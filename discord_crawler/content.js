(function () {
  'use strict';

  /**
     * ScraperService - Extracts Discord chat data and structures it according to SQLite schema
     */
  class ScraperService {
    constructor() {
      this.isCrawling = false;
      this.processedMessageIds = new Set();

      // Scrolling state
      this.scrollInterval = null;
      this.scrollCheckInterval = null;
      this.lastMessageCount = 0;
      this.noNewMessagesCount = 0;
      this.SCROLL_DELAY = 200; // Delay between scrolls (ms)
      this.NO_NEW_MESSAGES_THRESHOLD = 3; // Stop after 3 checks with no new messages

      // Context data (server/channel info)
      this.context = {
        server_id: null,
        server_name: null,
        channel_id: null,
        channel_name: null
      };

      this.updateContext();
    }

    /**
         * Extract server_id and channel_id from URL
         * URL format: discord.com/channels/{server_id}/{channel_id}
         */
    extractIdsFromUrl() {
      const url = window.location.href;
      const match = url.match(/discord\.com\/channels\/(\d+)\/(\d+)/);
      if (match) {
        return {
          server_id: match[1],
          channel_id: match[2]
        };
      }
      return { server_id: null, channel_id: null };
    }

    /**
         * Extract server name from DOM
         * Look for nav[aria-label*="server"] h2 OR header h2
         */
    extractServerName() {
      // Strategy 1: Look for nav with aria-label containing "server"
      const navServer = document.querySelector('nav[aria-label*="server"] h2');
      if (navServer) {
        return navServer.textContent?.trim() || null;
      }

      // Strategy 2: Look for header h2
      const headerH2 = document.querySelector('header h2');
      if (headerH2) {
        return headerH2.textContent?.trim() || null;
      }

      // Strategy 3: Fallback - look for any h2 in header area
      const header = document.querySelector('header');
      if (header) {
        const h2 = header.querySelector('h2');
        if (h2) {
          return h2.textContent?.trim() || null;
        }
      }

      return null;
    }

    /**
         * Extract channel name from DOM
         * Look for section[aria-label="Channel header"] h1
         */
    extractChannelName() {
      // Primary: Look for section with aria-label="Channel header"
      const channelHeader = document.querySelector('section[aria-label="Channel header"] h1');
      if (channelHeader) {
        return channelHeader.textContent?.trim() || null;
      }

      // Fallback: Look for titleWrapper class (ignore dynamic hash)
      const titleWrapper = document.querySelector('[class*="titleWrapper"]');
      if (titleWrapper) {
        return titleWrapper.textContent?.trim() || null;
      }

      // Final fallback: Look for h1 in header area
      const header = document.querySelector('header');
      if (header) {
        const h1 = header.querySelector('h1');
        if (h1) {
          return h1.textContent?.trim() || null;
        }
      }

      return null;
    }

    /**
         * Update context (server_id, server_name, channel_id, channel_name)
         */
    updateContext() {
      const ids = this.extractIdsFromUrl();
      this.context.server_id = ids.server_id;
      this.context.channel_id = ids.channel_id;
      this.context.server_name = this.extractServerName();
      this.context.channel_name = this.extractChannelName();

      if (this.isCrawling) {
        chrome.runtime.sendMessage({
          action: 'updateCrawlStatus',
          channelId: this.context.channel_id,
          channelName: this.context.channel_name,
          serverName: this.context.server_name,
          messageCount: this.processedMessageIds.size
        }).catch(err => console.error('[ScraperService] Error sending status update:', err));
      }
    }

    /**
         * Extract user_id from avatar image URL
         * Patterns:
         * 1. .../avatars/{user_id}/{hash}.webp
         * 2. .../guilds/{guild_id}/users/{user_id}/avatars/{hash}.webp
         */
    extractUserIdFromAvatar(imgElement) {
      if (!imgElement || !imgElement.src) {
        return null;
      }

      const src = imgElement.src;

      // Pattern 1: .../guilds/{guild_id}/users/{user_id}/avatars/{hash}.webp
      const guildMatch = src.match(/guilds\/\d+\/users\/(\d+)\/avatars\//);
      if (guildMatch && guildMatch[1]) {
        return guildMatch[1];
      }

      // Pattern 2: .../avatars/{user_id}/{hash}.webp
      const avatarMatch = src.match(/avatars\/(\d+)\//);
      if (avatarMatch && avatarMatch[1]) {
        return avatarMatch[1];
      }

      return null;
    }

    /**
         * Extract username from message element
         * Look for span[id^="message-username-"]
         */
    extractUsername(element) {
      // Strategy 1: Look for span with id starting with "message-username-"
      const usernameSpan = element.querySelector('span[id^="username"]');
      if (usernameSpan) {
        return usernameSpan.textContent?.trim() || null;
      }

      // Strategy 2: Look for elements with username-related classes
      const usernameSelectors = [
        '[class*="username"]',
        '[class*="author"]',
        '[id*="user"]'
      ];

      for (const selector of usernameSelectors) {
        const elem = element.querySelector(selector);
        if (elem && elem.textContent?.trim()) {
          return elem.textContent.trim();
        }
      }

      return null;
    }

    /**
         * Extract avatar URL from message element
         */
    extractAvatarUrl(element) {
      // Look for avatar image
      const avatarImg = element.querySelector('img[src*="cdn.discordapp.com/avatars/"]') ||
                element.querySelector('img[src*="discordapp.com/avatars/"]') ||
                element.querySelector('img[src*="avatars/"]');

      if (avatarImg && avatarImg.src) {
        return avatarImg.src;
      }

      return null;
    }

    /**
         * Extract message ID from element
         * ID format: chat-messages-{channel_id}-{message_id}
         */
    extractMessageId(element) {
      const id = element.getAttribute('id');
      if (!id) {
        return null;
      }

      // Match pattern: chat-messages-{channel_id}-{message_id}
      const match = id.match(/^chat-messages-\d+-(\d+)$/);
      if (match && match[1]) {
        return match[1];
      }

      // Fallback: return the full ID if pattern doesn't match
      return id;
    }

    /**
         * Extract timestamp from message element
         * Look for <time> element and use datetime attribute
         */
    extractTimestamp(element) {
      const timeElement = element.querySelector('time');
      if (timeElement && timeElement.getAttribute('datetime')) {
        return timeElement.getAttribute('datetime');
      }

      // Fallback: try to find timestamp in text
      const timestampSelectors = [
        '[class*="timestamp"]',
        'time'
      ];

      for (const selector of timestampSelectors) {
        const elem = element.querySelector(selector);
        if (elem) {
          const datetime = elem.getAttribute('datetime');
          if (datetime) {
            return datetime;
          }
        }
      }

      // Last resort: use current time
      return new Date().toISOString();
    }

    /**
         * Extract content from message element
         * Look for div[id^="message-content-"]
         */
    extractContent(element) {
      // Primary: Look for div with id starting with "message-content-"
      const contentDiv = element.querySelector('div[id^="message-content-"]');
      if (contentDiv) {
        // Return text content (raw text/html as specified)
        return contentDiv.textContent?.trim() || contentDiv.innerHTML?.trim() || '';
      }

      // Fallback: Look for message content by class
      const contentSelectors = [
        '[class*="messageContent"]',
        '[class*="markup"]',
        '[class*="text"]'
      ];

      for (const selector of contentSelectors) {
        const elem = element.querySelector(selector);
        if (elem) {
          return elem.textContent?.trim() || elem.innerHTML?.trim() || '';
        }
      }

      return '';
    }

    /**
         * Extract reactions from message element
         */
    extractReactions(element) {
      const reactions = [];

      // Find reactions container - look for element with role="group" and class containing "reactions"
      // Or look for element with id starting with "message-reactions-"
      let reactionsContainer = element.querySelector('[role="group"][class*="reactions"]');
      if (!reactionsContainer) {
        reactionsContainer = element.querySelector('[id^="message-reactions-"]');
      }
      if (!reactionsContainer) {
        // Fallback: look for any element with class containing "reactions"
        reactionsContainer = element.querySelector('[class*="reactions"]');
      }

      if (!reactionsContainer) {
        return reactions;
      }

      // Find all emoji images with data-type="emoji"
      const emojiImages = reactionsContainer.querySelectorAll('img.emoji[data-type="emoji"]');

      emojiImages.forEach(emojiImg => {
        try {
          // Get emoji name from data-name attribute
          const emojiName = emojiImg.getAttribute('data-name');
          if (!emojiName) {
            return;
          }

          // Find the parent reaction element to get the count
          let reactionEl = emojiImg.closest('[class*="reaction"]:not([class*="reactions"])');
          if (!reactionEl) {
            // Try to find parent by going up the DOM tree
            let parent = emojiImg.parentElement;
            while (parent && parent !== reactionsContainer) {
              if (parent.classList && Array.from(parent.classList).some(c => c.includes('reaction') && !c.includes('reactions'))) {
                reactionEl = parent;
                break;
              }
              parent = parent.parentElement;
            }
          }

          // Get reaction count
          let count = 0;
          if (reactionEl) {
            const countEl = reactionEl.querySelector('[class*="reactionCount"]');
            count = countEl ? parseInt(countEl.textContent.trim()) || 0 : 0;
          }

          // Skip reactions with 0 count
          if (count === 0) {
            return;
          }

          reactions.push({
            emoji: emojiName,
            count: count
          });
        } catch (error) {
          console.error('[ScraperService] Error extracting reaction:', error);
        }
      });

      return reactions;
    }

    /**
         * Check if message has attachments
         */
    hasAttachments(element) {
      const attachmentSelectors = [
        '[class*="attachment"]',
        '[class*="embed"]',
        '[class*="imageWrapper"]'
      ];

      for (const selector of attachmentSelectors) {
        if (element.querySelector(selector)) {
          return true;
        }
      }

      return false;
    }

    /**
         * Check if message has a header (avatar/username visible)
         * Messages without headers are grouped with the previous message's author
         */
    hasMessageHeader(element) {
      // Check for avatar image (indicates message has header)
      const avatarImg = element.querySelector('img[src*="avatars/"]');
      if (avatarImg) {
        return true;
      }

      // Check for username header element
      const usernameHeader = element.querySelector('span[id^="message-username-"]');
      if (usernameHeader) {
        return true;
      }

      // Check for header class (Discord uses classes like "header_c19a55")
      const header = element.querySelector('[class*="header"]');
      if (header && header.querySelector('span[class*="username"]')) {
        return true;
      }

      return false;
    }

    /**
         * Parse a single message element and return structured data
         * Returns an object matching the SQLite schema
         * @param {HTMLElement} element - The message LI element
         * @param {string|null} lastSeenAuthorId - The user_id from the previous message (for grouped messages)
         */
    parseMessage(element, lastSeenAuthorId = null) {
      if (!element || element.tagName !== 'LI') {
        return null;
      }

      // Extract message ID
      const message_id = this.extractMessageId(element);
      if (!message_id) {
        return null;
      }

      // Skip if already processed
      if (this.processedMessageIds.has(message_id)) {
        return null;
      }

      // Check if this message has a header (avatar/username visible)
      const hasHeader = this.hasMessageHeader(element);

      // Extract user info
      let user_id = null;
      let username = null;
      let avatar_url = null;

      if (hasHeader) {
        // Message has header - extract user info from this message
        const avatarImg = element.querySelector('img[src*="avatars/"]');
        user_id = avatarImg ? this.extractUserIdFromAvatar(avatarImg) : null;
        username = this.extractUsername(element);
        avatar_url = this.extractAvatarUrl(element);
      } else {
        // Message has no header - use last seen author (grouped message)
        user_id = lastSeenAuthorId;
        // Try to extract username/avatar from element, but fallback to lastSeenAuthorId
        username = this.extractUsername(element) || null;
        avatar_url = this.extractAvatarUrl(element) || null;
      }

      // Extract message content
      const contentData = this.extractContent(element);
      const timestamp = this.extractTimestamp(element);
      const has_attachments = this.hasAttachments(element);
      const reactions = this.extractReactions(element);

      // Build message object matching SQLite schema
      const message = {
        message_id: message_id,
        channel_id: this.context.channel_id,
        user_id: user_id,
        timestamp: timestamp,
        content: contentData, // Raw text/html content
        has_attachments: has_attachments,
        reactions: reactions
      };

      // Build user object (if user_id found)
      const user = user_id ? {
        user_id: user_id,
        username: username || 'Unknown',
        avatar_url: avatar_url || null
      } : null;

      // Mark as processed
      this.processedMessageIds.add(message_id);

      // Update status in background.js periodically (every 10 messages)
      if (this.isCrawling && this.processedMessageIds.size % 10 === 0) {
        chrome.runtime.sendMessage({
          action: 'updateCrawlStatus',
          messageCount: this.processedMessageIds.size
        }).catch(err => console.error('[ScraperService] Error sending status update:', err));
      }

      return {
        message: message,
        user: user
      };
    }

    /**
         * Extract all existing messages from DOM
         * Uses state-based iteration to handle grouped messages (Cozy mode)
         */
    extractExistingMessages() {
      const messages = [];
      const users = new Map(); // Deduplicate users by user_id

      // Find message container
      const chatList = document.querySelector('ol[data-list-id="chat-messages"]');
      if (!chatList) {
        return { messages: [], users: [] };
      }

      // Find all message list items
      const messageElements = chatList.querySelectorAll('li[id^="chat-messages-"]');

      let lastSeenAuthorId = null;
      messageElements.forEach((element, index) => {
        try {
          // Parse message with last seen author ID
          const parsed = this.parseMessage(element, lastSeenAuthorId);

          if (parsed && parsed.message) {
            messages.push(parsed.message);

            // Update lastSeenAuthorId if this message has a header and user_id
            if (parsed.message.user_id) {
              lastSeenAuthorId = parsed.message.user_id;
            }

            // Add user if found and not already in map
            if (parsed.user && parsed.user.user_id && !users.has(parsed.user.user_id)) {
              users.set(parsed.user.user_id, parsed.user);
            }
          }
        } catch (error) {
          console.error(`[ScraperService] Error parsing message ${index}:`, error);
        }
      });

      return {
        messages: messages,
        users: Array.from(users.values())
      };
    }

    /**
         * Find the scrollable container for messages
         * Based on Discord's structure: messagesWrapper > scroller (scrollable) > scrollerContent > ol[data-list-id="chat-messages"]
         */
    findScrollContainer() {
      const scroller = document.querySelector('div[class*="scroller_"][class*="managedReactiveScroller_"]');
      if (scroller) {
        return scroller;
      }
      return null;
    }

    /**
         * Scroll to bottom of messages
         */
    scrollToBottom() {
      const container = this.findScrollContainer();
      if (container) {
        container.scrollTop = container.scrollHeight;
        return true;
      }
      return false;
    }

    /**
         * Scroll up gradually to load older messages
         */
    scrollUp() {
      const container = this.findScrollContainer();
      if (!container) {
        return false;
      }

      const currentScroll = container.scrollTop;
      const scrollAmount = container.clientHeight * 0.8; // Scroll up 80% of viewport
      const newScroll = Math.max(0, currentScroll - scrollAmount);

      container.scrollTop = newScroll;
      return true;
    }

    /**
         * Check if we've reached the top (no new messages after scrolling)
         */
    checkIfReachedTop() {
      const currentMessageCount = this.processedMessageIds.size;

      if (currentMessageCount === this.lastMessageCount) {
        this.noNewMessagesCount++;

        if (this.noNewMessagesCount >= this.NO_NEW_MESSAGES_THRESHOLD) {
          const container = this.findScrollContainer();
          if (container && container.scrollTop <= 10) {
            this.stopCrawling();
            return true;
          }
        }
      } else {
        this.noNewMessagesCount = 0;
        this.lastMessageCount = currentMessageCount;
      }

      return false;
    }

    /**
         * Start automatic scrolling
         */
    startAutoScrolling() {
      if (this.scrollInterval) {
        return; // Already scrolling
      }

      // First, scroll to bottom
      this.scrollToBottom();

      // Wait a bit for messages to load, then start scrolling up
      setTimeout(() => {
        this.lastMessageCount = this.processedMessageIds.size;
        this.noNewMessagesCount = 0;

        // Function to perform one scroll cycle
        const performScrollCycle = () => {
          if (!this.isCrawling) {
            this.stopAutoScrolling();
            return;
          }

          // Get message count before scrolling
          const beforeCount = this.processedMessageIds.size;

          // Scroll up
          const scrolled = this.scrollUp();

          if (!scrolled) {
            this.noNewMessagesCount++;
            if (this.noNewMessagesCount >= this.NO_NEW_MESSAGES_THRESHOLD) {
              this.stopCrawling();
              return;
            }
          }

          // Wait for messages to load, then check
          setTimeout(() => {
            const afterCount = this.processedMessageIds.size;

            if (afterCount === beforeCount) {
              this.noNewMessagesCount++;

              const container = this.findScrollContainer();
              const isAtTop = container && container.scrollTop <= 10;

              if (this.noNewMessagesCount >= this.NO_NEW_MESSAGES_THRESHOLD && isAtTop) {
                this.stopCrawling();
                return;
              }
            } else {
              this.noNewMessagesCount = 0;
              this.lastMessageCount = afterCount;
            }
            if (this.isCrawling) {
              this.scrollInterval = setTimeout(performScrollCycle, this.SCROLL_DELAY);
            }
          }, this.SCROLL_DELAY);
        };

        this.scrollInterval = setTimeout(performScrollCycle, this.SCROLL_DELAY);
      }, 1000);
    }

    /**
         * Stop automatic scrolling
         */
    stopAutoScrolling() {
      if (this.scrollInterval) {
        clearTimeout(this.scrollInterval);
        this.scrollInterval = null;
      }

      if (this.scrollCheckInterval) {
        clearInterval(this.scrollCheckInterval);
        this.scrollCheckInterval = null;
      }
    }

    /**
         * Start crawling
         */
    startCrawling() {
      if (this.isCrawling) {
        return;
      }

      this.isCrawling = true;
      this.processedMessageIds.clear();
      this.updateContext();

      if (typeof updateButtonState === 'function') {
        updateButtonState(true);
      }

      const existing = this.extractExistingMessages();
      if (existing.messages.length > 0) {
        const serverData = {
          server_id: this.context.server_id,
          server_name: this.context.server_name
        };

        const channelData = {
          channel_id: this.context.channel_id,
          server_id: this.context.server_id,
          channel_name: this.context.channel_name
        };

        chrome.runtime.sendMessage({
          action: 'saveToIndexedDB',
          updateLastCrawled: true,
          server: serverData,
          channel: channelData,
          users: existing.users,
          messages: existing.messages
        }).catch(err => console.error('[ScraperService] Error sending data to background:', err));
      }

      // Start automatic scrolling
      this.startAutoScrolling();
    }

    /**
         * Stop crawling
         */
    stopCrawling() {
      if (!this.isCrawling) {
        return;
      }

      this.isCrawling = false;
      this.stopAutoScrolling();

      if (typeof updateButtonState === 'function') {
        updateButtonState(false);
      }

      chrome.runtime.sendMessage({
        action: 'updateCrawlStatus',
        isCrawling: false
      }).catch(err => console.error('[ScraperService] Error notifying background:', err));
    }
  }

  // Initialize scraper service
  const scraper = new ScraperService();

  // Toolbar button management
  let crawlButton = null;
  let toolbarObserver = null;

  /**
     * Create and inject crawl button into Discord toolbar
     */
  function createCrawlButton() {
    // Check if button already exists
    if (document.getElementById('discord-crawler-btn')) {
      return;
    }

    // Find toolbar element
    const toolbar = document.querySelector('[class*="toolbar"]');
    if (!toolbar) {
      return;
    }

    // Get class names from existing icon wrapper to match Discord's styling
    const existingIcon = toolbar.querySelector('[class*="iconWrapper"]');
    const iconWrapperClass = existingIcon ? existingIcon.className : 'iconWrapper__9293f clickable__9293f';
    const iconClass = existingIcon?.querySelector('[class*="icon"]')?.className || 'icon__9293f';

    // Create button wrapper matching Discord's icon style
    const buttonWrapper = document.createElement('div');
    buttonWrapper.id = 'discord-crawler-btn';
    buttonWrapper.className = iconWrapperClass;
    buttonWrapper.setAttribute('role', 'button');
    buttonWrapper.setAttribute('aria-label', 'Start Crawling');
    buttonWrapper.setAttribute('tabindex', '0');

    // Create SVG icon for start (download icon)
    const startIcon = `
      <svg x="0" y="0" class="${iconClass}" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
        <path fill="currentColor" d="M12 2a1 1 0 0 1 1 1v10.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42L11 13.59V3a1 1 0 0 1 1-1ZM3 18a1 1 0 0 1 1 1h16a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Z"/>
      </svg>
    `;

    buttonWrapper.innerHTML = startIcon;

    // Add hover effect
    buttonWrapper.addEventListener('mouseenter', () => {
      if (!buttonWrapper.hasAttribute('disabled')) {
        buttonWrapper.style.backgroundColor = 'rgba(114, 137, 218, 0.1)';
      }
    });
    buttonWrapper.addEventListener('mouseleave', () => {
      buttonWrapper.style.backgroundColor = 'transparent';
    });

    // Add click handler
    buttonWrapper.addEventListener('click', async () => {
      if (buttonWrapper.hasAttribute('disabled')) {
        return;
      }

      try {
        if (scraper.isCrawling) {
          // Stop crawling
          const response = await chrome.runtime.sendMessage({ action: 'stopCrawl' });
          if (response && response.success) {
            updateButtonState(false);
          }
        } else {
          // Start crawling
          const response = await chrome.runtime.sendMessage({ action: 'startCrawl' });
          if (response && response.success) {
            updateButtonState(true);
          } else {
            console.error('[Content] Failed to start crawling:', response?.error || 'Unknown error');
          }
        }
      } catch (error) {
        console.error('[Content] Error toggling crawl:', error);
      }
    });

    // Add keyboard support
    buttonWrapper.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        buttonWrapper.click();
      }
    });

    // Insert at the beginning of toolbar
    toolbar.insertBefore(buttonWrapper, toolbar.firstChild);
    crawlButton = buttonWrapper;
  }

  /**
     * Update button state based on crawl status
     */
  function updateButtonState(isCrawling) {
    if (!crawlButton) {
      return;
    }

    // Get icon class from existing icon if available
    const existingIcon = document.querySelector('[class*="toolbar"] [class*="icon"]');
    const iconClass = existingIcon?.className || 'icon__9293f';

    if (isCrawling) {
      // Stop icon (square)
      crawlButton.innerHTML = `
        <svg x="0" y="0" class="${iconClass}" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
          <path fill="currentColor" d="M6 6h12v12H6V6Z"/>
        </svg>
      `;
      crawlButton.setAttribute('aria-label', 'Stop Crawling');
      crawlButton.removeAttribute('disabled');
      // Use Discord's red color for stop
      const svg = crawlButton.querySelector('svg');
      if (svg) {
        svg.style.color = '#f04747';
      }
    } else {
      // Start icon (download)
      crawlButton.innerHTML = `
        <svg x="0" y="0" class="${iconClass}" aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
          <path fill="currentColor" d="M12 2a1 1 0 0 1 1 1v10.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42L11 13.59V3a1 1 0 0 1 1-1ZM3 18a1 1 0 0 1 1 1h16a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1Z"/>
        </svg>
      `;
      crawlButton.setAttribute('aria-label', 'Start Crawling');
      crawlButton.removeAttribute('disabled');
      // Reset to default color
      const svg = crawlButton.querySelector('svg');
      if (svg) {
        svg.style.color = '';
      }
    }
  }

  /**
     * Watch for toolbar element and inject button
     */
  function watchForToolbar() {
    // Try to create button immediately
    createCrawlButton();

    // Watch for toolbar if not found
    if (!crawlButton) {
      toolbarObserver = new MutationObserver(() => {
        if (!crawlButton) {
          createCrawlButton();
        }
      });

      toolbarObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  // Initialize toolbar button injection
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', watchForToolbar);
  } else {
    watchForToolbar();
  }

  // Listen for messages from popup and background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startCrawl') {
      scraper.startCrawling();
      updateButtonState(true);
      sendResponse({ success: true });
    } else if (request.action === 'stopCrawl') {
      scraper.stopCrawling();
      updateButtonState(false);
      sendResponse({ success: true });
    } else if (request.action === 'getStatus') {
      scraper.updateContext();
      const status = {
        isCrawling: scraper.isCrawling,
        channelName: scraper.context.channel_name,
        serverName: scraper.context.server_name,
        messageCount: scraper.processedMessageIds.size
      };
      sendResponse(status);
    } else if (request.action === 'updateCrawlButtonState') {
      // Update button state from background
      updateButtonState(request.isCrawling || false);
      sendResponse({ success: true });
    } else if (request.action === 'getChannelName') {
      // Get current channel name
      scraper.updateContext();
      sendResponse({ channelName: scraper.context.channel_name });
    }
    return true; // Keep channel open for async response
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    scraper.stopCrawling();
  });

})();
