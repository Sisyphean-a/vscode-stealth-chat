/**
 * Chat message renderer - creates DOM elements for messages.
 * Depends on window.ChatUtils.
 * Exposed as window.ChatRenderer.
 */
window.ChatRenderer = (function () {
  const { escapeHtml, linkifyImages, formatMessageTime, formatLogTime, formatDateLabel } = window.ChatUtils;

  /**
   * Create a date divider element
   * @param {number} timestamp
   * @param {'bubble' | 'log'} displayMode
   * @returns {HTMLElement}
   */
  function createTimeDivider(timestamp, displayMode) {
    const div = document.createElement('div');
    div.className = 'time-divider';
    const time = new Date(timestamp);
    const label = formatDateLabel(time);

    if (displayMode === 'log') {
      div.innerHTML = `<span>══ ${label} ══</span>`;
    } else {
      div.innerHTML = `<span>${label}</span>`;
    }
    return div;
  }

  /**
   * Create a time gap divider element (e.g. 14:30)
   * @param {number} timestamp
   * @param {'bubble' | 'log'} displayMode
   * @returns {HTMLElement}
   */
  function createTimeGapDivider(timestamp, displayMode) {
    const div = document.createElement('div');
    div.className = 'time-divider time-gap';
    const time = new Date(timestamp);
    const label = formatMessageTime(time); // Reuse existing time formatter (HH:MM)

    if (displayMode === 'log') {
      div.innerHTML = `<span>-- ${label} --</span>`;
    } else {
      div.innerHTML = `<span>${label}</span>`;
    }
    return div;
  }

  /**
   * Create a message element (dispatches to bubble or log based on mode)
   * @param {any} msg
   * @param {'bubble' | 'log'} displayMode
   * @returns {HTMLElement}
   */
  function createMessageElement(msg, displayMode) {
    const el = displayMode === 'log'
      ? createLogMessageElement(msg, '')
      : createBubbleMessageElement(msg, '');
    if (msg.id) {
      el.dataset.messageId = String(msg.id);
    }
    if (msg.timestamp) {
      el.dataset.timestamp = String(msg.timestamp);
    }
    return el;
  }

  /**
   * Create quote preview block (click to jump)
   * @param {any} quote
   * @param {'bubble' | 'log'} mode
   * @returns {HTMLElement}
   */
  function createQuotePreview(quote, mode) {
    const block = document.createElement('div');
    block.className = mode === 'bubble' ? 'quote-preview-bubble' : 'quote-preview-log';
    block.dataset.quoteMessageId = String(quote.messageId);
    block.setAttribute('role', 'button');
    block.tabIndex = 0;
    const snippet = quote.textSnippet || '(空消息)';
    block.innerHTML = `<span class="quote-text">${escapeHtml(snippet)}</span>`;
    return block;
  }

  /**
   * Create quote action button for a message
   * @param {any} msg
   * @param {'bubble' | 'log'} mode
   * @returns {HTMLButtonElement | null}
   */
  function createQuoteActionButton(msg, mode) {
    if (!msg.id) {
      return null;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = mode === 'bubble' ? 'quote-action-btn bubble' : 'quote-action-btn log';
    btn.dataset.quoteAction = 'quote';
    btn.dataset.messageId = String(msg.id);
    btn.textContent = '引用';
    return btn;
  }

  /**
   * Create bubble-style message element
   * @param {any} msg
   * @param {string} serverUrl
   * @returns {HTMLElement}
   */
  function createBubbleMessageElement(msg, serverUrl) {
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper ' + (msg.source === 'vscode' ? 'own' : 'remote');

    const timeEl = document.createElement('div');
    timeEl.className = 'message-time';
    const msgTime = new Date(msg.timestamp || Date.now());
    timeEl.textContent = formatMessageTime(msgTime);

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble ' + (msg.source === 'vscode' ? 'own' : 'remote');

    if (msg.quote && msg.quote.messageId) {
      bubble.appendChild(createQuotePreview(msg.quote, 'bubble'));
    }

    if (msg.attachments && msg.attachments.length > 0) {
      renderBubbleAttachments(bubble, msg, serverUrl);
    }

    if (msg.text) {
      const textDiv = document.createElement('div');
      textDiv.innerHTML = linkifyImages(escapeHtml(msg.text));
      bubble.appendChild(textDiv);
    }

    wrapper.appendChild(timeEl);
    wrapper.appendChild(bubble);
    const actionBtn = createQuoteActionButton(msg, 'bubble');
    if (actionBtn) {
      wrapper.appendChild(actionBtn);
    }
    return wrapper;
  }

  /**
   * Render image attachments inside a bubble
   * @param {HTMLElement} bubble
   * @param {any} msg
   * @param {string} serverUrl
   */
  function renderBubbleAttachments(bubble, msg, serverUrl) {
    msg.attachments.forEach(/** @param {any} att */ (att) => {
      if (att.type === 'image') {
        let imageUrl = att.data || att.url;
        if (imageUrl && imageUrl.startsWith('/uploads/')) {
          imageUrl = serverUrl + imageUrl;
        }

        const img = document.createElement('img');
        img.src = imageUrl;
        img.className = 'message-image';
        img.alt = 'Image';
        img.style.cssText = 'max-width: 100%; max-height: 300px; border-radius: 8px; cursor: pointer; display: block; margin-top: 8px;';
        const url = imageUrl;
        img.addEventListener('click', () => {
          // @ts-ignore
          window.showImagePreview(url);
        });
        bubble.appendChild(img);
      }
    });
  }

  /**
   * Create log-style message element
   * @param {any} msg
   * @param {string} serverUrl
   * @returns {HTMLElement}
   */
  function createLogMessageElement(msg, serverUrl) {
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper ' + (msg.source === 'vscode' ? 'own' : 'remote');

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble ' + (msg.source === 'vscode' ? 'own' : 'remote');

    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';

    const timestamp = document.createElement('span');
    timestamp.className = 'log-timestamp';
    const msgTime = new Date(msg.timestamp || Date.now());
    timestamp.textContent = '[' + formatLogTime(msgTime) + ']';

    const source = document.createElement('span');
    source.className = 'log-source ' + (msg.source === 'vscode' ? 'out' : 'info');
    source.textContent = msg.source === 'vscode' ? 'OUT  ' : 'INFO ';

    const content = document.createElement('span');
    content.className = 'log-content';

    if (msg.quote && msg.quote.messageId) {
      const quotePrefix = createQuotePreview(msg.quote, 'log');
      content.appendChild(quotePrefix);
    }

    if (msg.attachments && msg.attachments.length > 0) {
      renderLogAttachments(content, msg, serverUrl);
    }

    if (msg.text) {
      const textSpan = document.createElement('span');
      textSpan.innerHTML = linkifyImages(escapeHtml(msg.text));
      content.appendChild(textSpan);
    }

    logEntry.appendChild(timestamp);
    logEntry.appendChild(source);
    logEntry.appendChild(content);
    const actionBtn = createQuoteActionButton(msg, 'log');
    if (actionBtn) {
      logEntry.appendChild(actionBtn);
    }
    bubble.appendChild(logEntry);
    wrapper.appendChild(bubble);
    return wrapper;
  }

  /**
   * Render image attachments in log mode
   * @param {HTMLElement} content
   * @param {any} msg
   * @param {string} serverUrl
   */
  function renderLogAttachments(content, msg, serverUrl) {
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

    const tooltip = document.createElement('span');
    tooltip.className = 'img-preview-tooltip';

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

    tag.addEventListener('click', () => {
      // @ts-ignore
      window.showImagePreview(imageUrl);
    });

    tag.appendChild(tooltip);
    return tag;
  }

  return {
    createTimeDivider,
    createTimeGapDivider,
    createMessageElement,
    createBubbleMessageElement,
    createLogMessageElement,
    createImageTag,
  };
})();
