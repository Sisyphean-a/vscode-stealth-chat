/**
 * Chat utility functions - pure functions, no state, no DOM dependencies.
 * Exposed as window.ChatUtils for use by other modules.
 */
window.ChatUtils = (function () {
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
   * Convert image URLs in text to clickable links (CSP compliant)
   * @param {string} text
   * @returns {string}
   */
  function linkifyImages(text) {
    const imageUrlPattern = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|bmp))/gi;
    return text.replace(imageUrlPattern, (url) => {
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
   * Format time as HH:MM for bubble mode
   * @param {Date} date
   * @returns {string}
   */
  function formatMessageTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return hours + ':' + minutes;
  }

  /**
   * Format time as HH:MM:SS for log mode
   * @param {Date} date
   * @returns {string}
   */
  function formatLogTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return hours + ':' + minutes + ':' + seconds;
  }

  /**
   * Format date label (今天/昨天/MM-DD/YYYY-MM-DD)
   * @param {Date} date
   * @returns {string}
   */
  function formatDateLabel(date) {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const dateStr = date.toLocaleDateString();
    if (dateStr === today.toLocaleDateString()) {
      return "今天";
    }
    if (dateStr === yesterday.toLocaleDateString()) {
      return "昨天";
    }
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    if (year === today.getFullYear()) {
      return `${month}-${day}`;
    }
    return `${year}-${month}-${day}`;
  }

  /**
   * Format as MM-DD HH:MM
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

  return {
    escapeHtml,
    linkifyImages,
    bindImageLinkEvents,
    formatMessageTime,
    formatLogTime,
    formatDateLabel,
    formatTime,
  };
})();
