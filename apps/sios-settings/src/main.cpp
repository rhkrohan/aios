// SIOS Settings: start the app and hand the QML the real machine (look,
// Wi-Fi, updates, about) and the icon service.
#include "system.h"

#include <QApplication>
#include <QCommandLineParser>
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

int main(int argc, char *argv[])
{
    QApplication app(argc, argv);
    useDesktopIconTheme();
    app.setApplicationName(QStringLiteral("sios-settings"));
    app.setApplicationDisplayName(QStringLiteral("Settings"));
    app.setOrganizationDomain(QStringLiteral("sios.org"));
    app.setDesktopFileName(QStringLiteral("org.sios.settings"));
    app.setWindowIcon(QIcon::fromTheme(QStringLiteral("preferences-system")));
    QQuickStyle::setStyle(QStringLiteral("Basic"));

    QCommandLineParser args;
    args.addOption({QStringLiteral("page"), QStringLiteral("Open on a page: appearance, wifi, updates, about, brain, permissions, connections"), QStringLiteral("page")});
    args.process(app);

    System system;
    QQmlApplicationEngine engine;
    engine.addImageProvider(QStringLiteral("icon"), new IconProvider);
    engine.addImageProvider(QStringLiteral("theme"), new ThemeIconProvider);
    engine.rootContext()->setContextProperty(QStringLiteral("system"), &system);
    engine.rootContext()->setContextProperty(QStringLiteral("startPage"), args.value(QStringLiteral("page")));
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed, &app, [] { QCoreApplication::exit(1); }, Qt::QueuedConnection);
    engine.loadFromModule("org.sios.settings", "Main");
    return app.exec();
}
