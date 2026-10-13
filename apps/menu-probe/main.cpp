// Dev tool: pops up a menu like the desktop's so the app style can be checked
// with a screenshot (ui/vm-shot.sh). Not part of the image.
#include <QApplication>
#include <QIcon>
#include <QMenu>
#include <QTimer>
#include <QWidget>
int main(int argc, char **argv)
{
    QApplication app(argc, argv);
    QWidget win;
    win.resize(900, 600);
    win.show();
    QMenu menu(&win);
    QMenu *create = menu.addMenu(QIcon::fromTheme(QStringLiteral("document-new")), QStringLiteral("Create New"));
    create->addAction(QStringLiteral("Folder…"));
    menu.addAction(QIcon::fromTheme(QStringLiteral("edit-paste")), QStringLiteral("Paste Clipboard Contents…"))->setShortcut(QKeySequence::Paste);
    QAction *undo = menu.addAction(QIcon::fromTheme(QStringLiteral("edit-undo")), QStringLiteral("Undo"));
    undo->setShortcut(QKeySequence::Undo);
    undo->setEnabled(false);
    menu.addMenu(QIcon::fromTheme(QStringLiteral("view-list-icons")), QStringLiteral("Icons"));
    menu.addSeparator();
    menu.addAction(QIcon::fromTheme(QStringLiteral("system-lock-screen")), QStringLiteral("Lock Screen"));
    menu.addSeparator();
    menu.addAction(QIcon::fromTheme(QStringLiteral("preferences-desktop-wallpaper")), QStringLiteral("Desktop and Wallpaper"));
    menu.addAction(QIcon::fromTheme(QStringLiteral("preferences-desktop-display")), QStringLiteral("Display Configuration"));
    QTimer::singleShot(12000, &app, &QApplication::quit);
    QTimer::singleShot(800, &win, [&] { menu.popup(win.mapToGlobal(QPoint(60, 40))); menu.setActiveAction(menu.actions().at(1)); });
    return app.exec();
}
