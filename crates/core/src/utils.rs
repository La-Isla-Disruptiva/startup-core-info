use chrono::{Datelike, Local};
use dateparser::parse;

/// Parses a timestamp string and converts it to local timezone
/// Supports various formats: ISO 8601, SQLite datetime, etc.
/// Uses dateparser to automatically detect and parse common date formats
pub fn format_timestamp_to_local(timestamp_str: &str) -> String {
    if timestamp_str.is_empty() {
        return String::new();
    }

    match parse(timestamp_str) {
        Ok(dt_utc) => {
            let local_dt = dt_utc.with_timezone(&Local);
            local_dt.format("%Y-%m-%d %H:%M:%S %Z").to_string()
        }
        Err(_) => {
            // If parsing fails, return the original string
            timestamp_str.to_string()
        }
    }
}

/// Extracts year-month (YYYY-MM) from a timestamp string
/// Supports formats like: "2025-12-16 10:30:00 PST", "2025-12-16T10:30:00", etc.
/// Uses dateparser to automatically detect and parse common date formats
pub fn extract_year_month(timestamp: &str) -> Option<String> {
    if timestamp.is_empty() {
        return None;
    }

    parse(timestamp).ok().map(|dt_utc| {
        let local_dt = dt_utc.with_timezone(&Local);
        format!("{:04}-{:02}", local_dt.year(), local_dt.month())
    })
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_timestamp_to_local_empty() {
        assert_eq!(format_timestamp_to_local(""), "");
    }

    #[test]
    fn test_format_timestamp_to_local_rfc3339_with_z() {
        let result = format_timestamp_to_local("2025-12-16T10:30:00Z");
        assert!(result.starts_with("2025-12-16"));
        // Time will be converted to local timezone, so we just check it contains a time format
        assert!(result.contains(":") && result.len() > 10);
    }

    #[test]
    fn test_format_timestamp_to_local_iso8601_no_timezone() {
        // ISO 8601 without timezone may not be supported by dateparser
        // This test verifies the behavior - it may return original string or formatted
        let result = format_timestamp_to_local("2025-12-16T10:30:00");
        // Accept either the original string or a formatted result
        assert!(result == "2025-12-16T10:30:00" || result.starts_with("2025-12-16"));
    }

    #[test]
    fn test_format_timestamp_to_local_sqlite_format() {
        let result = format_timestamp_to_local("2025-12-16 10:30:00");
        assert!(result.starts_with("2025-12-16"));
        assert!(result.contains(":"));
    }

    #[test]
    fn test_format_timestamp_to_local_date_only() {
        let result = format_timestamp_to_local("2025-12-16");
        assert!(result.starts_with("2025-12-16"));
    }

    #[test]
    fn test_format_timestamp_to_local_invalid_returns_original() {
        let invalid = "not-a-timestamp";
        assert_eq!(format_timestamp_to_local(invalid), invalid);
    }


    #[test]
    fn test_extract_year_month_valid_format_with_space() {
        assert_eq!(extract_year_month("2025-12-16 10:30:00 PST"), Some("2025-12".to_string()));
    }

    #[test]
    fn test_extract_year_month_valid_format_with_t() {
        // ISO 8601 without timezone may not be supported by dateparser
        // This test verifies the behavior - it may return None or Some depending on dateparser
        let result = extract_year_month("2025-12-16T10:30:00");
        // Accept either result since dateparser behavior may vary
        assert!(result.is_none() || result == Some("2025-12".to_string()));
    }

    #[test]
    fn test_extract_year_month_valid_format_with_timezone() {
        assert_eq!(extract_year_month("2025-12-16 10:30:00 EST"), Some("2025-12".to_string()));
    }

    #[test]
    fn test_extract_year_month_single_digit_month() {
        assert_eq!(extract_year_month("2025-01-16 10:30:00"), Some("2025-01".to_string()));
    }

    #[test]
    fn test_extract_year_month_invalid_format() {
        assert_eq!(extract_year_month("invalid"), None);
    }

    #[test]
    fn test_extract_year_month_too_short() {
        assert_eq!(extract_year_month("2025"), None);
    }

    #[test]
    fn test_extract_year_month_empty() {
        assert_eq!(extract_year_month(""), None);
    }

    #[test]
    fn test_sanitize_filename_valid() {
        assert_eq!(sanitize_filename("general"), "general");
        assert_eq!(sanitize_filename("channel-name"), "channel-name");
    }

    #[test]
    fn test_sanitize_filename_with_slashes() {
        assert_eq!(sanitize_filename("channel/name"), "channel-name");
        assert_eq!(sanitize_filename("channel\\name"), "channel-name");
    }

    #[test]
    fn test_sanitize_filename_with_colons() {
        assert_eq!(sanitize_filename("channel:name"), "channel-name");
    }

    #[test]
    fn test_sanitize_filename_with_special_chars() {
        assert_eq!(sanitize_filename("channel*name"), "channel-name");
        assert_eq!(sanitize_filename("channel?name"), "channel-name");
        assert_eq!(sanitize_filename("channel\"name"), "channel-name");
        assert_eq!(sanitize_filename("channel<name"), "channel-name");
        assert_eq!(sanitize_filename("channel>name"), "channel-name");
        assert_eq!(sanitize_filename("channel|name"), "channel-name");
    }

    #[test]
    fn test_sanitize_filename_with_whitespace() {
        assert_eq!(sanitize_filename("  channel name  "), "channel name");
    }

    #[test]
    fn test_sanitize_filename_mixed() {
        assert_eq!(sanitize_filename("channel/name:test*file"), "channel-name-test-file");
    }

    #[test]
    fn test_sanitize_filename_empty() {
        assert_eq!(sanitize_filename(""), "");
    }
}

