// Dev tool: moves the pointer and clicks on the test VM, through KWin's fake
// input (allowed only for programs named in a desktop file that asks for it;
// see ui/vm-click.sh). Not part of the image.
//   vm-click X Y [left|right]
#include <KWayland/Client/connection_thread.h>
#include <KWayland/Client/fakeinput.h>
#include <KWayland/Client/registry.h>
#include <QGuiApplication>
#include <QTimer>
#include <linux/input-event-codes.h>
using namespace KWayland::Client;
int main(int argc, char **argv)
{
    QGuiApplication app(argc, argv);
    if (argc < 3) return 2;
    const QPointF pos(atof(argv[1]), atof(argv[2]));
    const quint32 button = argc > 3 && QByteArray(argv[3]) == "right" ? BTN_RIGHT : BTN_LEFT;
    ConnectionThread *conn = ConnectionThread::fromApplication(&app);
    Registry registry;
    registry.create(conn);
    QObject::connect(&registry, &Registry::fakeInputAnnounced, &app, [&](quint32 name, quint32 version) {
        FakeInput *input = registry.createFakeInput(name, version, &app);
        input->authenticate(QStringLiteral("vm-click"), QStringLiteral("SIOS test clicks"));
        input->requestPointerMoveAbsolute(pos);
        QTimer::singleShot(150, &app, [input, button, &app, conn] {
            input->requestPointerButtonClick(button);
            conn->flush();
            QTimer::singleShot(200, &app, &QGuiApplication::quit);
        });
        conn->flush();
    });
    registry.setup();
    QTimer::singleShot(5000, &app, [] { qWarning("no fake input"); QGuiApplication::exit(1); });
    return app.exec();
}
