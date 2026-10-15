// SIOS Settings: start the app and hand the QML the real machine (look,
// Wi-Fi, updates, about) and the icon service.
#include "broker.h"
#include "system.h"

#include <QApplication>
#include <QCommandLineParser>
#include <QDBusConnection>
#include <QJsonDocument>
#include <QJsonObject>
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
    if (!s.waitForBytesWritten(1000) || !s.waitForReadyRead(5000))
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
    args.addOption({QStringLiteral("page"), QStringLiteral("Open on a page: appearance, wifi, updates, about, brain, permissions, connections"), QStringLiteral("page")});
    args.process(app);
    if (qgetenv("SIOS_WINDOW") != "1" && brokerOpens(QStringLiteral("settings"), args.value(QStringLiteral("page"))))
        return 0;
    Waker waker;
    QDBusConnection::sessionBus().registerService(QStringLiteral("org.sios.Settings1"));
    QDBusConnection::sessionBus().registerObject(QStringLiteral("/Settings"), &waker, QDBusConnection::ExportScriptableSlots);

    System system;
    Broker broker;
    QQmlApplicationEngine engine;
    engine.addImageProvider(QStringLiteral("icon"), new IconProvider);
    engine.addImageProvider(QStringLiteral("theme"), new ThemeIconProvider);
    engine.rootContext()->setContextProperty(QStringLiteral("system"), &system);
    engine.rootContext()->setContextProperty(QStringLiteral("broker"), &broker);
    engine.rootContext()->setContextProperty(QStringLiteral("startPage"), args.value(QStringLiteral("page")));
    engine.rootContext()->setContextProperty(QStringLiteral("waker"), &waker);
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed, &app, [] { QCoreApplication::exit(1); }, Qt::QueuedConnection);
    engine.loadFromModule("org.sios.settings", "Main");
    return app.exec();
}

#include "main.moc"
