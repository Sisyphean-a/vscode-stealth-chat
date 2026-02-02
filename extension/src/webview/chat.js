// @ts-check

(function () {
  // @ts-ignore - acquireVsCodeApi is provided by VS Code
  const vscode = acquireVsCodeApi();

  // DOM elements
  /** @type {HTMLElement | null} */
  const statusIndicator = document.getElementById('status-indicator');
  /** @type {HTMLElement | null} */
  const statusText = document.getElementById('status-text');
  /** @type {HTMLElement | null} */
  const messagesContainer = document.getElementById('messages-container');
  /** @type {HTMLElement | null} */
  const emptyState = document.getElementById('empty-state');
  /** @type {HTMLTextAreaElement | null} */
  const messageInput = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('message-input'));
  /** @type {HTMLButtonElement | null} */
  const sendButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('send-button'));
  /** @type {HTMLButtonElement | null} */
  const scrollToBottomBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('scroll-to-bottom'));

  // State
  let autoScrollEnabled = true;
  let lastMessageTimestamp = 0;

  // ============================================================================
  // Event Listeners
  // ============================================================================

  // Send button click
  if (sendButton) {
    sendButton.addEventListener('click', sendMessage);
  }

  // Enter to send, Shift+Enter for new line
  if (messageInput) {
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Auto-adjust input height
    messageInput.addEventListener('input', () => {
      if (messageInput) {
        messageInput.style.height = 'auto';
        messageInput.style.height = messageInput.scrollHeight + 'px';
      }
    });
  }

  // Scroll to bottom button
  if (scrollToBottomBtn) {
    scrollToBottomBtn.addEventListener('click', () => {
      scrollToBottom(true);
      if (scrollToBottomBtn) {
        scrollToBottomBtn.style.display = 'none';
      }
    });
  }

  // Detect manual scroll
  if (messagesContainer) {
    messagesContainer.addEventListener('scroll', () => {
      if (!messagesContainer) return;
      const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      
      if (isAtBottom) {
        autoScrollEnabled = true;
        if (scrollToBottomBtn) {
          scrollToBottomBtn.style.display = 'none';
        }
      } else {
        autoScrollEnabled = false;
      }
    });
  }

  // Listen for messages from extension
  window.addEventListener('message', (event) => {
    const message = event.data;
    
    switch (message.type) {
      case 'addMessage':
        appendMessage(message.payload);
        break;
      case 'loadHistory':
        loadHistory(message.payload);
        break;
      case 'updateStatus':
        updateStatus(message.payload.connected);
        break;
      case 'clearMessages':
        clearMessages();
        break;
    }
  });

  // ============================================================================
  // Message Handling
  // ============================================================================

  function sendMessage() {
    if (!messageInput) return;
    
    const text = messageInput.value.trim();
    if (!text) return;
    
    // Send message to extension
    vscode.postMessage({
      type: 'sendMessage',
      payload: { text }
    });
    
    // Clear input and reset height
    messageInput.value = '';
    messageInput.style.height = 'auto';
  }

  /**
   * @param {any[]} messages
   */
  function loadHistory(messages) {
    clearMessages();
    messages.forEach(msg => {
      appendMessage(msg, true);
    });
    scrollToBottom(true);
  }

  /**
   * @param {any} msg
   * @param {boolean} [skipDivider]
   */
  function appendMessage(msg, skipDivider = false) {
    if (!messagesContainer) return;
    
    // Hide empty state
    if (emptyState) {
      emptyState.style.display = 'none';
    }

    // Add time divider if needed (more than 5 minutes gap)
    if (!skipDivider && msg.timestamp) {
      const timeDiff = msg.timestamp - lastMessageTimestamp;
      if (timeDiff > 5 * 60 * 1000 || lastMessageTimestamp === 0) {
        const divider = createTimeDivider(msg.timestamp);
        messagesContainer.appendChild(divider);
      }
      lastMessageTimestamp = msg.timestamp;
    }

    // Create message bubble
    const messageEl = createMessageElement(msg);
    messagesContainer.appendChild(messageEl);

    // Auto scroll if enabled
    if (autoScrollEnabled) {
      scrollToBottom();
    } else {
      // Show scroll-to-bottom button
      if (scrollToBottomBtn) {
        scrollToBottomBtn.style.display = 'flex';
      }
    }
  }

  function clearMessages() {
    if (!messagesContainer) return;
    messagesContainer.innerHTML = '<div id="empty-state">No messages yet</div>';
    lastMessageTimestamp = 0;
  }

  // ============================================================================
  // Element Creation
  // ============================================================================

  /**
   * @param {number} timestamp
   * @returns {HTMLElement}
   */
  function createTimeDivider(timestamp) {
    const div = document.createElement('div');
    div.className = 'time-divider';
    const time = new Date(timestamp);
    div.innerHTML = `<span>${formatTime(time)}</span>`;
    return div;
  }

  /**
   * @param {any} msg
   * @returns {HTMLElement}
   */
  function createMessageElement(msg) {
    // Create wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper ' + (msg.source === 'vscode' ? 'own' : 'remote');

    // Create time element
    const timeEl = document.createElement('div');
    timeEl.className = 'message-time';
    const msgTime = new Date(msg.timestamp || Date.now());
    timeEl.textContent = formatMessageTime(msgTime);

    // Create message bubble
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble ' + (msg.source === 'vscode' ? 'own' : 'remote');

    // Render image attachments or linkify text
    /** @type {string} */
    let html;
    if (msg.attachments && msg.attachments.length > 0) {
      html = '';
      msg.attachments.forEach(/** @param {any} att */ (att) => {
        if (att.type === 'image') {
          // Get server URL from window location (assuming WebView is served from same origin)
          // For VS Code WebView, we need to handle both inline data URLs and server URLs
          let imageUrl = att.data || att.url;

          // If it's a relative URL, we need to convert it to absolute
          // Note: In VS Code WebView, we'll need to use asWebviewUri for local resources
          if (imageUrl && imageUrl.startsWith('/uploads/')) {
            // This will be handled by server URL configuration
            // For now, assume we can access server directly
            const serverUrl = 'http://localhost:3000'; // TODO: Make this configurable
            imageUrl = serverUrl + imageUrl;
          }

          html += `<img src="${imageUrl}" class="message-image" onclick="showImagePreview('${imageUrl}')" alt="Image" style="max-width: 100%; max-height: 300px; border-radius: 8px; cursor: pointer; display: block; margin-top: 8px;" />`;
        }
      });
    } else {
      html = linkifyImages(escapeHtml(msg.text));
    }

    bubble.innerHTML = html;

    // Append elements
    wrapper.appendChild(timeEl);
    wrapper.appendChild(bubble);

    return wrapper;
  }

  // ============================================================================
  // Utility Functions
  // ============================================================================

  /**
   * @param {Date} date
   * @returns {string}
   */
  function formatMessageTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return hours + ':' + minutes;
  }

  /**
   * @param {Date} date
   * @returns {string}
   */
  function formatTime(date) {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  }

  /**
   * @param {string} text
   * @returns {string}
   */
  function linkifyImages(text) {
    const imageUrlPattern = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|bmp))/gi;
    return text.replace(imageUrlPattern, (url) => {
      return `<a href="#" class="image-link" data-image-url="${url}" onclick="showImagePreview('${url}'); return false;">[图片]</a>`;
    });
  }

  /**
   * @param {string} text
   * @returns {string}
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * @param {boolean} connected
   */
  function updateStatus(connected) {
    if (!statusIndicator || !statusText) return;
    
    if (connected) {
      statusIndicator.className = 'status-connected';
      statusText.textContent = 'Connected';
    } else {
      statusIndicator.className = 'status-disconnected';
      statusText.textContent = 'Disconnected';
    }
  }

  /**
   * @param {boolean} [force]
   */
  function scrollToBottom(force = false) {
    if (!messagesContainer) return;
    if (force || autoScrollEnabled) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  // ============================================================================
  // Image Preview
  // ============================================================================

  /**
   * @param {string} url
   */
  // @ts-ignore - Dynamically adding global function for onclick handlers
  window.showImagePreview = function(url) {
    let preview = document.querySelector('.image-preview');
    
    if (!preview) {
      preview = document.createElement('div');
      preview.className = 'image-preview';
      preview.innerHTML = `<img src="${url}" alt="Preview">`;
      preview.addEventListener('click', () => {
        if (preview) {
          preview.classList.remove('show');
        }
      });
      document.body.appendChild(preview);
    } else {
      const img = preview.querySelector('img');
      if (img) {
        img.src = url;
      }
    }
    
    preview.classList.add('show');
  };

  // ============================================================================
  // Initialization
  // ============================================================================

  // Notify extension that webview is ready
  vscode.postMessage({ type: 'ready' });
})();
