// SIOS Agents: start the app, hand the QML the broker and the icon service.
// It's one of SIOS's own windows: the broker starts it (S1, D55), so started
// any other way it asks the broker to start the real one and quits.
#include "broker.h"

#include <QCommandLineParser>
#include <QDBusConnection>
#include <QFile>
#include <QGuiApplication>
#include <QIcon>
#include <QImage>
#include <QJsonDocument>
#include <QJsonObject>
#include <QLocalSocket>
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
        QFile f(QStringLiteral(":/qt/qml/org/sios/agents/src/icons/%1.svg").arg(id.section(QLatin1Char('/'), 0, 0)));
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

// Started any other way than by the broker: ask it to start the real window, then quit.
static bool brokerOpens(const QString &page)
{
    QString dir = qEnvironmentVariable("SIOS_RUNTIME");
    if (dir.isEmpty())
        dir = qEnvironmentVariable("XDG_RUNTIME_DIR") + QStringLiteral("/sios");
    QLocalSocket s;
    s.connectToServer(dir + QStringLiteral("/capd.sock"));
    if (!s.waitForConnected(1000))
        return false;
    const QJsonObject req{{QStringLiteral("method"), QStringLiteral("windows.open")},
                          {QStringLiteral("params"), QJsonObject{{QStringLiteral("app"), QStringLiteral("agents")}, {QStringLiteral("page"), page}}}};
    s.write(QJsonDocument(req).toJson(QJsonDocument::Compact) + '\n');
    if (!s.waitForBytesWritten(1000) || !s.waitForReadyRead(5000))
        return false;
    return QJsonDocument::fromJson(s.readLine()).object().contains(QStringLiteral("ok"));
}

// brought forward by the broker when Memory is already open (a page name only)
class Waker : public QObject
{
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "org.sios.Agents1")
public:
    using QObject::QObject;
public Q_SLOTS:
    Q_SCRIPTABLE void Show(const QString &page) { Q_EMIT shown(page); }
Q_SIGNALS:
    void shown(const QString &page);
};

int main(int argc, char *argv[])
{
    QGuiApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("sios-agents"));
    app.setApplicationDisplayName(QStringLiteral("Agents"));
    app.setDesktopFileName(QStringLiteral("org.sios.agents"));
    app.setWindowIcon(QIcon::fromTheme(QStringLiteral("org.sios.agents")));
    QQuickStyle::setStyle(QStringLiteral("Basic"));

    QCommandLineParser args;
    args.addOption({QStringLiteral("page"), QStringLiteral("Open on a page: agents, inbox, activity, permissions, or an agent id"), QStringLiteral("page")});
    args.process(app);
    if (qgetenv("SIOS_WINDOW") != "1" && brokerOpens(args.value(QStringLiteral("page"))))
        return 0;
    Waker waker;
    QDBusConnection::sessionBus().registerService(QStringLiteral("org.sios.Agents1"));
    QDBusConnection::sessionBus().registerObject(QStringLiteral("/Agents"), &waker, QDBusConnection::ExportScriptableSlots);

    Broker broker;
    QQmlApplicationEngine engine;
    engine.addImageProvider(QStringLiteral("icon"), new IconProvider);
    engine.rootContext()->setContextProperty(QStringLiteral("broker"), &broker);
    engine.rootContext()->setContextProperty(QStringLiteral("waker"), &waker);
    engine.rootContext()->setContextProperty(QStringLiteral("startPage"), args.value(QStringLiteral("page")));
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed, &app, [] { QCoreApplication::exit(1); }, Qt::QueuedConnection);
    engine.loadFromModule("org.sios.agents", "Main");
    return app.exec();
}

#include "main.moc"
