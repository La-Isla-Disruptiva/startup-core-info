use clap::Parser;
use core::application::MarkdownWriter;
use core::ports::DataRepository;
use sqlite_adapter::SqliteDataRepository;
use markdown_adapter::MarkdownWriterAdapter;

/// CLI tool to extract Discord message data from SQLite and format it as Markdown
#[derive(Parser, Debug)]
#[command(name = "discord-extractor")]
#[command(about = "Extracts Discord messages from SQLite database and formats them as Markdown")]
struct Cli {
    /// Path to the source SQLite database file
    #[arg(short = 'i', long = "input-db", required = true)]
    input_db: String,

    /// Path where the final Markdown file will be written
    #[arg(short = 'o', long = "output-file", required = true)]
    output_file: String,
}

fn main() {
    let cli = Cli::parse();

    // Instantiate concrete implementations of secondary adapters
    let data_repository: Box<dyn DataRepository> = Box::new(
        SqliteDataRepository::new(cli.input_db.clone())
    );
    
    let markdown_writer: Box<dyn MarkdownWriter> = Box::new(
        MarkdownWriterAdapter::new(cli.output_file.clone())
    );

    // Instantiate the core business service with dependency injection
    let service = core::application::ExtractionServiceImpl::new(
        data_repository,
        markdown_writer,
    );

    // Execute the primary port method
    match service.execute_extraction() {
        Ok(_) => {
            println!("Successfully extracted messages to {}", cli.output_file);
        }
        Err(e) => {
            eprintln!("Error during extraction: {}", e);
            std::process::exit(1);
        }
    }
}

