// Background service worker - Backend data management layer
// Handles all IndexedDB operations and data storage

/**
 * IndexedDB Manager - Handles all IndexedDB operations
 */
class IndexedDBManager {
  constructor() {
    this.dbName = 'discord-crawler-db';
    this.version = 1;
    this.db = null;
  }

  /**
   * Initialize IndexedDB database
   */
  async init() {
    if (this.db) {
      return this.db;
    }

    // Get indexedDB from various possible contexts (service worker, global, etc.)
    const idb = self.indexedDB || globalThis.indexedDB || indexedDB;

    return new Promise((resolve, reject) => {
      const request = idb.open(this.dbName, this.version);

      request.onerror = () => {
        console.error('[Background] Error opening database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object stores if they don't exist
        if (!db.objectStoreNames.contains('servers')) {
          const serverStore = db.createObjectStore('servers', { keyPath: 'server_id' });
          serverStore.createIndex('server_name', 'server_name', { unique: false });
        }

        if (!db.objectStoreNames.contains('channels')) {
          const channelStore = db.createObjectStore('channels', { keyPath: 'channel_id' });
          channelStore.createIndex('server_id', 'server_id', { unique: false });
          channelStore.createIndex('channel_name', 'channel_name', { unique: false });
        }

        if (!db.objectStoreNames.contains('users')) {
          const userStore = db.createObjectStore('users', { keyPath: 'user_id' });
          userStore.createIndex('username', 'username', { unique: false });
        }

        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'message_id' });
          messageStore.createIndex('channel_id', 'channel_id', { unique: false });
          messageStore.createIndex('user_id', 'user_id', { unique: false });
          messageStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

      };
    });
  }

  /**
   * Generic method to store data in IndexedDB
   */
  async _storeData(storeName, data, keyPath) {
    if (!this.db) {
      await this.init();
    }
    if (!data || !data[keyPath]) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.error(`[Background] Error storing ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Store server data
   */
  async storeServer(server) {
    return this._storeData('servers', server, 'server_id');
  }

  /**
   * Store channel data
   */
  async storeChannel(channel) {
    if (!this.db) {
      await this.init();
    }
    if (!channel || !channel.channel_id) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['channels'], 'readwrite');
      const store = transaction.objectStore('channels');

      // Get existing channel to preserve last_crawled_at if not provided
      const getRequest = store.get(channel.channel_id);

      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        // Merge with existing data, preserving last_crawled_at unless explicitly updated
        const channelData = {
          ...existing,
          ...channel,
          // Only update last_crawled_at if it's explicitly provided in the new channel data
          last_crawled_at: channel.last_crawled_at !== undefined ? channel.last_crawled_at : (existing?.last_crawled_at || null)
        };

        const putRequest = store.put(channelData);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => {
          console.error('[Background] Error storing channel:', putRequest.error);
          reject(putRequest.error);
        };
      };

      getRequest.onerror = () => {
        // If get fails, just put the new channel
        const putRequest = store.put(channel);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => {
          console.error('[Background] Error storing channel:', putRequest.error);
          reject(putRequest.error);
        };
      };
    });
  }

  /**
   * Generic method to get data from IndexedDB
   */
  async _getData(storeName, key) {
    if (!this.db) {
      await this.init();
    }
    if (!key) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => {
        console.error(`[Background] Error getting ${storeName}:`, request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get channel by channel_id
   */
  async getChannel(channelId) {
    return this._getData('channels', channelId, 'channel_id');
  }

  /**
   * Store multiple users in batch
   */
  async storeUsers(users) {
    if (!this.db) {
      await this.init();
    }
    if (!users || users.length === 0) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['users'], 'readwrite');
      const store = transaction.objectStore('users');
      let completed = 0;
      let errors = 0;

      users.forEach((user) => {
        if (!user || !user.user_id) {
          completed++;
          if (completed === users.length) {
            if (errors > 0) {
              reject(new Error(`${errors} errors occurred`));
            } else {
              resolve();
            }
          }
          return;
        }

        const request = store.put(user);
        request.onsuccess = () => {
          completed++;
          if (completed === users.length) {
            if (errors > 0) {
              reject(new Error(`${errors} errors occurred`));
            } else {
              resolve();
            }
          }
        };
        request.onerror = () => {
          console.error('[Background] Error storing user:', request.error);
          errors++;
          completed++;
          if (completed === users.length) {
            if (errors > 0) {
              reject(new Error(`${errors} errors occurred`));
            } else {
              resolve();
            }
          }
        };
      });
    });
  }

  /**
   * Store multiple messages in batch
   */
  async storeMessages(messages) {
    if (!this.db) {
      await this.init();
    }
    if (!messages || messages.length === 0) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      let completed = 0;
      let errors = 0;

      messages.forEach((message) => {
        if (!message || !message.message_id) {
          completed++;
          if (completed === messages.length) {
            if (errors > 0) {
              reject(new Error(`${errors} errors occurred`));
            } else {
              resolve();
            }
          }
          return;
        }

        const request = store.put(message);
        request.onsuccess = () => {
          completed++;
          if (completed === messages.length) {
            if (errors > 0) {
              reject(new Error(`${errors} errors occurred`));
            } else {
              resolve();
            }
          }
        };
        request.onerror = () => {
          console.error('[Background] Error storing message:', request.error);
          errors++;
          completed++;
          if (completed === messages.length) {
            if (errors > 0) {
              reject(new Error(`${errors} errors occurred`));
            } else {
              resolve();
            }
          }
        };
      });
    });
  }

  /**
   * Get message count (optionally filtered by channel_id)
   */
  async getMessageCount(channelId = null) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');

      if (channelId) {
        // Count messages for specific channel
        const index = store.index('channel_id');
        const request = index.count(IDBKeyRange.only(channelId));

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          console.error('[Background] Error counting messages for channel:', request.error);
          reject(request.error);
        };
      } else {
        // Count all messages
        const request = store.count();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          console.error('[Background] Error counting messages:', request.error);
          reject(request.error);
        };
      }
    });
  }

  /**
   * Get channel count
   */
  async getChannelCount() {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['channels'], 'readonly');
      const store = transaction.objectStore('channels');
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.error('[Background] Error counting channels:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all messages (with optional limit)
   */
  async getAllMessages(limit = null) {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const index = store.index('timestamp');
      const request = index.openCursor(null, 'prev'); // Get newest first
      const messages = [];
      let count = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && (limit === null || count < limit)) {
          messages.push(cursor.value);
          count++;
          cursor.continue();
        } else {
          resolve(messages);
        }
      };

      request.onerror = () => {
        console.error('[Background] Error getting messages:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all channels
   */
  async getAllChannels() {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['channels'], 'readonly');
      const store = transaction.objectStore('channels');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.error('[Background] Error getting channels:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all users
   */
  async getAllUsers() {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['users'], 'readonly');
      const store = transaction.objectStore('users');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.error('[Background] Error getting users:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all servers
   */
  async getAllServers() {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['servers'], 'readonly');
      const store = transaction.objectStore('servers');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.error('[Background] Error getting servers:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Clear all data
   */
  async clearAll() {
    if (!this.db) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['messages', 'channels', 'users', 'servers'], 'readwrite');

      let completed = 0;
      const total = 4;
      const checkComplete = () => {
        completed++;
        if (completed === total) {
          resolve();
        }
      };

      transaction.objectStore('messages').clear().onsuccess = checkComplete;
      transaction.objectStore('channels').clear().onsuccess = checkComplete;
      transaction.objectStore('users').clear().onsuccess = checkComplete;
      transaction.objectStore('servers').clear().onsuccess = checkComplete;

      transaction.onerror = () => {
        console.error('[Background] Error clearing data:', transaction.error);
        reject(transaction.error);
      };
    });
  }
}

// Initialize IndexedDB manager
const dbManager = new IndexedDBManager();
dbManager.init().catch(err => console.error('[Background] Error initializing IndexedDB:', err));

// Crawl state management - only one crawler at a time
let crawlState = {
  isCrawling: false,
  currentTabId: null,
  currentChannel: null,
  currentChannelName: null,
  currentServerName: null,
  messageCount: 0
};

// Helper: Reset crawl state
const resetCrawlState = () => {
  crawlState.isCrawling = false;
  crawlState.currentTabId = null;
  crawlState.currentChannel = null;
  crawlState.currentChannelName = null;
  crawlState.currentServerName = null;
  crawlState.messageCount = 0;
};

// Helper: Send a consistent response
const sendResponseHelper = (sendResponse, success, data = {}, error = null) => {
  sendResponse({ success, ...data, error });
};

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // Handle start crawl request from popup.js
  if (request.action === 'startCrawl') {
    (async () => {
      try {
        // Check if already crawling
        if (crawlState.isCrawling) {
          sendResponseHelper(sendResponse, false, {}, 'Crawler is already running');
          return;
        }

        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || !tab.url.includes('discord.com')) {
          sendResponseHelper(sendResponse, false, {}, 'Please navigate to a Discord channel first');
          return;
        }

        // Update crawl state
        crawlState.isCrawling = true;
        crawlState.currentTabId = tab.id;
        crawlState.messageCount = 0;

        // Send start message to content script
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'startCrawl' });
          sendResponseHelper(sendResponse, true);
        } catch (error) {
          resetCrawlState();
          sendResponseHelper(sendResponse, false, {}, 'Failed to start crawler: ' + error.message);
        }
      } catch (error) {
        console.error('[Background] Error starting crawl:', error);
        sendResponseHelper(sendResponse, false, {}, error.message);
      }
    })();
    return true; // Keep channel open for async response
  }

  // Handle stop crawl request from popup.js
  if (request.action === 'stopCrawl') {
    (async () => {
      try {
        if (!crawlState.isCrawling) {
          sendResponseHelper(sendResponse, false, {}, 'No crawler is running');
          return;
        }

        // Update last_crawled_at for the current channel when crawl stops
        if (crawlState.currentChannel) {
          try {
            const channel = await dbManager.getChannel(crawlState.currentChannel);
            if (channel) {
              channel.last_crawled_at = new Date().toISOString();
              await dbManager.storeChannel(channel);
            }
          } catch (error) {
            console.error('[Background] Error updating last_crawled_at:', error);
          }
        }

        // Send stop message to content script
        if (crawlState.currentTabId) {
          try {
            await chrome.tabs.sendMessage(crawlState.currentTabId, { action: 'stopCrawl' });
          } catch (error) {
            console.warn('[Background] Error sending stop message to content script:', error);
          }
        }

        // Reset crawl state
        resetCrawlState();

        sendResponseHelper(sendResponse, true);
      } catch (error) {
        console.error('[Background] Error stopping crawl:', error);
        sendResponseHelper(sendResponse, false, {}, error.message);
      }
    })();
    return true; // Keep channel open for async response
  }

  // Handle get crawl status request from popup.js
  if (request.action === 'getCrawlStatus') {
    sendResponse({
      success: true,
      isCrawling: crawlState.isCrawling,
      currentChannel: crawlState.currentChannel,
      currentChannelName: crawlState.currentChannelName,
      currentServerName: crawlState.currentServerName,
      messageCount: crawlState.messageCount
    });
    return false; // Synchronous response
  }

  // Handle status update from content.js
  if (request.action === 'updateCrawlStatus') {
    const wasCrawling = crawlState.isCrawling;

    if (request.isCrawling !== undefined) {
      crawlState.isCrawling = request.isCrawling;
    }
    if (request.channelName) {
      crawlState.currentChannelName = request.channelName;
    }
    if (request.serverName) {
      crawlState.currentServerName = request.serverName;
    }
    if (request.channelId) {
      crawlState.currentChannel = request.channelId;
    }
    if (request.messageCount !== undefined) {
      crawlState.messageCount = request.messageCount;
    }

    // If crawling stopped, notify popup
    if (wasCrawling && !crawlState.isCrawling) {
      // Try to notify popup if it's open
      chrome.runtime.sendMessage({
        action: 'crawlStatusChanged',
        isCrawling: false
      }).catch(() => {
        // Popup might not be open, ignore error
      });
    }

    sendResponseHelper(sendResponse, true);
    return false; // Synchronous response
  }

  // Handle save request from content.js
  if (request.action === 'saveToIndexedDB') {
    (async () => {
      try {
        // Store server
        if (request.server && request.server.server_id) {
          await dbManager.storeServer(request.server);
        }

        // Store channel
        if (request.channel && request.channel.channel_id) {
          // If this is a crawl completion, update last_crawled_at
          if (request.updateLastCrawled) {
            request.channel.last_crawled_at = new Date().toISOString();
          }
          await dbManager.storeChannel(request.channel);
        }

        // Store users (batch)
        if (request.users && request.users.length > 0) {
          await dbManager.storeUsers(request.users);
        }

        // Store messages (batch)
        if (request.messages && request.messages.length > 0) {
          await dbManager.storeMessages(request.messages);
          // Update crawl state message count
          crawlState.messageCount += request.messages.length;
        }

        // Update channel/server info from saved data
        if (request.channel) {
          crawlState.currentChannel = request.channel.channel_id;
          crawlState.currentChannelName = request.channel.channel_name;
        }
        if (request.server) {
          crawlState.currentServerName = request.server.server_name;
        }

        sendResponseHelper(sendResponse, true);
      } catch (error) {
        console.error('[Background] Error saving to IndexedDB:', error);
        sendResponseHelper(sendResponse, false, {}, error.message);
      }
    })();
    return true; // Keep channel open for async response
  }

  // Handle get channel request
  // Handle get channel stats request
  if (request.action === 'getChannelStats') {
    (async () => {
      try {
        const channel = await dbManager.getChannel(request.channel_id);
        if (!channel) {
          sendResponseHelper(sendResponse, true, { messageCount: 0, lastCrawled: null });
          return;
        }

        // Get message count for this channel
        const messageCount = await dbManager.getMessageCount(request.channel_id);

        sendResponseHelper(sendResponse, true, {
          messageCount,
          lastCrawled: channel.last_crawled_at || null
        });
      } catch (error) {
        console.error('[Background] Error getting channel stats:', error);
        sendResponseHelper(sendResponse, false, {}, error.message);
      }
    })();
    return true; // Keep channel open for async response
  }

  // Handle stats request from popup.js - returns both IndexedDB stats and crawl state
  if (request.action === 'getIndexedDBStats') {
    (async () => {
      try {
        const messageCount = await dbManager.getMessageCount();
        const channelCount = await dbManager.getChannelCount();
        sendResponse({
          success: true,
          messageCount: messageCount || 0,
          channelCount: channelCount || 0,
          crawlState: {
            isCrawling: crawlState.isCrawling,
            currentChannel: crawlState.currentChannel,
            currentChannelName: crawlState.currentChannelName,
            currentServerName: crawlState.currentServerName,
            messageCount: crawlState.messageCount
          }
        });
      } catch (error) {
        console.error('[Background] Error getting stats:', error);
        sendResponse({
          success: false,
          error: error.message,
          messageCount: 0,
          channelCount: 0,
          crawlState: crawlState
        });
      }
    })();
    return true; // Keep channel open for async response
  }

  // Handle get all data request from popup.js
  if (request.action === 'getIndexedDBData') {
    (async () => {
      try {
        const [servers, channels, users, messages] = await Promise.all([
          dbManager.getAllServers(),
          dbManager.getAllChannels(),
          dbManager.getAllUsers(),
          dbManager.getAllMessages(request.limit || null)
        ]);
        sendResponseHelper(sendResponse, true, {
          servers, channels, users, messages
        });
      } catch (error) {
        console.error('[Background] Error getting data:', error);
        sendResponseHelper(sendResponse, false, {}, error.message);
      }
    })();
    return true; // Keep channel open for async response
  }

  // Handle clear request from popup.js
  if (request.action === 'clearIndexedDB') {
    (async () => {
      try {
        await dbManager.clearAll();
        sendResponseHelper(sendResponse, true);
      } catch (error) {
        console.error('[Background] Error clearing IndexedDB:', error);
        sendResponseHelper(sendResponse, false, {}, error.message);
      }
    })();
    return true; // Keep channel open for async response
  }
});

// Handle tab close/unload - reset crawl state if the crawling tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (crawlState.isCrawling && crawlState.currentTabId === tabId) {
    resetCrawlState();
  }
});

// Handle tab update (URL change) - reset crawl state if URL changes away from Discord
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (crawlState.isCrawling && crawlState.currentTabId === tabId) {
    if (changeInfo.url && !changeInfo.url.includes('discord.com')) {
      resetCrawlState();
    }
  }
});

