use core::domain::ExtractedRecord;
use core::ports::{MarkdownWriter, Result};
use core::utils::{extract_year_month, sanitize_filename};
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
            let year_month = extract_year_month(&record.timestamp)
                .unwrap_or_else(|| "unknown".to_string());
            
            let key = (record.channel_name.clone(), year_month);
            grouped.entry(key).or_insert_with(Vec::new).push(record);
        }

        // Write a separate file for each channel-month combination
        for ((channel_name, year_month), channel_records) in grouped.iter() {
            let sanitized_channel = sanitize_filename(channel_name);
            let filename = format!("{}-{}.md", sanitized_channel, year_month);
            let file_path = output_dir.join(&filename);

            let markdown_content = self.format_markdown(channel_name, channel_records);
            fs::write(&file_path, markdown_content)?;
        }

        Ok(())
    }
}

