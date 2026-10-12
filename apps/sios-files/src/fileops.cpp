#include "fileops.h"
#include "foldermodel.h"

#include <KFileItem>
#include <KFormat>
#include <KIO/CopyJob>
#include <KIO/DeleteOrTrashJob>
#include <KIO/EmptyTrashJob>
#include <KIO/FileUndoManager>
#include <KIO/JobUiDelegateFactory>
#include <KIO/MkdirJob>
#include <KIO/OpenUrlJob>
#include <KIO/Paste>
#include <KIO/PasteJob>
#include <KUrlMimeData>

#include <QClipboard>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QGuiApplication>
#include <QMimeData>
#include <QStorageInfo>

namespace
{
QList<QUrl> toUrls(const QStringList &locations)
{
    QList<QUrl> urls;
    for (const QString &l : locations)
        urls.append(QUrl(l));
    return urls;
}

QString things(int n)
{
    return n == 1 ? QStringLiteral("1 item") : QStringLiteral("%1 items").arg(n);
}
} // namespace

FileOps::FileOps(QObject *parent)
    : QObject(parent)
{
    auto *undo = KIO::FileUndoManager::self();
    connect(undo, &KIO::FileUndoManager::undoAvailable, this, &FileOps::undoChanged);
    connect(undo, &KIO::FileUndoManager::undoTextChanged, this, &FileOps::undoChanged);
}

bool FileOps::canUndo() const
{
    return KIO::FileUndoManager::self()->isUndoAvailable();
}

QString FileOps::undoText() const
{
    return KIO::FileUndoManager::self()->undoText();
}

QString FileOps::home() const
{
    return QUrl::fromLocalFile(QDir::homePath()).toString();
}

QVariantMap FileOps::storage() const
{
    const QStorageInfo info(QDir::homePath());
    const qint64 total = info.bytesTotal();
    const qint64 used = total - info.bytesAvailable();
    KFormat f;
    return {{QStringLiteral("fraction"), total > 0 ? double(used) / double(total) : 0.0},
            {QStringLiteral("text"), QStringLiteral("%1 of %2 used").arg(f.formatByteSize(double(used), 0), f.formatByteSize(double(total), 0))}};
}

void FileOps::watch(KJob *job, const QString &doneText, bool undoable)
{
    connect(job, &KJob::result, this, [this, doneText, undoable](KJob *j) {
        if (j->error() && j->error() != KIO::ERR_USER_CANCELED) {
            Q_EMIT failed(j->errorString());
            return;
        }
        if (!j->error() && !doneText.isEmpty())
            Q_EMIT message(doneText, undoable);
        Q_EMIT storageChanged();
    });
}

void FileOps::open(const QString &location)
{
    auto *job = new KIO::OpenUrlJob(QUrl(location));
    job->setUiDelegate(KIO::createDefaultJobUiDelegate(KJobUiDelegate::AutoHandlingEnabled, nullptr));
    job->setRunExecutables(false);
    job->start();
}

void FileOps::openWith(const QString &location)
{
    auto *job = new KIO::OpenUrlJob(QUrl(location));
    job->setUiDelegate(KIO::createDefaultJobUiDelegate(KJobUiDelegate::AutoHandlingEnabled, nullptr));
    job->setShowOpenOrExecuteDialog(true);
    job->start();
}

void FileOps::trash(const QStringList &locations)
{
    if (locations.isEmpty())
        return;
    auto *job = KIO::trash(toUrls(locations));
    KIO::FileUndoManager::self()->recordCopyJob(job);
    watch(job, QStringLiteral("Moved %1 to Trash").arg(things(int(locations.size()))), true);
}

void FileOps::emptyTrash()
{
    auto *job = KIO::emptyTrash();
    watch(job, QStringLiteral("Trash emptied"), false);
}

QString FileOps::newFolder(const QString &inLocation)
{
    const QUrl dir(inLocation);
    QString name = QStringLiteral("New folder");
    if (dir.isLocalFile()) {
        int n = 2;
        while (QFileInfo::exists(dir.toLocalFile() + QLatin1Char('/') + name))
            name = QStringLiteral("New folder %1").arg(n++);
    }
    QUrl url = dir;
    url.setPath(dir.path() + (dir.path().endsWith(QLatin1Char('/')) ? QString() : QStringLiteral("/")) + name);
    auto *job = KIO::mkdir(url);
    KIO::FileUndoManager::self()->recordJob(KIO::FileUndoManager::Mkdir, {}, url, job);
    watch(job, QString(), true);
    return url.toString();
}

void FileOps::rename(const QString &location, const QString &newName)
{
    const QUrl from(location);
    const QString clean = newName.trimmed();
    if (clean.isEmpty() || clean.contains(QLatin1Char('/')) || clean == from.fileName())
        return;
    QUrl to = from.adjusted(QUrl::RemoveFilename);
    to.setPath(to.path() + clean);
    auto *job = KIO::moveAs(from, to, KIO::HideProgressInfo);
    KIO::FileUndoManager::self()->recordJob(KIO::FileUndoManager::Rename, {from}, to, job);
    watch(job, QString(), true);
}

void FileOps::move(const QStringList &locations, const QString &toFolder)
{
    if (locations.isEmpty())
        return;
    auto *job = KIO::move(toUrls(locations), QUrl(toFolder));
    KIO::FileUndoManager::self()->recordCopyJob(job);
    watch(job, QStringLiteral("Moved %1 to %2").arg(things(int(locations.size())), QUrl(toFolder).fileName()), true);
}

void FileOps::copy(const QStringList &locations, const QString &toFolder)
{
    if (locations.isEmpty())
        return;
    auto *job = KIO::copy(toUrls(locations), QUrl(toFolder));
    KIO::FileUndoManager::self()->recordCopyJob(job);
    watch(job, QStringLiteral("Copied %1 to %2").arg(things(int(locations.size())), QUrl(toFolder).fileName()), true);
}

void FileOps::toClipboard(const QStringList &locations, bool cut)
{
    auto *mime = new QMimeData;
    KUrlMimeData::setUrls(toUrls(locations), toUrls(locations), mime);
    KIO::setClipboardDataCut(mime, cut);
    QGuiApplication::clipboard()->setMimeData(mime);
    Q_EMIT message(QStringLiteral("%1 %2").arg(cut ? QStringLiteral("Cut") : QStringLiteral("Copied"), things(int(locations.size()))), false);
}

bool FileOps::clipboardHasFiles() const
{
    const QMimeData *mime = QGuiApplication::clipboard()->mimeData();
    return mime && mime->hasUrls();
}

void FileOps::paste(const QString &toFolder)
{
    const QMimeData *mime = QGuiApplication::clipboard()->mimeData();
    if (!mime || !mime->hasUrls())
        return;
    auto *job = KIO::paste(mime, QUrl(toFolder));
    if (job)
        watch(job, QStringLiteral("Pasted"), true);
    if (KIO::isClipboardDataCut(mime))
        QGuiApplication::clipboard()->clear();
}

void FileOps::undo()
{
    KIO::FileUndoManager::self()->undo();
    Q_EMIT storageChanged();
}

QString FileOps::readText(const QString &location, int maxBytes) const
{
    QFile f(QUrl(location).toLocalFile());
    if (!f.open(QIODevice::ReadOnly))
        return {};
    const QByteArray data = f.read(maxBytes);
    if (data.contains('\0'))
        return {};
    return QString::fromUtf8(data);
}

QVariantMap FileOps::folderStats(const QString &location) const
{
    return FolderModel::folderStats(QUrl(location).toLocalFile());
}

QString FileOps::urlFromPath(const QString &path) const
{
    return QUrl::fromLocalFile(path).toString();
}
