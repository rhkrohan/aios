// Dev tool: a window whose right-click menu looks like the desktop's, so the
// app style can be checked with ui/vm-click.sh and ui/vm-shot.sh. Not part
// of the image. Quits after 20 seconds.
#include <QApplication>
#include <QContextMenuEvent>
#include <QIcon>
#include <QMenu>
#include <QTimer>
#include <QWidget>
class Probe : public QWidget
{
protected:
    void contextMenuEvent(QContextMenuEvent *e) override
    {
        QMenu *menu = new QMenu(this);
        QMenu *create = menu->addMenu(QIcon::fromTheme(QStringLiteral("document-new")), QStringLiteral("Create New"));
        create->addAction(QStringLiteral("Folder…"));
        menu->addAction(QIcon::fromTheme(QStringLiteral("edit-paste")), QStringLiteral("Paste Clipboard Contents…"))->setShortcut(QKeySequence::Paste);
        QAction *undo = menu->addAction(QIcon::fromTheme(QStringLiteral("edit-undo")), QStringLiteral("Undo"));
        undo->setEnabled(false);
        menu->addSeparator();
        menu->addAction(QIcon::fromTheme(QStringLiteral("system-lock-screen")), QStringLiteral("Lock Screen"));
        menu->addAction(QIcon::fromTheme(QStringLiteral("preferences-desktop-display")), QStringLiteral("Display Configuration"));
        menu->popup(e->globalPos());
    }
};
int main(int argc, char **argv)
{
    QApplication app(argc, argv);
    Probe win;
    win.resize(900, 600);
    win.show();
    QTimer::singleShot(20000, &app, &QApplication::quit);
    return app.exec();
}
