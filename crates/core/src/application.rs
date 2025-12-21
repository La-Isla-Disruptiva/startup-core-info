use crate::ports::{DataRepository, MarkdownWriter, Result};

/// Application service for extracting and formatting Discord messages
pub struct ExtractionServiceImpl {
    data_repository: Box<dyn DataRepository>,
    markdown_writer: Box<dyn MarkdownWriter>,
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

