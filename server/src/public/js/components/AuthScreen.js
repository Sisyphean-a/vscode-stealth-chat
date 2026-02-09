/**
 * 登录认证屏幕组件
 */
export default {
    props: {
        connections: { type: Array, default: () => [] },
        authToken: { type: String, default: '' },
        rememberMe: { type: Boolean, default: false },
        newConnectionName: { type: String, default: '' },
        isConnecting: { type: Boolean, default: false },
        errorMsg: { type: String, default: '' }
    },
    emits: [
        'update:authToken', 'update:rememberMe', 'update:newConnectionName',
        'connect', 'switch-connection', 'open-manager'
    ],
    template: `
    <div class="auth-container">
        <div class="auth-box">
            <h1 class="auth-title">Stealth Chat</h1>
            <p class="auth-subtitle">{{ connections.length > 0 ? '选择对话或添加新对话' : '请输入密钥开始聊天' }}</p>

            <div v-if="connections.length > 0" class="saved-connections">
                <div v-for="conn in connections" :key="conn.id"
                     class="saved-conn-item"
                     @click="$emit('switch-connection', conn.id)">
                    <span class="saved-conn-name">{{ conn.name }}</span>
                    <span class="saved-conn-arrow">→</span>
                </div>
                <div class="auth-divider"><span>或添加新对话</span></div>
            </div>

            <input
                type="text"
                class="auth-input"
                :value="newConnectionName"
                @input="$emit('update:newConnectionName', $event.target.value)"
                placeholder="对话名称（可选）"
                style="margin-bottom: 12px;"
            >

            <input
                type="password"
                class="auth-input"
                :value="authToken"
                @input="$emit('update:authToken', $event.target.value)"
                placeholder="应用密钥"
                @keyup.enter="$emit('connect')"
            >

            <div class="auth-options">
                <label class="checkbox-wrapper">
                    <input type="checkbox" :checked="rememberMe" @change="$emit('update:rememberMe', $event.target.checked)">
                    <span>记住此对话</span>
                </label>
                <span v-if="connections.length > 0" class="action-link" @click="$emit('open-manager')">管理对话</span>
            </div>

            <button class="primary-btn" @click="$emit('connect')" :disabled="isConnecting || !authToken.trim()">
                <span v-if="isConnecting" class="loading-spinner"></span>
                {{ isConnecting ? '连接中...' : '进入聊天' }}
            </button>
            <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
        </div>
    </div>
    `
}
