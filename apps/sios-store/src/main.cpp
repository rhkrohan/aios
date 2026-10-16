// SIOS Store: start the app and hand the QML the catalog (Flathub through
// Flatpak) and the icon service, then show the preview's Store.
#include "broker.h"
#include "catalog.h"

#include <QCommandLineParser>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLocalSocket>

#include <QApplication>
#include <QFile>
#include <QIcon>
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
        QFile f(QStringLiteral(":/qt/qml/org/sios/store/src/icons/%1.svg").arg(id.section(QLatin1Char('/'), 0, 0)));
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

// Started any other way than by the broker (the Apps menu): ask it to start the real
// window, so the Connectors page is SIOS's own window (D59), then quit.
static bool brokerOpens()
{
    QString dir = qEnvironmentVariable("SIOS_RUNTIME");
    if (dir.isEmpty())
        dir = qEnvironmentVariable("XDG_RUNTIME_DIR") + QStringLiteral("/sios");
    QLocalSocket s;
    s.connectToServer(dir + QStringLiteral("/capd.sock"));
    if (!s.waitForConnected(1000))
        return false;
    const QJsonObject req{{QStringLiteral("method"), QStringLiteral("windows.open")}, {QStringLiteral("params"), QJsonObject{{QStringLiteral("app"), QStringLiteral("store")}}}};
    s.write(QJsonDocument(req).toJson(QJsonDocument::Compact) + '\n');
    if (!s.waitForBytesWritten(1000) || !s.waitForReadyRead(5000))
        return false;
    return QJsonDocument::fromJson(s.readLine()).object().contains(QStringLiteral("ok"));
}

int main(int argc, char *argv[])
{
    QApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("sios-store"));
    app.setApplicationDisplayName(QStringLiteral("Store"));
    app.setOrganizationDomain(QStringLiteral("sios.org"));
    app.setDesktopFileName(QStringLiteral("org.sios.store"));
    app.setWindowIcon(QIcon::fromTheme(QStringLiteral("org.sios.store"), QIcon::fromTheme(QStringLiteral("system-software-install"))));
    QQuickStyle::setStyle(QStringLiteral("Basic"));
    if (qgetenv("SIOS_WINDOW") != "1" && brokerOpens())
        return 0;

    Catalog catalog;
    Broker broker;
    QQmlApplicationEngine engine;
    engine.addImageProvider(QStringLiteral("icon"), new IconProvider);
    engine.rootContext()->setContextProperty(QStringLiteral("catalog"), &catalog);
    engine.rootContext()->setContextProperty(QStringLiteral("broker"), &broker);
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed, &app, [] { QCoreApplication::exit(1); }, Qt::QueuedConnection);
    engine.loadFromModule("org.sios.store", "Main");
    return app.exec();
}
