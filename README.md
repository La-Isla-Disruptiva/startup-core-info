# startup-core-info

A Rust CLI application built with Hexagonal Architecture that extracts Discord message data from SQLite databases and formats it into Markdown files.

## Features

- Extracts Discord messages from SQLite databases
- Formats messages as Markdown files
- Groups messages by channel and month
- Converts timestamps to local timezone
- Organizes output into separate files per channel-month combination

## Architecture

This project follows the Hexagonal Architecture pattern:

- **Core**: Domain models, ports (interfaces), and application services
- **Adapters**:
  - `sqlite_adapter`: Reads data from SQLite databases
  - `markdown_adapter`: Writes formatted Markdown files
  - `cli`: Primary adapter (command-line interface)

## Prerequisites

- Rust (latest stable version)
- A SQLite database file containing Discord messages with the following schema:
  - `channels` table: `id`, `name`, `url`
  - `users` table: `user_id`, `username`
  - `messages` table: `channel_id`, `user_id`, `timestamp`, `content`

## Building

Build the project:

```bash
cargo build --release
```

The binary will be located at `target/release/cli`.

## Running

Run the CLI tool with the following command:

```bash
cargo run --bin cli -- --input-db <PATH_TO_SQLITE_DB> --output-folder <OUTPUT_FOLDER>
```

Or if you've built the release binary:

```bash
./target/release/cli --input-db <PATH_TO_SQLITE_DB> --output-folder <OUTPUT_FOLDER>
```

### Arguments

- `-i, --input-db <PATH>`: Path to the source SQLite database file (required)
- `-o, --output-folder <PATH>`: Path to the output folder where Markdown files will be written (required)

### Example

```bash
cargo run --bin cli -- --input-db discord-crawl-2025-12-16.db --output-folder ./output
```

This will:

1. Read messages from `discord-crawl-2025-12-16.db`
2. Group messages by channel and month
3. Create separate Markdown files in the `./output` folder
4. Files will be named: `{channel-name}-{YYYY-MM}.md`

## Output Format

The tool generates Markdown files organized by channel and month. Each file contains:

- Channel header with message count
- Messages formatted with username, timestamp, and content
- Messages are separated by dividers

Example file: `general-2025-12.md`

```markdown
# #general

_42 messages_

---

**username1** _2025-12-16 10:30:00 PST_

Message content here

---
```

## Testing

Run all tests:

```bash
cargo test --workspace
```

Run tests for a specific crate:

```bash
cargo test --package core
```

## Project Structure

```
startup-core-info/
├── crates/
│   ├── core/           # Domain, ports, application services
│   └── cli/            # Command-line interface
├── adapters/
│   ├── sqlite_adapter/ # SQLite database adapter
│   └── markdown_adapter/ # Markdown file writer adapter
└── Cargo.toml          # Workspace configuration
```
