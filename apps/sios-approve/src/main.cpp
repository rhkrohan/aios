// SIOS Approve (D37): started by the broker when something waits for the owner
// (S1), it shows what an AI asked for and sends the answer.
// It decides nothing itself and takes no data from whoever woke it: it asks the
// broker what's waiting. Yes needs the owner's password (the broker asks polkit).
#include "approvals.h"

#include <QDBusConnection>
#include <QDBusInterface>
#include <QFile>
#include <QGuiApplication>
#include <QIcon>
#include <QImage>
#include <QJsonDocument>
#include <QJsonObject>
#include <QDeadlineTimer>
#include <QLocalSocket>
#include <QPainter>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickImageProvider>
#include <QQuickStyle>
#include <QSvgRenderer>


// woken by the broker (through the session bus); carries nothing
class Waker : public QObject
{
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "org.sios.Approve1")
public:
    using QObject::QObject;
public Q_SLOTS:
    Q_SCRIPTABLE void Show() { Q_EMIT shown(); }
Q_SIGNALS:
    void shown();
};

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
        QFile f(QStringLiteral(":/qt/qml/org/sios/approve/src/icons/%1.svg").arg(id.section(QLatin1Char('/'), 0, 0)));
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

int main(int argc, char *argv[])
{
    // Its memory is safe from other programs because the image sets
    // kernel.yama.ptrace_scope=1 (60-sios-ptrace.conf). Don't hide it with
    // PR_SET_DUMPABLE: that also hides /proc/<pid>/exe, and the broker then
    // can't see that this is SIOS's own window (owner actions are refused).
    QGuiApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("sios-approve"));
    app.setApplicationDisplayName(QStringLiteral("SIOS"));
    app.setDesktopFileName(QStringLiteral("org.sios.approve"));
    app.setWindowIcon(QIcon::fromTheme(QStringLiteral("org.sios.approve")));
    app.setQuitOnLastWindowClosed(false);
    QQuickStyle::setStyle(QStringLiteral("Basic"));
    if (qgetenv("SIOS_WINDOW") != "1") {
        // without the broker there is nothing to approve
        return brokerOpens(QStringLiteral("approve"), {}) ? 0 : 1;
    }

    // one copy: a second start just wakes the first
    auto bus = QDBusConnection::sessionBus();
    if (!bus.registerService(QStringLiteral("org.sios.Approve1"))) {
        QDBusInterface(QStringLiteral("org.sios.Approve1"), QStringLiteral("/Approve"), QStringLiteral("org.sios.Approve1")).call(QStringLiteral("Show"));
        return 0;
    }
    Waker waker;
    bus.registerObject(QStringLiteral("/Approve"), &waker, QDBusConnection::ExportScriptableSlots);

    Approvals approvals;
    QQmlApplicationEngine engine;
    engine.addImageProvider(QStringLiteral("icon"), new IconProvider);
    engine.rootContext()->setContextProperty(QStringLiteral("approvals"), &approvals);
    engine.rootContext()->setContextProperty(QStringLiteral("waker"), &waker);
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed, &app, [] { QCoreApplication::exit(1); }, Qt::QueuedConnection);
    engine.loadFromModule("org.sios.approve", "Main");
    approvals.refresh();
    return app.exec();
}

#include "main.moc"
