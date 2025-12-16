use chrono::{DateTime, Local, NaiveDateTime};

/// Parses a timestamp string and converts it to local timezone
/// Supports various formats: ISO 8601, SQLite datetime, etc.
pub fn format_timestamp_to_local(timestamp_str: &str) -> String {
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

/// Extracts year-month (YYYY-MM) from a timestamp string
/// Supports formats like: "2025-12-16 10:30:00 PST", "2025-12-16T10:30:00", etc.
pub fn extract_year_month(timestamp: &str) -> Option<String> {
    // Try to parse common timestamp formats
    // Look for YYYY-MM pattern at the start (works with both "2025-12-16 10:30:00" and "2025-12-16T10:30:00")
    if timestamp.len() >= 7 {
        let prefix = &timestamp[..7];
        if prefix.matches('-').count() == 1 {
            // Check if it matches YYYY-MM pattern
            let parts: Vec<&str> = prefix.split('-').collect();
            if parts.len() == 2 && parts[0].len() == 4 && parts[1].len() == 2 {
                if parts[0].chars().all(|c| c.is_ascii_digit())
                    && parts[1].chars().all(|c| c.is_ascii_digit())
                {
                    return Some(prefix.to_string());
                }
            }
        }
    }
    None
}

/// Sanitizes a string for use in a filename
/// Replaces invalid filename characters with hyphens
pub fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            c if c.is_control() => '-',
            c => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

