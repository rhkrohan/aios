#include "deskview.h"

#include <QPainter>
#include <QSocketNotifier>
#include <rfb/rfbclient.h>
#include <poll.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

namespace {

const int kTag = 0x5105;

// libvncclient's own logging stays quiet (a plain function: GCC won't turn a variadic lambda into one)
void quiet(const char *, ...) {}

DeskView *viewOf(rfbClient *c)
{
    return static_cast<DeskView *>(rfbClientGetClientData(c, (void *)&kTag));
}

char *getPassword(rfbClient *c)
{
    DeskView *v = viewOf(c);
    return strdup(v ? v->password.constData() : "");
}

rfbBool mallocFrame(rfbClient *c)
{
    DeskView *v = viewOf(c);
    return v && v->resizeFrame(c, c->width, c->height);
}

void gotUpdate(rfbClient *c, int x, int y, int w, int h)
{
    if (DeskView *v = viewOf(c))
        v->frameChanged(x, y, w, h);
}

// a line from the bridge ("ok <password>"), at most 128 bytes, within 4 seconds
QByteArray readLine(int fd)
{
    QByteArray line;
    char ch;
    while (line.size() < 128) {
        pollfd p{fd, POLLIN, 0};
        if (poll(&p, 1, 4000) <= 0 || ::read(fd, &ch, 1) != 1)
            return {};
        if (ch == '\n')
            return line;
        line.append(ch);
    }
    return {};
}

// X keysyms for the keys that aren't plain text
quint32 keysym(QKeyEvent *e)
{
    switch (e->key()) {
    case Qt::Key_Return: case Qt::Key_Enter: return 0xff0d;
    case Qt::Key_Backspace: return 0xff08;
    case Qt::Key_Tab: case Qt::Key_Backtab: return 0xff09;
    case Qt::Key_Escape: return 0xff1b;
    case Qt::Key_Delete: return 0xffff;
    case Qt::Key_Home: return 0xff50;
    case Qt::Key_Left: return 0xff51;
    case Qt::Key_Up: return 0xff52;
    case Qt::Key_Right: return 0xff53;
    case Qt::Key_Down: return 0xff54;
    case Qt::Key_PageUp: return 0xff55;
    case Qt::Key_PageDown: return 0xff56;
    case Qt::Key_End: return 0xff57;
    case Qt::Key_Insert: return 0xff63;
    case Qt::Key_Shift: return 0xffe1;
    case Qt::Key_Control: return 0xffe3;
    case Qt::Key_Alt: return 0xffe9;
    case Qt::Key_Meta: return 0xffeb;
    case Qt::Key_Space: return 0x20;
    default: break;
    }
    if (e->key() >= Qt::Key_F1 && e->key() <= Qt::Key_F12)
        return 0xffbe + (e->key() - Qt::Key_F1);
    const QString t = e->text();
    if (t.size() == 1 && t.at(0).unicode() >= 0x20) {
        const quint32 u = t.at(0).unicode();
        return u < 0x100 ? u : 0x01000000 | u;
    }
    // with Ctrl held, text is a control code: send the letter itself
    if (e->key() >= Qt::Key_A && e->key() <= Qt::Key_Z)
        return (e->modifiers() & Qt::ShiftModifier ? 'A' : 'a') + (e->key() - Qt::Key_A);
    if (e->key() >= 0x20 && e->key() < 0x7f)
        return e->key();
    return 0;
}

} // namespace

DeskView::DeskView(QQuickItem *parent)
    : QQuickPaintedItem(parent)
{
    setAcceptedMouseButtons(Qt::AllButtons);
    setAcceptHoverEvents(true);
    setFlag(ItemAcceptsInputMethod, false);
    rfbClientLog = quiet;
    rfbClientErr = quiet;
}

DeskView::~DeskView()
{
    close();
}

void DeskView::open(const QString &socket, const QString &token)
{
    close();
    m_error.clear();
    Q_EMIT errorChanged();
    const QByteArray path = socket.toLocal8Bit();
    if (path.size() >= int(sizeof(sockaddr_un::sun_path)) || token.isEmpty())
        return fail(QStringLiteral("That desktop can't be reached."));
    int fd = ::socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0);
    sockaddr_un a{};
    a.sun_family = AF_UNIX;
    memcpy(a.sun_path, path.constData(), path.size());
    if (fd < 0 || ::connect(fd, reinterpret_cast<sockaddr *>(&a), sizeof(a)) != 0) {
        if (fd >= 0)
            ::close(fd);
        return fail(QStringLiteral("Its desktop isn't running."));
    }
    const QByteArray hello = token.toLatin1() + '\n';
    const QByteArray reply = ::write(fd, hello.constData(), hello.size()) == hello.size() ? readLine(fd) : QByteArray();
    if (!reply.startsWith("ok ")) {
        ::close(fd);
        return fail(QStringLiteral("Its desktop didn't let this window in (it may have restarted)."));
    }
    password = reply.mid(3);

    // 32 bits a pixel, laid out as QImage::Format_RGB32 expects
    rfbClient *c = rfbGetClient(8, 3, 4);
    c->format.redShift = 16;
    c->format.greenShift = 8;
    c->format.blueShift = 0;
    // the stream comes from inside an agent's sandbox: only the two simplest encodings,
    // so almost none of libvncclient's decoders can be reached (security review); a local
    // socket carries raw pixels easily. A confined decoding helper is the next step (D109)
    c->appData.encodingsString = "copyrect raw";
    c->appData.useRemoteCursor = FALSE;
    c->GetPassword = getPassword;
    c->MallocFrameBuffer = mallocFrame;
    c->GotFrameBufferUpdate = gotUpdate;
    rfbClientSetClientData(c, (void *)&kTag, this);
    // already connected and let in: libvncclient takes the socket as it is
    c->sock = fd;
    c->listenSpecified = TRUE;
    free(c->serverHost);
    c->serverHost = strdup("sios-desk");
    int argc = 0;
    if (!rfbInitClient(c, &argc, nullptr)) {
        // rfbInitClient frees the client (and closes the socket) when it fails
        password.clear();
        return fail(QStringLiteral("Its desktop answered, but the picture didn't start."));
    }
    m_client = c;
    m_notifier = new QSocketNotifier(fd, QSocketNotifier::Read, this);
    connect(m_notifier, &QSocketNotifier::activated, this, [this] {
        if (m_client && !HandleRFBServerMessage(m_client))
            fail(QStringLiteral("Its desktop closed."));
    });
    Q_EMIT connectedChanged();
}

void DeskView::close()
{
    delete m_notifier;
    m_notifier = nullptr;
    if (m_client) {
        // the picture is this window's, never libvncclient's to free
        m_client->frameBuffer = nullptr;
        rfbClientCleanup(m_client);
        m_client = nullptr;
        Q_EMIT connectedChanged();
    }
    password.clear();
    m_frame = QImage();
    setControl(false);
    update();
}

void DeskView::fail(const QString &why)
{
    close();
    m_error = why;
    Q_EMIT errorChanged();
}

void DeskView::setControl(bool on)
{
    if (on == m_control || (on && !m_client))
        return;
    m_control = on;
    if (on)
        forceActiveFocus();
    else if (m_client && m_buttons) {
        // let go of anything still held
        SendPointerEvent(m_client, 0, 0, 0);
        m_buttons = 0;
    }
    Q_EMIT controlChanged();
}

bool DeskView::resizeFrame(rfbClient *c, int w, int h)
{
    // libvncclient asks for the picture while it starts, before m_client is set: use the
    // client it passes. The size comes from the other end: only the desktop's own size
    if (!c || w <= 0 || h <= 0 || w > 4096 || h > 4096 || c->format.bitsPerPixel != 32)
        return false;
    m_frame = QImage(w, h, QImage::Format_RGB32);
    m_frame.fill(Qt::black);
    c->frameBuffer = m_frame.bits();
    return true;
}

void DeskView::frameChanged(int, int, int, int)
{
    update();
}

QRectF DeskView::target() const
{
    if (m_frame.isNull())
        return {};
    QSizeF s = m_frame.size().toSizeF().scaled(size(), Qt::KeepAspectRatio);
    return QRectF(QPointF((width() - s.width()) / 2, (height() - s.height()) / 2), s);
}

void DeskView::paint(QPainter *p)
{
    if (m_frame.isNull())
        return;
    p->setRenderHint(QPainter::SmoothPixmapTransform);
    p->drawImage(target(), m_frame);
}

void DeskView::pointer(QPointF at, int mask)
{
    const QRectF t = target();
    if (!m_client || !m_control || t.isEmpty())
        return;
    const int x = qBound(0, int((at.x() - t.x()) * m_frame.width() / t.width()), m_frame.width() - 1);
    const int y = qBound(0, int((at.y() - t.y()) * m_frame.height() / t.height()), m_frame.height() - 1);
    SendPointerEvent(m_client, x, y, mask);
}

static int buttonBit(Qt::MouseButton b)
{
    return b == Qt::LeftButton ? 1 : b == Qt::MiddleButton ? 2 : b == Qt::RightButton ? 4 : 0;
}

void DeskView::mousePressEvent(QMouseEvent *e)
{
    if (!m_control)
        return e->ignore();
    forceActiveFocus();
    m_buttons |= buttonBit(e->button());
    pointer(e->position(), m_buttons);
}

void DeskView::mouseReleaseEvent(QMouseEvent *e)
{
    m_buttons &= ~buttonBit(e->button());
    pointer(e->position(), m_buttons);
}

void DeskView::mouseMoveEvent(QMouseEvent *e)
{
    pointer(e->position(), m_buttons);
}

void DeskView::hoverMoveEvent(QHoverEvent *e)
{
    pointer(e->position(), m_buttons);
}

void DeskView::wheelEvent(QWheelEvent *e)
{
    if (!m_control)
        return e->ignore();
    const int bit = e->angleDelta().y() > 0 ? 8 : e->angleDelta().y() < 0 ? 16 : 0;
    if (bit) {
        pointer(e->position(), m_buttons | bit);
        pointer(e->position(), m_buttons);
    }
}

void DeskView::key(QKeyEvent *e, bool down)
{
    if (!m_client || !m_control)
        return e->ignore();
    if (const quint32 k = keysym(e))
        SendKeyEvent(m_client, k, down ? TRUE : FALSE);
}

void DeskView::keyPressEvent(QKeyEvent *e)
{
    key(e, true);
}

void DeskView::keyReleaseEvent(QKeyEvent *e)
{
    if (!e->isAutoRepeat())
        key(e, false);
}
