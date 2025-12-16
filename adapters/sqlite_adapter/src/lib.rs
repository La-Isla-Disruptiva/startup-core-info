use core::domain::ExtractedRecord;
use core::ports::{DataRepository, Result};
use rusqlite::{Connection, Row};

/// SQLite implementation of the DataRepository trait
pub struct SqliteDataRepository {
    db_path: String,
}

impl SqliteDataRepository {
    /// Creates a new SqliteDataRepository with the given database path
    pub fn new(db_path: String) -> Self {
        Self { db_path }
    }
}

impl DataRepository for SqliteDataRepository {
    fn fetch_all_records(&self) -> Result<Vec<ExtractedRecord>> {
        // Connect to the SQLite database
        let conn = Connection::open(&self.db_path)?;

        // Execute a SQL JOIN query to pull channel_name, username, timestamp, and content
        // Ordered by timestamp ascending
        let mut stmt = conn.prepare(
            r#"
            SELECT 
                COALESCE(c.name, 'Unknown') AS channel_name,
                COALESCE(u.username, 'Unknown') AS username,
                COALESCE(m.timestamp, '') AS timestamp,
                COALESCE(m.content, '') AS content
            FROM messages m
            LEFT JOIN channels c ON m.channel_id = c.id
            LEFT JOIN users u ON m.user_id = u.user_id
            ORDER BY m.timestamp ASC
            "#,
        )?;

        // Map rows to ExtractedRecord using rusqlite's row mapping
        let records = stmt
            .query_map([], |row: &Row| {
                Ok(ExtractedRecord {
                    channel_name: row.get(0)?,
                    username: row.get(1)?,
                    timestamp: row.get(2)?,
                    content: row.get(3)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, rusqlite::Error>>()?;

        Ok(records)
    }
}

