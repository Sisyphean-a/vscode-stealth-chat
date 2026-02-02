/**
 * WebView HTML content for the chat interface
 */

export function getChatHtml(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src https: data:;">
  <title>TS-Lint Service</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    #header {
      padding: 12px 16px;
      background: var(--vscode-editorWidget-background);
      border-bottom: 1px solid var(--vscode-editorWidget-border);
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }

    #connection-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--vscode-testing-iconFailed);
      transition: background 0.3s;
    }

    .status-indicator.connected {
      background: var(--vscode-testing-iconPassed);
    }

    #messages-container {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    #empty-state {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--vscode-descriptionForeground);
      font-size: 14px;
    }

    .time-divider {
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 16px 0;
    }

    .time-divider span {
      padding: 4px 12px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
    }

    .message-bubble {
      padding: 8px 12px;
      border-radius: 8px;
      max-width: 70%;
      word-wrap: break-word;
      white-space: pre-wrap;
      line-height: 1.5;
      font-size: 13px;
    }

    .message-bubble.own {
      align-self: flex-end;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-bottom-right-radius: 2px;
    }

    .message-bubble.remote {
      align-self: flex-start;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-bottom-left-radius: 2px;
    }

    .image-link {
      color: var(--vscode-textLink-foreground);
      text-decoration: underline;
      cursor: pointer;
    }

    .image-link:hover {
      color: var(--vscode-textLink-activeForeground);
    }

    #image-tooltip {
      position: fixed;
      background: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-editorWidget-border);
      padding: 4px;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
      z-index: 9999;
      display: none;
      pointer-events: none;
    }

    #image-tooltip img {
      max-width: 400px;
      max-height: 300px;
      border-radius: 2px;
      display: block;
    }

    #scroll-to-bottom {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      transition: opacity 0.3s;
    }

    #scroll-to-bottom:hover {
      opacity: 0.8;
    }

    /* Scrollbar styling */
    #messages-container::-webkit-scrollbar {
      width: 10px;
    }

    #messages-container::-webkit-scrollbar-track {
      background: var(--vscode-scrollbarSlider-background);
    }

    #messages-container::-webkit-scrollbar-thumb {
      background: var(--vscode-scrollbarSlider-hoverBackground);
      border-radius: 5px;
    }

    #messages-container::-webkit-scrollbar-thumb:hover {
      background: var(--vscode-scrollbarSlider-activeBackground);
    }

    /* Input container styling */
    #input-container {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      background: var(--vscode-editorWidget-background);
      border-top: 1px solid var(--vscode-editorWidget-border);
      flex-shrink: 0;
    }

    #message-input {
      flex: 1;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      padding: 8px 12px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      resize: none;
      max-height: 120px;
      overflow-y: auto;
    }

    #message-input:focus {
      outline: none;
      border-color: var(--vscode-focusBorder);
    }

    #send-button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      padding: 8px 16px;
      cursor: pointer;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      transition: opacity 0.2s;
      white-space: nowrap;
    }

    #send-button:hover {
      opacity: 0.9;
    }

    #send-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  <div id="header">
    <div id="connection-status">
      <div class="status-indicator" id="status-indicator"></div>
      <span id="status-text">Disconnected</span>
    </div>
  </div>

  <div id="messages-container">
    <div id="empty-state">No messages yet</div>
  </div>

  <div id="input-container">
    <textarea 
      id="message-input" 
      placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
      rows="1"
    ></textarea>
    <button id="send-button" title="发送消息">
      <span>发送</span>
    </button>
  </div>

  <button id="scroll-to-bottom" title="Scroll to bottom">↓</button>

  <div id="image-tooltip"></div>

  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();

      const messagesContainer = document.getElementById('messages-container');
      const emptyState = document.getElementById('empty-state');
      const statusIndicator = document.getElementById('status-indicator');
      const statusText = document.getElementById('status-text');
      const scrollToBottomBtn = document.getElementById('scroll-to-bottom');
      const imageTooltip = document.getElementById('image-tooltip');
      const messageInput = document.getElementById('message-input');
      const sendButton = document.getElementById('send-button');

      let autoScrollEnabled = true;
      let lastMessageTime = 0;
      const TIME_DIVIDER_THRESHOLD = 300000; // 5 minutes in ms

      // Image URL detection regex
      const imageUrlPattern = /https?:\\/\\/[^\\s]+\\.(jpg|jpeg|png|gif|webp|svg)(\\?[^\\s]*)?/gi;

      // Notify extension that WebView is ready
      vscode.postMessage({ type: 'ready' });

      // Send message function
      function sendMessage() {
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

      // Send button click event
      sendButton.addEventListener('click', sendMessage);

      // Enter to send, Shift+Enter for new line
      messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });

      // Auto-adjust input height
      messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = messageInput.scrollHeight + 'px';
      });

      // Listen for messages from extension
      window.addEventListener('message', event => {
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

      // Load history messages
      function loadHistory(messages) {
        clearMessages();
        messages.forEach(msg => {
          appendMessage(msg, true);
        });
        scrollToBottom(true);
      }

      // Append single message
      function appendMessage(msg, skipDivider = false) {
        // Hide empty state
        if (emptyState.style.display !== 'none') {
          emptyState.style.display = 'none';
        }

        // Add time divider if needed
        if (!skipDivider && msg.timestamp && msg.source !== 'system') {
          const timeDiff = msg.timestamp - lastMessageTime;
          if (lastMessageTime === 0 || timeDiff > TIME_DIVIDER_THRESHOLD) {
            const divider = createTimeDivider(msg.timestamp);
            messagesContainer.appendChild(divider);
          }
          lastMessageTime = msg.timestamp;
        }

        // Create message bubble
        const messageEl = createMessageElement(msg);
        messagesContainer.appendChild(messageEl);

        // Auto scroll if enabled
        if (autoScrollEnabled) {
          scrollToBottom();
        } else {
          // Show scroll-to-bottom button
          scrollToBottomBtn.style.display = 'flex';
        }
      }

      // Create time divider element
      function createTimeDivider(timestamp) {
        const div = document.createElement('div');
        div.className = 'time-divider';
        const time = new Date(timestamp);
        div.innerHTML = \`<span>\${formatTime(time)}</span>\`;
        return div;
      }

      // Create message bubble element
      function createMessageElement(msg) {
        const div = document.createElement('div');
        div.className = \`message-bubble \${msg.source === 'vscode' ? 'own' : 'remote'}\`;

        // Linkify image URLs
        const html = linkifyImages(escapeHtml(msg.text));
        div.innerHTML = html;

        return div;
      }

      // Convert image URLs to clickable links
      function linkifyImages(text) {
        return text.replace(imageUrlPattern, (url) => {
          return \`<a href="#" class="image-link" data-image-url="\${url}">\${url}</a>\`;
        });
      }

      // Escape HTML to prevent XSS
      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }

      // Format timestamp
      function formatTime(date) {
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();

        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const timeStr = \`\${hours}:\${minutes}\`;

        if (isToday) {
          return timeStr;
        } else {
          const month = (date.getMonth() + 1).toString().padStart(2, '0');
          const day = date.getDate().toString().padStart(2, '0');
          return \`\${month}/\${day} \${timeStr}\`;
        }
      }

      // Update connection status
      function updateStatus(connected) {
        if (connected) {
          statusIndicator.classList.add('connected');
          statusText.textContent = 'Connected';
        } else {
          statusIndicator.classList.remove('connected');
          statusText.textContent = 'Disconnected';
        }
      }

      // Clear all messages
      function clearMessages() {
        messagesContainer.innerHTML = '';
        const emptyStateEl = document.createElement('div');
        emptyStateEl.id = 'empty-state';
        emptyStateEl.textContent = 'No messages yet';
        messagesContainer.appendChild(emptyStateEl);
        lastMessageTime = 0;
      }

      // Scroll to bottom
      function scrollToBottom(force = false) {
        if (force || autoScrollEnabled) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }

      // Detect manual scroll
      messagesContainer.addEventListener('scroll', () => {
        const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

        if (!isAtBottom) {
          autoScrollEnabled = false;
          scrollToBottomBtn.style.display = 'flex';
        } else {
          autoScrollEnabled = true;
          scrollToBottomBtn.style.display = 'none';
        }
      });

      // Scroll to bottom button click
      scrollToBottomBtn.addEventListener('click', () => {
        scrollToBottom(true);
        autoScrollEnabled = true;
        scrollToBottomBtn.style.display = 'none';
      });

      // Image tooltip handling
      messagesContainer.addEventListener('mouseover', (e) => {
        if (e.target.classList.contains('image-link')) {
          e.preventDefault();
          const url = e.target.dataset.imageUrl;
          showImageTooltip(url, e.clientX, e.clientY);
        }
      });

      messagesContainer.addEventListener('mouseout', (e) => {
        if (e.target.classList.contains('image-link')) {
          hideImageTooltip();
        }
      });

      messagesContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('image-link')) {
          e.preventDefault();
        }
      });

      function showImageTooltip(url, x, y) {
        imageTooltip.innerHTML = \`<img src="\${url}" alt="Preview" loading="lazy">\`;
        imageTooltip.style.left = (x + 10) + 'px';
        imageTooltip.style.top = (y + 10) + 'px';
        imageTooltip.style.display = 'block';
      }

      function hideImageTooltip() {
        imageTooltip.style.display = 'none';
        imageTooltip.innerHTML = '';
      }
    })();
  </script>
</body>
</html>`;
}
