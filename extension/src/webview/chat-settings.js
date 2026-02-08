/**
 * Chat settings management - handles the settings overlay UI.
 * Depends on window.ChatUtils (escapeHtml).
 * Exposed as window.ChatSettings.
 */
window.ChatSettings = (function () {
  const { escapeHtml } = window.ChatUtils;

  // State
  /** @type {any[]} */
  let connections = [];
  let activeConnection = "";
  /** @type {any} */
  let editingConnection = null;
  /** @type {ReturnType<typeof acquireVsCodeApi> | null} */
  let vscodeApi = null;

  // DOM references (resolved lazily in init)
  /** @type {HTMLElement | null} */
  let settingsView = null;
  /** @type {HTMLInputElement | null} */
  let serverUrlInput = null;
  /** @type {HTMLInputElement | null} */
  let autoRevealCheckbox = null;
  /** @type {HTMLSelectElement | null} */
  let displayModeSelect = null;
  /** @type {HTMLElement | null} */
  let connectionList = null;
  /** @type {HTMLElement | null} */
  let modal = null;
  /** @type {HTMLElement | null} */
  let modalTitle = null;
  /** @type {HTMLInputElement | null} */
  let connNameInput = null;
  /** @type {HTMLInputElement | null} */
  let connServerUrlInput = null;
  /** @type {HTMLInputElement | null} */
  let connTokenInput = null;

  /**
   * Initialize settings module - bind events and cache DOM refs
   * @param {ReturnType<typeof acquireVsCodeApi>} vscode
   */
  function init(vscode) {
    vscodeApi = vscode;

    // Cache DOM elements
    settingsView = document.getElementById("settings-view");
    serverUrlInput = /** @type {HTMLInputElement | null} */ (document.getElementById("serverUrl"));
    autoRevealCheckbox = /** @type {HTMLInputElement | null} */ (document.getElementById("autoReveal"));
    displayModeSelect = /** @type {HTMLSelectElement | null} */ (document.getElementById("displayMode"));
    connectionList = document.getElementById("connectionList");
    modal = document.getElementById("modal");
    modalTitle = document.getElementById("modalTitle");
    connNameInput = /** @type {HTMLInputElement | null} */ (document.getElementById("connName"));
    connServerUrlInput = /** @type {HTMLInputElement | null} */ (document.getElementById("connServerUrl"));
    connTokenInput = /** @type {HTMLInputElement | null} */ (document.getElementById("connToken"));

    // Bind button events
    const saveGlobalBtn = document.getElementById("saveGlobalBtn");
    const addConnectionBtn = document.getElementById("addConnectionBtn");
    const modalCancelBtn = document.getElementById("modalCancelBtn");
    const modalSaveBtn = document.getElementById("modalSaveBtn");

    if (saveGlobalBtn) saveGlobalBtn.addEventListener("click", saveGlobalSettings);
    if (addConnectionBtn) addConnectionBtn.addEventListener("click", () => openModal());
    if (modalCancelBtn) modalCancelBtn.addEventListener("click", closeModal);
    if (modalSaveBtn) modalSaveBtn.addEventListener("click", saveConnectionHandler);
  }

  function show() {
    if (!settingsView) return;
    settingsView.classList.remove('hidden');
    requestAnimationFrame(() => {
      if (settingsView) settingsView.classList.add('visible');
    });
  }

  function hide() {
    if (!settingsView) return;
    settingsView.classList.remove('visible');
    setTimeout(() => {
      if (settingsView) settingsView.classList.add('hidden');
    }, 200);
  }

  /**
   * @param {any} payload
   */
  function loadConfig(payload) {
    const { globalSettings, connections: conns, activeConnection: active } = payload;

    if (serverUrlInput) serverUrlInput.value = globalSettings.serverUrl || "";
    const transportRadio = document.querySelector(
      `input[name="transport"][value="${globalSettings.forceWebsocket ? "websocket" : "auto"}"]`
    );
    if (transportRadio) /** @type {HTMLInputElement} */ (transportRadio).checked = true;
    if (autoRevealCheckbox) autoRevealCheckbox.checked = globalSettings.autoReveal || false;
    if (displayModeSelect) displayModeSelect.value = globalSettings.displayMode || "bubble";

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

    // Bind radio events
    connectionList.querySelectorAll('.connection-radio').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const item = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('.connection-item'));
        if (item) selectConnection(item.dataset.name || '');
      });
    });

    // Bind action button events
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
    if (!vscodeApi) return;
    const transportRadio = /** @type {HTMLInputElement | null} */ (
      document.querySelector('input[name="transport"]:checked')
    );
    vscodeApi.postMessage({
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
   * @param {any} [conn]
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
    if (!vscodeApi) return;
    const name = connNameInput?.value.trim() || '';
    const token = connTokenInput?.value.trim() || '';
    if (!name || !token) return;

    vscodeApi.postMessage({
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

  /** @param {string} name */
  function selectConnection(name) {
    if (!vscodeApi) return;
    vscodeApi.postMessage({ type: "setActiveConnection", payload: { name } });
  }

  /** @param {string} name */
  function editConn(name) {
    const conn = connections.find((c) => c.name === name);
    if (conn) openModal(conn);
  }

  /** @param {string} name */
  function deleteConn(name) {
    if (!vscodeApi) return;
    if (confirm(`确定删除连接配置 "${name}"?`)) {
      vscodeApi.postMessage({ type: "deleteConnection", payload: { name } });
    }
  }

  /** @param {string} name */
  function testConn(name) {
    if (!vscodeApi) return;
    const conn = connections.find((c) => c.name === name);
    if (conn) {
      vscodeApi.postMessage({
        type: "testConnection",
        payload: {
          name,
          serverUrl: conn.serverUrl || serverUrlInput?.value || '',
          token: conn.token,
        },
      });
    }
  }

  /** @param {any} payload */
  function handleOperationResult(payload) {
    if (!vscodeApi) return;
    if (payload.success) {
      vscodeApi.postMessage({ type: "getConfig" });
    }
  }

  /** @param {any} payload */
  function handleTestResult(payload) {
    const { name, success, latency } = payload;
    const item = document.querySelector(`.connection-item[data-name="${name}"]`);
    if (!item) return;

    const existing = item.querySelector(".status-badge");
    if (existing) existing.remove();

    const badge = document.createElement("span");
    badge.className = `status-badge ${success ? "success" : "error"}`;
    badge.textContent = success ? `${latency}ms` : "失败";
    const infoEl = item.querySelector(".connection-info");
    if (infoEl) infoEl.appendChild(badge);

    setTimeout(() => badge.remove(), 5000);
  }

  return {
    init,
    show,
    hide,
    loadConfig,
    handleOperationResult,
    handleTestResult,
  };
})();
