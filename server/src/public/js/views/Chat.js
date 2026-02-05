const { ref, reactive, nextTick, onMounted, onUnmounted, watchEffect } = Vue;

// 导入 composables
import { useSocket } from '../composables/useSocket.js'
import { useConnections } from '../composables/useConnections.js'
import { useImageHandler } from '../composables/useImageHandler.js'
import { useImagePreview } from '../composables/useImagePreview.js'

// 导入工具函数
import { formatTime, formatDividerDate, showTimeDivider, parseMarkdown, getImageSrc } from '../utils/formatters.js'

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
                <!-- 加载更多按钮 -->
                <div v-if="messages.length > 0 && hasMoreHistory" class="load-more-wrapper">
                    <button class="load-more-btn" @click="loadMore" :disabled="isLoadingMore">
                        {{ isLoadingMore ? '加载中...' : '加载更多' }}
                    </button>
                </div>

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
                    <button type="button" class="attach-btn" @click="triggerFileInput" title="从相册选择">+</button>
                    <button type="button" class="camera-btn" @click="triggerCameraInput" title="拍照">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"/>
                            <path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>
                        </svg>
                    </button>
                    <input type="file" ref="fileInput" accept="image/*" style="display: none" @change="handleFileSelect" multiple>
                    <input type="file" ref="cameraInput" accept="image/*" capture="environment" style="display: none" @change="handleFileSelect">
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
        // 使用 Composables
        const socketManager = useSocket()
        const connManager = useConnections()
        const imageHandler = useImageHandler()
        const imagePreview = useImagePreview()

        // 从 composables 解构常用状态
        const { connected, socketConnected, isConnecting, isLoadingMore, hasMoreHistory, errorMsg } = socketManager
        const { connections, activeConnectionId } = connManager
        const { pendingImages } = imageHandler
        const { previewImage, previewScale } = imagePreview

        // 本地状态
        const authToken = ref('')
        const rememberMe = ref(false)
        const hasSavedToken = ref(false)
        const messages = reactive([])
        const inputText = ref('')
        const messagesContainer = ref(null)
        const inputArea = ref(null)
        const fileInput = ref(null)
        const cameraInput = ref(null)

        // UI 状态
        const showConnectionMenu = ref(false)
        const showConnectionManager = ref(false)
        const showConnectionEditor = ref(false)
        const editingConnection = ref(null)
        const newConnectionName = ref('')
        const newConnectionToken = ref('')

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

        // --- 多连接管理（使用 composables）---
        const { loadConnections, saveActiveConnection, getActiveConnection, addConnection, updateConnection } = connManager

        const deleteConnection = (id) => {
            const wasActive = activeConnectionId.value === id
            connManager.deleteConnection(id)
            if (wasActive && connections.length > 0) {
                switchConnection(connections[0].id)
            }
        }

        const switchConnection = (connId) => {
            if (activeConnectionId.value === connId && connected.value) return

            activeConnectionId.value = connId
            saveActiveConnection()
            messages.splice(0)
            socketManager.disconnect()
            socketManager.resetLoadMoreState()

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
                socketManager.errorMsg.value = "请输入密钥"
                return
            }

            socketManager.connect(authToken.value, {
                onConnect: () => {
                    saveToken()
                    appendSystemMessage('已安全连接')
                },
                onDisconnect: () => {
                    appendSystemMessage('连接已断开')
                },
                onMessage: (msg) => {
                    appendMessage(msg)
                    scrollToBottom()
                },
                onHistoryLoaded: (history) => {
                    if (history) {
                        history.forEach(appendMessage)
                        scrollToBottom()
                    }
                }
            })
        }

        const disconnect = () => {
            socketManager.disconnect()
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

            socketManager.emit('chat message', {
                text: inputText.value,
                source: 'mobile',
                attachments: attachments.length > 0 ? attachments : undefined
            })

            inputText.value = ''
            imageHandler.clearPendingImages()
            nextTick(() => {
                if(inputArea.value) {
                    inputArea.value.style.height = 'auto'
                }
                scrollToBottom()
            })
        }

        // --- Image Handling (使用 composables) ---
        const handlePaste = (e) => imageHandler.handlePaste(e, appendSystemMessage)
        const handleFileSelect = (e) => imageHandler.handleFileSelect(e, appendSystemMessage)
        const removePendingImage = (index) => imageHandler.removePendingImage(index)

        const triggerFileInput = () => {
            if (fileInput.value) {
                fileInput.value.click()
            }
        }

        const triggerCameraInput = () => {
            if (cameraInput.value) {
                cameraInput.value.click()
            }
        }

        // --- Image Preview (使用 composables) ---
        const { openImage, closePreview, zoomIn, zoomOut, resetZoom } = imagePreview

        // --- 加载更多历史消息 ---
        const loadMore = () => {
            if (messages.length === 0) return

            const oldestTimestamp = messages[0].timestamp
            const oldScrollHeight = messagesContainer.value?.scrollHeight || 0

            socketManager.loadMoreHistory(oldestTimestamp, (olderMessages) => {
                if (olderMessages && olderMessages.length > 0) {
                    const newMessages = olderMessages.map(msg => ({
                        text: msg.text,
                        type: msg.source === 'mobile' ? 'own' : (msg.source === 'system' ? 'system' : 'remote'),
                        sender: msg.source === 'mobile' ? '我' : 'VSCode',
                        timestamp: msg.timestamp,
                        attachments: msg.attachments
                    }))
                    messages.unshift(...newMessages)

                    // 保持滚动位置
                    nextTick(() => {
                        if (messagesContainer.value) {
                            const newScrollHeight = messagesContainer.value.scrollHeight
                            messagesContainer.value.scrollTop = newScrollHeight - oldScrollHeight
                        }
                    })
                }
            })
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

        // 格式化函数已从 ../utils/formatters.js 导入

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
            socketManager.disconnect()
        })

        return {
            connected, socketConnected, isConnecting, isLoadingMore, hasMoreHistory,
            authToken, rememberMe, errorMsg, hasSavedToken,
            messages, inputText, messagesContainer, inputArea, fileInput, cameraInput,
            pendingImages, previewImage, previewScale,
            // 多连接管理
            connections, activeConnectionId, showConnectionMenu, showConnectionManager, showConnectionEditor,
            editingConnection, newConnectionName, newConnectionToken,
            getActiveConnection, switchConnection, addConnection, deleteConnection,
            openAddConnection, openEditConnection, saveConnectionEditor, closeConnectionEditor, openConnectionManager,
            connectWithNewToken,
            // 原有方法
            connect, disconnect, sendMessage, clearSavedToken, loadMore,
            autoResize, parseMarkdown, formatTime, showTimeDivider, formatDividerDate,
            getImageSrc, openImage, closePreview, zoomIn, zoomOut, resetZoom,
            handlePaste, triggerFileInput, triggerCameraInput, handleFileSelect, removePendingImage
        }
    }
}
