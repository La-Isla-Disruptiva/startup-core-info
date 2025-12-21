use crate::domain::ExtractedRecord;
use std::error::Error;

pub type Result<T> = std::result::Result<T, Box<dyn Error>>;

pub trait DataRepository {
    // Fetches joined data and maps it to ExtractedRecord
    fn fetch_all_records(&self) -> Result<Vec<ExtractedRecord>>;
}

/// Trait for writing markdown content
/// This is a port (interface) that defines how the core communicates with output adapters
pub trait MarkdownWriter: Send + Sync {
    fn write(&self, records: &[ExtractedRecord]) -> Result<()>;
}

