<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { Connection, GlobalSettings } from "../../../types";

  type TestBadge = { success: boolean; latency?: number };

  const DEFAULT_SETTINGS: GlobalSettings = {
    serverUrl: "http://localhost:3000",
    forceWebsocket: false,
    autoReveal: false,
    displayMode: "bubble",
  };

  export let visible = false;
  export let globalSettings: GlobalSettings = DEFAULT_SETTINGS;
  export let connections: Connection[] = [];
  export let activeConnection = "";
  export let testBadges: Record<string, TestBadge> = {};

  const dispatch = createEventDispatcher<{
    close: void;
    saveGlobal: { settings: GlobalSettings };
    saveConnection: { connection: Connection; originalName?: string };
    deleteConnection: { name: string };
    setActiveConnection: { name: string };
    testConnection: { name: string; serverUrl: string; token: string };
  }>();

  let serverUrl = DEFAULT_SETTINGS.serverUrl;
  let forceWebsocket = DEFAULT_SETTINGS.forceWebsocket;
  let autoReveal = DEFAULT_SETTINGS.autoReveal;
  let displayMode: "bubble" | "log" = DEFAULT_SETTINGS.displayMode;
  let previousSettingsRef: GlobalSettings | null = null;

  let modalVisible = false;
  let modalTitle = "添加连接配置";
  let editingName: string | undefined;
  let connName = "";
  let connServerUrl = "";
  let connToken = "";
  let connBackgroundSync = true;

  $: if (globalSettings !== previousSettingsRef) {
    previousSettingsRef = globalSettings;
    serverUrl = globalSettings.serverUrl || DEFAULT_SETTINGS.serverUrl;
    forceWebsocket = !!globalSettings.forceWebsocket;
    autoReveal = !!globalSettings.autoReveal;
    displayMode = globalSettings.displayMode === "log" ? "log" : "bubble";
  }

  function openModal(connection?: Connection): void {
    editingName = connection?.name;
    modalTitle = connection ? "编辑连接配置" : "添加连接配置";
    connName = connection?.name || "";
    connServerUrl = connection?.serverUrl || "";
    connToken = connection?.token || "";
    connBackgroundSync = connection?.backgroundSync !== false;
    modalVisible = true;
  }

  function closeModal(): void {
    modalVisible = false;
    editingName = undefined;
    connName = "";
    connServerUrl = "";
    connToken = "";
    connBackgroundSync = true;
  }

  function saveGlobalSettings(): void {
    dispatch("saveGlobal", {
      settings: {
        serverUrl,
        forceWebsocket,
        autoReveal,
        displayMode,
      },
    });
  }

  function saveConnection(): void {
    const name = connName.trim();
    const token = connToken.trim();
    if (!name || !token) {
      return;
    }
    dispatch("saveConnection", {
      connection: {
        name,
        token,
        serverUrl: connServerUrl.trim() || undefined,
        backgroundSync: connBackgroundSync,
      },
      originalName: editingName,
    });
    closeModal();
  }

  function deleteConnection(name: string): void {
    if (window.confirm(`确定删除连接配置 "${name}"?`)) {
      dispatch("deleteConnection", { name });
    }
  }

  function testConnection(connection: Connection): void {
    dispatch("testConnection", {
      name: connection.name,
      serverUrl: connection.serverUrl || serverUrl,
      token: connection.token,
    });
  }
</script>

<div id="settings-view" class="{visible ? 'visible' : 'hidden'}">
  <div class="settings-header">
    <button id="settings-back-btn" title="返回" on:click={() => dispatch("close")}>←</button>
    <span>设置</span>
  </div>

  <div class="settings-content">
    <section class="section">
      <h2 class="section-title">全局设置</h2>
      <div class="form-group">
        <label for="serverUrl">默认服务器</label>
        <input id="serverUrl" type="text" bind:value={serverUrl} placeholder="http://localhost:3000" />
      </div>

      <div class="form-group">
        <div class="form-label">传输方式</div>
        <div class="radio-group">
          <label class="radio-label">
            <input
              type="radio"
              name="transport"
              value="auto"
              checked={!forceWebsocket}
              on:change={() => (forceWebsocket = false)}
            />
            <span>自动</span>
          </label>
          <label class="radio-label">
            <input
              type="radio"
              name="transport"
              value="websocket"
              checked={forceWebsocket}
              on:change={() => (forceWebsocket = true)}
            />
            <span>WebSocket</span>
          </label>
        </div>
      </div>

      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" bind:checked={autoReveal} />
          <span>自动显示</span>
        </label>
      </div>

      <div class="form-group">
        <label for="displayMode">显示模式</label>
        <select id="displayMode" bind:value={displayMode}>
          <option value="bubble">气泡</option>
          <option value="log">日志</option>
        </select>
      </div>
      <button id="saveGlobalBtn" class="btn btn-primary" on:click={saveGlobalSettings}>保存设置</button>
    </section>

    <section class="section">
      <h2 class="section-title">连接配置</h2>
      <div id="connectionList">
        {#each connections as connection}
          <div class="connection-item {connection.name === activeConnection ? 'active' : ''}">
            <input
              type="radio"
              name="activeConn"
              class="connection-radio"
              checked={connection.name === activeConnection}
              on:change={() => dispatch("setActiveConnection", { name: connection.name })}
            />
            <div class="connection-info">
              <div class="connection-name">{connection.name}</div>
              <div class="connection-url">{connection.serverUrl || "默认"}</div>
              <div class="connection-url">
                后台轮询: {connection.backgroundSync === false ? "关闭" : "开启"}
              </div>
              {#if testBadges[connection.name]}
                <span class="status-badge {testBadges[connection.name].success ? 'success' : 'error'}">
                  {testBadges[connection.name].success
                    ? `${testBadges[connection.name].latency ?? 0}ms`
                    : "失败"}
                </span>
              {/if}
            </div>
            <div class="connection-actions">
              <button class="btn btn-small btn-secondary" on:click={() => testConnection(connection)}>
                验证
              </button>
              <button class="btn btn-small btn-secondary" on:click={() => openModal(connection)}>
                编辑
              </button>
              <button class="btn btn-small btn-secondary" on:click={() => deleteConnection(connection.name)}>
                删除
              </button>
            </div>
          </div>
        {/each}
      </div>
      <button id="addConnectionBtn" class="btn btn-secondary" on:click={() => openModal()}>
        + 添加连接配置
      </button>
    </section>
  </div>
</div>

<div id="modal" class="modal {modalVisible ? '' : 'hidden'}">
  <div class="modal-content">
    <h3 id="modalTitle">{modalTitle}</h3>
    <div class="form-group">
      <label for="connName">名称</label>
      <input id="connName" type="text" bind:value={connName} placeholder="Production" />
    </div>
    <div class="form-group">
      <label for="connServerUrl">服务器地址 (可选)</label>
      <input id="connServerUrl" type="text" bind:value={connServerUrl} placeholder="使用全局默认" />
    </div>
    <div class="form-group">
      <label for="connToken">密钥</label>
      <input id="connToken" type="password" bind:value={connToken} placeholder="输入密钥" />
    </div>
    <div class="form-group">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={connBackgroundSync} />
        <span>启用后台轮询</span>
      </label>
    </div>
    <div class="modal-actions">
      <button id="modalCancelBtn" class="btn btn-secondary" on:click={closeModal}>取消</button>
      <button id="modalSaveBtn" class="btn btn-primary" on:click={saveConnection}>保存</button>
    </div>
  </div>
</div>
