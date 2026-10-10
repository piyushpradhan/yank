use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::Mutex;

pub struct Db(pub Mutex<Connection>);

impl Db {
    /// Lock, recovering from poison: nothing holds a transaction across a
    /// panic, so the connection is consistent once the panicking thread unwinds.
    pub fn conn(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.0.lock().unwrap_or_else(|e| {
            self.0.clear_poison();
            e.into_inner()
        })
    }
}

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    match open_inner(path) {
        Err(e) if is_corrupt(&e) => match quarantine(path) {
            Ok(moved) => {
                eprintln!("[db] {e}; moved corrupt db aside to {moved}");
                open_inner(path)
            }
            Err(io) => {
                eprintln!("[db] {e}; quarantine failed: {io}");
                Err(e)
            }
        },
        r => r,
    }
}

/// Only damage to the file itself. BUSY/LOCKED/CANTOPEN/READONLY/IOERR/PERM
/// mean a healthy DB we can't reach right now, so those must propagate.
fn is_corrupt(e: &rusqlite::Error) -> bool {
    matches!(
        e.sqlite_error_code(),
        Some(rusqlite::ErrorCode::DatabaseCorrupt | rusqlite::ErrorCode::NotADatabase)
    )
}

/// Moves the DB and its WAL/SHM aside as one set (`clips.db.corrupt-<ms>`,
/// `…-wal`, `…-shm`) so it stays recoverable with sqlite3 `.recover`. Nothing
/// is deleted. Sidecars must move too, or the fresh DB would replay a stale WAL.
fn quarantine(path: &Path) -> std::io::Result<String> {
    let ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis());
    let to = format!("{}.corrupt-{ms}", path.display());
    std::fs::rename(path, &to)?;
    for ext in ["-wal", "-shm"] {
        match std::fs::rename(format!("{}{ext}", path.display()), format!("{to}{ext}")) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e),
            _ => {}
        }
    }
    Ok(to)
}

fn open_inner(path: &Path) -> rusqlite::Result<Connection> {
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

    // Idempotent and run on every open: repairs DBs where a crash split the
    // ALTERs, including ones already stamped v4. image_data = PNG bytes;
    // embedding/embedding_model = f32 LE bytes + model id for re-embedding.
    for (col, ty) in [("image_data", "BLOB"), ("embedding", "BLOB"), ("embedding_model", "TEXT")] {
        let exists = conn
            .prepare("SELECT 1 FROM pragma_table_info('items') WHERE name = ?1")?
            .exists([col])?;
        if !exists {
            conn.execute_batch(&format!("ALTER TABLE items ADD COLUMN {col} {ty};"))?;
        }
    }
    if version < 4 {
        conn.execute_batch("PRAGMA user_version = 4;")?;
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

/// Check whether `content` already exists in a non-deleted, non-image item.
/// If so the watcher touches the existing row instead of inserting a duplicate —
/// this prevents a round-trip through the clipboard (e.g. copying FROM Yank)
/// from creating an extra entry.
pub fn dedup_text(conn: &Connection, content: &str) -> rusqlite::Result<Option<i64>> {
    let result = conn.query_row(
        "SELECT id FROM items
          WHERE content = ?1 AND category != 'image' AND deleted = 0
          ORDER BY last_used_at DESC LIMIT 1",
        params![content],
        |r| r.get(0),
    );
    match result {
        Ok(id) => Ok(Some(id)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
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

#[cfg(test)]
mod tests {
    #[test]
    fn garbage_db_is_quarantined_and_replaced() {
        let dir = std::env::temp_dir().join(format!("yank-db-quarantine-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("clips.db");
        std::fs::write(&path, vec![0xAB; 4096]).unwrap();

        let conn = super::open(&path).unwrap();
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        let rows: i64 = conn.query_row("SELECT count(*) FROM items", [], |r| r.get(0)).unwrap();
        assert!(version >= 4);
        assert_eq!(rows, 0);

        let moved: Vec<_> = std::fs::read_dir(&dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().starts_with("clips.db.corrupt-"))
            .collect();
        assert_eq!(moved.len(), 1);
        assert_eq!(std::fs::read(moved[0].path()).unwrap(), vec![0xAB; 4096]);

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
