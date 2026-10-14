// SIOS Approve (D37): started by the session bus when the broker has something
// waiting for the owner, it shows what an AI asked for and sends the answer.
// It decides nothing itself and takes no data from whoever woke it: it asks the
// broker what's waiting. Yes needs the owner's password (the broker asks polkit).
#include "approvals.h"

#include <QDBusConnection>
#include <QDBusInterface>
#include <QFile>
#include <QGuiApplication>
#include <QIcon>
#include <QImage>
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
