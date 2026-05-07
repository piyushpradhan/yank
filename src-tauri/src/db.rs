use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::Mutex;

pub struct Db(pub Mutex<Connection>);

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         PRAGMA foreign_keys=ON;",
    )?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;

    if version < 1 {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS items (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                content       TEXT    NOT NULL,
                category      TEXT    NOT NULL,
                label         TEXT,
                preview       TEXT    NOT NULL,
                source        TEXT,
                pinned        INTEGER NOT NULL DEFAULT 0,
                deleted       INTEGER NOT NULL DEFAULT 0,
                deleted_at    INTEGER,
                created_at    INTEGER NOT NULL,
                last_used_at  INTEGER NOT NULL
             );

             CREATE INDEX IF NOT EXISTS idx_items_pinned
               ON items(pinned DESC, last_used_at DESC) WHERE deleted = 0;
             CREATE INDEX IF NOT EXISTS idx_items_deleted
               ON items(deleted_at) WHERE deleted = 1;

             CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
                label, content, source, category,
                content='items', content_rowid='id',
                tokenize='porter unicode61'
             );

             CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON items BEGIN
                INSERT INTO items_fts(rowid, label, content, source, category)
                VALUES (new.id, new.label, new.content, new.source, new.category);
             END;
             CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON items BEGIN
                INSERT INTO items_fts(items_fts, rowid, label, content, source, category)
                VALUES ('delete', old.id, old.label, old.content, old.source, old.category);
             END;
             CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON items BEGIN
                INSERT INTO items_fts(items_fts, rowid, label, content, source, category)
                VALUES ('delete', old.id, old.label, old.content, old.source, old.category);
                INSERT INTO items_fts(rowid, label, content, source, category)
                VALUES (new.id, new.label, new.content, new.source, new.category);
             END;

             PRAGMA user_version = 1;",
        )?;
    }

    if version < 2 {
        // Embedding storage: raw f32 LE bytes + identifier so we can re-embed on provider change.
        let has_embedding = conn
            .prepare("SELECT 1 FROM pragma_table_info('items') WHERE name='embedding'")?
            .exists([])?;
        if !has_embedding {
            conn.execute_batch(
                "ALTER TABLE items ADD COLUMN embedding BLOB;
                 ALTER TABLE items ADD COLUMN embedding_model TEXT;",
            )?;
        }
        conn.execute_batch("PRAGMA user_version = 2;")?;
    }

    if version < 3 {
        // Image storage: PNG bytes
        let has_image = conn
            .prepare("SELECT 1 FROM pragma_table_info('items') WHERE name='image_data'")?
            .exists([])?;
        if !has_image {
            conn.execute_batch(
                "ALTER TABLE items ADD COLUMN image_data BLOB;",
            )?;
        }
        conn.execute_batch("PRAGMA user_version = 3;")?;
    }

    Ok(())
}

pub fn insert_item(
    conn: &Connection,
    content: &str,
    category: &str,
    preview: &str,
    source: Option<&str>,
) -> rusqlite::Result<i64> {
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO items (content, category, label, preview, source, pinned, deleted, created_at, last_used_at)
         VALUES (?1, ?2, NULL, ?3, ?4, 0, 0, ?5, ?5)",
        params![content, category, preview, source, now],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn insert_image_item(
    conn: &Connection,
    image_data: &[u8],
    preview: &str,
    source: Option<&str>,
) -> rusqlite::Result<i64> {
    let now = chrono::Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO items (content, category, label, preview, source, pinned, deleted, created_at, last_used_at, image_data)
         VALUES ('', 'image', NULL, ?1, ?2, 0, 0, ?3, ?3, ?4)",
        params![preview, source, now, image_data],
    )?;
    Ok(conn.last_insert_rowid())
}
