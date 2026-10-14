// What the Ask bar finds as you type: apps (KDE's app list), settings pages,
// actions (lock, sleep, dark mode, ...) and files (KDE's file index, Baloo).
// Asking the assistant is assistant.h (brain-d).
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
    /** Every app, A to Z, for the All apps grid; filtered by what was typed. */
    Q_INVOKABLE QVariantList allApps(const QString &filter = {}) const;
    /** Open an app or file, change a setting, or run an action. */
    Q_INVOKABLE void run(const QVariantMap &item);

private:
    void loadApps();
    KService::List m_apps;
};
