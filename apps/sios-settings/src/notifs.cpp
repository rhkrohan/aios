#include "notifs.h"

#include <KConfig>
#include <KConfigGroup>
#include <QDateTime>
#include <QRegularExpression>
#include <QStandardPaths>

// Plasma's popup positions (NotificationManager::Settings::PopupPosition)
static const QList<int> POSITIONS = {0, 1, 2, 3, 4, 5, 6};

NotifsArea::NotifsArea(QObject *parent)
    : Area(parent)
{
}

// an app's own name from its .desktop file (the id otherwise)
static QString appName(const QString &id)
{
    const QString path = QStandardPaths::locate(QStandardPaths::ApplicationsLocation, id + QStringLiteral(".desktop"));
    if (path.isEmpty())
        return id;
    KConfig d(path, KConfig::SimpleConfig);
    const QString n = d.group(QStringLiteral("Desktop Entry")).readEntry("Name", QString());
    return n.isEmpty() ? id : n;
}

void NotifsArea::refresh()
{
    KConfig cfg(QStringLiteral("plasmanotifyrc"));
    const KConfigGroup dnd = cfg.group(QStringLiteral("DoNotDisturb"));
    const KConfigGroup n = cfg.group(QStringLiteral("Notifications"));
    QVariantMap s;
    const QDateTime until = dnd.readEntry("Until", QDateTime());
    const bool on = until.isValid() && until > QDateTime::currentDateTime();
    s[QStringLiteral("dnd")] = on;
    // more than a year ahead is "until I turn it off"
    s[QStringLiteral("dndForever")] = on && until > QDateTime::currentDateTime().addYears(1);
    s[QStringLiteral("dndUntil")] = on ? until.toSecsSinceEpoch() : 0;
    s[QStringLiteral("sounds")] = !dnd.readEntry("NotificationSoundsMuted", false);
    s[QStringLiteral("position")] = n.readEntry("PopupPosition", 0);
    s[QStringLiteral("timeout")] = n.readEntry("PopupTimeout", 5000);
    s[QStringLiteral("critical")] = n.readEntry("CriticalInDndMode", true);
    s[QStringLiteral("lowHistory")] = n.readEntry("LowPriorityHistory", false);
    s[QStringLiteral("lowPopups")] = n.readEntry("LowPriorityPopups", true);

    QVariantList apps;
    const KConfigGroup all = cfg.group(QStringLiteral("Applications"));
    for (const QString &id : all.groupList()) {
        const KConfigGroup a = all.group(id);
        apps.append(QVariantMap{{QStringLiteral("id"), id},
                                {QStringLiteral("name"), appName(id)},
                                {QStringLiteral("popups"), a.readEntry("ShowPopups", true)},
                                {QStringLiteral("popupsDnd"), a.readEntry("ShowPopupsInDndMode", false)},
                                {QStringLiteral("history"), a.readEntry("ShowInHistory", true)}});
    }
    std::sort(apps.begin(), apps.end(), [](const QVariant &a, const QVariant &b) {
        return a.toMap().value(QStringLiteral("name")).toString().localeAwareCompare(b.toMap().value(QStringLiteral("name")).toString()) < 0;
    });
    s[QStringLiteral("apps")] = apps;
    replace(s);
}

void NotifsArea::set(const QString &key, const QVariant &value)
{
    KConfig cfg(QStringLiteral("plasmanotifyrc"));
    KConfigGroup dnd = cfg.group(QStringLiteral("DoNotDisturb"));
    KConfigGroup n = cfg.group(QStringLiteral("Notifications"));
    if (key == QLatin1String("dnd")) {
        // off, hour, tomorrow (8:00 tomorrow), forever
        const QString v = value.toString();
        const QDateTime now = QDateTime::currentDateTime();
        if (v == QLatin1String("off"))
            dnd.deleteEntry("Until", KConfig::Notify);
        else if (v == QLatin1String("hour"))
            dnd.writeEntry("Until", now.addSecs(3600), KConfig::Notify);
        else if (v == QLatin1String("tomorrow"))
            dnd.writeEntry("Until", QDateTime(now.date().addDays(1), QTime(8, 0)), KConfig::Notify);
        else if (v == QLatin1String("forever"))
            dnd.writeEntry("Until", QDateTime(QDate(2099, 12, 31), QTime(23, 59)), KConfig::Notify);
        else
            return;
    } else if (key == QLatin1String("sounds")) {
        dnd.writeEntry("NotificationSoundsMuted", !value.toBool(), KConfig::Notify);
    } else if (key == QLatin1String("position")) {
        if (!POSITIONS.contains(value.toInt()))
            return;
        n.writeEntry("PopupPosition", value.toInt(), KConfig::Notify);
    } else if (key == QLatin1String("timeout")) {
        n.writeEntry("PopupTimeout", qBound(2000, value.toInt(), 60000), KConfig::Notify);
    } else if (key == QLatin1String("critical")) {
        n.writeEntry("CriticalInDndMode", value.toBool(), KConfig::Notify);
    } else if (key == QLatin1String("lowHistory")) {
        n.writeEntry("LowPriorityHistory", value.toBool(), KConfig::Notify);
    } else if (key == QLatin1String("lowPopups")) {
        n.writeEntry("LowPriorityPopups", value.toBool(), KConfig::Notify);
    } else if (key.startsWith(QLatin1String("app/"))) {
        // "app/<id>/popups": only an app that already has its group, and a plain id
        const QString id = key.section(QLatin1Char('/'), 1, 1);
        const QString what = key.section(QLatin1Char('/'), 2);
        static const QRegularExpression plain(QStringLiteral("^[A-Za-z0-9._-]+$"));
        KConfigGroup all = cfg.group(QStringLiteral("Applications"));
        if (!plain.match(id).hasMatch() || !all.groupList().contains(id))
            return;
        const char *k = what == QLatin1String("popups") ? "ShowPopups" : what == QLatin1String("popupsDnd") ? "ShowPopupsInDndMode" : what == QLatin1String("history") ? "ShowInHistory" : nullptr;
        if (!k)
            return;
        all.group(id).writeEntry(k, value.toBool(), KConfig::Notify);
    } else {
        return;
    }
    cfg.sync();
    refresh();
}

void NotifsArea::act(const QString &name, const QVariantMap &params)
{
    Q_UNUSED(name)
    Q_UNUSED(params)
}
