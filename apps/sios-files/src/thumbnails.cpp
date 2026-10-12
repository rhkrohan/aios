#include "thumbnails.h"

#include <KFileItem>
#include <KIO/PreviewJob>

#include <QCoreApplication>
#include <QImage>
#include <QPixmap>
#include <QQuickTextureFactory>
#include <QThread>
#include <QUrl>
#include <QFile>
#include <QPainter>
#include <QSvgRenderer>

namespace
{
class ThumbnailResponse : public QQuickImageResponse
{
public:
    ThumbnailResponse(const QUrl &url, const QSize &size)
    {
        // KIO jobs live on the main thread; this is called from QML's loader thread
        moveToThread(QCoreApplication::instance()->thread());
        QMetaObject::invokeMethod(this, [this, url, size] { start(url, size); }, Qt::QueuedConnection);
    }

    QQuickTextureFactory *textureFactory() const override
    {
        return QQuickTextureFactory::textureFactoryForImage(m_image);
    }

private:
    void start(const QUrl &url, const QSize &size)
    {
        const QSize want = size.isValid() && !size.isEmpty() ? size : QSize(256, 256);
        const QStringList plugins = KIO::PreviewJob::defaultPlugins();
        auto *job = new KIO::PreviewJob(KFileItemList{KFileItem(url)}, want, &plugins);
        job->setScaleType(KIO::PreviewJob::ScaledAndCached);
        QObject::connect(job, &KIO::PreviewJob::gotPreview, this, [this](const KFileItem &, const QPixmap &pixmap) {
            m_image = pixmap.toImage();
        });
        QObject::connect(job, &KJob::result, this, [this] { Q_EMIT finished(); });
        job->start();
    }

    QImage m_image;
};
} // namespace

QQuickImageResponse *ThumbnailProvider::requestImageResponse(const QString &id, const QSize &requestedSize)
{
    return new ThumbnailResponse(QUrl(QUrl::fromPercentEncoding(id.toUtf8())), requestedSize);
}

QImage IconProvider::requestImage(const QString &id, QSize *size, const QSize &requestedSize)
{
    const QString name = id.section(QLatin1Char('/'), 0, 0);
    const QString color = id.section(QLatin1Char('/'), 1, 1);
    QFile f(QStringLiteral(":/qt/qml/org/sios/files/src/icons/%1.svg").arg(name));
    if (!f.open(QIODevice::ReadOnly))
        return {};
    QByteArray svg = f.readAll();
    svg.replace("#000000", "#" + color.toLatin1());
    QSvgRenderer renderer(svg);
    const QSize out = requestedSize.isValid() && !requestedSize.isEmpty() ? requestedSize : QSize(48, 48);
    QImage image(out, QImage::Format_ARGB32_Premultiplied);
    image.fill(Qt::transparent);
    QPainter p(&image);
    renderer.render(&p);
    if (size)
        *size = out;
    return image;
}
