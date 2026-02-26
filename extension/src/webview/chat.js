(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  // Dependencies
  const { bindImageLinkEvents } = window.ChatUtils;
  const { createTimeDivider, createTimeGapDivider, createMessageElement } = window.ChatRenderer;
  const { createManager: createAttachmentManager } = window.ChatAttachments;

  // Constants
  const TIME_GAP_THRESHOLD = 10 * 60 * 1000; // 10 minutes

  function normalizeServerUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '');
  }

  // Initialize settings module
  window.ChatSettings.init(vscode);

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
  /** @type {HTMLButtonElement | null} */
  const settingsBackBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('settings-back-btn'));

  // State
  let autoScrollEnabled = true;
  let lastMessageTimestamp = 0;
  /** @type {'bubble' | 'log'} */
  let displayMode = 'bubble';
  /** @type {string} */
  let serverUrl = normalizeServerUrl('http://localhost:3000');
  /** @type {string} */
  let authToken = '';

  // IME 组合状态追踪
  let isComposing = false;
  /** @type {any[]} */
  let pendingMessages = [];

  // 加载更多历史状态
  let isLoadingMore = false;
  let hasMoreHistory = true;
  /** @type {number | null} */
  let oldestTimestamp = null;
  let isFirstLoad = true;

  // 图片大小限制 (5MB)
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
  const HISTORY_PAGE_SIZE = 50;
  const attachmentManager = createAttachmentManager({
    maxImageSize: MAX_IMAGE_SIZE,
    getInputContainer: () => document.getElementById('input-container'),
  });

  // ============================================================================
  // Event Listeners
  // ============================================================================

  if (sendButton) {
    sendButton.addEventListener('click', sendMessage);
  }

  if (messageInput) {
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    messageInput.addEventListener('input', () => {
      if (messageInput) {
        messageInput.style.height = 'auto';
        messageInput.style.height = messageInput.scrollHeight + 'px';
      }
    });

    messageInput.addEventListener('compositionstart', () => {
      isComposing = true;
    });

    messageInput.addEventListener('compositionend', () => {
      isComposing = false;
      flushPendingMessages();
    });

    messageInput.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) handleImageFile(file);
          break;
        }
      }
    });
  }

  if (scrollToBottomBtn) {
    scrollToBottomBtn.addEventListener('click', () => {
      scrollToBottom(true);
      if (scrollToBottomBtn) scrollToBottomBtn.style.display = 'none';
    });
  }

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      window.ChatSettings.show();
      vscode.postMessage({ type: "getConfig" });
    });
  }

  if (settingsBackBtn) {
    settingsBackBtn.addEventListener('click', () => window.ChatSettings.hide());
  }

  if (messagesContainer) {
    messagesContainer.addEventListener('scroll', () => {
      if (!messagesContainer) return;
      const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

      if (isAtBottom) {
        autoScrollEnabled = true;
        if (scrollToBottomBtn) scrollToBottomBtn.style.display = 'none';
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
        updateStatus(message.payload.connected);
        break;
      case 'setDisplayMode':
        {
          const payload = message.payload || {};
          if (Object.prototype.hasOwnProperty.call(payload, 'serverUrl')) {
            serverUrl = normalizeServerUrl(payload.serverUrl);
          }
          if (Object.prototype.hasOwnProperty.call(payload, 'token')) {
            authToken = typeof payload.token === 'string' ? payload.token : '';
          }
          if (payload.mode === 'bubble' || payload.mode === 'log') {
            setDisplayMode(payload.mode);
          }
        }
        break;
      case 'clearMessages':
        clearMessages();
        break;
      case 'configLoaded':
        window.ChatSettings.loadConfig(message.payload);
        break;
      case 'operationResult':
        window.ChatSettings.handleOperationResult(message.payload);
        break;
      case 'testResult':
        window.ChatSettings.handleTestResult(message.payload);
        break;
    }
  });

  // ============================================================================
  // Message Handling
  // ============================================================================

  async function sendMessage() {
    if (!messageInput) return;

    const pendingAttachments = attachmentManager.getPending();
    const text = messageInput.value.trim();
    if (!text && pendingAttachments.length === 0) return;

    let attachments;

    if (pendingAttachments.length > 0) {
      if (!serverUrl) {
        console.error('[WebView] Image upload failed: missing server URL');
        return;
      }
      if (!authToken) {
        console.error('[WebView] Image upload failed: missing auth token');
        return;
      }

      try {
        attachments = await attachmentManager.uploadAll(serverUrl, authToken);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[WebView] Image upload failed:', message);
        return;
      }
    }

    vscode.postMessage({
      type: 'sendMessage',
      payload: {
        text: text || '',
        attachments: attachments && attachments.length > 0 ? attachments : undefined
      }
    });

    messageInput.value = '';
    messageInput.style.height = 'auto';
    attachmentManager.clear();
  }

  /**
   * @param {any[]} messages
   */
  function loadHistory(messages) {
    clearMessages();
    // Use local tracking for the loop not global lastMessageTimestamp yet
    // Actually we iterate formatted messages which are time sorted
    // But we need to update global lastMessageTimestamp at the end
    // Or just update it as we go.
    // The original code was using lastMessageTimestamp to track global state? 
    // Wait, loadHistory clears messages, so lastMessageTimestamp is 0. 
    // And we iterate messages.
    // We need to properly track 'lastDate' for date dividers.
    // And 'lastTimestamp' for gap dividers.
    
    // Reset global state
    lastMessageTimestamp = 0; 
    
    messages.forEach(msg => {
      if (msg.timestamp && messagesContainer) {
        const msgDate = new Date(msg.timestamp).toLocaleDateString();
        const prevDate = lastMessageTimestamp > 0
          ? new Date(lastMessageTimestamp).toLocaleDateString()
          : "";

        if (msgDate !== prevDate) {
          const divider = createTimeDivider(msg.timestamp, displayMode);
          messagesContainer.appendChild(divider);
          // Reset last timestamp to current for gap calculation relative to the date divider
          // Actually, we just need to update lastMessageTimestamp. 
          // But effectively, date divider "resets" the visual flow.
        } else if (lastMessageTimestamp > 0 && (msg.timestamp - lastMessageTimestamp > TIME_GAP_THRESHOLD)) {
          // Same day, but large gap
          const divider = createTimeGapDivider(msg.timestamp, displayMode);
          messagesContainer.appendChild(divider);
        }
        
        lastMessageTimestamp = msg.timestamp;
      }
      appendMessage(msg, true);
    });
    if (messages.length > 0) {
      oldestTimestamp = messages[0].timestamp;
      hasMoreHistory = messages.length >= HISTORY_PAGE_SIZE;
    } else {
      hasMoreHistory = false;
    }
    isLoadingMore = false;
    hideLoadMoreButton();
    if (hasMoreHistory) showLoadMoreButton();
    updateEmptyState();
    if (isFirstLoad) {
      scrollToBottom(true);
      isFirstLoad = false;
    }
  }

  function loadMoreHistory() {
    if (isLoadingMore || !hasMoreHistory || !oldestTimestamp) {
      return;
    }

    isLoadingMore = true;

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
    // 1. 禁用自动滚动和平滑滚动，防止视觉跳动
    autoScrollEnabled = false;
    isLoadingMore = false;
    hasMoreHistory = hasMore;
    
    if (messagesContainer) {
      messagesContainer.style.scrollBehavior = 'auto';
    }

    // 获取当前滚动高度和位置
    const oldScrollHeight = messagesContainer ? messagesContainer.scrollHeight : 0;
    const oldScrollTop = messagesContainer ? messagesContainer.scrollTop : 0;

    hideLoadMoreButton();

    if (!messagesContainer || messages.length === 0) {
      if (hasMore) showLoadMoreButton();
      return;
    }

    const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);

    if (sorted.length > 0) {
      oldestTimestamp = sorted[0].timestamp;
    }

    // 锚定元素：当前的第一条消息
    let anchorMsg = messagesContainer.firstElementChild;
    const existingFirstMsg = /** @type {HTMLElement | null} */ (messagesContainer.querySelector('.message-wrapper'));
    const existingFirstDate = existingFirstMsg?.dataset.timestamp
      ? new Date(Number(existingFirstMsg.dataset.timestamp)).toLocaleDateString()
      : null;

    let lastDate = "";
    let prevTimestamp = 0;
    const fragment = document.createDocumentFragment();
    sorted.forEach(msg => {
      if (msg.timestamp) {
        const msgDate = new Date(msg.timestamp).toLocaleDateString();
        
        // Check for date change
        if (msgDate !== lastDate) {
          fragment.appendChild(createTimeDivider(msg.timestamp, displayMode));
          lastDate = msgDate;
          // After a date divider, we consider this a fresh start for gap calculation within this loop
          // But we need to track local previous timestamp for gap check
        } else if (prevTimestamp > 0 && (msg.timestamp - prevTimestamp > TIME_GAP_THRESHOLD)) {
          fragment.appendChild(createTimeGapDivider(msg.timestamp, displayMode));
        }
        prevTimestamp = msg.timestamp;
      }
      const messageEl = createMessageElement(msg, displayMode);
      bindImageLinkEvents(messageEl);
      fragment.appendChild(messageEl);
    });

    // 处理日期分割线衔接
    if (lastDate && existingFirstDate && lastDate === existingFirstDate) {
      const firstDivider = messagesContainer.querySelector('.time-divider');
      if (firstDivider) {
        // 如果要移除的分割线就是锚点元素，则将锚点向后移一位，防止 insertBefore 找不到父节点
        if (anchorMsg === firstDivider) {
          anchorMsg = firstDivider.nextElementSibling;
        }
        firstDivider.remove();
      }
    }

    // 插入新消息到顶部
    messagesContainer.insertBefore(fragment, anchorMsg);

    if (hasMore) showLoadMoreButton();

    // 恢复滚动位置：使锚点元素保持在相对视口相同的位置
    const newScrollHeight = messagesContainer.scrollHeight;
    const heightDiff = newScrollHeight - oldScrollHeight;
    messagesContainer.scrollTop = oldScrollTop + heightDiff;
    
    // 恢复平滑滚动（如果不立即恢复，建议用 setTimeout 稍微延迟一点，确保渲染完成）
    setTimeout(() => {
      if (messagesContainer) {
        messagesContainer.style.scrollBehavior = '';
      }
    }, 50);
  }

  function showLoadMoreButton() {
    if (!messagesContainer) return;
    hideLoadMoreButton();
    const btn = document.createElement('div');
    btn.id = 'load-more-btn';
    btn.className = 'load-more-btn';
    btn.textContent = '加载更多历史';
    btn.addEventListener('click', () => {
      btn.textContent = '加载中...';
      btn.classList.add('loading');
      loadMoreHistory();
    });
    messagesContainer.insertBefore(btn, messagesContainer.firstChild);
  }

  function hideLoadMoreButton() {
    const btn = document.getElementById('load-more-btn');
    if (btn) {btn.remove();
  }
    updateEmptyState();
  }

  /**
   * @param {any} msg
   * @param {boolean} [skipDivider]
   */
  function appendMessage(msg, skipDivider = false) {
    if (!messagesContainer) return;

    if (emptyState) emptyState.style.display = 'none';

    if (!skipDivider && msg.timestamp) {
      const lastDateStr = lastMessageTimestamp > 0
        ? new Date(lastMessageTimestamp).toLocaleDateString()
        : "";
      const msgDate = new Date(msg.timestamp).toLocaleDateString();
      
      if (msgDate !== lastDateStr) {
        const divider = createTimeDivider(msg.timestamp, displayMode);
        messagesContainer.appendChild(divider);
      } else if (lastMessageTimestamp > 0 && (msg.timestamp - lastMessageTimestamp > TIME_GAP_THRESHOLD)) {
        const divider = createTimeGapDivider(msg.timestamp, displayMode);
        messagesContainer.appendChild(divider);
      }
      lastMessageTimestamp = msg.timestamp;
    }

    const messageEl = createMessageElement(msg, displayMode);
    messagesContainer.appendChild(messageEl);
    bindImageLinkEvents(messageEl);

    if (autoScrollEnabled) {
      scrollToBottom();
    } else {
      if (scrollToBottomBtn) scrollToBottomBtn.style.display = 'flex';
    }
  }

  function clearMessages() {
    if (!messagesContainer) return;
    messagesContainer.innerHTML = '<div id="empty-state">暂无消息</div>';
    lastMessageTimestamp = 0;
    oldestTimestamp = null;
    hasMoreHistory = true;
    isFirstLoad = true;
  }

  function updateEmptyState() {
    if (!messagesContainer) return;
    const currentEmptyState = document.getElementById('empty-state');
    if (!currentEmptyState) return;

    const hasMessages = Array.from(messagesContainer.children).some(
      child => child.id !== 'empty-state' && child.id !== 'load-more-btn'
    );
    const isLoading = document.getElementById('load-more-btn')?.classList.contains('loading') || false;
    currentEmptyState.style.display = (!hasMessages && !isLoading) ? 'block' : 'none';
  }

  function flushPendingMessages() {
    if (pendingMessages.length === 0) return;
    requestAnimationFrame(() => {
      pendingMessages.forEach(msg => appendMessage(msg));
      pendingMessages = [];
    });
  }

  /**
   * @param {'bubble' | 'log'} mode
   */
  function setDisplayMode(mode) {
    if (displayMode === mode) return;
    displayMode = mode;
    document.body.dataset.displayMode = mode;
    if (messagesContainer) {
      vscode.postMessage({ type: 'ready' });
    }
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
  async function handleImageFile(file) {
    try {
      await attachmentManager.handleImageFile(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[WebView] Failed to add image:', message);
      alert(`添加图片失败：${message}`);
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
    vscode.postMessage({
      type: 'openImage',
      payload: { url }
    });
  };

  // ============================================================================
  // Initialization
  // ============================================================================

  vscode.postMessage({ type: 'ready' });
})();
