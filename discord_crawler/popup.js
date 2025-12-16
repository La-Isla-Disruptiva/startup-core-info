
document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const exportBtn = document.getElementById('exportBtn');
  const clearBtn = document.getElementById('clearBtn');
  const statusText = document.getElementById('statusText');
  const channelName = document.getElementById('channelName');
  const messageCount = document.getElementById('messageCount');
  const totalMessages = document.getElementById('totalMessages');
  const channelCount = document.getElementById('channelCount');
  const lastCrawled = document.getElementById('lastCrawled');
  const dbStatsHeader = document.getElementById('dbStatsHeader');
  const dbStatsContent = document.getElementById('dbStatsContent');
  const dbStatsToggle = document.getElementById('dbStatsToggle');
  const statusDiv = document.getElementById('status');
  const viewDataBtn = document.getElementById('viewDataBtn');
  const dataViewer = document.getElementById('dataViewer');
  const closeViewerBtn = document.getElementById('closeViewerBtn');
  const dataTabs = document.querySelectorAll('.data-tab');
  const dataPanels = document.querySelectorAll('.data-panel');

  let updateInterval = null;
  let allData = null;
  let selectedChannelFilter = null;

  const getDefaultCrawlState = () => ({
    isCrawling: false,
    currentChannel: null,
    currentChannelName: null,
    currentServerName: null,
    messageCount: 0
  });

  const updateCrawlUI = (isCrawling) => {
    if (updateInterval) {
      updateInterval._isCrawling = isCrawling;
    }

    startBtn.disabled = isCrawling || !isOnDiscordChannel;
    stopBtn.disabled = !isCrawling;
    if (isCrawling) {
      statusText.textContent = 'Crawling...';
    } else if (isOnDiscordChannel) {
      statusText.textContent = 'Idle';
    } else {
      statusText.textContent = 'Not in a channel';
    }
    if (isCrawling) {
      statusDiv.classList.add('crawling');
      if (updateInterval) {
        clearInterval(updateInterval);
      }
      updateInterval = setInterval(() => updateStats(), 1000);
      updateInterval._isCrawling = true;
    } else {
      statusDiv.classList.remove('crawling');
      if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
      }
      setTimeout(() => updateStats(), 500);
    }
    // Update channel name in channel field
    updateChannelNameDisplay();
  };

  const sendMessage = async (action, data = {}) => {
    try {
      return await chrome.runtime.sendMessage({ action, ...data });
    } catch (error) {
      console.error(`[Popup] Error sending message ${action}:`, error);
      return { success: false, error: error.message };
    }
  };

  // Toast notification system
  function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) {
      return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, duration);
  }

  // Confirmation dialog
  function showConfirm(message) {
    return new Promise((resolve) => {
      const confirmed = window.confirm(message);
      resolve(confirmed);
    });
  }

  // Button loading state
  function setButtonLoading(button, isLoading) {
    if (isLoading) {
      button.classList.add('button-loading');
      button.disabled = true;
      button.dataset.originalText = button.textContent;
      button.textContent = '';
    } else {
      button.classList.remove('button-loading');
      button.disabled = false;
      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
      }
    }
  }

  let isOnDiscordChannel = false;
  let currentChannelName = null;
  let currentChannelId = null;

  async function checkDiscordChannelPage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url || !tab.id) {
        isOnDiscordChannel = false;
        currentChannelName = null;
        updateUIForDiscordPage(false, null);
        return false;
      }

      // Check if URL is a Discord channel page
      const urlMatch = tab.url.match(/discord\.com\/channels\/(\d+)\/(\d+)/);
      const isChannelPage = urlMatch !== null;

      if (isChannelPage) {
        currentChannelId = urlMatch[2];

        try {
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'getChannelName' });
          if (response && response.channelName) {
            currentChannelName = response.channelName;
          } else {
            currentChannelName = null;
          }
        } catch (error) {
          currentChannelName = null;
        }
      } else {
        currentChannelName = null;
        currentChannelId = null;
      }

      isOnDiscordChannel = isChannelPage;
      updateUIForDiscordPage(isChannelPage, currentChannelName);
      return isChannelPage;
    } catch (error) {
      console.error('[Popup] Error checking Discord channel page:', error);
      isOnDiscordChannel = false;
      currentChannelName = null;
      updateUIForDiscordPage(false, null);
      return false;
    }
  }

  function updateChannelNameDisplay() {
    if (isOnDiscordChannel && currentChannelName) {
      channelName.textContent = currentChannelName;
    } else if (isOnDiscordChannel) {
      channelName.textContent = 'In channel';
    } else {
      channelName.textContent = '-';
    }
  }

  // Update UI based on whether we're on a Discord channel page
  function updateUIForDiscordPage(isOnChannel, _channelName = null) {
    // Get current crawl state to preserve it
    const isCrawling = updateInterval && updateInterval._isCrawling;

    // Always disable start button if not on Discord channel, regardless of crawl state
    // If crawling, button is already disabled, but we still want to enforce Discord channel requirement
    startBtn.disabled = isCrawling || !isOnChannel;

    // Update status text if not crawling
    if (!isCrawling) {
      if (isOnChannel) {
        statusText.textContent = 'Idle';
      } else {
        statusText.textContent = 'Not in a channel';
      }
      if (!isOnChannel) {
        statusDiv.classList.remove('crawling');
      }
    }

    // Update channel name in channel field
    updateChannelNameDisplay();
  }

  // Initialize database and process message queue


  async function getIndexedDBStats() {
    try {
      const response = await sendMessage('getIndexedDBStats');
      if (response && response.success) {
        return {
          messageCount: response.messageCount || 0,
          channelCount: response.channelCount || 0,
          crawlState: response.crawlState || getDefaultCrawlState()
        };
      }
      return { messageCount: 0, channelCount: 0, crawlState: getDefaultCrawlState() };
    } catch (error) {
      console.error('[Popup] Error getting IndexedDB stats:', error);
      return { messageCount: 0, channelCount: 0, crawlState: getDefaultCrawlState() };
    }
  }

  // Get channel-specific stats (message count and last crawled time)
  async function getChannelStats(channelId) {
    if (!channelId) {
      return { messageCount: 0, lastCrawled: null };
    }
    try {
      const response = await sendMessage('getChannelStats', { channel_id: channelId });
      if (response && response.success) {
        return {
          messageCount: response.messageCount || 0,
          lastCrawled: response.lastCrawled || null
        };
      }
      return { messageCount: 0, lastCrawled: null };
    } catch (error) {
      console.error('[Popup] Error getting channel stats:', error);
      return { messageCount: 0, lastCrawled: null };
    }
  }

  // Get all data from IndexedDB via background.js
  async function getIndexedDBData(limit = null) {
    try {
      const response = await sendMessage('getIndexedDBData', { limit });
      if (response && response.success) {
        return {
          servers: response.servers || [],
          channels: response.channels || [],
          users: response.users || [],
          messages: response.messages || []
        };
      }
      return { servers: [], channels: [], users: [], messages: [] };
    } catch (error) {
      console.error('[Popup] Error getting IndexedDB data:', error);
      return { servers: [], channels: [], users: [], messages: [] };
    }
  }

  // Clear IndexedDB via background.js
  async function clearIndexedDB() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'clearIndexedDB' });
      return response && response.success;
    } catch (error) {
      console.error('[Popup] Error clearing IndexedDB:', error);
      return false;
    }
  }

  async function updateStats() {
    try {
      // Get all stats from background.js (IndexedDB stats + crawl state)
      const stats = await getIndexedDBStats();

      // Get channel-specific stats if we're on a channel
      let channelStats = { messageCount: 0, lastCrawled: null };
      if (currentChannelId) {
        channelStats = await getChannelStats(currentChannelId);
      }

      if (stats && stats.crawlState) {
        const state = stats.crawlState;

        // Update status text based on crawl state
        if (state.isCrawling) {
          statusText.textContent = 'Crawling...';
        } else if (isOnDiscordChannel) {
          statusText.textContent = 'Idle';
        } else {
          statusText.textContent = 'Not in a channel';
        }
        statusDiv.classList.toggle('crawling', state.isCrawling);

        // Update channel name - prefer current channel name from checkDiscordChannelPage, fallback to crawl state
        if (currentChannelName) {
          channelName.textContent = currentChannelName;
        } else if (state.currentChannelName) {
          channelName.textContent = state.currentChannelName;
        } else {
          updateChannelNameDisplay();
        }

        // Messages crawled for current channel (use channel stats if available, otherwise use crawl state)
        if (currentChannelId && channelStats.messageCount > 0) {
          messageCount.textContent = channelStats.messageCount;
        } else {
          messageCount.textContent = state.messageCount || 0;
        }

        // Last crawled time
        if (channelStats.lastCrawled) {
          const lastCrawledDate = new Date(channelStats.lastCrawled);
          lastCrawled.textContent = lastCrawledDate.toLocaleString();
        } else {
          lastCrawled.textContent = 'Never';
        }

        totalMessages.textContent = stats.messageCount || 0;
        channelCount.textContent = stats.channelCount || 0;

        startBtn.disabled = state.isCrawling || !isOnDiscordChannel;
        stopBtn.disabled = !state.isCrawling;
      } else {
        // Fallback if stats not available
        if (isOnDiscordChannel) {
          statusText.textContent = 'Idle';
        } else {
          statusText.textContent = 'Not in a channel';
        }
        statusDiv.classList.remove('crawling');
        updateChannelNameDisplay();

        // Use channel stats if available
        if (currentChannelId && channelStats.messageCount > 0) {
          messageCount.textContent = channelStats.messageCount;
        } else {
          messageCount.textContent = '0';
        }

        // Last crawled time
        if (channelStats.lastCrawled) {
          const lastCrawledDate = new Date(channelStats.lastCrawled);
          lastCrawled.textContent = lastCrawledDate.toLocaleString();
        } else {
          lastCrawled.textContent = '-';
        }

        totalMessages.textContent = stats?.messageCount || 0;
        channelCount.textContent = stats?.channelCount || 0;
        startBtn.disabled = !isOnDiscordChannel;
        stopBtn.disabled = true;
      }
    } catch (error) {
      console.error('Error updating stats:', error);
    }
  }

  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      if (changes.crawlState) {
        updateStats();
      }
    }
  });

  // All stats now come from background.js via updateStats()

  // Start crawling
  startBtn.addEventListener('click', async () => {
    const isOnChannel = await checkDiscordChannelPage();
    if (!isOnChannel) {
      showToast('Please navigate to a Discord channel page first.', 'warning');
      return;
    }

    setButtonLoading(startBtn, true);
    try {
      const response = await sendMessage('startCrawl');
      if (response && response.success) {
        updateCrawlUI(true);
        showToast('Crawling started successfully', 'success');
      } else {
        showToast(response?.error || 'Failed to start crawling. Make sure you are on a Discord channel page.', 'error');
      }
    } catch (error) {
      showToast('Error starting crawl: ' + error.message, 'error');
    } finally {
      setButtonLoading(startBtn, false);
    }
  });

  stopBtn.addEventListener('click', async () => {
    setButtonLoading(stopBtn, true);
    try {
      const response = await sendMessage('stopCrawl');
      if (response && response.success) {
        updateCrawlUI(false);
        showToast('Crawling stopped', 'success');
      } else {
        showToast(response?.error || 'Failed to stop crawling', 'error');
      }
    } catch (error) {
      showToast('Error stopping crawl: ' + error.message, 'error');
    } finally {
      setButtonLoading(stopBtn, false);
    }
  });

  exportBtn.addEventListener('click', async () => {
    setButtonLoading(exportBtn, true);
    try {
      const data = await getIndexedDBData();

      if (!data || !data.messages || data.messages.length === 0) {
        showToast('No data to export. Start crawling first!', 'warning');
        setButtonLoading(exportBtn, false);
        return;
      }

      showToast('Exporting database...', 'info', 2000);
      const sqliteData = await exportDatabaseFromIndexedDB(data);
      const blob = new Blob([sqliteData], { type: 'application/x-sqlite3' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `discord-crawl-${new Date().toISOString().split('T')[0]}.db`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 100);

      showToast(`Exported ${data.messages.length} messages successfully!`, 'success');
    } catch (error) {
      console.error('Error exporting database:', error);
      showToast('Error exporting database: ' + error.message, 'error');
    } finally {
      setButtonLoading(exportBtn, false);
    }
  });

  clearBtn.addEventListener('click', async () => {
    const confirmed = await showConfirm('Are you sure you want to clear all data? This will clear both SQLite and IndexedDB. This cannot be undone!');
    if (!confirmed) {
      return;
    }

    setButtonLoading(clearBtn, true);
    try {
      await clearIndexedDB();
      await updateStats();
      chrome.action.setBadgeText({ text: '' });
      showToast('Database cleared successfully', 'success');
    } catch (error) {
      console.error('Error clearing database:', error);
      showToast('Error clearing database: ' + error.message, 'error');
    } finally {
      setButtonLoading(clearBtn, false);
    }
  });


  async function checkAndUpdate() {
    await checkDiscordChannelPage();
    updateStats();
  }

  startBtn.disabled = true;

  (async () => {
    await checkAndUpdate();
  })();

  window.addEventListener('focus', () => {
    checkAndUpdate();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      checkAndUpdate();
    }
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, _tab) => {
    if (changeInfo.status === 'complete') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id === tabId) {
          checkAndUpdate();
        }
      });
    }
  });

  chrome.tabs.onActivated.addListener((_activeInfo) => {
    checkAndUpdate();
  });

  if (dbStatsHeader && dbStatsContent && dbStatsToggle) {
    dbStatsHeader.addEventListener('click', () => {
      const isHidden = dbStatsContent.style.display === 'none';
      dbStatsContent.style.display = isHidden ? 'block' : 'none';
      dbStatsToggle.textContent = isHidden ? '▲' : '▼';
    });
  }

  chrome.runtime.onMessage.addListener((request, _sender, _sendResponse) => {
    if (request.action === 'crawlStatusChanged' && request.isCrawling !== undefined) {
      updateCrawlUI(request.isCrawling);
    }
  });

  viewDataBtn.addEventListener('click', async () => {
    document.querySelectorAll('body > *:not(.data-viewer)').forEach(el => {
      if (el.tagName !== 'SCRIPT') {
        el.style.display = 'none';
      }
    });

    // Show data viewer
    dataViewer.style.display = 'flex';
    await loadAndDisplayData();
  });

  closeViewerBtn.addEventListener('click', () => {
    // Show main content
    document.querySelectorAll('body > *:not(.data-viewer)').forEach(el => {
      if (el.tagName !== 'SCRIPT') {
        el.style.display = '';
      }
    });

    // Hide data viewer
    dataViewer.style.display = 'none';
  });

  dataTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');

      // Update tabs
      dataTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update panels
      dataPanels.forEach(p => p.classList.remove('active'));
      document.getElementById(`${targetTab}Panel`).classList.add('active');
    });
  });

  // Load and display all data
  async function loadAndDisplayData() {
    try {
      // Show loading state
      dataPanels.forEach(panel => {
        panel.querySelector('.data-loading').style.display = 'block';
        panel.querySelector('.data-list').innerHTML = '';
      });

      // Fetch all data from background.js
      const response = await chrome.runtime.sendMessage({
        action: 'getIndexedDBData',
        limit: 1000 // Limit messages to 1000 for performance
      });

      if (response && response.success) {
        allData = response;
        displayServers(response.servers || []);
        displayChannels(response.channels || []);
        displayUsers(response.users || []);
        setupChannelFilter(response.channels || [], response.messages || []);
        displayMessages(response.messages || [], selectedChannelFilter);
      } else {
        throw new Error(response?.error || 'Failed to load data');
      }
    } catch (error) {
      console.error('Error loading data:', error);
      dataPanels.forEach(panel => {
        panel.querySelector('.data-loading').textContent = `Error: ${error.message}`;
      });
    }
  }

  function displayServers(servers) {
    const list = document.getElementById('serversList');
    const loading = document.getElementById('serversPanel').querySelector('.data-loading');
    loading.style.display = 'none';

    if (servers.length === 0) {
      list.innerHTML = '<div class="data-item"><div class="data-item-value empty">No servers found</div></div>';
      return;
    }

    list.innerHTML = servers.map(server => `
      <div class="data-item">
        <div class="data-item-header">
          <div class="data-item-title">${escapeHtml(server.server_name || 'Unknown')}</div>
          <div class="data-item-id">ID: ${server.server_id}</div>
        </div>
        <div class="data-item-field">
          <span class="data-item-label">Server ID:</span>
          <span class="data-item-value">${server.server_id}</span>
        </div>
        <div class="data-item-field">
          <span class="data-item-label">Server Name:</span>
          <span class="data-item-value">${escapeHtml(server.server_name || '(empty)')}</span>
        </div>
      </div>
    `).join('');
  }

  function displayChannels(channels) {
    const list = document.getElementById('channelsList');
    const loading = document.getElementById('channelsPanel').querySelector('.data-loading');
    loading.style.display = 'none';

    if (channels.length === 0) {
      list.innerHTML = '<div class="data-item"><div class="data-item-value empty">No channels found</div></div>';
      return;
    }

    list.innerHTML = channels.map(channel => `
      <div class="data-item">
        <div class="data-item-header">
          <div class="data-item-title">${escapeHtml(channel.channel_name || 'Unknown')}</div>
          <div class="data-item-id">ID: ${channel.channel_id}</div>
        </div>
        <div class="data-item-field">
          <span class="data-item-label">Channel ID:</span>
          <span class="data-item-value">${channel.channel_id}</span>
        </div>
        <div class="data-item-field">
          <span class="data-item-label">Channel Name:</span>
          <span class="data-item-value">${escapeHtml(channel.channel_name || '(empty)')}</span>
        </div>
        <div class="data-item-field">
          <span class="data-item-label">Server ID:</span>
          <span class="data-item-value">${channel.server_id}</span>
        </div>
        <div class="data-item-field">
          <span class="data-item-label">Actions:</span>
          <span class="data-item-value">
            <a href="#" class="channel-link" data-channel-id="${channel.channel_id}" data-channel-name="${escapeHtml(channel.channel_name || 'Unknown')}">
              View Messages →
            </a>
          </span>
        </div>
      </div>
    `).join('');

    // Add click handlers for channel links
    list.querySelectorAll('.channel-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const channelId = link.getAttribute('data-channel-id');
        filterMessagesByChannel(channelId);
      });
    });
  }

  function displayUsers(users) {
    const list = document.getElementById('usersList');
    const loading = document.getElementById('usersPanel').querySelector('.data-loading');
    loading.style.display = 'none';

    if (users.length === 0) {
      list.innerHTML = '<div class="data-item"><div class="data-item-value empty">No users found</div></div>';
      return;
    }

    list.innerHTML = users.map(user => `
      <div class="data-item">
        <div class="data-item-header">
          <div class="data-item-title">${escapeHtml(user.username || 'Unknown')}</div>
          <div class="data-item-id">ID: ${user.user_id}</div>
        </div>
        <div class="data-item-field">
          <span class="data-item-label">User ID:</span>
          <span class="data-item-value">${user.user_id}</span>
        </div>
        <div class="data-item-field">
          <span class="data-item-label">Username:</span>
          <span class="data-item-value">${escapeHtml(user.username || '(empty)')}</span>
        </div>
        <div class="data-item-field">
          <span class="data-item-label">Avatar URL:</span>
          <span class="data-item-value">${user.avatar_url ? `<a href="${user.avatar_url}" target="_blank" style="color: #7289da;">View</a>` : '(empty)'}</span>
        </div>
      </div>
    `).join('');
  }

  function setupChannelFilter(channels, messages) {
    const filterSelect = document.getElementById('channelFilter');
    if (!filterSelect) {
      return;
    }

    // Clear existing options except "All Channels"
    filterSelect.innerHTML = '<option value="">All Channels</option>';

    // Get unique channels from messages
    const channelIds = new Set(messages.map(m => m.channel_id));
    const channelMap = new Map(channels.map(c => [c.channel_id, c]));

    // Add channel options
    channelIds.forEach(channelId => {
      const channel = channelMap.get(channelId);
      const channelName = channel ? channel.channel_name : `Channel ${channelId}`;
      const option = document.createElement('option');
      option.value = channelId;
      option.textContent = escapeHtml(channelName);
      filterSelect.appendChild(option);
    });

    // Set current filter value
    if (selectedChannelFilter) {
      filterSelect.value = selectedChannelFilter;
    }

    // Remove existing event listeners by cloning the element
    const newFilterSelect = filterSelect.cloneNode(true);
    filterSelect.parentNode.replaceChild(newFilterSelect, filterSelect);

    // Add change event listener to the new element
    newFilterSelect.addEventListener('change', (e) => {
      selectedChannelFilter = e.target.value || null;
      if (allData && allData.messages) {
        displayMessages(allData.messages, selectedChannelFilter);
      }
    });
  }

  function filterMessagesByChannel(channelId) {
    selectedChannelFilter = channelId;

    // Switch to messages tab
    const messagesTab = document.querySelector('.data-tab[data-tab="messages"]');
    if (messagesTab) {
      messagesTab.click();
    }

    // Update filter dropdown
    const filterSelect = document.getElementById('channelFilter');
    if (filterSelect) {
      filterSelect.value = channelId;
    }

    // Display filtered messages
    if (allData && allData.messages) {
      displayMessages(allData.messages, selectedChannelFilter);
    }
  }

  function displayMessages(messages, filterChannelId = null) {
    const list = document.getElementById('messagesList');
    const loading = document.getElementById('messagesPanel').querySelector('.data-loading');
    loading.style.display = 'none';

    // Filter messages by channel if filter is set
    let filteredMessages = messages;
    if (filterChannelId) {
      // Convert both to string for comparison to handle type mismatches
      const filterId = String(filterChannelId);
      filteredMessages = messages.filter(m => String(m.channel_id) === filterId);
    }

    if (filteredMessages.length === 0) {
      const filterText = filterChannelId ? ' for selected channel' : '';
      list.innerHTML = `<div class="data-item"><div class="data-item-value empty">No messages found${filterText}</div></div>`;
      return;
    }

    // Create maps for channel and user lookups
    const channelMap = new Map();
    const userMap = new Map();
    if (allData) {
      if (allData.channels) {
        allData.channels.forEach(c => {
          channelMap.set(String(c.channel_id), c.channel_name);
        });
      }
      if (allData.users) {
        allData.users.forEach(u => {
          userMap.set(String(u.user_id), u.username);
        });
      }
    }

    // Add stats header
    const statsHtml = `
      <div class="data-stats">
        <div class="data-stat">
          <div class="data-stat-value">${filteredMessages.length}</div>
          <div class="data-stat-label">Messages ${filterChannelId ? 'Filtered' : 'Loaded'}</div>
        </div>
        <div class="data-stat">
          <div class="data-stat-value">${new Set(filteredMessages.map(m => m.channel_id)).size}</div>
          <div class="data-stat-label">Channels</div>
        </div>
        <div class="data-stat">
          <div class="data-stat-value">${new Set(filteredMessages.map(m => m.user_id).filter(Boolean)).size}</div>
          <div class="data-stat-label">Users</div>
        </div>
      </div>
    `;

    const messagesHtml = filteredMessages.map(message => {
      const timestamp = message.timestamp ? new Date(message.timestamp).toLocaleString() : 'Unknown';
      const content = message.content || '(empty)';
      const hasAttachments = message.has_attachments ? 'Yes' : 'No';

      // Get channel name and username
      const channelName = channelMap.get(String(message.channel_id)) || `Channel ${message.channel_id}`;
      const username = message.user_id ? (userMap.get(String(message.user_id)) || `User ${message.user_id}`) : '(empty)';

      return `
        <div class="data-item">
          <div class="data-item-header">
            <div class="data-item-title">Message</div>
            <div class="data-item-id">ID: ${message.message_id}</div>
          </div>
          <div class="data-item-field">
            <span class="data-item-label">Message ID:</span>
            <span class="data-item-value">${message.message_id}</span>
          </div>
          <div class="data-item-field">
            <span class="data-item-label">Channel:</span>
            <span class="data-item-value">${escapeHtml(channelName)}</span>
          </div>
          <div class="data-item-field">
            <span class="data-item-label">User:</span>
            <span class="data-item-value">${escapeHtml(username)}</span>
          </div>
          <div class="data-item-field">
            <span class="data-item-label">Timestamp:</span>
            <span class="data-item-value">${timestamp}</span>
          </div>
          <div class="data-item-field">
            <span class="data-item-label">Has Attachments:</span>
            <span class="data-item-value">${hasAttachments}</span>
          </div>
          ${message.reactions && message.reactions.length > 0 ? `
          <div class="data-item-field">
            <span class="data-item-label">Reactions:</span>
            <span class="data-item-value">${message.reactions.map(r => `${r.emoji} (${r.count})`).join(', ')}</span>
          </div>
          ` : ''}
          <div class="data-item-field">
            <span class="data-item-label">Content:</span>
            <div class="message-content">${escapeHtml(content)}</div>
          </div>
        </div>
      `;
    }).join('');

    list.innerHTML = statsHtml + messagesHtml;
  }

  function escapeHtml(text) {
    if (!text) {
      return '';
    }
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Cleanup on popup close
  window.addEventListener('beforeunload', () => {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
  });
});

