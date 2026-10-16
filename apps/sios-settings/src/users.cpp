#include "users.h"

#include <QDBusConnection>
#include <QDBusInterface>
#include <QDBusMessage>
#include <QDBusObjectPath>
#include <QDBusPendingCallWatcher>
#include <QDBusPendingReply>
#include <QDBusReply>
#include <QDir>
#include <QFileInfo>
#include <QImageReader>
#include <QUrl>

#include <crypt.h>
#include <cstring>
#include <memory>
#include <unistd.h>

static const QString ACCOUNTS = QStringLiteral("org.freedesktop.Accounts");
static const QString USER = QStringLiteral("org.freedesktop.Accounts.User");
static const QString AVATARS = QStringLiteral("/usr/share/plasma/avatars");

UsersArea::UsersArea(QObject *parent)
    : Area(parent)
{
}

QString UsersArea::userPath()
{
    if (m_path.isEmpty()) {
        QDBusInterface mgr(ACCOUNTS, QStringLiteral("/org/freedesktop/Accounts"), ACCOUNTS, QDBusConnection::systemBus());
        const QDBusReply<QDBusObjectPath> r = mgr.call(QStringLiteral("FindUserById"), qlonglong(getuid()));
        if (r.isValid())
            m_path = r.value().path();
    }
    return m_path;
}

void UsersArea::refresh()
{
    const QString path = userPath();
    QVariantMap s;
    if (path.isEmpty()) {
        s.insert(QStringLiteral("available"), false);
        replace(s);
        return;
    }
    QDBusMessage m = QDBusMessage::createMethodCall(ACCOUNTS, path, QStringLiteral("org.freedesktop.DBus.Properties"), QStringLiteral("GetAll"));
    m << USER;
    const QDBusReply<QVariantMap> r = QDBusConnection::systemBus().call(m, QDBus::Block, 3000);
    const QVariantMap p = r.isValid() ? r.value() : QVariantMap();
    // SIOS's faces: Plasma's own pictures, if the image has them
    QVariantList faces;
    QDir dir(AVATARS);
    for (const QFileInfo &fi : dir.entryInfoList({QStringLiteral("*.png")}, QDir::Files, QDir::Name))
        faces.append(fi.absoluteFilePath());
    const QString icon = p.value(QStringLiteral("IconFile")).toString();
    s = {
        {QStringLiteral("available"), r.isValid()},
        {QStringLiteral("name"), p.value(QStringLiteral("RealName")).toString()},
        {QStringLiteral("username"), p.value(QStringLiteral("UserName")).toString()},
        {QStringLiteral("icon"), QFileInfo(icon).isReadable() ? icon : QString()},
        {QStringLiteral("autologin"), p.value(QStringLiteral("AutomaticLogin")).toBool()},
        {QStringLiteral("admin"), p.value(QStringLiteral("AccountType")).toInt() == 1},
        {QStringLiteral("faces"), faces},
    };
    replace(s);
}

// one AccountsService call in the background; polkit may show its password window
void UsersArea::call(const QString &method, const QVariant &arg, const QString &done, const QString &failed, const QVariant &arg2)
{
    const QString path = userPath();
    if (path.isEmpty()) {
        Q_EMIT message(QStringLiteral("Your account service isn't running."), true);
        return;
    }
    QDBusMessage m = QDBusMessage::createMethodCall(ACCOUNTS, path, USER, method);
    m << arg;
    if (arg2.isValid())
        m << arg2;
    m.setInteractiveAuthorizationAllowed(true);
    // the owner may take a while with the password window
    auto *w = new QDBusPendingCallWatcher(QDBusConnection::systemBus().asyncCall(m, 150 * 1000), this);
    connect(w, &QDBusPendingCallWatcher::finished, this, [this, w, done, failed] {
        const QDBusPendingReply<> r = *w;
        w->deleteLater();
        if (r.isError()) {
            const bool denied = r.error().name().contains(QLatin1String("PermissionDenied")) || r.error().name().contains(QLatin1String("NotAuthorized"));
            Q_EMIT message(failed + (denied ? QStringLiteral(". The password window was closed, so nothing changed.") : QStringLiteral(": ") + r.error().message()), true);
        } else if (!done.isEmpty()) {
            Q_EMIT message(done, false);
        }
        refresh();
    });
}

void UsersArea::set(const QString &key, const QVariant &value)
{
    if (key == QLatin1String("name")) {
        QString name;
        for (const QChar c : value.toString().trimmed())
            if (!c.isNonCharacter() && c.category() != QChar::Other_Control && c.category() != QChar::Other_Format)
                name += c;
        name.truncate(64);
        if (name.isEmpty())
            return;
        call(QStringLiteral("SetRealName"), name, QStringLiteral("Name saved"), QStringLiteral("Couldn't save your name"));
    } else if (key == QLatin1String("icon")) {
        // a real picture file the owner chose, or one of SIOS's faces
        QString file = value.toString();
        if (file.startsWith(QLatin1String("file://")))
            file = QUrl(file).toLocalFile();
        const QFileInfo fi(file);
        if (!fi.isFile() || !fi.isReadable() || fi.size() > 5 * 1024 * 1024 || QImageReader::imageFormat(fi.absoluteFilePath()).isEmpty()) {
            Q_EMIT message(QStringLiteral("That file isn't a picture SIOS can use (PNG or JPEG, up to 5 MB)."), true);
            return;
        }
        call(QStringLiteral("SetIconFile"), fi.absoluteFilePath(), QStringLiteral("Picture saved"), QStringLiteral("Couldn't save your picture"));
    } else if (key == QLatin1String("autologin")) {
        call(QStringLiteral("SetAutomaticLogin"), value.toBool(), value.toBool() ? QStringLiteral("You'll be signed in when the computer starts") : QStringLiteral("You'll sign in with your password when the computer starts"),
             QStringLiteral("Couldn't change automatic sign-in"));
    }
}

void UsersArea::act(const QString &name, const QVariantMap &params)
{
    if (name != QLatin1String("password"))
        return;
    QByteArray pw = params.value(QStringLiteral("password")).toString().toUtf8();
    QByteArray again = params.value(QStringLiteral("again")).toString().toUtf8();
    const bool same = pw == again;
    again.fill('\0');
    if (!same || pw.size() < 8 || pw.size() > 512) {
        pw.fill('\0');
        Q_EMIT message(!same ? QStringLiteral("The two new passwords aren't the same.") : QStringLiteral("Use at least 8 characters."), true);
        return;
    }
    // yescrypt, the system's own scheme; only the hash leaves this process
    char salt[CRYPT_GENSALT_OUTPUT_SIZE];
    if (!crypt_gensalt_rn("$y$", 0, nullptr, 0, salt, sizeof salt)) {
        pw.fill('\0');
        Q_EMIT message(QStringLiteral("Couldn't prepare the new password."), true);
        return;
    }
    auto data = std::make_unique<crypt_data>();
    const char *hash = crypt_rn(pw.constData(), salt, data.get(), sizeof(crypt_data));
    pw.fill('\0');
    if (!hash || hash[0] == '*') {
        explicit_bzero(data.get(), sizeof(crypt_data));
        Q_EMIT message(QStringLiteral("Couldn't prepare the new password."), true);
        return;
    }
    const QString hashed = QString::fromLatin1(hash);
    explicit_bzero(data.get(), sizeof(crypt_data));
    call(QStringLiteral("SetPassword"), hashed, QStringLiteral("Password changed. Use it the next time you sign in."), QStringLiteral("Couldn't change your password"), QString());
}
