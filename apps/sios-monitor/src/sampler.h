// How the computer is doing, once a second, read straight from the kernel
// (/proc and /sys): CPU, memory, disk, network, battery, and the apps using
// the most. Nothing here needs special permission; quitting an app only
// works for your own.
#pragma once

#include <QHash>
#include <QObject>
#include <QTimer>
#include <QVariantList>

class Sampler : public QObject
{
    Q_OBJECT
    Q_PROPERTY(double cpu READ cpu NOTIFY sampled)
    Q_PROPERTY(QVariantList cpuHistory READ cpuHistory NOTIFY sampled)
    Q_PROPERTY(int cores READ cores CONSTANT)
    Q_PROPERTY(QVariantMap memory READ memory NOTIFY sampled)
    Q_PROPERTY(QVariantList memoryHistory READ memoryHistory NOTIFY sampled)
    Q_PROPERTY(QVariantMap disk READ disk NOTIFY sampled)
    Q_PROPERTY(QVariantMap network READ network NOTIFY sampled)
    Q_PROPERTY(QVariantList networkHistory READ networkHistory NOTIFY sampled)
    Q_PROPERTY(QVariantMap battery READ battery NOTIFY sampled)
    Q_PROPERTY(QVariantList apps READ apps NOTIFY sampled)
    Q_PROPERTY(QString uptime READ uptime NOTIFY sampled)

public:
    explicit Sampler(QObject *parent = nullptr);

    double cpu() const { return m_cpu; }
    QVariantList cpuHistory() const { return m_cpuHistory; }
    int cores() const { return m_cores; }
    QVariantMap memory() const { return m_memory; }
    QVariantList memoryHistory() const { return m_memHistory; }
    QVariantMap disk() const { return m_disk; }
    QVariantMap network() const { return m_network; }
    QVariantList networkHistory() const { return m_netHistory; }
    QVariantMap battery() const { return m_battery; }
    QVariantList apps() const { return m_apps; }
    QString uptime() const { return m_uptime; }

    /** Ask an app to quit (SIGTERM). Only your own processes. */
    Q_INVOKABLE bool quit(const QVariantList &pids);

Q_SIGNALS:
    void sampled();

private:
    void sample();
    void sampleProcesses(double elapsedTicks);

    QTimer m_timer;
    int m_cores = 1;
    quint64 m_lastTotal = 0, m_lastIdle = 0;
    quint64 m_lastRx = 0, m_lastTx = 0;
    qint64 m_lastNetMs = 0;
    QHash<int, quint64> m_lastProcTicks;
    double m_cpu = 0;
    QVariantList m_cpuHistory, m_memHistory, m_netHistory;
    QVariantMap m_memory, m_disk, m_network, m_battery;
    QVariantList m_apps;
    QString m_uptime;
};
