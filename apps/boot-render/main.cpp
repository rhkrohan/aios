// boot-render SPLASH_DIR OUT_DIR: loads render.qml (next to this file, given as
// argv[3]) offscreen and writes the boot screen's PNGs. See ui/render-boot.sh.
#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickWindow>

int main(int argc, char *argv[])
{
    QQuickWindow::setGraphicsApi(QSGRendererInterface::Software);
    QGuiApplication app(argc, argv);
    if (argc < 4)
        return 2;
    QQmlApplicationEngine engine;
    engine.addImportPath(QString::fromLocal8Bit(argv[1]));
    engine.rootContext()->setContextProperty(QStringLiteral("splashDir"), QUrl::fromLocalFile(QString::fromLocal8Bit(argv[1]) + QStringLiteral("/")));
    engine.rootContext()->setContextProperty(QStringLiteral("outDir"), QString::fromLocal8Bit(argv[2]));
    engine.load(QUrl::fromLocalFile(QString::fromLocal8Bit(argv[3])));
    return engine.rootObjects().isEmpty() ? 1 : app.exec();
}
