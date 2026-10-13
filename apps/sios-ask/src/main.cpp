// The SIOS Ask bar: one copy waits in the background after login (started
// with --background), so the orb or Meta+Space shows it at once. Running
// sios-ask again tells that copy to show or hide (over D-Bus, org.sios.Ask).
#include "search.h"

#include <QApplication>
#include <QCommandLineParser>
#include <QDBusConnection>
#include <QDBusInterface>
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

// show or hide, asked by a second launch
class Toggle : public QObject
{
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "org.sios.Ask")
public:
    using QObject::QObject;
public Q_SLOTS:
    Q_SCRIPTABLE void toggle() { Q_EMIT toggled(); }
    Q_SCRIPTABLE void showApps() { Q_EMIT appsRequested(); }
Q_SIGNALS:
    void toggled();
    void appsRequested();
};

// the app's line icons in any colour ("image://icon/<name>/<rrggbb>"), and
// the system's icons for apps and files ("image://theme/<name>")
class Icons : public QQuickImageProvider
{
public:
    Icons()
        : QQuickImageProvider(QQuickImageProvider::Image)
    {
    }
    QImage requestImage(const QString &id, QSize *size, const QSize &requested) override
    {
        const QSize out = requested.isValid() && !requested.isEmpty() ? requested : QSize(64, 64);
        if (size)
            *size = out;
        if (id.startsWith(QLatin1String("theme/")))
            return QIcon::fromTheme(id.mid(6), QIcon::fromTheme(QStringLiteral("application-x-executable"))).pixmap(out).toImage();
        QFile f(QStringLiteral(":/qt/qml/org/sios/ask/src/icons/%1.svg").arg(id.section(QLatin1Char('/'), 1, 1)));
        if (!f.open(QIODevice::ReadOnly))
            return {};
        QByteArray svg = f.readAll();
        svg.replace("#000000", "#" + id.section(QLatin1Char('/'), 2, 2).toLatin1());
        QSvgRenderer renderer(svg);
        QImage image(out, QImage::Format_ARGB32_Premultiplied);
        image.fill(Qt::transparent);
        QPainter p(&image);
        renderer.render(&p);
        return image;
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

int main(int argc, char *argv[])
{
    QApplication app(argc, argv);
    useDesktopIconTheme();
    app.setApplicationName(QStringLiteral("sios-ask"));
    app.setApplicationDisplayName(QStringLiteral("Ask SIOS"));
    app.setDesktopFileName(QStringLiteral("org.sios.ask"));
    app.setQuitOnLastWindowClosed(false);
    QQuickStyle::setStyle(QStringLiteral("Basic"));

    QCommandLineParser args;
    args.addOption({QStringLiteral("background"), QStringLiteral("Start hidden and wait for the orb or Meta+Space")});
    args.addOption({QStringLiteral("apps"), QStringLiteral("Show all apps (the top bar's Apps)")});
    args.process(app);

    // already running: tell it to show (or hide) and leave
    auto bus = QDBusConnection::sessionBus();
    if (!bus.registerService(QStringLiteral("org.sios.Ask"))) {
        QDBusInterface running(QStringLiteral("org.sios.Ask"), QStringLiteral("/Ask"), QStringLiteral("org.sios.Ask"));
        running.call(args.isSet(QStringLiteral("apps")) ? QStringLiteral("showApps") : QStringLiteral("toggle"));
        return 0;
    }
    Toggle toggle;
    bus.registerObject(QStringLiteral("/Ask"), &toggle, QDBusConnection::ExportScriptableSlots);

    Search search;
    QQmlApplicationEngine engine;
    engine.addImageProvider(QStringLiteral("icon"), new Icons);
    engine.rootContext()->setContextProperty(QStringLiteral("search"), &search);
    engine.rootContext()->setContextProperty(QStringLiteral("toggler"), &toggle);
    engine.rootContext()->setContextProperty(QStringLiteral("startHidden"), args.isSet(QStringLiteral("background")));
    engine.rootContext()->setContextProperty(QStringLiteral("startApps"), args.isSet(QStringLiteral("apps")));
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed, &app, [] { QCoreApplication::exit(1); }, Qt::QueuedConnection);
    engine.loadFromModule("org.sios.ask", "Main");
    return app.exec();
}

#include "main.moc"
