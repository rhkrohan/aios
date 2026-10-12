// What the Ask bar finds as you type: apps (KDE's app list), settings pages,
// actions (lock, sleep, dark mode, ...) and files (KDE's file index, Baloo).
// Asking the assistant itself arrives with brain-d (Stage B).
#pragma once

#include <QObject>
#include <QVariantList>

#include <KService>

class Search : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QVariantList suggestions READ suggestions CONSTANT)

public:
    explicit Search(QObject *parent = nullptr);

    QVariantList suggestions() const;
    /** The best matches for what was typed, best first, at most 8. */
    Q_INVOKABLE QVariantList find(const QString &text) const;
    /** Open an app or file, change a setting, or run an action. */
    Q_INVOKABLE void run(const QVariantMap &item);

private:
    void loadApps();
    KService::List m_apps;
};
