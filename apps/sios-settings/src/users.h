// Your account: your name, your picture, your username (read only), automatic
// login, and changing your password. Through AccountsService on the system bus,
// which asks for the administrator's password (polkit) where the system says so:
// name and picture don't, automatic login and the password do. The new password
// is hashed here (yescrypt, libcrypt) and only the hash is sent; it never goes to
// a file, a log or a command line, and its buffers are wiped after.
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

private:
    QString userPath();
    void call(const QString &method, const QVariant &arg, const QString &done, const QString &failed, const QVariant &arg2 = QVariant());
    QString m_path;
};
