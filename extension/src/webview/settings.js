// @ts-check
(function () {
  // @ts-ignore
  const vscode = acquireVsCodeApi();

  let connections = [];
  let activeConnection = "";
  let editingConnection = null;

  // DOM Elements
  const serverUrlInput = document.getElementById("serverUrl");
  const autoRevealCheckbox = document.getElementById("autoReveal");
  const displayModeSelect = document.getElementById("displayMode");
  const saveGlobalBtn = document.getElementById("saveGlobalBtn");
  const connectionList = document.getElementById("connectionList");
  const addConnectionBtn = document.getElementById("addConnectionBtn");
  const modal = document.getElementById("modal");
  const modalTitle = document.getElementById("modalTitle");
  const connNameInput = document.getElementById("connName");
  const connServerUrlInput = document.getElementById("connServerUrl");
  const connTokenInput = document.getElementById("connToken");
  const modalCancelBtn = document.getElementById("modalCancelBtn");
  const modalSaveBtn = document.getElementById("modalSaveBtn");

  // Initialize
  vscode.postMessage({ type: "getConfig" });

  // Event Listeners
  saveGlobalBtn.addEventListener("click", saveGlobalSettings);
  addConnectionBtn.addEventListener("click", () => openModal());
  modalCancelBtn.addEventListener("click", closeModal);
  modalSaveBtn.addEventListener("click", saveConnection);

  // Handle messages from extension
  window.addEventListener("message", (event) => {
    const message = event.data;
    switch (message.type) {
      case "configLoaded":
        loadConfig(message.payload);
        break;
      case "operationResult":
        handleOperationResult(message.payload);
        break;
      case "testResult":
        handleTestResult(message.payload);
        break;
    }
  });

  function loadConfig(payload) {
    const { globalSettings, connections: conns, activeConnection: active } = payload;

    // Global settings
    serverUrlInput.value = globalSettings.serverUrl || "";
    document.querySelector(`input[name="transport"][value="${globalSettings.forceWebsocket ? "websocket" : "auto"}"]`).checked = true;
    autoRevealCheckbox.checked = globalSettings.autoReveal || false;
    displayModeSelect.value = globalSettings.displayMode || "bubble";

    // Connections
    connections = conns || [];
    activeConnection = active || "";
    renderConnections();
  }

  function renderConnections() {
    connectionList.innerHTML = connections.map((conn) => `
      <div class="connection-item ${conn.name === activeConnection ? "active" : ""}" data-name="${conn.name}">
        <input type="radio" name="activeConn" class="connection-radio"
          ${conn.name === activeConnection ? "checked" : ""}
          onchange="selectConnection('${conn.name}')">
        <div class="connection-info">
          <div class="connection-name">${conn.name}</div>
          <div class="connection-url">${conn.serverUrl || "default"}</div>
        </div>
        <div class="connection-actions">
          <button class="btn btn-small btn-secondary" onclick="testConn('${conn.name}')">Validate</button>
          <button class="btn btn-small btn-secondary" onclick="editConn('${conn.name}')">Edit</button>
          <button class="btn btn-small btn-secondary" onclick="deleteConn('${conn.name}')">Delete</button>
        </div>
      </div>
    `).join("");
  }

  function saveGlobalSettings() {
    const transport = document.querySelector('input[name="transport"]:checked').value;
    vscode.postMessage({
      type: "saveGlobalSettings",
      payload: {
        serverUrl: serverUrlInput.value,
        forceWebsocket: transport === "websocket",
        autoReveal: autoRevealCheckbox.checked,
        displayMode: displayModeSelect.value,
      },
    });
  }

  function openModal(conn = null) {
    editingConnection = conn;
    modalTitle.textContent = conn ? "Edit Rule Set" : "Add Rule Set";
    connNameInput.value = conn?.name || "";
    connServerUrlInput.value = conn?.serverUrl || "";
    connTokenInput.value = conn?.token || "";
    modal.classList.remove("hidden");
  }

  function closeModal() {
    modal.classList.add("hidden");
    editingConnection = null;
  }

  function saveConnection() {
    const name = connNameInput.value.trim();
    const token = connTokenInput.value.trim();
    if (!name || !token) return;

    vscode.postMessage({
      type: "saveConnection",
      payload: {
        connection: {
          name,
          serverUrl: connServerUrlInput.value.trim() || undefined,
          token,
        },
        originalName: editingConnection?.name,
      },
    });
    closeModal();
  }

  // Global functions for onclick handlers
  window.selectConnection = function (name) {
    vscode.postMessage({ type: "setActiveConnection", payload: { name } });
  };

  window.editConn = function (name) {
    const conn = connections.find((c) => c.name === name);
    if (conn) openModal(conn);
  };

  window.deleteConn = function (name) {
    if (confirm(`Delete rule set "${name}"?`)) {
      vscode.postMessage({ type: "deleteConnection", payload: { name } });
    }
  };

  window.testConn = function (name) {
    const conn = connections.find((c) => c.name === name);
    if (conn) {
      vscode.postMessage({
        type: "testConnection",
        payload: {
          name,
          serverUrl: conn.serverUrl || serverUrlInput.value,
          token: conn.token,
        },
      });
    }
  };

  function handleOperationResult(payload) {
    if (payload.success) {
      vscode.postMessage({ type: "getConfig" });
    }
  }

  function handleTestResult(payload) {
    const { name, success, message, latency } = payload;
    const item = document.querySelector(`.connection-item[data-name="${name}"]`);
    if (!item) return;

    // Remove existing badge
    const existing = item.querySelector(".status-badge");
    if (existing) existing.remove();

    // Add new badge
    const badge = document.createElement("span");
    badge.className = `status-badge ${success ? "success" : "error"}`;
    badge.textContent = success ? `${latency}ms` : "Failed";
    item.querySelector(".connection-info").appendChild(badge);

    // Auto remove after 5s
    setTimeout(() => badge.remove(), 5000);
  }
})();
