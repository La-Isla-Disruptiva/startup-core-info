#[derive(Debug, Clone)]
pub struct ExtractedRecord {
    pub channel_name: String,
    pub username: String,
    pub timestamp: String, // Treat as String for now
    pub content: String,
}

