#include "printers.h"

#include <QFile>
#include <QRegularExpression>

// paper sizes and two-sided choices a person may pick (CUPS option values)
static const QStringList MEDIA = {QStringLiteral("A4"), QStringLiteral("Letter"), QStringLiteral("Legal"), QStringLiteral("A5"), QStringLiteral("A3")};
static const QStringList SIDES = {QStringLiteral("one-sided"), QStringLiteral("two-sided-long-edge"), QStringLiteral("two-sided-short-edge")};

PrintersArea::PrintersArea(QObject *parent)
    : Area(parent)
{
}

void PrintersArea::cups(const QString &program, const QStringList &args, std::function<void(int, const QString &)> done)
{
    auto *p = new QProcess(this);
    p->setProcessChannelMode(QProcess::MergedChannels);
    QProcessEnvironment env = QProcessEnvironment::systemEnvironment();
    env.insert(QStringLiteral("LC_ALL"), QStringLiteral("C"));
    p->setProcessEnvironment(env);
    connect(p, &QProcess::finished, this, [p, done](int code) {
        const QString out = QString::fromUtf8(p->readAll());
        p->deleteLater();
        if (done)
            done(code, out);
    });
    connect(p, &QProcess::errorOccurred, this, [p, done, program](QProcess::ProcessError e) {
        if (e == QProcess::FailedToStart) {
            p->deleteLater();
            if (done)
                done(-1, program + QStringLiteral(" isn't installed"));
        }
    });
    p->start(program, args);
}

// "k=v k='v w' k=v\ w" from lpoptions, into a map
static QVariantMap parseOptions(const QString &line)
{
    QVariantMap out;
    QString key, val;
    bool inKey = true, quoted = false;
    QChar quote;
    auto flush = [&] {
        if (!key.isEmpty())
            out.insert(key, val);
        key.clear();
        val.clear();
        inKey = true;
    };
    for (int i = 0; i < line.size(); ++i) {
        const QChar c = line.at(i);
        if (inKey) {
            if (c == QLatin1Char('='))
                inKey = false;
            else if (c.isSpace())
                flush();
            else
                key += c;
        } else if (quoted) {
            if (c == quote)
                quoted = false;
            else
                val += c;
        } else if (c == QLatin1Char('\'') || c == QLatin1Char('"')) {
            quoted = true;
            quote = c;
        } else if (c == QLatin1Char('\\') && i + 1 < line.size()) {
            val += line.at(++i);
        } else if (c.isSpace()) {
            flush();
        } else {
            val += c;
        }
    }
    flush();
    return out;
}

// a printer name CUPS accepts, made from what the printer calls itself
static QString printerName(const QString &info)
{
    QString n;
    for (const QChar c : info)
        n += (c.isLetterOrNumber() && c.unicode() < 128) || c == QLatin1Char('-') || c == QLatin1Char('_') ? c : QLatin1Char('_');
    n.replace(QRegularExpression(QStringLiteral("_+")), QStringLiteral("_"));
    n = n.left(48);
    // never a leading dash (it would read as an option)
    while (n.startsWith(QLatin1Char('_')) || n.startsWith(QLatin1Char('-')))
        n.remove(0, 1);
    return n.isEmpty() ? QStringLiteral("Printer") : n;
}

static QString clean(const QString &s, int max = 200)
{
    QString out;
    for (const QChar c : s)
        if (c.category() != QChar::Other_Control && c.category() != QChar::Other_Format)
            out += c;
    return out.left(max).trimmed();
}

bool PrintersArea::known(const QString &printer) const
{
    for (const QVariant &v : m_state.value(QStringLiteral("printers")).toList())
        if (v.toMap().value(QStringLiteral("name")).toString() == printer)
            return true;
    return false;
}

void PrintersArea::refresh()
{
    put(QStringLiteral("found"), m_found);
    cups(QStringLiteral("lpstat"), {QStringLiteral("-p"), QStringLiteral("-d"), QStringLiteral("-v")}, [this](int code, const QString &out) {
        if (code == -1) {
            put(QStringLiteral("available"), false);
            return;
        }
        QVariantMap byName;
        QStringList order;
        QString def;
        static const QRegularExpression printerRe(QStringLiteral("^printer (\\S+) (is idle|now printing|disabled)"));
        static const QRegularExpression deviceRe(QStringLiteral("^device for (\\S+): (.+)$"));
        for (const QString &line : out.split(QLatin1Char('\n'))) {
            if (const auto m = printerRe.match(line); m.hasMatch()) {
                const QString n = m.captured(1);
                const QString st = m.captured(2);
                order << n;
                byName.insert(n, QVariantMap{{QStringLiteral("name"), n},
                                             {QStringLiteral("state"), st == QLatin1String("is idle") ? QStringLiteral("idle") : st == QLatin1String("now printing") ? QStringLiteral("printing") : QStringLiteral("stopped")}});
            } else if (const auto d = deviceRe.match(line); d.hasMatch()) {
                QVariantMap p = byName.value(d.captured(1)).toMap();
                p.insert(QStringLiteral("uri"), d.captured(2).trimmed());
                byName.insert(d.captured(1), p);
            } else if (line.startsWith(QLatin1String("system default destination: "))) {
                def = line.mid(28).trimmed();
            }
        }
        QVariantList printers;
        for (const QString &n : order) {
            QVariantMap p = byName.value(n).toMap();
            p.insert(QStringLiteral("isDefault"), n == def);
            printers.append(p);
        }
        put(QStringLiteral("available"), true);
        put(QStringLiteral("printers"), printers);
        // each printer's details: what it calls itself, ink, paper, two-sided
        for (const QString &n : order) {
            cups(QStringLiteral("lpoptions"), {QStringLiteral("-p"), n}, [this, n](int c, const QString &o) {
                if (c != 0)
                    return;
                const QVariantMap opts = parseOptions(o.trimmed());
                const QStringList names = opts.value(QStringLiteral("marker-names")).toString().split(QLatin1Char(','), Qt::SkipEmptyParts);
                const QStringList levels = opts.value(QStringLiteral("marker-levels")).toString().split(QLatin1Char(','), Qt::SkipEmptyParts);
                const QStringList colors = opts.value(QStringLiteral("marker-colors")).toString().split(QLatin1Char(','), Qt::SkipEmptyParts);
                QVariantList ink;
                for (int i = 0; i < names.size() && i < levels.size(); ++i)
                    ink.append(QVariantMap{{QStringLiteral("name"), clean(names.at(i), 40)}, {QStringLiteral("level"), levels.at(i).toInt()},
                                           {QStringLiteral("color"), i < colors.size() && QRegularExpression(QStringLiteral("^#[0-9A-Fa-f]{6}$")).match(colors.at(i)).hasMatch() ? colors.at(i) : QString()}});
                QVariantList list = m_state.value(QStringLiteral("printers")).toList();
                for (QVariant &v : list) {
                    QVariantMap p = v.toMap();
                    if (p.value(QStringLiteral("name")) != n)
                        continue;
                    p.insert(QStringLiteral("info"), clean(opts.value(QStringLiteral("printer-info"), n).toString()));
                    p.insert(QStringLiteral("model"), clean(opts.value(QStringLiteral("printer-make-and-model")).toString()));
                    p.insert(QStringLiteral("ink"), ink);
                    p.insert(QStringLiteral("media"), opts.value(QStringLiteral("media")).toString());
                    p.insert(QStringLiteral("sides"), opts.value(QStringLiteral("sides"), QStringLiteral("one-sided")).toString());
                    p.insert(QStringLiteral("accepting"), opts.value(QStringLiteral("printer-is-accepting-jobs"), QStringLiteral("true")).toString() == QLatin1String("true"));
                    v = p;
                }
                put(QStringLiteral("printers"), list);
            });
        }
    });
    // jobs waiting: "NAME-ID  user  size  date"
    cups(QStringLiteral("lpstat"), {QStringLiteral("-o")}, [this](int, const QString &out) {
        QVariantList jobs;
        static const QRegularExpression jobRe(QStringLiteral("^(\\S+)-(\\d+)\\s+(\\S+)\\s+(\\d+)\\s+(.+)$"));
        for (const QString &line : out.split(QLatin1Char('\n'))) {
            const auto m = jobRe.match(line.trimmed());
            if (m.hasMatch())
                jobs.append(QVariantMap{{QStringLiteral("id"), m.captured(1) + QLatin1Char('-') + m.captured(2)}, {QStringLiteral("printer"), m.captured(1)},
                                        {QStringLiteral("user"), m.captured(3)}, {QStringLiteral("size"), m.captured(4).toLongLong()}, {QStringLiteral("when"), m.captured(5).trimmed()}});
        }
        put(QStringLiteral("jobs"), jobs);
    });
}

void PrintersArea::set(const QString &key, const QVariant &value)
{
    Q_UNUSED(key)
    Q_UNUSED(value)
}

void PrintersArea::act(const QString &name, const QVariantMap &params)
{
    const QString printer = params.value(QStringLiteral("name")).toString();
    if (name == QLatin1String("discover")) {
        // printers on the network and USB that can print without a driver
        put(QStringLiteral("discovering"), true);
        cups(QStringLiteral("lpinfo"), {QStringLiteral("--timeout"), QStringLiteral("8"), QStringLiteral("--include-schemes"), QStringLiteral("dnssd,ipp,ipps,usb"), QStringLiteral("-l"), QStringLiteral("-v")},
             [this](int, const QString &out) {
                 QVariantList found;
                 QVariantMap cur;
                 auto flush = [&] {
                     const QString uri = cur.value(QStringLiteral("uri")).toString();
                     // a bare scheme ("network ipp") is a backend, not a printer
                     if (uri.contains(QLatin1String("://")) && !uri.contains(QRegularExpression(QStringLiteral("\\s"))))
                         found.append(cur);
                     cur.clear();
                 };
                 for (const QString &raw : out.split(QLatin1Char('\n'))) {
                     const QString line = raw.trimmed();
                     if (line.startsWith(QLatin1String("Device: uri = "))) {
                         flush();
                         cur.insert(QStringLiteral("uri"), line.mid(14).trimmed());
                     } else if (line.startsWith(QLatin1String("info = "))) {
                         cur.insert(QStringLiteral("info"), clean(line.mid(7)));
                     } else if (line.startsWith(QLatin1String("make-and-model = "))) {
                         cur.insert(QStringLiteral("model"), clean(line.mid(17)));
                     } else if (line.startsWith(QLatin1String("class = "))) {
                         cur.insert(QStringLiteral("kind"), line.mid(8).trimmed() == QLatin1String("direct") ? QStringLiteral("USB") : QStringLiteral("Network"));
                     }
                 }
                 flush();
                 for (QVariant &v : found) {
                     QVariantMap m = v.toMap();
                     m.insert(QStringLiteral("suggested"), printerName(m.value(QStringLiteral("info")).toString()));
                     v = m;
                 }
                 m_found = found;
                 put(QStringLiteral("found"), found);
                 put(QStringLiteral("discovering"), false);
             });
    } else if (name == QLatin1String("add")) {
        // only a printer that was just found, under a plain name
        const QString uri = params.value(QStringLiteral("uri")).toString();
        QVariantMap hit;
        for (const QVariant &v : m_found)
            if (v.toMap().value(QStringLiteral("uri")).toString() == uri)
                hit = v.toMap();
        if (hit.isEmpty())
            return;
        const QString n = printerName(params.value(QStringLiteral("name"), hit.value(QStringLiteral("suggested"))).toString());
        const QString info = clean(hit.value(QStringLiteral("info")).toString(), 120);
        put(QStringLiteral("adding"), uri);
        cups(QStringLiteral("/usr/bin/pkexec"), {QStringLiteral("/usr/sbin/lpadmin"), QStringLiteral("-p"), n, QStringLiteral("-E"), QStringLiteral("-v"), uri, QStringLiteral("-m"), QStringLiteral("everywhere"), QStringLiteral("-D"), info},
             [this, n](int code, const QString &out) {
                 put(QStringLiteral("adding"), QString());
                 if (code == 0)
                     Q_EMIT message(n + QStringLiteral(" is ready to print"), false);
                 else if (code == 126 || code == 127)
                     Q_EMIT message(QStringLiteral("Couldn't add the printer. The password window was closed, so nothing changed."), true);
                 else
                     Q_EMIT message(QStringLiteral("Couldn't add the printer. It may need a driver SIOS doesn't have: ") + clean(out, 300), true);
                 refresh();
             });
    } else if (name == QLatin1String("remove") && known(printer)) {
        cups(QStringLiteral("/usr/bin/pkexec"), {QStringLiteral("/usr/sbin/lpadmin"), QStringLiteral("-x"), printer}, [this, printer](int code, const QString &out) {
            if (code == 0)
                Q_EMIT message(printer + QStringLiteral(" removed"), false);
            else if (code == 126 || code == 127)
                Q_EMIT message(QStringLiteral("Couldn't remove the printer. The password window was closed, so nothing changed."), true);
            else
                Q_EMIT message(QStringLiteral("Couldn't remove the printer: ") + clean(out, 300), true);
            refresh();
        });
    } else if (name == QLatin1String("default") && known(printer)) {
        cups(QStringLiteral("lpoptions"), {QStringLiteral("-d"), printer}, [this, printer](int code, const QString &out) {
            Q_EMIT message(code == 0 ? printer + QStringLiteral(" is your default printer") : QStringLiteral("Couldn't change the default printer: ") + clean(out, 300), code != 0);
            refresh();
        });
    } else if (name == QLatin1String("test") && known(printer)) {
        QString page = QStringLiteral("/usr/share/cups/data/default-testpage.pdf");
        if (!QFile::exists(page))
            page = QStringLiteral("/usr/share/cups/data/testprint");
        cups(QStringLiteral("lp"), {QStringLiteral("-d"), printer, QStringLiteral("-t"), QStringLiteral("SIOS test page"), page}, [this, printer](int code, const QString &out) {
            Q_EMIT message(code == 0 ? QStringLiteral("Test page sent to ") + printer : QStringLiteral("Couldn't print the test page: ") + clean(out, 300), code != 0);
            refresh();
        });
    } else if (name == QLatin1String("cancel")) {
        const QString id = params.value(QStringLiteral("id")).toString();
        if (!QRegularExpression(QStringLiteral("^[A-Za-z0-9_.-]+-\\d+$")).match(id).hasMatch())
            return;
        cups(QStringLiteral("cancel"), {id}, [this](int code, const QString &out) {
            Q_EMIT message(code == 0 ? QStringLiteral("Print job cancelled") : QStringLiteral("Couldn't cancel the job: ") + clean(out, 300), code != 0);
            refresh();
        });
    } else if (name == QLatin1String("option") && known(printer)) {
        // your own defaults for this printer: paper size, two-sided
        const QString key = params.value(QStringLiteral("key")).toString();
        const QString value = params.value(QStringLiteral("value")).toString();
        if (!((key == QLatin1String("media") && MEDIA.contains(value)) || (key == QLatin1String("sides") && SIDES.contains(value))))
            return;
        cups(QStringLiteral("lpoptions"), {QStringLiteral("-p"), printer, QStringLiteral("-o"), key + QLatin1Char('=') + value}, [this](int code, const QString &out) {
            if (code != 0)
                Q_EMIT message(QStringLiteral("Couldn't save that: ") + clean(out, 300), true);
            refresh();
        });
    }
}
