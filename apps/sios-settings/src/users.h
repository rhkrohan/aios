// Your account: name, picture, password (AccountsService over D-Bus).
#pragma once

#include "area.h"

class UsersArea : public Area
{
    Q_OBJECT
public:
    explicit UsersArea(QObject *parent = nullptr);
    void refresh() override;
    void set(const QString &key, const QVariant &value) override;
    void act(const QString &name, const QVariantMap &params) override;
};
