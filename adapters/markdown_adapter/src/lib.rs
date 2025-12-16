use core::application::MarkdownWriter;
use core::domain::ExtractedRecord;
use core::ports::Result;
use std::collections::BTreeMap;
use std::fs;

/// Markdown writer adapter implementation
pub struct MarkdownWriterAdapter {
    output_path: String,
}

impl MarkdownWriterAdapter {
    pub fn new(output_path: String) -> Self {
        Self { output_path }
    }

    /// Formats records into markdown, grouping by channel
    fn format_markdown(&self, records: &[ExtractedRecord]) -> String {
        if records.is_empty() {
            return "# Discord Messages\n\nNo messages found.\n".to_string();
        }

        // Group records by channel name
        let mut channels: BTreeMap<String, Vec<&ExtractedRecord>> = BTreeMap::new();
        for record in records {
            channels
                .entry(record.channel_name.clone())
                .or_insert_with(Vec::new)
                .push(record);
        }

        let mut output = String::new();
        output.push_str("# Discord Messages\n\n");
        output.push_str(&format!(
            "**Total messages:** {}\n\n",
            records.len()
        ));
        output.push_str("---\n\n");

        // Format each channel section
        for (channel_name, channel_records) in channels.iter() {
            output.push_str(&format!("## #{}\n\n", channel_name));
            output.push_str(&format!("*{} messages in this channel*\n\n", channel_records.len()));

            // Format each message in the channel
            for record in channel_records {
                // Format message header with username and timestamp
                output.push_str(&format!(
                    "**{}** *{}*\n\n",
                    record.username, record.timestamp
                ));
                
                // Format message content
                if !record.content.trim().is_empty() {
                    let content = record.content.trim();
                    // For multi-line content, preserve formatting
                    // For single-line content, output as-is
                    output.push_str(&format!("{}\n\n", content));
                } else {
                    output.push_str("*[No content]*\n\n");
                }
                
                output.push_str("---\n\n");
            }
        }

        output
    }
}

impl MarkdownWriter for MarkdownWriterAdapter {
    fn write(&self, records: &[ExtractedRecord]) -> Result<()> {
        let markdown_content = self.format_markdown(records);
        fs::write(&self.output_path, markdown_content)?;
        Ok(())
    }
}

