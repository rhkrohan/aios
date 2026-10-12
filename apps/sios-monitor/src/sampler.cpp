#include "sampler.h"

#include <KFormat>

#include <QDateTime>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QRegularExpression>
#include <QStorageInfo>
#include <QThread>

#include <algorithm>
#include <csignal>
#include <unistd.h>

namespace
{
QString readFile(const QString &path)
{
    QFile f(path);
    return f.open(QIODevice::ReadOnly) ? QString::fromUtf8(f.readAll()) : QString();
}

void push(QVariantList &history, double value)
{
    history.append(value);
    while (history.size() > 60)
        history.removeFirst();
}

// friendly names for processes people recognise
QString friendly(const QString &comm, const QString &cmd)
{
    static const QHash<QString, QString> names = {
        {QStringLiteral("plasmashell"), QStringLiteral("Desktop")}, {QStringLiteral("kwin_wayland"), QStringLiteral("Window manager")},
        {QStringLiteral("firefox"), QStringLiteral("Firefox")}, {QStringLiteral("firefox-bin"), QStringLiteral("Firefox")},
        {QStringLiteral("Isolated Web Co"), QStringLiteral("Firefox (a tab)")}, {QStringLiteral("Web Content"), QStringLiteral("Firefox (a tab)")},
        {QStringLiteral("sios-files"), QStringLiteral("Files")}, {QStringLiteral("sios-store"), QStringLiteral("Store")},
        {QStringLiteral("sios-monitor"), QStringLiteral("Monitor")}, {QStringLiteral("dolphin"), QStringLiteral("Dolphin")},
        {QStringLiteral("konsole"), QStringLiteral("Konsole")}, {QStringLiteral("systemsettings"), QStringLiteral("System Settings")},
        {QStringLiteral("baloo_file"), QStringLiteral("File search")}, {QStringLiteral("baloo_file_extractor"), QStringLiteral("File search")},
        {QStringLiteral("Xwayland"), QStringLiteral("Older apps (X11)")}, {QStringLiteral("pipewire"), QStringLiteral("Sound")},
        {QStringLiteral("wireplumber"), QStringLiteral("Sound")}, {QStringLiteral("plasma-discover"), QStringLiteral("Discover")},
    };
    if (names.contains(comm))
        return names.value(comm);
    // flatpak apps run as "bwrap ... --command=X": show the app id's last part
    if (cmd.contains(QLatin1String("flatpak")) || comm == QLatin1String("bwrap")) {
        const int i = cmd.indexOf(QLatin1String("--app-id="));
        if (i >= 0)
            return cmd.mid(i + 9).section(QLatin1Char(' '), 0, 0).section(QLatin1Char('.'), -1);
    }
    QString n = comm;
    if (!n.isEmpty())
        n[0] = n[0].toUpper();
    return n;
}
} // namespace

Sampler::Sampler(QObject *parent)
    : QObject(parent)
{
    m_cores = std::max(1, QThread::idealThreadCount());
    connect(&m_timer, &QTimer::timeout, this, &Sampler::sample);
    m_timer.start(1000);
    sample();
}

void Sampler::sample()
{
    KFormat f;

    // CPU: busy share since the last look
    const QStringList cpuLine = readFile(QStringLiteral("/proc/stat")).section(QLatin1Char('\n'), 0, 0).split(QLatin1Char(' '), Qt::SkipEmptyParts);
    quint64 total = 0, idle = 0;
    for (int i = 1; i < cpuLine.size(); ++i)
        total += cpuLine[i].toULongLong();
    if (cpuLine.size() > 5)
        idle = cpuLine[4].toULongLong() + cpuLine[5].toULongLong();
    const quint64 dTotal = total - m_lastTotal, dIdle = idle - m_lastIdle;
    if (m_lastTotal && dTotal)
        m_cpu = 100.0 * double(dTotal - dIdle) / double(dTotal);
    const double elapsedTicks = m_lastTotal ? double(dTotal) / m_cores : 0;
    m_lastTotal = total;
    m_lastIdle = idle;
    push(m_cpuHistory, m_cpu);

    // memory
    QHash<QString, quint64> mem;
    for (const QString &line : readFile(QStringLiteral("/proc/meminfo")).split(QLatin1Char('\n'), Qt::SkipEmptyParts))
        mem.insert(line.section(QLatin1Char(':'), 0, 0), line.section(QLatin1Char(':'), 1).trimmed().section(QLatin1Char(' '), 0, 0).toULongLong() * 1024);
    const quint64 memTotal = mem.value(QStringLiteral("MemTotal")), memAvail = mem.value(QStringLiteral("MemAvailable"));
    const double memUsed = double(memTotal - memAvail);
    m_memory = {{QStringLiteral("fraction"), memTotal ? memUsed / double(memTotal) : 0.0},
                {QStringLiteral("text"), f.formatByteSize(memUsed, 1)},
                {QStringLiteral("of"), f.formatByteSize(double(memTotal), 0)}};
    push(m_memHistory, memTotal ? 100.0 * memUsed / double(memTotal) : 0);

    // disk: where your files live
    const QStorageInfo st(QDir::homePath());
    const double used = double(st.bytesTotal() - st.bytesAvailable());
    m_disk = {{QStringLiteral("fraction"), st.bytesTotal() ? used / double(st.bytesTotal()) : 0.0},
              {QStringLiteral("text"), f.formatByteSize(used, 0)},
              {QStringLiteral("of"), f.formatByteSize(double(st.bytesTotal()), 0)},
              {QStringLiteral("free"), f.formatByteSize(double(st.bytesAvailable()), 0)}};

    // network: bytes per second in and out, every interface but loopback
    quint64 rx = 0, tx = 0;
    const QStringList net = readFile(QStringLiteral("/proc/net/dev")).split(QLatin1Char('\n'), Qt::SkipEmptyParts).mid(2);
    for (const QString &line : net) {
        const QString name = line.section(QLatin1Char(':'), 0, 0).trimmed();
        if (name == QLatin1String("lo"))
            continue;
        const QStringList v = line.section(QLatin1Char(':'), 1).split(QLatin1Char(' '), Qt::SkipEmptyParts);
        if (v.size() > 8) {
            rx += v[0].toULongLong();
            tx += v[8].toULongLong();
        }
    }
    const qint64 now = QDateTime::currentMSecsSinceEpoch();
    double down = 0, up = 0;
    if (m_lastNetMs) {
        const double secs = std::max(0.001, (now - m_lastNetMs) / 1000.0);
        down = (rx - m_lastRx) / secs;
        up = (tx - m_lastTx) / secs;
    }
    m_lastRx = rx;
    m_lastTx = tx;
    m_lastNetMs = now;
    m_network = {{QStringLiteral("down"), f.formatByteSize(down, 1) + QStringLiteral("/s")},
                 {QStringLiteral("up"), f.formatByteSize(up, 1) + QStringLiteral("/s")}};
    push(m_netHistory, down);

    // battery, on laptops
    m_battery.clear();
    for (const QString &b : QDir(QStringLiteral("/sys/class/power_supply")).entryList({QStringLiteral("BAT*")}, QDir::Dirs | QDir::System)) {
        const QString base = QStringLiteral("/sys/class/power_supply/") + b;
        m_battery = {{QStringLiteral("percent"), readFile(base + QStringLiteral("/capacity")).trimmed().toInt()},
                     {QStringLiteral("status"), readFile(base + QStringLiteral("/status")).trimmed()}};
        break;
    }

    // how long it's been on
    const qint64 up_s = qint64(readFile(QStringLiteral("/proc/uptime")).section(QLatin1Char(' '), 0, 0).toDouble());
    m_uptime = up_s >= 86400 ? QStringLiteral("%1 days").arg(up_s / 86400) : up_s >= 3600 ? QStringLiteral("%1 h %2 min").arg(up_s / 3600).arg((up_s % 3600) / 60) : QStringLiteral("%1 min").arg(up_s / 60);

    sampleProcesses(elapsedTicks);
    Q_EMIT sampled();
}

void Sampler::sampleProcesses(double elapsedTicks)
{
    struct Group {
        QString name;
        double cpu = 0;
        quint64 rss = 0;
        QVariantList pids;
        bool mine = false;
    };
    QHash<QString, Group> groups;
    QHash<int, quint64> ticks;
    const long page = sysconf(_SC_PAGESIZE);
    const uid_t me = getuid();

    for (const QString &d : QDir(QStringLiteral("/proc")).entryList(QDir::Dirs | QDir::NoDotAndDotDot)) {
        bool ok = false;
        const int pid = d.toInt(&ok);
        if (!ok)
            continue;
        const QString stat = readFile(QStringLiteral("/proc/%1/stat").arg(pid));
        const int close = stat.lastIndexOf(QLatin1Char(')'));
        if (close < 0)
            continue;
        const QString comm = stat.mid(stat.indexOf(QLatin1Char('(')) + 1, close - stat.indexOf(QLatin1Char('(')) - 1);
        const QStringList rest = stat.mid(close + 2).split(QLatin1Char(' '));
        if (rest.size() < 22)
            continue;
        const quint64 t = rest[11].toULongLong() + rest[12].toULongLong();
        ticks.insert(pid, t);
        const quint64 rss = rest[21].toULongLong() * quint64(page);
        if (rss == 0)
            continue; // kernel threads
        const double cpu = elapsedTicks > 0 && m_lastProcTicks.contains(pid) ? 100.0 * double(t - m_lastProcTicks.value(pid)) / elapsedTicks / m_cores : 0;
        QString cmd = readFile(QStringLiteral("/proc/%1/cmdline").arg(pid));
        cmd.replace(QChar(0), QLatin1Char(' '));
        QFileInfo owner(QStringLiteral("/proc/%1").arg(pid));
        // things people don't think of as apps are folded into two rows
        static const QRegularExpression background(QStringLiteral(
            "^(kded|kactivitymanage|kwalletd|ksmserver|ksecretd|kglobalacc|kaccess|kscreen|xdg-|systemd|dbus|at-spi|gvfs|pipewire|wireplumber|"
            "polkit|plasma-(?!shell)|org_kde_power|powerdevil|baloo|ibus|fcitx|flatpak-|bwrap$|gpg-agent|ssh-agent|kioworker|kiod|kio-|krunner|"
            "xembedsniproxy|gmenudbusmenupro|DiscoverNotifie|xwaylandvideobr|vmtoolsd|vmware-|kdeconnect|evolution-|goa-|tracker-|uresourced|sshd|\\(sd-pam\\)|startplasma)"));
        const QString name = owner.ownerId() != getuid() ? QStringLiteral("System")
                             : (background.match(comm).hasMatch() && !cmd.contains(QLatin1String("--app-id="))) ? QStringLiteral("Background services")
                                                                                                              : friendly(comm, cmd);
        Group &g = groups[name];
        g.name = name;
        g.cpu += cpu;
        g.rss += rss;
        g.pids.append(pid);
        g.mine = name != QLatin1String("System") && name != QLatin1String("Background services") && (g.mine || owner.ownerId() == me);
    }
    m_lastProcTicks = ticks;

    QList<Group> list = groups.values();
    std::sort(list.begin(), list.end(), [](const Group &a, const Group &b) { return a.cpu != b.cpu ? a.cpu > b.cpu : a.rss > b.rss; });
    KFormat f;
    m_apps.clear();
    for (const Group &g : list.mid(0, 12)) {
        m_apps.append(QVariantMap{{QStringLiteral("name"), g.name},
                                  {QStringLiteral("cpu"), g.cpu},
                                  {QStringLiteral("memory"), f.formatByteSize(double(g.rss), 0)},
                                  {QStringLiteral("pids"), g.pids},
                                  {QStringLiteral("mine"), g.mine},
                                  {QStringLiteral("count"), g.pids.size()}});
    }
}

bool Sampler::quit(const QVariantList &pids)
{
    bool any = false;
    const uid_t me = getuid();
    for (const QVariant &p : pids) {
        const int pid = p.toInt();
        if (QFileInfo(QStringLiteral("/proc/%1").arg(pid)).ownerId() != me || pid == getpid())
            continue;
        any = ::kill(pid, SIGTERM) == 0 || any;
    }
    return any;
}
