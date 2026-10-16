#include "keyboard.h"

#include <KConfig>
#include <KConfigGroup>
#include <QDBusConnection>
#include <QDBusMessage>
#include <QFile>
#include <QTextStream>

// what Caps Lock can do, and the keys that switch layouts: xkb option names
static const QStringList CAPS = {QStringLiteral("ctrl:nocaps"), QStringLiteral("caps:escape"), QStringLiteral("caps:swapescape"),
                                 QStringLiteral("caps:backspace"), QStringLiteral("caps:none"), QStringLiteral("ctrl:swapcaps")};
static const QStringList SWITCH = {QStringLiteral("grp:alt_shift_toggle"), QStringLiteral("grp:ctrl_shift_toggle"), QStringLiteral("grp:caps_toggle")};
static const QStringList COMPOSE = {QStringLiteral("compose:ralt"), QStringLiteral("compose:rwin"), QStringLiteral("compose:menu"), QStringLiteral("compose:caps")};

KeyboardArea::KeyboardArea(QObject *parent)
    : Area(parent)
{
}

// every layout and variant the system knows, from xkb's own list
static QVariantList readCatalog()
{
    QVariantList out;
    QFile f(QStringLiteral("/usr/share/X11/xkb/rules/evdev.lst"));
    if (!f.open(QIODevice::ReadOnly | QIODevice::Text))
        return out;
    QTextStream in(&f);
    QString section;
    while (!in.atEnd()) {
        const QString line = in.readLine();
        if (line.startsWith(QLatin1Char('!'))) {
            section = line.mid(1).trimmed();
            continue;
        }
        const QString t = line.trimmed();
        if (t.isEmpty())
            continue;
        const int sp = t.indexOf(QLatin1Char(' '));
        if (sp < 0)
            continue;
        const QString id = t.left(sp);
        const QString rest = t.mid(sp).trimmed();
        if (section == QLatin1String("layout")) {
            out.append(QVariantMap{{QStringLiteral("code"), id}, {QStringLiteral("variant"), QString()}, {QStringLiteral("name"), rest}});
        } else if (section == QLatin1String("variant")) {
            const int colon = rest.indexOf(QLatin1Char(':'));
            if (colon < 0)
                continue;
            out.append(QVariantMap{{QStringLiteral("code"), rest.left(colon).trimmed()}, {QStringLiteral("variant"), id}, {QStringLiteral("name"), rest.mid(colon + 1).trimmed()}});
        }
    }
    return out;
}

static QString nameOf(const QVariantList &catalog, const QString &code, const QString &variant)
{
    for (const QVariant &v : catalog) {
        const QVariantMap m = v.toMap();
        if (m.value(QStringLiteral("code")).toString() == code && m.value(QStringLiteral("variant")).toString() == variant)
            return m.value(QStringLiteral("name")).toString();
    }
    return variant.isEmpty() ? code : code + QStringLiteral(" (") + variant + QLatin1Char(')');
}

static bool inCatalog(const QVariantList &catalog, const QString &code, const QString &variant)
{
    for (const QVariant &v : catalog) {
        const QVariantMap m = v.toMap();
        if (m.value(QStringLiteral("code")).toString() == code && m.value(QStringLiteral("variant")).toString() == variant)
            return true;
    }
    return false;
}

QStringList KeyboardArea::options() const
{
    return m_state.value(QStringLiteral("options")).toStringList();
}

void KeyboardArea::refresh()
{
    if (m_catalog.isEmpty())
        m_catalog = readCatalog();

    KConfig xkb(QStringLiteral("kxkbrc"));
    const KConfigGroup g = xkb.group(QStringLiteral("Layout"));
    QStringList codes = g.readEntry("LayoutList", QString()).split(QLatin1Char(','), Qt::SkipEmptyParts);
    QStringList variants = g.readEntry("VariantList", QString()).split(QLatin1Char(','));
    const QStringList opts = g.readEntry("Options", QString()).split(QLatin1Char(','), Qt::SkipEmptyParts);
    if (codes.isEmpty())
        codes = {QStringLiteral("us")}; // the system's own default when nothing is chosen
    QVariantList layouts;
    for (int i = 0; i < codes.size(); ++i) {
        const QString code = codes.at(i).trimmed();
        const QString variant = i < variants.size() ? variants.at(i).trimmed() : QString();
        layouts.append(QVariantMap{{QStringLiteral("code"), code}, {QStringLiteral("variant"), variant}, {QStringLiteral("name"), nameOf(m_catalog, code, variant)}});
    }
    auto pick = [&opts](const QStringList &from) {
        for (const QString &o : opts)
            if (from.contains(o))
                return o;
        return QString();
    };

    KConfig input(QStringLiteral("kcminputrc"));
    const KConfigGroup k = input.group(QStringLiteral("Keyboard"));
    QVariantMap s{
        {QStringLiteral("layouts"), layouts},
        {QStringLiteral("catalog"), m_catalog},
        {QStringLiteral("options"), opts},
        {QStringLiteral("switchKey"), pick(SWITCH)},
        {QStringLiteral("caps"), pick(CAPS)},
        {QStringLiteral("compose"), pick(COMPOSE)},
        {QStringLiteral("repeat"), k.readEntry("KeyRepeat", QStringLiteral("repeat")) != QLatin1String("nothing")},
        {QStringLiteral("delay"), k.readEntry("RepeatDelay", 600)},
        {QStringLiteral("rate"), k.readEntry("RepeatRate", 25.0)},
        {QStringLiteral("numlock"), k.readEntry("NumLock", 2)},
    };
    replace(s);
}

void KeyboardArea::writeLayouts(const QVariantList &layouts, const QStringList &opts)
{
    QStringList codes, variants, names;
    for (const QVariant &v : layouts) {
        const QVariantMap m = v.toMap();
        codes << m.value(QStringLiteral("code")).toString();
        variants << m.value(QStringLiteral("variant")).toString();
        names << QString();
    }
    KConfig xkb(QStringLiteral("kxkbrc"));
    KConfigGroup g = xkb.group(QStringLiteral("Layout"));
    const auto flags = KConfig::Normal | KConfig::Notify;
    g.writeEntry("Use", true, flags);
    g.writeEntry("LayoutList", codes.join(QLatin1Char(',')), flags);
    g.writeEntry("VariantList", variants.join(QLatin1Char(',')), flags);
    g.writeEntry("DisplayNames", names.join(QLatin1Char(',')), flags);
    g.writeEntry("Options", opts.join(QLatin1Char(',')), flags);
    g.writeEntry("ResetOldOptions", true, flags);
    xkb.sync();
    // KWin applies layouts and options when KDE's keyboard settings say so
    QDBusConnection::sessionBus().send(QDBusMessage::createSignal(QStringLiteral("/Layouts"), QStringLiteral("org.kde.keyboard"), QStringLiteral("reloadConfig")));
    refresh();
}

void KeyboardArea::set(const QString &key, const QVariant &value)
{
    // a layout option: one per kind (switch key, Caps Lock, compose), from a fixed list
    const QHash<QString, QStringList> kinds{{QStringLiteral("switchKey"), SWITCH}, {QStringLiteral("caps"), CAPS}, {QStringLiteral("compose"), COMPOSE}};
    if (kinds.contains(key)) {
        const QStringList allowed = kinds.value(key);
        const QString v = value.toString();
        if (!v.isEmpty() && !allowed.contains(v))
            return;
        QStringList opts = options();
        opts.erase(std::remove_if(opts.begin(), opts.end(), [&allowed](const QString &o) { return allowed.contains(o); }), opts.end());
        if (!v.isEmpty())
            opts << v;
        writeLayouts(m_state.value(QStringLiteral("layouts")).toList(), opts);
        Q_EMIT message(QStringLiteral("Keyboard updated"), false);
        return;
    }

    // key repeat and Num Lock: kcminputrc, then KWin reads it again
    KConfig input(QStringLiteral("kcminputrc"));
    KConfigGroup k = input.group(QStringLiteral("Keyboard"));
    const auto flags = KConfig::Normal | KConfig::Notify;
    if (key == QLatin1String("repeat"))
        k.writeEntry("KeyRepeat", value.toBool() ? QStringLiteral("repeat") : QStringLiteral("nothing"), flags);
    else if (key == QLatin1String("delay"))
        k.writeEntry("RepeatDelay", qBound(100, value.toInt(), 1000), flags);
    else if (key == QLatin1String("rate"))
        k.writeEntry("RepeatRate", qBound(5.0, value.toDouble(), 100.0), flags);
    else if (key == QLatin1String("numlock"))
        k.writeEntry("NumLock", qBound(0, value.toInt(), 2), flags);
    else
        return;
    input.sync();
    QDBusConnection::sessionBus().send(QDBusMessage::createMethodCall(QStringLiteral("org.kde.KWin"), QStringLiteral("/KWin"), QStringLiteral("org.kde.KWin"), QStringLiteral("reconfigure")));
    refresh();
}

void KeyboardArea::act(const QString &name, const QVariantMap &params)
{
    QVariantList layouts = m_state.value(QStringLiteral("layouts")).toList();
    const int i = params.value(QStringLiteral("index"), -1).toInt();
    if (name == QLatin1String("add")) {
        const QString code = params.value(QStringLiteral("code")).toString();
        const QString variant = params.value(QStringLiteral("variant")).toString();
        if (!inCatalog(m_catalog, code, variant))
            return;
        for (const QVariant &v : layouts) {
            const QVariantMap m = v.toMap();
            if (m.value(QStringLiteral("code")) == code && m.value(QStringLiteral("variant")) == variant)
                return;
        }
        if (layouts.size() >= 8) {
            Q_EMIT message(QStringLiteral("Eight layouts is the most a keyboard can switch between."), true);
            return;
        }
        layouts.append(QVariantMap{{QStringLiteral("code"), code}, {QStringLiteral("variant"), variant}});
        writeLayouts(layouts, options());
        Q_EMIT message(QStringLiteral("Added ") + nameOf(m_catalog, code, variant), false);
    } else if (name == QLatin1String("remove")) {
        if (i < 0 || i >= layouts.size() || layouts.size() < 2)
            return;
        layouts.removeAt(i);
        writeLayouts(layouts, options());
    } else if (name == QLatin1String("move")) {
        const int j = i + params.value(QStringLiteral("by")).toInt();
        if (i < 0 || i >= layouts.size() || j < 0 || j >= layouts.size())
            return;
        layouts.swapItemsAt(i, j);
        writeLayouts(layouts, options());
    }
}
