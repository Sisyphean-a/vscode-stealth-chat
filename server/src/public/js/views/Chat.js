const { ref, reactive, nextTick, onMounted, onUnmounted, watchEffect } = Vue;

export default {
    template: `
    <div class="chat-wrapper" style="height: 100%; display: flex; flex-direction: column;">
        <!-- Login Screen -->
        <div v-if="!connected" class="auth-container">
            <div class="auth-box">
                <h1 class="auth-title">Stealth Chat</h1>
                <p class="auth-subtitle">{{ connections.length > 0 ? '选择对话或添加新对话' : '请输入密钥开始聊天' }}</p>

                <!-- 已有连接列表 -->
                <div v-if="connections.length > 0" class="saved-connections">
                    <div v-for="conn in connections" :key="conn.id"
                         class="saved-conn-item"
                         @click="switchConnection(conn.id)">
                        <span class="saved-conn-name">{{ conn.name }}</span>
                        <span class="saved-conn-arrow">→</span>
                    </div>
                    <div class="auth-divider"><span>或添加新对话</span></div>
                </div>

                <input
                    type="text"
                    class="auth-input"
                    v-model="newConnectionName"
                    placeholder="对话名称（可选）"
                    style="margin-bottom: 12px;"
                >

                <input
                    type="password"
                    class="auth-input"
                    v-model="authToken"
                    placeholder="应用密钥"
                    @keyup.enter="connectWithNewToken"
                >

                <div class="auth-options">
                    <label class="checkbox-wrapper">
                        <input type="checkbox" v-model="rememberMe">
                        <span>记住此对话</span>
                    </label>
                    <span v-if="connections.length > 0" class="action-link" @click="openConnectionManager">管理对话</span>
                </div>

                <button class="primary-btn" @click="connectWithNewToken" :disabled="isConnecting || !authToken.trim()">
                    <span v-if="isConnecting" class="loading-spinner"></span>
                    {{ isConnecting ? '连接中...' : '进入聊天' }}
                </button>
                <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
            </div>
        </div>

        <!-- Chat Screen -->
        <div v-else class="chat-interface">
            <header class="chat-header">
                <div class="header-left">
                    <div class="status-dot" :class="{ active: socketConnected }"></div>
                    <div class="connection-selector" @click="showConnectionMenu = !showConnectionMenu">
                        <span class="conn-name">{{ getActiveConnection()?.name || 'Stealth Chat' }}</span>
                        <span class="conn-arrow">▼</span>
                    </div>
                    <!-- 连接下拉菜单 -->
                    <div v-if="showConnectionMenu" class="connection-menu">
                        <div v-for="conn in connections" :key="conn.id"
                             class="conn-item"
                             :class="{ active: conn.id === activeConnectionId }"
                             @click="switchConnection(conn.id)">
                            <span class="conn-check">{{ conn.id === activeConnectionId ? '✓' : '' }}</span>
                            <span class="conn-item-name">{{ conn.name }}</span>
                        </div>
                        <div class="conn-divider"></div>
                        <div class="conn-item action" @click="openAddConnection">
                            <span class="conn-icon">+</span>
                            <span>添加新对话</span>
                        </div>
                        <div class="conn-item action" @click="openConnectionManager">
                            <span class="conn-icon">⚙</span>
                            <span>管理对话</span>
                        </div>
                    </div>
                </div>
                <div class="header-right">
                    <button class="text-btn" @click="disconnect">断开</button>
                </div>
            </header>

            <main class="message-list" ref="messagesContainer">
                <div v-if="messages.length === 0" class="empty-state">
                    <span>暂无消息</span>
                </div>

                <template v-for="(msg, index) in messages" :key="index">
                    <div v-if="showTimeDivider(msg, messages[index-1])" class="time-divider">
                        <span>{{ formatDividerDate(msg.timestamp) }}</span>
                    </div>

                    <div :class="['message-row', msg.type]">
                        <div v-if="msg.sender !== '我' && msg.type !== 'system'" class="avatar">{{ msg.sender[0] }}</div>
                        <div class="message-content">
                            <div class="bubble">
                                <div v-if="msg.attachments" v-for="att in msg.attachments" :key="att.filename">
                                    <img v-if="att.type === 'image'" :src="getImageSrc(att)" class="chat-img" @click="openImage(getImageSrc(att))">
                                </div>
                                <div v-html="parseMarkdown(msg.text)"></div>
                            </div>
                        </div>
                    </div>
                </template>
            </main>

            <footer class="chat-input-area">
                <!-- Pending Images Preview -->
                <div v-if="pendingImages.length > 0" class="pending-images">
                    <div v-for="(img, index) in pendingImages" :key="index" class="pending-item">
                        <img :src="img.data" alt="待发送图片">
                        <button class="remove-pending" @click="removePendingImage(index)">×</button>
                    </div>
                </div>
                <form @submit.prevent="sendMessage" class="input-form" @paste="handlePaste">
                    <button type="button" class="attach-btn" @click="triggerFileInput" title="添加图片">+</button>
                    <input type="file" ref="fileInput" accept="image/*" style="display: none" @change="handleFileSelect" multiple>
                    <textarea
                        v-model="inputText"
                        rows="1"
                        placeholder="发送消息... (可粘贴图片)"
                        ref="inputArea"
                        @input="autoResize"
                        @keydown.enter.exact.prevent="sendMessage"
                    ></textarea>
                    <button type="submit" class="send-btn" :disabled="!inputText.trim() && pendingImages.length === 0"></button>
                </form>
            </footer>
        </div>

        <!-- Image Preview Modal -->
        <div v-if="previewImage" class="image-modal" @click.self="closePreview">
            <div class="modal-toolbar">
                <button class="modal-btn" @click="zoomIn" title="放大">+</button>
                <button class="modal-btn" @click="zoomOut" title="缩小">−</button>
                <button class="modal-btn" @click="resetZoom" title="重置">⟲</button>
                <button class="modal-btn" @click="closePreview" title="关闭">×</button>
            </div>
            <img :src="previewImage" :style="{ transform: 'scale(' + previewScale + ')' }" alt="预览">
        </div>

        <!-- 连接管理弹窗 -->
        <div v-if="showConnectionManager" class="modal-overlay" @click.self="showConnectionManager = false">
            <div class="modal-box">
                <div class="modal-header">
                    <h3>管理对话</h3>
                    <button class="modal-close" @click="showConnectionManager = false">×</button>
                </div>
                <div class="modal-body">
                    <div v-if="connections.length === 0" class="empty-hint">暂无对话配置</div>
                    <div v-for="conn in connections" :key="conn.id" class="conn-manage-item">
                        <span class="conn-manage-name">{{ conn.name }}</span>
                        <div class="conn-manage-actions">
                            <button class="btn-edit" @click="openEditConnection(conn)">编辑</button>
                            <button class="btn-delete" @click="deleteConnection(conn.id)">删除</button>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-add" @click="openAddConnection">+ 添加新对话</button>
                </div>
            </div>
        </div>

        <!-- 连接编辑弹窗 -->
        <div v-if="showConnectionEditor" class="modal-overlay" @click.self="closeConnectionEditor">
            <div class="modal-box">
                <div class="modal-header">
                    <h3>{{ editingConnection ? '编辑对话' : '添加新对话' }}</h3>
                    <button class="modal-close" @click="closeConnectionEditor">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>名称</label>
                        <input type="text" v-model="newConnectionName" placeholder="对话名称（可选）" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>密钥</label>
                        <input type="password" v-model="newConnectionToken" placeholder="应用密钥" class="form-input">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-cancel" @click="closeConnectionEditor">取消</button>
                    <button class="btn-save" @click="saveConnectionEditor" :disabled="!newConnectionToken.trim()">保存</button>
                </div>
            </div>
        </div>
    </div>
    `,
    setup() {
        // State
        const connected = ref(false)
        const socketConnected = ref(false)
        const isConnecting = ref(false)
        const authToken = ref('')
        const rememberMe = ref(false)
        const errorMsg = ref('')
        const hasSavedToken = ref(false)
        const messages = reactive([])
        const inputText = ref('')
        const messagesContainer = ref(null)
        const inputArea = ref(null)
        const fileInput = ref(null)
        let socket = null

        // Pending images for sending
        const pendingImages = reactive([])

        // 多连接管理
        const connections = reactive([])
        const activeConnectionId = ref('')
        const showConnectionMenu = ref(false)
        const showConnectionManager = ref(false)
        const showConnectionEditor = ref(false)
        const editingConnection = ref(null)
        const newConnectionName = ref('')
        const newConnectionToken = ref('')

        // localStorage keys
        const CONNECTIONS_KEY = 'st_connections'
        const ACTIVE_CONN_KEY = 'st_active_conn'

        // 图片大小限制 (5MB)
        const MAX_IMAGE_SIZE = 5 * 1024 * 1024

        // Image preview state
        const previewImage = ref(null)
        const previewScale = ref(1)

        // --- Auth Logic ---
        const loadSavedToken = () => {
            const saved = localStorage.getItem('st_token')
            if (saved) {
                try {
                    authToken.value = atob(saved)
                    rememberMe.value = true
                    hasSavedToken.value = true
                } catch(e) {}
            }
        }

        const saveToken = () => {
            if (rememberMe.value) {
                localStorage.setItem('st_token', btoa(authToken.value))
                hasSavedToken.value = true
            } else {
                localStorage.removeItem('st_token')
                hasSavedToken.value = false
            }
        }

        const clearSavedToken = () => {
            localStorage.removeItem('st_token')
            authToken.value = ''
            rememberMe.value = false
            hasSavedToken.value = false
        }

        // --- 多连接管理 ---
        const generateId = () => Math.random().toString(36).substring(2, 10)

        const loadConnections = () => {
            const saved = localStorage.getItem(CONNECTIONS_KEY)
            if (saved) {
                try {
                    const parsed = JSON.parse(saved)
                    connections.splice(0, connections.length, ...parsed)
                } catch(e) {}
            }
            // 兼容旧版单 token 格式
            if (connections.length === 0) {
                const oldToken = localStorage.getItem('st_token')
                if (oldToken) {
                    try {
                        const token = atob(oldToken)
                        connections.push({
                            id: generateId(),
                            name: '默认对话',
                            token: token
                        })
                        saveConnections()
                    } catch(e) {}
                }
            }
            // 加载活动连接
            const activeId = localStorage.getItem(ACTIVE_CONN_KEY)
            if (activeId && connections.find(c => c.id === activeId)) {
                activeConnectionId.value = activeId
            } else if (connections.length > 0) {
                activeConnectionId.value = connections[0].id
            }
        }

        const saveConnections = () => {
            localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(connections))
        }

        const saveActiveConnection = () => {
            localStorage.setItem(ACTIVE_CONN_KEY, activeConnectionId.value)
        }

        const getActiveConnection = () => {
            return connections.find(c => c.id === activeConnectionId.value)
        }

        const addConnection = (name, token) => {
            const conn = {
                id: generateId(),
                name: name || '新对话',
                token: token
            }
            connections.push(conn)
            saveConnections()
            return conn
        }

        const updateConnection = (id, name, token) => {
            const conn = connections.find(c => c.id === id)
            if (conn) {
                conn.name = name
                conn.token = token
                saveConnections()
            }
        }

        const deleteConnection = (id) => {
            const index = connections.findIndex(c => c.id === id)
            if (index !== -1) {
                connections.splice(index, 1)
                saveConnections()
                // 如果删除的是当前活动连接，切换到第一个
                if (activeConnectionId.value === id && connections.length > 0) {
                    switchConnection(connections[0].id)
                }
            }
        }

        const switchConnection = (connId) => {
            if (activeConnectionId.value === connId && connected.value) return

            activeConnectionId.value = connId
            saveActiveConnection()

            // 清空当前消息
            messages.splice(0)

            // 断开旧连接
            if (socket) {
                socket.disconnect()
                socket = null
            }
            connected.value = false
            socketConnected.value = false

            // 使用新 token 重连
            const conn = getActiveConnection()
            if (conn) {
                authToken.value = conn.token
                connect()
            }

            showConnectionMenu.value = false
        }

        // 连接编辑器操作
        const openAddConnection = () => {
            editingConnection.value = null
            newConnectionName.value = ''
            newConnectionToken.value = ''
            showConnectionEditor.value = true
            showConnectionMenu.value = false
        }

        const openEditConnection = (conn) => {
            editingConnection.value = conn
            newConnectionName.value = conn.name
            newConnectionToken.value = conn.token
            showConnectionEditor.value = true
            showConnectionManager.value = false
        }

        const saveConnectionEditor = () => {
            if (!newConnectionToken.value.trim()) return

            if (editingConnection.value) {
                updateConnection(editingConnection.value.id, newConnectionName.value || '新对话', newConnectionToken.value)
            } else {
                const conn = addConnection(newConnectionName.value, newConnectionToken.value)
                // 如果是第一个连接，自动切换
                if (connections.length === 1) {
                    switchConnection(conn.id)
                }
            }
            showConnectionEditor.value = false
        }

        const closeConnectionEditor = () => {
            showConnectionEditor.value = false
            editingConnection.value = null
        }

        const openConnectionManager = () => {
            showConnectionManager.value = true
            showConnectionMenu.value = false
        }

        // 从登录页使用新 token 连接
        const connectWithNewToken = () => {
            if (!authToken.value.trim()) {
                errorMsg.value = "请输入密钥"
                return
            }

            // 如果勾选了记住，则保存为新连接
            if (rememberMe.value) {
                const conn = addConnection(newConnectionName.value || '新对话', authToken.value)
                activeConnectionId.value = conn.id
                saveActiveConnection()
            }

            connect()
        }

        const connect = () => {
            if (!authToken.value) {
                errorMsg.value = "请输入密钥"
                return
            }

            // 显示连接中状态
            isConnecting.value = true
            errorMsg.value = ''

            // Connect
            socket = io({
                auth: { token: authToken.value }
            })

            socket.on('connect', () => {
                connected.value = true
                socketConnected.value = true
                isConnecting.value = false
                errorMsg.value = ''
                saveToken()
                socket.emit('load history', 50)
                appendSystemMessage('已安全连接')
            })

            socket.on('connect_error', (err) => {
                isConnecting.value = false
                errorMsg.value = "连接失败: " + err.message
                socketConnected.value = false
            })

            socket.on('disconnect', () => {
                socketConnected.value = false
                appendSystemMessage('连接已断开')
            })

            socket.on('chat message', (msg) => {
                appendMessage(msg)
                scrollToBottom()
            })

            socket.on('history loaded', (history) => {
                if(history) {
                    history.forEach(appendMessage)
                    scrollToBottom()
                }
            })
        }

        const disconnect = () => {
            if (socket) socket.disconnect()
            connected.value = false
            messages.splice(0)
        }

        // --- Chat Logic ---
        const appendMessage = (msg) => {
            const type = msg.source === 'mobile' ? 'own' : (msg.source === 'system' ? 'system' : 'remote')
            const sender = msg.source === 'mobile' ? '我' : 'VSCode'
            messages.push({
                text: msg.text,
                type,
                sender,
                timestamp: msg.timestamp || Date.now(),
                attachments: msg.attachments
            })
        }

        const appendSystemMessage = (text) => {
            messages.push({
                text,
                type: 'system',
                sender: 'System',
                timestamp: Date.now()
            })
        }

        const sendMessage = () => {
            if ((!inputText.value.trim() && pendingImages.length === 0) || !socketConnected.value) return

            // Build attachments from pending images
            const attachments = pendingImages.map(img => ({
                type: 'image',
                data: img.data,
                filename: img.filename,
                size: img.size
            }))

            socket.emit('chat message', {
                text: inputText.value,
                source: 'mobile',
                attachments: attachments.length > 0 ? attachments : undefined
            })

            inputText.value = ''
            pendingImages.splice(0) // Clear pending images
            nextTick(() => {
                if(inputArea.value) {
                    inputArea.value.style.height = 'auto'
                }
                scrollToBottom()
            })
        }

        // --- Image Handling ---
        const handlePaste = (e) => {
            const items = e.clipboardData?.items
            if (!items) return

            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault()
                    const file = item.getAsFile()
                    if (file) {
                        processImageFile(file)
                    }
                    break
                }
            }
        }

        const triggerFileInput = () => {
            if (fileInput.value) {
                fileInput.value.click()
            }
        }

        const handleFileSelect = (e) => {
            const files = e.target.files
            if (!files) return
            for (const file of files) {
                if (file.type.startsWith('image/')) {
                    processImageFile(file)
                }
            }
            // Reset input so same file can be selected again
            e.target.value = ''
        }

        const processImageFile = (file) => {
            // 检查文件大小
            if (file.size > MAX_IMAGE_SIZE) {
                const sizeMB = (file.size / 1024 / 1024).toFixed(2)
                appendSystemMessage(`图片过大 (${sizeMB}MB)，请选择小于 5MB 的图片`)
                return
            }

            const reader = new FileReader()
            reader.onload = (e) => {
                const dataUrl = e.target?.result
                if (dataUrl) {
                    pendingImages.push({
                        data: dataUrl,
                        filename: file.name || 'image.png',
                        size: file.size
                    })
                }
            }
            reader.readAsDataURL(file)
        }

        const removePendingImage = (index) => {
            pendingImages.splice(index, 1)
        }

        // --- Image Preview ---
        const openImage = (src) => {
            previewImage.value = src
            previewScale.value = 1
        }

        const closePreview = () => {
            previewImage.value = null
            previewScale.value = 1
        }

        const zoomIn = () => {
            previewScale.value = Math.min(previewScale.value + 0.25, 3)
        }

        const zoomOut = () => {
            previewScale.value = Math.max(previewScale.value - 0.25, 0.5)
        }

        const resetZoom = () => {
            previewScale.value = 1
        }

        // --- UI Utilities ---
        const scrollToBottom = () => {
            nextTick(() => {
                if (messagesContainer.value) {
                messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
                }
            })
        }

        const autoResize = (e) => {
            e.target.style.height = 'auto'
            e.target.style.height = e.target.scrollHeight + 'px'
        }

        const parseMarkdown = (text) => {
            if(!text) return ''
            return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="image-link">$1</a>')
        }

        const formatTime = (ts) => {
            const date = new Date(ts)
            return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`
        }

        const formatDividerDate = (ts) => {
            const date = new Date(ts)
            const now = new Date()
            if (date.toDateString() === now.toDateString()) {
                return formatTime(ts)
            }
            return `${date.getMonth()+1}-${date.getDate()} ${formatTime(ts)}`
        }

        const showTimeDivider = (current, prev) => {
            if (!prev) return true
            return (current.timestamp - prev.timestamp) > 5 * 60 * 1000
        }

        const getImageSrc = (att) => {
            if (att.url) return att.url
            if (att.data) return att.data.startsWith('data:') ? att.data : `data:image/png;base64,${att.data}`
            return ''
        }

        onMounted(() => {
            loadConnections()
            loadSavedToken()
            // 如果有连接配置，自动连接到活动连接
            const activeConn = getActiveConnection()
            if (activeConn) {
                authToken.value = activeConn.token
                connect()
            } else if (authToken.value && rememberMe.value) {
                // 兼容旧版：如果有保存的密钥且勾选了记住我，则自动连接
                connect()
            }
        })

        onUnmounted(() => {
            if (socket) socket.disconnect()
        })

        return {
            connected, socketConnected, isConnecting, authToken, rememberMe, errorMsg, hasSavedToken,
            messages, inputText, messagesContainer, inputArea, fileInput,
            pendingImages, previewImage, previewScale,
            // 多连接管理
            connections, activeConnectionId, showConnectionMenu, showConnectionManager, showConnectionEditor,
            editingConnection, newConnectionName, newConnectionToken,
            getActiveConnection, switchConnection, addConnection, deleteConnection,
            openAddConnection, openEditConnection, saveConnectionEditor, closeConnectionEditor, openConnectionManager,
            connectWithNewToken,
            // 原有方法
            connect, disconnect, sendMessage, clearSavedToken,
            autoResize, parseMarkdown, formatTime, showTimeDivider, formatDividerDate,
            getImageSrc, openImage, closePreview, zoomIn, zoomOut, resetZoom,
            handlePaste, triggerFileInput, handleFileSelect, removePendingImage
        }
    }
}
