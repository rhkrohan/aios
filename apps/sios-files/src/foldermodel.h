// What one Files view shows: a folder (or Trash, or Recent), or the "From the
// web" view, turned into groups of plain items for the QML to draw, like the
// preview's FilesApp.tsx: "Folders" first, then files by when they changed.
#pragma once

#include <QObject>
#include <QTimer>
#include <QUrl>
#include <QVariantList>

class KCoreDirLister;
class KFileItem;

class FolderModel : public QObject
{
    Q_OBJECT
    Q_PROPERTY(QString location READ location WRITE setLocation NOTIFY locationChanged)
    Q_PROPERTY(QString title READ title NOTIFY locationChanged)
    Q_PROPERTY(QVariantList crumbs READ crumbs NOTIFY locationChanged)
    Q_PROPERTY(QString filter READ filter WRITE setFilter NOTIFY filterChanged)
    Q_PROPERTY(QString sortBy READ sortBy WRITE setSortBy NOTIFY sortByChanged)
    Q_PROPERTY(QVariantList groups READ groups NOTIFY groupsChanged)
    Q_PROPERTY(int count READ count NOTIFY groupsChanged)
    Q_PROPERTY(bool loading READ loading NOTIFY loadingChanged)
    Q_PROPERTY(bool canGoBack READ canGoBack NOTIFY historyChanged)
    Q_PROPERTY(bool canGoForward READ canGoForward NOTIFY historyChanged)
    Q_PROPERTY(bool isTrash READ isTrash NOTIFY locationChanged)

public:
    explicit FolderModel(QObject *parent = nullptr);

    QString location() const { return m_location; }
    void setLocation(const QString &location);
    QString title() const;
    QVariantList crumbs() const;
    QString filter() const { return m_filter; }
    void setFilter(const QString &filter);
    QString sortBy() const { return m_sortBy; }
    void setSortBy(const QString &sortBy);
    QVariantList groups() const { return m_groups; }
    int count() const { return m_count; }
    bool loading() const { return m_loading; }
    bool canGoBack() const { return m_index > 0; }
    bool canGoForward() const { return m_index + 1 < m_history.size(); }
    bool isTrash() const { return m_location.startsWith(QLatin1String("trash:")); }

    /** Go somewhere new (adds to back/forward history). "web:" is the From the web view. */
    Q_INVOKABLE void go(const QString &location);
    Q_INVOKABLE void back();
    Q_INVOKABLE void forward();
    Q_INVOKABLE void reload();
    /** Every item in the view, in display order (for keyboard moves and Select all). */
    Q_INVOKABLE QVariantList flatItems() const;

    /** What a folder holds, by kind, for its disc: {total, segments:[{kind,n}], untrusted}. */
    static QVariantMap folderStats(const QString &path);
    /** pdf, doc, sheet, slides, image, archive, installer, code, text, audio, video. */
    static QString kindOf(const QString &name, const QString &mimetype);
    /** Where a download came from (Firefox and Chromium write this), or empty. */
    static QString originOf(const QString &localPath);

Q_SIGNALS:
    void locationChanged();
    void filterChanged();
    void sortByChanged();
    void groupsChanged();
    void loadingChanged();
    void historyChanged();

private:
    void open();
    void rebuild();
    void scanWeb();
    QVariantMap itemFor(const KFileItem &item) const;

    KCoreDirLister *m_lister;
    QTimer m_debounce;
    QString m_location;
    QString m_filter;
    QString m_sortBy = QStringLiteral("name");
    QVariantList m_groups;
    QVariantList m_webItems;
    int m_count = 0;
    bool m_loading = false;
    QStringList m_history;
    int m_index = -1;
};
