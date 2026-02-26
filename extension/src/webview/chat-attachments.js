window.ChatAttachments = (function () {
  function normalizeServerUrl(serverUrl) {
    return String(serverUrl || '').trim().replace(/\/+$/, '');
  }

  function buildUploadUrl(serverUrl) {
    const normalizedServerUrl = normalizeServerUrl(serverUrl);
    if (!normalizedServerUrl) {
      throw new Error('Missing server URL');
    }
    return `${normalizedServerUrl}/api/upload`;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result;
        if (!result || typeof result !== 'string') {
          reject(new Error('Failed to parse file data'));
          return;
        }
        resolve(result);
      };
      reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
      reader.readAsDataURL(file);
    });
  }

  async function uploadImage(serverUrl, authToken, attachment) {
    const response = await fetch(buildUploadUrl(serverUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        data: attachment.data,
        filename: attachment.filename,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || 'Upload failed');
    }

    return payload.attachment;
  }

  function createManager(options) {
    const maxImageSize = options.maxImageSize;
    const getInputContainer = options.getInputContainer;
    let pendingAttachments = [];

    const renderAttachmentPreview = () => {
      let previewContainer = document.getElementById('attachment-preview');
      if (!previewContainer) {
        previewContainer = document.createElement('div');
        previewContainer.id = 'attachment-preview';
        const inputContainer = getInputContainer();
        if (inputContainer) {
          inputContainer.insertBefore(previewContainer, inputContainer.firstChild);
        }
      }

      if (!previewContainer) {
        return;
      }

      if (pendingAttachments.length === 0) {
        previewContainer.style.display = 'none';
        previewContainer.innerHTML = '';
        return;
      }

      previewContainer.style.display = 'flex';
      previewContainer.innerHTML = '';

      pendingAttachments.forEach((attachment, index) => {
        const item = document.createElement('div');
        item.className = 'attachment-item';
        item.dataset.index = String(index);

        const image = document.createElement('img');
        image.src = attachment.data;
        image.alt = attachment.filename;
        item.appendChild(image);

        const removeButton = document.createElement('button');
        removeButton.className = 'remove-attachment';
        removeButton.dataset.index = String(index);
        removeButton.title = '移除';
        removeButton.textContent = '×';
        removeButton.addEventListener('click', () => {
          pendingAttachments.splice(index, 1);
          renderAttachmentPreview();
        });
        item.appendChild(removeButton);

        previewContainer.appendChild(item);
      });
    };

    const handleImageFile = async (file) => {
      if (file.size > maxImageSize) {
        const sizeMB = (file.size / 1024 / 1024).toFixed(2);
        throw new Error(`Image too large: ${sizeMB}MB`);
      }

      const data = await readFileAsDataUrl(file);
      pendingAttachments.push({
        data,
        filename: file.name || 'image.png',
        size: file.size,
      });
      renderAttachmentPreview();
    };

    const uploadAll = async (serverUrl, authToken) => {
      const uploads = [];
      for (const attachment of pendingAttachments) {
        const uploaded = await uploadImage(serverUrl, authToken, attachment);
        uploads.push(uploaded);
      }
      return uploads;
    };

    const clear = () => {
      pendingAttachments = [];
      renderAttachmentPreview();
    };

    const getPending = () => pendingAttachments;

    return {
      clear,
      getPending,
      handleImageFile,
      uploadAll,
    };
  }

  return {
    createManager,
  };
})();
