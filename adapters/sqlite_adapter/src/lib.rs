use core::domain::ExtractedRecord;
use core::ports::{DataRepository, Result};
use chrono::{DateTime, Local, NaiveDateTime};
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

    /// Parses a timestamp string and converts it to local timezone
    /// Supports various formats: ISO 8601, SQLite datetime, etc.
    fn format_timestamp_to_local(&self, timestamp_str: &str) -> String {
        if timestamp_str.is_empty() {
            return String::new();
        }

        // Try parsing as ISO 8601 with timezone (e.g., "2025-12-16T10:30:00Z" or "2025-12-16T10:30:00+00:00")
        if let Ok(dt) = DateTime::parse_from_rfc3339(timestamp_str) {
            return dt.with_timezone(&Local).format("%Y-%m-%d %H:%M:%S %Z").to_string();
        }

        // Try parsing as ISO 8601 without timezone (assume UTC)
        if let Ok(naive_dt) = NaiveDateTime::parse_from_str(timestamp_str, "%Y-%m-%dT%H:%M:%S") {
            let utc_dt = naive_dt.and_utc();
            return utc_dt.with_timezone(&Local).format("%Y-%m-%d %H:%M:%S %Z").to_string();
        }

        // Try parsing as SQLite datetime format (e.g., "2025-12-16 10:30:00")
        if let Ok(naive_dt) = NaiveDateTime::parse_from_str(timestamp_str, "%Y-%m-%d %H:%M:%S") {
            let utc_dt = naive_dt.and_utc();
            return utc_dt.with_timezone(&Local).format("%Y-%m-%d %H:%M:%S %Z").to_string();
        }

        // Try parsing as date only (e.g., "2025-12-16") - treat as midnight UTC
        if let Ok(naive_dt) = NaiveDateTime::parse_from_str(timestamp_str, "%Y-%m-%d") {
            let utc_dt = naive_dt.and_utc();
            return utc_dt.with_timezone(&Local).format("%Y-%m-%d %H:%M:%S %Z").to_string();
        }

        // If parsing fails, return the original string
        timestamp_str.to_string()
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
                let raw_timestamp: String = row.get(2)?;
                let formatted_timestamp = self.format_timestamp_to_local(&raw_timestamp);
                
                Ok(ExtractedRecord {
                    channel_name: row.get(0)?,
                    username: row.get(1)?,
                    timestamp: formatted_timestamp,
                    content: row.get(3)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, rusqlite::Error>>()?;

        Ok(records)
    }
}

