// SIOS Settings: start the app and hand the QML the real machine (look,
// Wi-Fi, updates, about) and the icon service.
#include "broker.h"
#include "system.h"
#include "display.h"
#include "sound.h"
#include "bluetooth.h"
#include "notifs.h"
#include "power.h"
#include "clock.h"
#include "keyboard.h"
#include "mouse.h"
#include "access.h"
#include "users.h"
#include "printers.h"

#include <QApplication>
#include <QCommandLineParser>
#include <QDBusConnection>
#include <QJsonDocument>
#include <QJsonObject>
#include <QDeadlineTimer>
#include <QLocalSocket>
#include <QFile>
#include <QDir>
#include <QIcon>
#include <QSettings>
#include <QImage>
#include <QPainter>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickImageProvider>
#include <QQuickStyle>
#include <QSvgRenderer>


// the app's line icons in any colour: "image://icon/<name>/<rrggbb>"
class IconProvider : public QQuickImageProvider
{
public:
    IconProvider()
        : QQuickImageProvider(QQuickImageProvider::Image)
    {
    }
    QImage requestImage(const QString &id, QSize *size, const QSize &requested) override
    {
        QFile f(QStringLiteral(":/qt/qml/org/sios/settings/src/icons/%1.svg").arg(id.section(QLatin1Char('/'), 0, 0)));
        if (!f.open(QIODevice::ReadOnly))
            return {};
        QByteArray svg = f.readAll();
        svg.replace("#000000", "#" + id.section(QLatin1Char('/'), 1, 1).toLatin1());
        QSvgRenderer renderer(svg);
        const QSize out = requested.isValid() && !requested.isEmpty() ? requested : QSize(48, 48);
        QImage image(out, QImage::Format_ARGB32_Premultiplied);
        image.fill(Qt::transparent);
        QPainter p(&image);
        renderer.render(&p);
        if (size)
            *size = out;
        return image;
    }
};

// icons from the system theme (the SIOS logo): "image://theme/<name>"
class ThemeIconProvider : public QQuickImageProvider
{
public:
    ThemeIconProvider()
        : QQuickImageProvider(QQuickImageProvider::Image)
    {
    }
    QImage requestImage(const QString &id, QSize *size, const QSize &requested) override
    {
        const QSize out = requested.isValid() && !requested.isEmpty() ? requested : QSize(128, 128);
        if (size)
            *size = out;
        return QIcon::fromTheme(id).pixmap(out).toImage();
    }
};

// Started outside the desktop session (autostart races, ssh), Qt can miss the
// KDE icon theme and fall back to bare hicolor, leaving most apps blank. Read
// the theme the desktop uses ourselves.
static void useDesktopIconTheme()
{
    if (!QIcon::themeName().isEmpty() && QIcon::themeName() != QLatin1String("hicolor"))
        return;
    QString theme;
    for (const QString &file : {QDir::homePath() + QStringLiteral("/.config/kdeglobals"), QStringLiteral("/etc/xdg/kdeglobals")}) {
        theme = QSettings(file, QSettings::IniFormat).value(QStringLiteral("Icons/Theme")).toString();
        if (!theme.isEmpty())
            break;
    }
    QIcon::setThemeName(theme.isEmpty() ? QStringLiteral("breeze") : theme);
    QIcon::setFallbackThemeName(QStringLiteral("breeze"));
}


// SIOS's windows are started by the broker (S1, D55): it trusts only the exact
// processes it started itself, so no AI can start this window as its own child
// and drive it. Started any other way (the menu, the dock, a terminal), ask the
// broker to start the real one, then quit.
static bool brokerOpens(const QString &app, const QString &page)
{
    QString dir = qEnvironmentVariable("SIOS_RUNTIME");
    if (dir.isEmpty())
        dir = qEnvironmentVariable("XDG_RUNTIME_DIR") + QStringLiteral("/sios");
    QLocalSocket s;
    s.connectToServer(dir + QStringLiteral("/capd.sock"));
    if (!s.waitForConnected(1000))
        return false;
    const QJsonObject req{{QStringLiteral("method"), QStringLiteral("windows.open")},
                          {QStringLiteral("params"), QJsonObject{{QStringLiteral("app"), app}, {QStringLiteral("page"), page}}}};
    s.write(QJsonDocument(req).toJson(QJsonDocument::Compact) + '\n');
    // the answer can arrive while the request is still being written, so wait for a
    // whole line, not for more data (else an answer already here reads as a failure
    // and an untrusted second window opens)
    if (!s.waitForBytesWritten(1000))
        return false;
    QDeadlineTimer deadline(5000);
    while (!s.canReadLine())
        if (deadline.hasExpired() || !s.waitForReadyRead(int(deadline.remainingTime())))
            return false;
    return QJsonDocument::fromJson(s.readLine()).object().contains(QStringLiteral("ok"));
}

// brought forward by the broker when Settings is already open (a page name only)
class Waker : public QObject
{
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "org.sios.Settings1")
public:
    using QObject::QObject;
public Q_SLOTS:
    Q_SCRIPTABLE void Show(const QString &page) { Q_EMIT shown(page); }
Q_SIGNALS:
    void shown(const QString &page);
};

int main(int argc, char *argv[])
{
    // Its memory is safe from other programs because the image sets
    // kernel.yama.ptrace_scope=1 (60-sios-ptrace.conf). Don't hide it with
    // PR_SET_DUMPABLE: that also hides /proc/<pid>/exe, and the broker then
    // can't see that this is SIOS's own window (owner actions are refused).
    QApplication app(argc, argv);
    useDesktopIconTheme();
    app.setApplicationName(QStringLiteral("sios-settings"));
    app.setApplicationDisplayName(QStringLiteral("Settings"));
    app.setOrganizationDomain(QStringLiteral("sios.org"));
    app.setDesktopFileName(QStringLiteral("org.sios.settings"));
    app.setWindowIcon(QIcon::fromTheme(QStringLiteral("org.sios.settings")));
    QQuickStyle::setStyle(QStringLiteral("Basic"));

    QCommandLineParser args;
    args.addOption({QStringLiteral("page"), QStringLiteral("Open on a page: appearance, display, sound, wifi, bluetooth, notifications, power, keyboard, mouse, printers, account, clock, accessibility, updates, about, brain, permissions, connectors, connections"), QStringLiteral("page")});
    args.process(app);
    if (qgetenv("SIOS_WINDOW") != "1" && brokerOpens(QStringLiteral("settings"), args.value(QStringLiteral("page"))))
        return 0;
    Waker waker;
    QDBusConnection::sessionBus().registerService(QStringLiteral("org.sios.Settings1"));
    QDBusConnection::sessionBus().registerObject(QStringLiteral("/Settings"), &waker, QDBusConnection::ExportScriptableSlots);

    System system;
    Broker broker;
    // the areas of the computer, one per page (made before the engine, so they outlive it);
    // their notes and errors go out as system's
    DisplayArea displayArea;
    QObject::connect(&displayArea, &Area::message, &system, &System::message);
    SoundArea soundArea;
    QObject::connect(&soundArea, &Area::message, &system, &System::message);
    BluetoothArea bluetoothArea;
    QObject::connect(&bluetoothArea, &Area::message, &system, &System::message);
    NotifsArea notifsArea;
    QObject::connect(&notifsArea, &Area::message, &system, &System::message);
    PowerArea powerArea;
    QObject::connect(&powerArea, &Area::message, &system, &System::message);
    ClockArea clockArea;
    QObject::connect(&clockArea, &Area::message, &system, &System::message);
    KeyboardArea keyboardArea;
    QObject::connect(&keyboardArea, &Area::message, &system, &System::message);
    MouseArea mouseArea;
    QObject::connect(&mouseArea, &Area::message, &system, &System::message);
    AccessArea accessArea;
    QObject::connect(&accessArea, &Area::message, &system, &System::message);
    UsersArea usersArea;
    QObject::connect(&usersArea, &Area::message, &system, &System::message);
    PrintersArea printersArea;
    QObject::connect(&printersArea, &Area::message, &system, &System::message);
    QQmlApplicationEngine engine;
    engine.addImageProvider(QStringLiteral("icon"), new IconProvider);
    engine.addImageProvider(QStringLiteral("theme"), new ThemeIconProvider);
    engine.rootContext()->setContextProperty(QStringLiteral("system"), &system);
    engine.rootContext()->setContextProperty(QStringLiteral("broker"), &broker);
    engine.rootContext()->setContextProperty(QStringLiteral("display"), &displayArea);
    engine.rootContext()->setContextProperty(QStringLiteral("sound"), &soundArea);
    engine.rootContext()->setContextProperty(QStringLiteral("bluetooth"), &bluetoothArea);
    engine.rootContext()->setContextProperty(QStringLiteral("notifs"), &notifsArea);
    engine.rootContext()->setContextProperty(QStringLiteral("power"), &powerArea);
    engine.rootContext()->setContextProperty(QStringLiteral("clock"), &clockArea);
    engine.rootContext()->setContextProperty(QStringLiteral("keyboard"), &keyboardArea);
    engine.rootContext()->setContextProperty(QStringLiteral("mouse"), &mouseArea);
    engine.rootContext()->setContextProperty(QStringLiteral("access"), &accessArea);
    engine.rootContext()->setContextProperty(QStringLiteral("users"), &usersArea);
    engine.rootContext()->setContextProperty(QStringLiteral("printers"), &printersArea);

    engine.rootContext()->setContextProperty(QStringLiteral("startPage"), args.value(QStringLiteral("page")));
    engine.rootContext()->setContextProperty(QStringLiteral("waker"), &waker);
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed, &app, [] { QCoreApplication::exit(1); }, Qt::QueuedConnection);
    engine.loadFromModule("org.sios.settings", "Main");
    return app.exec();
}

#include "main.moc"
