// SIOS Files: start the app, hand the QML the folder model, the file actions
// and the thumbnail service, and open the folder it was asked for (or Home).
#include "fileops.h"
#include "foldermodel.h"
#include "thumbnails.h"

#include <QApplication>
#include <QCommandLineParser>
#include <QDir>
#include <QIcon>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>
#include <QUrl>

int main(int argc, char *argv[])
{
    QApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("sios-files"));
    app.setApplicationDisplayName(QStringLiteral("Files"));
    app.setOrganizationDomain(QStringLiteral("sios.org"));
    app.setDesktopFileName(QStringLiteral("org.sios.files"));
    app.setWindowIcon(QIcon::fromTheme(QStringLiteral("system-file-manager")));
    // we draw our own controls from the preview's design; Basic keeps Qt out of the way
    QQuickStyle::setStyle(QStringLiteral("Basic"));

    QCommandLineParser args;
    args.addPositionalArgument(QStringLiteral("location"), QStringLiteral("Folder to open"));
    args.addHelpOption();
    args.process(app);
    QString start = QUrl::fromLocalFile(QDir::homePath()).toString();
    if (!args.positionalArguments().isEmpty()) {
        const QUrl url = QUrl::fromUserInput(args.positionalArguments().first(), QDir::currentPath(), QUrl::AssumeLocalFile);
        if (url.isValid())
            start = url.toString();
    }

    qmlRegisterType<FolderModel>("org.sios.files.core", 1, 0, "FolderModel");
    FileOps ops;

    QQmlApplicationEngine engine;
    engine.addImageProvider(QStringLiteral("thumb"), new ThumbnailProvider);
    engine.addImageProvider(QStringLiteral("icon"), new IconProvider);
    engine.rootContext()->setContextProperty(QStringLiteral("fileOps"), &ops);
    engine.rootContext()->setContextProperty(QStringLiteral("startLocation"), start);
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreationFailed, &app, [] { QCoreApplication::exit(1); }, Qt::QueuedConnection);
    engine.loadFromModule("org.sios.files", "Main");
    return app.exec();
}
