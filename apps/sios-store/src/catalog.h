// The app catalog: every desktop app Flathub offers, read from the AppStream
// data Flatpak keeps on disk (the same data Discover and Bazaar show), plus
// what Flatpak says is installed or has an update.
#pragma once

#include <QHash>
#include <QObject>
#include <QProcess>
#include <QVariantList>

namespace AppStream { class Pool; class Component; }

class Catalog : public QObject
{
    Q_OBJECT
    Q_PROPERTY(bool ready READ ready NOTIFY changed)
    Q_PROPERTY(bool refreshing READ refreshing NOTIFY refreshingChanged)
    Q_PROPERTY(QVariantMap featured READ featured NOTIFY changed)
    Q_PROPERTY(QVariantList popular READ popular NOTIFY changed)
    Q_PROPERTY(QVariantList installed READ installed NOTIFY installedChanged)
    Q_PROPERTY(QVariantList updates READ updates NOTIFY installedChanged)
    Q_PROPERTY(QVariantList categories READ categories CONSTANT)
    Q_PROPERTY(QVariantMap busy READ busy NOTIFY busyChanged)

public:
    explicit Catalog(QObject *parent = nullptr);
    ~Catalog() override;

    bool ready() const { return m_ready; }
    bool refreshing() const { return m_refreshing; }
    QVariantMap featured() const;
    QVariantList popular() const;
    QVariantList installed() const;
    QVariantList updates() const;
    QVariantList categories() const;
    QVariantMap busy() const { return m_busy; }

    Q_INVOKABLE QVariantList search(const QString &term) const;
    Q_INVOKABLE QVariantList inCategory(const QString &category) const;
    /** Everything about one app, for its page. */
    Q_INVOKABLE QVariantMap app(const QString &id) const;
    /** What an app may reach, from its Flatpak sandbox settings (async: permissionsReady). */
    Q_INVOKABLE void loadPermissions(const QString &id);

    Q_INVOKABLE void install(const QString &id);
    Q_INVOKABLE void remove(const QString &id);
    Q_INVOKABLE void update(const QString &id);
    Q_INVOKABLE void updateAll();
    Q_INVOKABLE void open(const QString &id);
    Q_INVOKABLE void refresh();

Q_SIGNALS:
    void changed();
    void installedChanged();
    void refreshingChanged();
    void busyChanged();
    void permissionsReady(const QString &id, const QVariantMap &permissions);
    void finished(const QString &id, const QString &action, bool ok, const QString &message);

private:
    void loadPool();
    void loadInstalled();
    QVariantMap brief(const AppStream::Component &c) const;
    QString remoteFor(const QString &id) const;
    void runFlatpak(const QString &id, const QString &action, const QStringList &args);

    AppStream::Pool *m_pool;
    QHash<QString, int> m_index;              // id -> position in m_apps
    QList<AppStream::Component> *m_apps;
    QHash<QString, QVariantMap> m_installed;  // id -> {version, origin, installation}
    QHash<QString, QString> m_updates;        // id -> new version
    QVariantMap m_busy;                       // id -> {action, progress}
    bool m_ready = false;
    bool m_refreshing = false;
};
