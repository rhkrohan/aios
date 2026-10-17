// An agent's own desktop, live (D109). The broker gives this window a socket and a
// token for one start of the desktop; the view opens the socket, passes the token,
// and speaks VNC (libvncclient) to the desktop's sharer inside the agent's sandbox.
// It only ever shows the agent's desktop: the owner's screen is never captured.
// Your mouse and keys go in only while `control` is on (Take control).
#pragma once

#include <QImage>
#include <QQuickPaintedItem>
#include <QtQml/qqmlregistration.h>

class QSocketNotifier;
struct _rfbClient;

class DeskView : public QQuickPaintedItem
{
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(bool connected READ connected NOTIFY connectedChanged)
    Q_PROPERTY(bool control READ control WRITE setControl NOTIFY controlChanged)
    Q_PROPERTY(QString error READ error NOTIFY errorChanged)
public:
    explicit DeskView(QQuickItem *parent = nullptr);
    ~DeskView() override;

    bool connected() const { return m_client != nullptr; }
    bool control() const { return m_control; }
    void setControl(bool on);
    QString error() const { return m_error; }

    // the socket and token from the broker (agents.desk "ticket")
    Q_INVOKABLE void open(const QString &socket, const QString &token);
    Q_INVOKABLE void close();

    void paint(QPainter *p) override;

    // from libvncclient's callbacks
    void frameChanged(int x, int y, int w, int h);
    bool resizeFrame(int w, int h);
    QByteArray password;

Q_SIGNALS:
    void connectedChanged();
    void controlChanged();
    void errorChanged();

protected:
    void mousePressEvent(QMouseEvent *e) override;
    void mouseReleaseEvent(QMouseEvent *e) override;
    void mouseMoveEvent(QMouseEvent *e) override;
    void hoverMoveEvent(QHoverEvent *e) override;
    void wheelEvent(QWheelEvent *e) override;
    void keyPressEvent(QKeyEvent *e) override;
    void keyReleaseEvent(QKeyEvent *e) override;

private:
    void fail(const QString &why);
    void pointer(QPointF at, int mask);
    void key(QKeyEvent *e, bool down);
    QRectF target() const;

    _rfbClient *m_client = nullptr;
    QSocketNotifier *m_notifier = nullptr;
    QImage m_frame;
    bool m_control = false;
    int m_buttons = 0;
    QString m_error;
};
