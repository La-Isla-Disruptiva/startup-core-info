use crate::domain::ExtractedRecord;
use crate::ports::{DataRepository, Result};

/// Application service for extracting and formatting Discord messages
pub struct ExtractionServiceImpl {
    data_repository: Box<dyn DataRepository>,
    markdown_writer: Box<dyn MarkdownWriter>,
}

/// Trait for writing markdown content
pub trait MarkdownWriter: Send + Sync {
    fn write(&self, records: &[ExtractedRecord]) -> Result<()>;
}

impl ExtractionServiceImpl {
    /// Creates a new ExtractionServiceImpl with the given dependencies
    pub fn new(
        data_repository: Box<dyn DataRepository>,
        markdown_writer: Box<dyn MarkdownWriter>,
    ) -> Self {
        Self {
            data_repository,
            markdown_writer,
        }
    }

    /// Executes the extraction process: fetches records and writes them as markdown
    pub fn execute_extraction(&self) -> Result<()> {
        let records = self.data_repository.fetch_all_records()?;
        self.markdown_writer.write(&records)?;
        Ok(())
    }
}

