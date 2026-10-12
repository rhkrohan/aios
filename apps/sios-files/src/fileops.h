// Everything Files does to files, through KDE's KIO: open, new folder, rename,
// move, copy, paste, move to Trash, and undo (KIO's undo manager, the same
// one Dolphin uses, so "Undo" means the same thing in both).
#pragma once

#include <QObject>
#include <QStringList>
#include <QVariantMap>

class KJob;

class FileOps : public QObject
{
    Q_OBJECT
    Q_PROPERTY(bool canUndo READ canUndo NOTIFY undoChanged)
    Q_PROPERTY(QString undoText READ undoText NOTIFY undoChanged)
    Q_PROPERTY(QVariantMap storage READ storage NOTIFY storageChanged)
    Q_PROPERTY(QString home READ home CONSTANT)

public:
    explicit FileOps(QObject *parent = nullptr);

    bool canUndo() const;
    QString undoText() const;
    QVariantMap storage() const;
    QString home() const;

    Q_INVOKABLE void open(const QString &location);
    Q_INVOKABLE void openWith(const QString &location);
    Q_INVOKABLE void trash(const QStringList &locations);
    Q_INVOKABLE void emptyTrash();
    Q_INVOKABLE QString newFolder(const QString &inLocation);
    Q_INVOKABLE void rename(const QString &location, const QString &newName);
    Q_INVOKABLE void move(const QStringList &locations, const QString &toFolder);
    Q_INVOKABLE void copy(const QStringList &locations, const QString &toFolder);
    Q_INVOKABLE void toClipboard(const QStringList &locations, bool cut);
    Q_INVOKABLE void paste(const QString &toFolder);
    Q_INVOKABLE bool clipboardHasFiles() const;
    Q_INVOKABLE void undo();
    /** The start of a text file, for the space-bar preview. */
    Q_INVOKABLE QString readText(const QString &location, int maxBytes = 6000) const;
    Q_INVOKABLE QVariantMap folderStats(const QString &location) const;
    Q_INVOKABLE QString urlFromPath(const QString &path) const;

Q_SIGNALS:
    void undoChanged();
    void storageChanged();
    /** Something happened worth a toast: text, and whether Undo applies. */
    void message(const QString &text, bool undoable);
    void failed(const QString &text);

private:
    void watch(KJob *job, const QString &doneText, bool undoable);
};
