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
  /** @type {Array<{data: string, filename: string, size: number}>} */
  let pendingAttachments = [];
  /** @type {'bubble' | 'log'} */
  let displayMode = 'bubble';

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

    // Paste event for image attachment
    messageInput.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            handleImageFile(file);
          }
          break;
        }
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
    console.log('[WebView] Received message:', message.type, message.payload);

    switch (message.type) {
      case 'addMessage':
        appendMessage(message.payload);
        break;
      case 'loadHistory':
        loadHistory(message.payload);
        break;
      case 'updateStatus':
        console.log('[WebView] Updating status to:', message.payload.connected);
        updateStatus(message.payload.connected);
        break;
      case 'setDisplayMode':
        setDisplayMode(message.payload.mode);
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
    // Allow sending if there's text OR attachments
    if (!text && pendingAttachments.length === 0) return;

    // Build attachments array for sending
    const attachments = pendingAttachments.map(att => ({
      type: 'image',
      data: att.data,
      filename: att.filename,
      size: att.size
    }));

    // Send message to extension
    vscode.postMessage({
      type: 'sendMessage',
      payload: {
        text: text || '',
        attachments: attachments.length > 0 ? attachments : undefined
      }
    });

    // Clear input and attachments
    messageInput.value = '';
    messageInput.style.height = 'auto';
    clearPendingAttachments();
  }

  /**
   * @param {any[]} messages
   */
  function loadHistory(messages) {
    clearMessages();
    messages.forEach(msg => {
      appendMessage(msg, true);
    });
    // Scroll to bottom when loading history (first time or reconnect)
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

    // Bind click events to image links (CSP compliant)
    bindImageLinkEvents(messageEl);

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
    if (displayMode === 'log') {
      return createLogMessageElement(msg);
    }
    return createBubbleMessageElement(msg);
  }

  /**
   * Create bubble-style message element (original style)
   * @param {any} msg
   * @returns {HTMLElement}
   */
  function createBubbleMessageElement(msg) {
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
    if (msg.attachments && msg.attachments.length > 0) {
      msg.attachments.forEach(/** @param {any} att */ (att) => {
        if (att.type === 'image') {
          let imageUrl = att.data || att.url;

          // If it's a relative URL, convert to absolute
          if (imageUrl && imageUrl.startsWith('/uploads/')) {
            const serverUrl = 'http://localhost:3000'; // TODO: Make this configurable
            imageUrl = serverUrl + imageUrl;
          }

          // Create image element using DOM methods (CSP compliant)
          const img = document.createElement('img');
          img.src = imageUrl;
          img.className = 'message-image';
          img.alt = 'Image';
          img.style.cssText = 'max-width: 100%; max-height: 300px; border-radius: 8px; cursor: pointer; display: block; margin-top: 8px;';
          img.addEventListener('click', () => {
            // @ts-ignore
            window.showImagePreview(imageUrl);
          });
          bubble.appendChild(img);
        }
      });

      // Add text if present
      if (msg.text) {
        const textDiv = document.createElement('div');
        textDiv.innerHTML = linkifyImages(escapeHtml(msg.text));
        bubble.appendChild(textDiv);
      }
    } else {
      bubble.innerHTML = linkifyImages(escapeHtml(msg.text));
    }

    // Append elements
    wrapper.appendChild(timeEl);
    wrapper.appendChild(bubble);

    return wrapper;
  }

  /**
   * Create log-style message element
   * @param {any} msg
   * @returns {HTMLElement}
   */
  function createLogMessageElement(msg) {
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper ' + (msg.source === 'vscode' ? 'own' : 'remote');

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble ' + (msg.source === 'vscode' ? 'own' : 'remote');

    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';

    // Timestamp: [HH:MM:SS]
    const timestamp = document.createElement('span');
    timestamp.className = 'log-timestamp';
    const msgTime = new Date(msg.timestamp || Date.now());
    timestamp.textContent = '[' + formatLogTime(msgTime) + ']';

    // Source: INFO (mobile) or OUT (vscode)
    const source = document.createElement('span');
    source.className = 'log-source ' + (msg.source === 'vscode' ? 'out' : 'info');
    source.textContent = msg.source === 'vscode' ? 'OUT  ' : 'INFO ';

    // Content
    const content = document.createElement('span');
    content.className = 'log-content';

    // Handle attachments
    if (msg.attachments && msg.attachments.length > 0) {
      msg.attachments.forEach(/** @param {any} att */ (att) => {
        if (att.type === 'image') {
          let imageUrl = att.data || att.url;
          if (imageUrl && imageUrl.startsWith('/uploads/')) {
            const serverUrl = 'http://localhost:3000';
            imageUrl = serverUrl + imageUrl;
          }

          const imgTag = createImageTag(att.filename || 'image.png', imageUrl);
          content.appendChild(imgTag);
          content.appendChild(document.createTextNode(' '));
        }
      });

      if (msg.text) {
        const textSpan = document.createElement('span');
        textSpan.innerHTML = linkifyImages(escapeHtml(msg.text));
        content.appendChild(textSpan);
      }
    } else {
      content.innerHTML = linkifyImages(escapeHtml(msg.text));
    }

    logEntry.appendChild(timestamp);
    logEntry.appendChild(source);
    logEntry.appendChild(content);
    bubble.appendChild(logEntry);
    wrapper.appendChild(bubble);

    return wrapper;
  }

  /**
   * Create clickable image tag with hover preview
   * @param {string} filename
   * @param {string} imageUrl
   * @returns {HTMLElement}
   */
  function createImageTag(filename, imageUrl) {
    const tag = document.createElement('span');
    tag.className = 'img-tag';
    tag.dataset.imgUrl = imageUrl;
    tag.textContent = '[IMG:' + filename + ']';

    // Create tooltip for hover preview
    const tooltip = document.createElement('span');
    tooltip.className = 'img-preview-tooltip';

    // Lazy load image on first hover
    let imageLoaded = false;
    tag.addEventListener('mouseenter', () => {
      if (!imageLoaded) {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = 'Preview';
        tooltip.appendChild(img);
        imageLoaded = true;
      }
    });

    // Click to open full preview
    tag.addEventListener('click', () => {
      // @ts-ignore
      window.showImagePreview(imageUrl);
    });

    tag.appendChild(tooltip);
    return tag;
  }

  /**
   * Set display mode and re-render messages
   * @param {'bubble' | 'log'} mode
   */
  function setDisplayMode(mode) {
    if (displayMode === mode) return;
    displayMode = mode;
    document.body.dataset.displayMode = mode;

    // Re-render all messages
    if (messagesContainer) {
      const messages = [];
      // Collect message data from existing elements (simplified approach)
      // In practice, we'd store the original message data
      // For now, we trigger a history reload
      vscode.postMessage({ type: 'ready' });
    }
  }

  /**
   * Format time for log mode [HH:MM:SS]
   * @param {Date} date
   * @returns {string}
   */
  function formatLogTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return hours + ':' + minutes + ':' + seconds;
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
      // Use data attribute instead of inline onclick for CSP compliance
      return `<a href="#" class="image-link" data-image-url="${escapeHtml(url)}">[图片]</a>`;
    });
  }

  /**
   * Bind click events to image links after they are added to DOM
   * @param {HTMLElement} container
   */
  function bindImageLinkEvents(container) {
    container.querySelectorAll('.image-link[data-image-url]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const url = /** @type {HTMLElement} */ (link).dataset.imageUrl;
        if (url) {
          // @ts-ignore
          window.showImagePreview(url);
        }
      });
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
  // Attachment Handling
  // ============================================================================

  /**
   * @param {File} file
   */
  function handleImageFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = /** @type {string} */ (e.target?.result);
      if (dataUrl) {
        pendingAttachments.push({
          data: dataUrl,
          filename: file.name || 'image.png',
          size: file.size
        });
        renderAttachmentPreview();
      }
    };
    reader.readAsDataURL(file);
  }

  function renderAttachmentPreview() {
    let previewContainer = document.getElementById('attachment-preview');

    if (!previewContainer) {
      previewContainer = document.createElement('div');
      previewContainer.id = 'attachment-preview';
      const inputContainer = document.getElementById('input-container');
      if (inputContainer) {
        inputContainer.insertBefore(previewContainer, inputContainer.firstChild);
      }
    }

    if (pendingAttachments.length === 0) {
      previewContainer.style.display = 'none';
      previewContainer.innerHTML = '';
      return;
    }

    previewContainer.style.display = 'flex';
    // Clear and rebuild using DOM methods for safety
    previewContainer.innerHTML = '';

    pendingAttachments.forEach((att, index) => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'attachment-item';
      itemDiv.dataset.index = String(index);

      const img = document.createElement('img');
      img.src = att.data;
      img.alt = att.filename;
      itemDiv.appendChild(img);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-attachment';
      removeBtn.dataset.index = String(index);
      removeBtn.title = '移除';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        pendingAttachments.splice(index, 1);
        renderAttachmentPreview();
      });
      itemDiv.appendChild(removeBtn);

      previewContainer.appendChild(itemDiv);
    });
  }

  function clearPendingAttachments() {
    pendingAttachments = [];
    renderAttachmentPreview();
  }

  // ============================================================================
  // Image Preview
  // ============================================================================

  /**
   * @param {string} url
   */
  // @ts-ignore - Dynamically adding global function for onclick handlers
  window.showImagePreview = function(url) {
    // Send message to extension to open image in a new editor tab
    vscode.postMessage({
      type: 'openImage',
      payload: { url }
    });
  };

  // ============================================================================
  // Initialization
  // ============================================================================

  console.log('[WebView] Initializing chat view');

  // Notify extension that webview is ready
  console.log('[WebView] Sending ready message');
  vscode.postMessage({ type: 'ready' });
})();
