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
  /** @type {HTMLButtonElement | null} */
  const settingsBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('settings-btn'));
  /** @type {HTMLElement | null} */
  const settingsView = document.getElementById('settings-view');
  /** @type {HTMLButtonElement | null} */
  const settingsBackBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('settings-back-btn'));

  // State
  let autoScrollEnabled = true;
  let lastMessageTimestamp = 0;
  /** @type {Array<{data: string, filename: string, size: number}>} */
  let pendingAttachments = [];
  /** @type {'bubble' | 'log'} */
  let displayMode = 'bubble';
  /** @type {string} */
  let serverUrl = 'http://localhost:3000';

  // IME 组合状态追踪
  let isComposing = false;
  /** @type {any[]} */
  let pendingMessages = [];

  // 加载更多历史状态
  let isLoadingMore = false;
  let hasMoreHistory = true;
  /** @type {number | null} */
  let oldestTimestamp = null;

  // 图片大小限制 (5MB)
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

  // Settings state
  /** @type {any[]} */
  let connections = [];
  let activeConnection = "";
  /** @type {any} */
  let editingConnection = null;

  // Settings DOM elements
  const serverUrlInput = /** @type {HTMLInputElement | null} */ (document.getElementById("serverUrl"));
  const autoRevealCheckbox = /** @type {HTMLInputElement | null} */ (document.getElementById("autoReveal"));
  const displayModeSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById("displayMode"));
  const saveGlobalBtn = document.getElementById("saveGlobalBtn");
  const connectionList = document.getElementById("connectionList");
  const addConnectionBtn = document.getElementById("addConnectionBtn");
  const modal = document.getElementById("modal");
  const modalTitle = document.getElementById("modalTitle");
  const connNameInput = /** @type {HTMLInputElement | null} */ (document.getElementById("connName"));
  const connServerUrlInput = /** @type {HTMLInputElement | null} */ (document.getElementById("connServerUrl"));
  const connTokenInput = /** @type {HTMLInputElement | null} */ (document.getElementById("connToken"));
  const modalCancelBtn = document.getElementById("modalCancelBtn");
  const modalSaveBtn = document.getElementById("modalSaveBtn");

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

    // IME 组合事件监听 - 防止输入被打断
    messageInput.addEventListener('compositionstart', () => {
      isComposing = true;
    });

    messageInput.addEventListener('compositionend', () => {
      isComposing = false;
      // 处理在 IME 组合期间积累的消息
      flushPendingMessages();
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

  // Settings button - show settings view
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      showSettingsView();
      vscode.postMessage({ type: "getConfig" });
    });
  }

  // Settings back button - hide settings view
  if (settingsBackBtn) {
    settingsBackBtn.addEventListener('click', hideSettingsView);
  }

  // Settings form event listeners
  if (saveGlobalBtn) {
    saveGlobalBtn.addEventListener("click", saveGlobalSettings);
  }
  if (addConnectionBtn) {
    addConnectionBtn.addEventListener("click", () => openModal());
  }
  if (modalCancelBtn) {
    modalCancelBtn.addEventListener("click", closeModal);
  }
  if (modalSaveBtn) {
    modalSaveBtn.addEventListener("click", saveConnectionHandler);
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

      // 检测滚动到顶部，触发加载更多
      if (scrollTop < 50 && hasMoreHistory && !isLoadingMore && oldestTimestamp) {
        loadMoreHistory();
      }
    });
  }

  // Listen for messages from extension
  window.addEventListener('message', (event) => {
    const message = event.data;
    console.log('[WebView] Received message:', message.type, message.payload);

    switch (message.type) {
      case 'addMessage':
        // 如果正在 IME 组合，延迟处理消息
        if (isComposing) {
          pendingMessages.push(message.payload);
        } else {
          appendMessage(message.payload);
        }
        break;
      case 'loadHistory':
        loadHistory(message.payload);
        break;
      case 'prependHistory':
        prependHistory(message.payload.messages, message.payload.hasMore);
        break;
      case 'updateStatus':
        console.log('[WebView] Updating status to:', message.payload.connected);
        updateStatus(message.payload.connected);
        break;
      case 'setDisplayMode':
        if (message.payload.serverUrl) {
          serverUrl = message.payload.serverUrl;
        }
        setDisplayMode(message.payload.mode);
        break;
      case 'clearMessages':
        clearMessages();
        break;
      case 'configLoaded':
        loadConfig(message.payload);
        break;
      case 'operationResult':
        handleOperationResult(message.payload);
        break;
      case 'testResult':
        handleTestResult(message.payload);
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
    // 更新最早时间戳
    if (messages.length > 0) {
      oldestTimestamp = messages[0].timestamp;
      hasMoreHistory = true;
    }
    // Scroll to bottom when loading history (first time or reconnect)
    scrollToBottom(true);
  }

  /**
   * 请求加载更多历史
   */
  function loadMoreHistory() {
    if (isLoadingMore || !hasMoreHistory || !oldestTimestamp) return;

    isLoadingMore = true;
    showLoadingIndicator();

    vscode.postMessage({
      type: 'loadMoreHistory',
      payload: { beforeTimestamp: oldestTimestamp }
    });
  }

  /**
   * @param {any[]} messages
   * @param {boolean} hasMore
   */
  function prependHistory(messages, hasMore) {
    isLoadingMore = false;
    hasMoreHistory = hasMore;
    hideLoadingIndicator();

    if (!messagesContainer || messages.length === 0) return;

    // 记录当前滚动位置
    const prevScrollHeight = messagesContainer.scrollHeight;

    // 按时间排序
    const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);

    // 更新最早时间戳
    if (sorted.length > 0) {
      oldestTimestamp = sorted[0].timestamp;
    }

    // 在顶部插入消息
    const firstChild = messagesContainer.firstChild;
    sorted.forEach(msg => {
      const messageEl = createMessageElement(msg);
      bindImageLinkEvents(messageEl);
      messagesContainer.insertBefore(messageEl, firstChild);
    });

    // 保持滚动位置
    const newScrollHeight = messagesContainer.scrollHeight;
    messagesContainer.scrollTop = newScrollHeight - prevScrollHeight;
  }

  /**
   * 显示加载指示器
   */
  function showLoadingIndicator() {
    if (!messagesContainer) return;
    let indicator = document.getElementById('loading-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'loading-indicator';
      indicator.className = 'loading-indicator';
      indicator.textContent = '加载中...';
    }
    messagesContainer.insertBefore(indicator, messagesContainer.firstChild);
  }

  /**
   * 隐藏加载指示器
   */
  function hideLoadingIndicator() {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) {
      indicator.remove();
    }
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
    messagesContainer.innerHTML = '<div id="empty-state">暂无消息</div>';
    lastMessageTimestamp = 0;
  }

  /**
   * 处理在 IME 组合期间积累的消息
   */
  function flushPendingMessages() {
    if (pendingMessages.length === 0) return;

    // 使用 requestAnimationFrame 确保在下一帧渲染
    requestAnimationFrame(() => {
      pendingMessages.forEach(msg => appendMessage(msg));
      pendingMessages = [];
    });
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
      statusText.textContent = '已连接';
    } else {
      statusIndicator.className = 'status-disconnected';
      statusText.textContent = '已断开';
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
    // 检查文件大小
    if (file.size > MAX_IMAGE_SIZE) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(2);
      console.warn('[WebView] Image too large:', sizeMB, 'MB');
      return;
    }

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
    reader.onerror = () => {
      console.error('[WebView] Failed to read file:', file.name);
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
  // Settings View Functions
  // ============================================================================

  function showSettingsView() {
    if (!settingsView) return;
    settingsView.classList.remove('hidden');
    requestAnimationFrame(() => {
      settingsView.classList.add('visible');
    });
  }

  function hideSettingsView() {
    if (!settingsView) return;
    settingsView.classList.remove('visible');
    setTimeout(() => {
      settingsView.classList.add('hidden');
    }, 200);
  }

  /**
   * @param {any} payload
   */
  function loadConfig(payload) {
    const { globalSettings, connections: conns, activeConnection: active } = payload;

    // Global settings
    if (serverUrlInput) serverUrlInput.value = globalSettings.serverUrl || "";
    const transportRadio = document.querySelector(`input[name="transport"][value="${globalSettings.forceWebsocket ? "websocket" : "auto"}"]`);
    if (transportRadio) /** @type {HTMLInputElement} */ (transportRadio).checked = true;
    if (autoRevealCheckbox) autoRevealCheckbox.checked = globalSettings.autoReveal || false;
    if (displayModeSelect) displayModeSelect.value = globalSettings.displayMode || "bubble";

    // Connections
    connections = conns || [];
    activeConnection = active || "";
    renderConnections();
  }

  function renderConnections() {
    if (!connectionList) return;
    connectionList.innerHTML = connections.map((conn) => `
      <div class="connection-item ${conn.name === activeConnection ? "active" : ""}" data-name="${escapeHtml(conn.name)}">
        <input type="radio" name="activeConn" class="connection-radio"
          ${conn.name === activeConnection ? "checked" : ""}>
        <div class="connection-info">
          <div class="connection-name">${escapeHtml(conn.name)}</div>
          <div class="connection-url">${escapeHtml(conn.serverUrl || "默认")}</div>
        </div>
        <div class="connection-actions">
          <button class="btn btn-small btn-secondary" data-action="test" data-name="${escapeHtml(conn.name)}">验证</button>
          <button class="btn btn-small btn-secondary" data-action="edit" data-name="${escapeHtml(conn.name)}">编辑</button>
          <button class="btn btn-small btn-secondary" data-action="delete" data-name="${escapeHtml(conn.name)}">删除</button>
        </div>
      </div>
    `).join("");

    // Bind events
    connectionList.querySelectorAll('.connection-radio').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const item = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('.connection-item'));
        if (item) selectConnection(item.dataset.name || '');
      });
    });

    connectionList.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        const action = target.dataset.action;
        const name = target.dataset.name || '';
        if (action === 'test') testConn(name);
        else if (action === 'edit') editConn(name);
        else if (action === 'delete') deleteConn(name);
      });
    });
  }

  function saveGlobalSettings() {
    const transportRadio = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="transport"]:checked'));
    vscode.postMessage({
      type: "saveGlobalSettings",
      payload: {
        serverUrl: serverUrlInput?.value || '',
        forceWebsocket: transportRadio?.value === "websocket",
        autoReveal: autoRevealCheckbox?.checked || false,
        displayMode: displayModeSelect?.value || 'bubble',
      },
    });
  }

  /**
   * @param {any} conn
   */
  function openModal(conn = null) {
    editingConnection = conn;
    if (modalTitle) modalTitle.textContent = conn ? "编辑连接配置" : "添加连接配置";
    if (connNameInput) connNameInput.value = conn?.name || "";
    if (connServerUrlInput) connServerUrlInput.value = conn?.serverUrl || "";
    if (connTokenInput) connTokenInput.value = conn?.token || "";
    if (modal) modal.classList.remove("hidden");
  }

  function closeModal() {
    if (modal) modal.classList.add("hidden");
    editingConnection = null;
  }

  function saveConnectionHandler() {
    const name = connNameInput?.value.trim() || '';
    const token = connTokenInput?.value.trim() || '';
    if (!name || !token) return;

    vscode.postMessage({
      type: "saveConnection",
      payload: {
        connection: {
          name,
          serverUrl: connServerUrlInput?.value.trim() || undefined,
          token,
        },
        originalName: editingConnection?.name,
      },
    });
    closeModal();
  }

  /**
   * @param {string} name
   */
  function selectConnection(name) {
    vscode.postMessage({ type: "setActiveConnection", payload: { name } });
  }

  /**
   * @param {string} name
   */
  function editConn(name) {
    const conn = connections.find((c) => c.name === name);
    if (conn) openModal(conn);
  }

  /**
   * @param {string} name
   */
  function deleteConn(name) {
    if (confirm(`确定删除连接配置 "${name}"?`)) {
      vscode.postMessage({ type: "deleteConnection", payload: { name } });
    }
  }

  /**
   * @param {string} name
   */
  function testConn(name) {
    const conn = connections.find((c) => c.name === name);
    if (conn) {
      vscode.postMessage({
        type: "testConnection",
        payload: {
          name,
          serverUrl: conn.serverUrl || serverUrlInput?.value || '',
          token: conn.token,
        },
      });
    }
  }

  /**
   * @param {any} payload
   */
  function handleOperationResult(payload) {
    if (payload.success) {
      vscode.postMessage({ type: "getConfig" });
    }
  }

  /**
   * @param {any} payload
   */
  function handleTestResult(payload) {
    const { name, success, latency } = payload;
    const item = document.querySelector(`.connection-item[data-name="${name}"]`);
    if (!item) return;

    // Remove existing badge
    const existing = item.querySelector(".status-badge");
    if (existing) existing.remove();

    // Add new badge
    const badge = document.createElement("span");
    badge.className = `status-badge ${success ? "success" : "error"}`;
    badge.textContent = success ? `${latency}ms` : "失败";
    const infoEl = item.querySelector(".connection-info");
    if (infoEl) infoEl.appendChild(badge);

    // Auto remove after 5s
    setTimeout(() => badge.remove(), 5000);
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  console.log('[WebView] Initializing chat view');

  // Notify extension that webview is ready
  console.log('[WebView] Sending ready message');
  vscode.postMessage({ type: 'ready' });
})();
