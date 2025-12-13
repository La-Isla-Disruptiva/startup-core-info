/**
 * Exports IndexedDB data to a SQLite database format
 * @param {Object} indexedDBData - The data from IndexedDB containing servers, channels, users, and messages
 * @returns {Promise<Uint8Array>} The exported SQLite database as a Uint8Array
 * @throws {Error} If no data is available to export
 */
// eslint-disable-next-line no-unused-vars
async function exportDatabaseFromIndexedDB(indexedDBData) {
  if (!indexedDBData || !indexedDBData.messages || indexedDBData.messages.length === 0) {
    throw new Error('No data to export');
  }

  // Create a fresh SQLite database for export
  const SQL = await initSqlJs({
    wasmBinary: await fetch(chrome.runtime.getURL('sql-wasm.wasm')).then(r => r.arrayBuffer()),
    locateFile: () => chrome.runtime.getURL('sql-wasm.wasm')
  });

  // Create a new database (not loading from storage)
  const exportDb = new SQL.Database();

  // Create tables
  exportDb.run(`
    CREATE TABLE channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      UNIQUE(url)
    )
  `);

  exportDb.run(`
    CREATE TABLE users (
      user_id TEXT PRIMARY KEY,
      username TEXT
    )
  `);

  exportDb.run(`
    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER,
      message_id TEXT NOT NULL,
      user_id TEXT,
      content TEXT,
      timestamp DATETIME,
      attachments TEXT,
      reactions TEXT,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
      UNIQUE(channel_id, message_id)
    )
  `);

  exportDb.run('CREATE INDEX idx_messages_channel ON messages(channel_id)');
  exportDb.run('CREATE INDEX idx_messages_timestamp ON messages(timestamp)');
  exportDb.run('CREATE INDEX idx_messages_user_id ON messages(user_id)');

  // Export users first (needed for foreign key constraint)
  for (const user of indexedDBData.users || []) {
    if (!user || typeof user.user_id !== 'string') {
      continue;
    }
    try {
      const stmt = exportDb.prepare('INSERT INTO users (user_id, username) VALUES (?, ?)');
      stmt.run([user.user_id, user.username || null]);
      stmt.free();
    } catch (error) {
      console.error('[Database] Error inserting user:', error);
    }
  }

  // Export channels and create mapping
  const channelIdMap = new Map();
  for (const channel of indexedDBData.channels || []) {
    if (!channel || !channel.server_id || !channel.channel_id) {
      continue;
    }
    try {
      const url = `https://discord.com/channels/${channel.server_id}/${channel.channel_id}`;
      const channelName = (typeof channel.channel_name === 'string' && channel.channel_name.trim())
        ? channel.channel_name.trim()
        : 'Unknown';

      const stmt = exportDb.prepare('INSERT INTO channels (name, url) VALUES (?, ?)');
      stmt.run([channelName, url]);
      stmt.free();

      // Get the inserted channel ID
      const selectStmt = exportDb.prepare('SELECT id FROM channels WHERE url = ?');
      selectStmt.bind([url]);
      if (selectStmt.step()) {
        channelIdMap.set(channel.channel_id, selectStmt.get()[0]);
      }
      selectStmt.free();
    } catch (error) {
      console.error('[Database] Error inserting channel:', error);
    }
  }

  // Export messages
  let exportedCount = 0;
  for (const msg of indexedDBData.messages || []) {
    if (!msg || !msg.message_id || !msg.channel_id) {
      continue;
    }

    const channelId = channelIdMap.get(msg.channel_id);
    if (!channelId) {
      continue;
    }

    try {
      // Serialize reactions to JSON if present
      let reactionsJson = null;
      if (msg.reactions && Array.isArray(msg.reactions) && msg.reactions.length > 0) {
        try {
          reactionsJson = JSON.stringify(msg.reactions);
        } catch (error) {
          console.error('[Database] Error serializing reactions:', error);
        }
      }

      const content = (typeof msg.content === 'string') ? msg.content : '';
      const timestamp = (typeof msg.timestamp === 'string' || msg.timestamp instanceof Date)
        ? msg.timestamp
        : null;
      const attachments = msg.has_attachments ? 'Yes' : '';

      const stmt = exportDb.prepare(`
        INSERT INTO messages 
        (channel_id, message_id, user_id, content, timestamp, attachments, reactions)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run([
        channelId,
        msg.message_id,
        msg.user_id || null,
        content,
        timestamp,
        attachments,
        reactionsJson
      ]);
      stmt.free();
      exportedCount++;
    } catch (error) {
      console.error('[Database] Error inserting message:', error);
    }
  }

  if (exportedCount === 0) {
    throw new Error('No valid messages could be exported');
  }

  // Export SQLite database
  const sqliteData = exportDb.export();
  exportDb.close();

  return sqliteData;
}
