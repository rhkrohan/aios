// What SIOS Settings reads and changes on the real machine:
//   appearance  the SIOS light/dark look and the wallpaper (KDE's own tools)
//   wifi        networks through NetworkManager (nmcli)
//   updates     the image this computer runs (rpm-ostree / bootc); checking
//               and installing ask for an administrator through pkexec
//   about       name, version, processor, memory, storage
//   (display, sound, Bluetooth and the rest are areas of their own: area.h)
#pragma once

#include <QObject>
#include <QProcess>
#include <QVariantList>

#include <functional>

class System : public QObject
{
    Q_OBJECT
    Q_PROPERTY(bool dark READ dark NOTIFY appearanceChanged)
    Q_PROPERTY(QString wallpaper READ wallpaper NOTIFY appearanceChanged)
    Q_PROPERTY(QVariantList wallpapers READ wallpapers CONSTANT)
    Q_PROPERTY(bool wifiEnabled READ wifiEnabled NOTIFY wifiChanged)
    Q_PROPERTY(bool wifiHardware READ wifiHardware NOTIFY wifiChanged)
    Q_PROPERTY(QVariantList networks READ networks NOTIFY wifiChanged)
    Q_PROPERTY(QString wired READ wired NOTIFY wifiChanged)
    Q_PROPERTY(QVariantMap update READ update NOTIFY updateChanged)
    Q_PROPERTY(QVariantMap about READ about CONSTANT)

public:
    explicit System(QObject *parent = nullptr);

    bool dark() const { return m_dark; }
    QString wallpaper() const { return m_wallpaper; }
    QVariantList wallpapers() const;
    bool wifiEnabled() const { return m_wifiEnabled; }
    bool wifiHardware() const { return m_wifiHardware; }
    QVariantList networks() const { return m_networks; }
    QString wired() const { return m_wired; }
    QVariantMap update() const { return m_update; }
    QVariantMap about() const;

    Q_INVOKABLE void setDark(bool dark);
    Q_INVOKABLE void setWallpaper(const QString &id);
    Q_INVOKABLE void setWifi(bool on);
    Q_INVOKABLE void scanWifi();
    Q_INVOKABLE void connectWifi(const QString &ssid, const QString &password);
    Q_INVOKABLE void checkForUpdate();
    Q_INVOKABLE void installUpdate();
    Q_INVOKABLE void restart();

Q_SIGNALS:
    void appearanceChanged();
    void wifiChanged();
    void updateChanged();
    void message(const QString &text, bool error);

private:
    void readAppearance();
    void readWifi();
    void readUpdate();
    void run(const QString &program, const QStringList &args, std::function<void(int, const QString &)> done);

    bool m_dark = false;
    QString m_wallpaper;
    bool m_wifiEnabled = false;
    bool m_wifiHardware = false;
    QVariantList m_networks;
    QString m_wired;
    QVariantMap m_update;
};
