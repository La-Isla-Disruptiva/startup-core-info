use crate::domain::ExtractedRecord;
use std::error::Error;

pub type Result<T> = std::result::Result<T, Box<dyn Error>>;

pub trait DataRepository {
    // Fetches joined data and maps it to ExtractedRecord
    fn fetch_all_records(&self) -> Result<Vec<ExtractedRecord>>;
}

