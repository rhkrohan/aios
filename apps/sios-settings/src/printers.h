// Printers: the printers this computer knows (state, ink when the printer reports
// it, default), print a test page, remove; find printers on the network or USB
// and add one without a driver (IPP Everywhere); jobs waiting; (advanced) paper
// size and two-sided printing. CUPS's own tools: lpstat, lpinfo, lpoptions, lp,
// cancel. Adding and removing a printer change the system, so they run lpadmin
// through pkexec (the administrator's password); the rest is per person.
#pragma once

#include "area.h"

class PrintersArea : public Area
{
    Q_OBJECT
public:
    explicit PrintersArea(QObject *parent = nullptr);
    void refresh() override;
    void set(const QString &key, const QVariant &value) override;
    void act(const QString &name, const QVariantMap &params) override;

private:
    // like Area::run, but in the C locale so CUPS's answers read the same everywhere
    void cups(const QString &program, const QStringList &args, std::function<void(int, const QString &)> done = {});
    bool known(const QString &printer) const;
    QVariantList m_found;
};
