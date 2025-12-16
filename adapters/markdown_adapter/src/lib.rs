use core::application::MarkdownWriter;
use core::domain::ExtractedRecord;
use core::ports::Result;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

/// Markdown writer adapter implementation
pub struct MarkdownWriterAdapter {
    output_folder: String,
}

impl MarkdownWriterAdapter {
    pub fn new(output_folder: String) -> Self {
        Self { output_folder }
    }

    /// Extracts year-month (YYYY-MM) from a timestamp string
    /// Supports formats like: "2025-12-16 10:30:00", "2025-12-16T10:30:00", etc.
    fn extract_year_month(&self, timestamp: &str) -> Option<String> {
        // Try to parse common timestamp formats
        // Look for YYYY-MM pattern at the start
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

    /// Sanitizes a channel name for use in a filename
    fn sanitize_filename(&self, name: &str) -> String {
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

    /// Formats records into markdown for a single channel-month group
    fn format_markdown(&self, channel_name: &str, records: &[&ExtractedRecord]) -> String {
        if records.is_empty() {
            return String::new();
        }

        let mut output = String::new();
        output.push_str(&format!("# #{}\n\n", channel_name));
        output.push_str(&format!("*{} messages*\n\n", records.len()));
        output.push_str("---\n\n");

        // Format each message
        for record in records {
            // Format message header with username and timestamp
            output.push_str(&format!(
                "**{}** *{}*\n\n",
                record.username, record.timestamp
            ));
            
            // Format message content
            if !record.content.trim().is_empty() {
                let content = record.content.trim();
                output.push_str(&format!("{}\n\n", content));
            } else {
                output.push_str("*[No content]*\n\n");
            }
            
            output.push_str("---\n\n");
        }

        output
    }
}

impl MarkdownWriter for MarkdownWriterAdapter {
    fn write(&self, records: &[ExtractedRecord]) -> Result<()> {
        if records.is_empty() {
            return Ok(());
        }

        // Create output directory if it doesn't exist
        let output_dir = Path::new(&self.output_folder);
        fs::create_dir_all(output_dir)?;

        // Group records by channel and month: (channel_name, year_month) -> Vec<records>
        let mut grouped: BTreeMap<(String, String), Vec<&ExtractedRecord>> = BTreeMap::new();
        
        for record in records {
            // Extract year-month from timestamp, default to "unknown" if parsing fails
            let year_month = self
                .extract_year_month(&record.timestamp)
                .unwrap_or_else(|| "unknown".to_string());
            
            let key = (record.channel_name.clone(), year_month);
            grouped.entry(key).or_insert_with(Vec::new).push(record);
        }

        // Write a separate file for each channel-month combination
        for ((channel_name, year_month), channel_records) in grouped.iter() {
            let sanitized_channel = self.sanitize_filename(channel_name);
            let filename = format!("{}-{}.md", sanitized_channel, year_month);
            let file_path = output_dir.join(&filename);

            let markdown_content = self.format_markdown(channel_name, channel_records);
            fs::write(&file_path, markdown_content)?;
        }

        Ok(())
    }
}

