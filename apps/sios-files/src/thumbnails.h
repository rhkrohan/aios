// Thumbnails for pictures, PDFs and videos, from KDE's preview service (the
// same thumbnails Dolphin shows). QML asks for "image://thumb/<file url>".
#pragma once

#include <QQuickAsyncImageProvider>
#include <QQuickImageProvider>

class ThumbnailProvider : public QQuickAsyncImageProvider
{
public:
    QQuickImageResponse *requestImageResponse(const QString &id, const QSize &requestedSize) override;
};

// The app's line icons in any colour: "image://icon/<name>/<rrggbb>".
class IconProvider : public QQuickImageProvider
{
public:
    IconProvider()
        : QQuickImageProvider(QQuickImageProvider::Image)
    {
    }
    QImage requestImage(const QString &id, QSize *size, const QSize &requestedSize) override;
};
