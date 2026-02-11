const { ref, nextTick, onMounted, onUnmounted } = Vue

import { useChatConnection } from '../composables/useChatConnection.js'
import { useImageHandler } from '../composables/useImageHandler.js'
import { useImagePreview } from '../composables/useImagePreview.js'
import { formatTime, formatDividerDate, showTimeDivider, parseMarkdown, getImageSrc } from '../utils/formatters.js'

import AuthScreen from '../components/AuthScreen.js'
import ConnectionManager from '../components/ConnectionManager.js'
import ConnectionEditor from '../components/ConnectionEditor.js'
import ImagePreviewModal from '../components/ImagePreviewModal.js'

export default {
    components: { AuthScreen, ConnectionManager, ConnectionEditor, ImagePreviewModal },
    template: `
    <div class="chat-wrapper" style="height: 100%; display: flex; flex-direction: column;">
        <auth-screen
            v-if="!connected"
            v-model:authToken="authToken"
            v-model:rememberMe="rememberMe"
            v-model:newConnectionName="newConnectionName"
            :connections="connections"
            :is-connecting="isConnecting"
            :error-msg="errorMsg"
            @connect="connectWithNewToken"
            @switch-connection="switchConnection"
            @open-manager="openConnectionManager"
        />

        <div v-else class="chat-interface">
            <header class="chat-header">
                <div class="header-left">
                    <div class="status-dot" :class="{ active: socketConnected }"></div>
                    <div class="connection-selector" @click="showConnectionMenu = !showConnectionMenu">
                        <span class="conn-name">{{ getActiveConnection()?.name || 'Stealth Chat' }}</span>
                        <span class="conn-arrow">▼</span>
                    </div>
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
                <div v-if="messages.length > 0 && hasMoreHistory" class="load-more-wrapper">
                    <button class="load-more-btn" @click="loadMore" :disabled="isLoadingMore">
                        {{ isLoadingMore ? '加载中...' : '加载更多' }}
                    </button>
                </div>

                <div v-if="messages.length === 0" class="empty-state">
                    <span>暂无消息</span>
                </div>

                <template v-for="(msg, index) in messages" :key="msg.timestamp + '-' + index">
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
                <div v-if="pendingImages.length > 0" class="pending-images">
                    <div v-for="(img, idx) in pendingImages" :key="idx" class="pending-item">
                        <img :src="img.data" alt="待发送图片">
                        <button class="remove-pending" @click="removePendingImage(idx)">×</button>
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

        <image-preview-modal
            v-if="previewImage"
            :src="previewImage"
            :scale="previewScale"
            @close="closePreview"
            @zoom-in="zoomIn"
            @zoom-out="zoomOut"
            @reset-zoom="resetZoom"
        />

        <connection-manager
            v-if="showConnectionManager"
            :connections="connections"
            @close="showConnectionManager = false"
            @edit="openEditConnection"
            @add="openAddConnection"
            @delete="deleteConnection"
        />

        <connection-editor
            v-if="showConnectionEditor"
            :editing="editingConnection"
            @close="closeConnectionEditor"
            @save="handleConnectionSave"
        />
    </div>
    `,
    setup() {
        const chat = useChatConnection()
        const imageHandler = useImageHandler()
        const imagePreview = useImagePreview()

        const { pendingImages } = imageHandler
        const { previewImage, previewScale, openImage, closePreview, zoomIn, zoomOut, resetZoom } = imagePreview

        const inputText = ref('')
        const inputArea = ref(null)
        const fileInput = ref(null)
        const cameraInput = ref(null)

        const isSending = ref(false)

        const sendMessage = async () => {
            if ((!inputText.value.trim() && pendingImages.length === 0) || !chat.socketConnected.value || isSending.value) return

            isSending.value = true
            try {
                let attachments

                // 有图片时先通过 HTTP 上传，避免大 base64 走 socket
                if (pendingImages.length > 0) {
                    try {
                        attachments = await imageHandler.uploadAllImages(chat.authToken.value)
                    } catch (err) {
                        console.error('[Chat] Image upload failed:', err)
                        chat.errorMsg.value = '图片上传失败: ' + err.message
                        isSending.value = false
                        return
                    }
                }

                chat.emit('chat message', {
                    text: inputText.value,
                    source: 'mobile',
                    attachments: attachments && attachments.length > 0 ? attachments : undefined
                })

                inputText.value = ''
                imageHandler.clearPendingImages()
                nextTick(() => {
                    if (inputArea.value) inputArea.value.style.height = 'auto'
                    chat.scrollToBottom()
                })
            } finally {
                isSending.value = false
            }
        }

        const showError = (msg) => { chat.errorMsg.value = msg }
        const handlePaste = (e) => imageHandler.handlePaste(e, showError)
        const handleFileSelect = (e) => imageHandler.handleFileSelect(e, showError)
        const removePendingImage = (index) => imageHandler.removePendingImage(index)
        const triggerFileInput = () => fileInput.value?.click()
        const triggerCameraInput = () => cameraInput.value?.click()

        const handleConnectionSave = (data) => {
            if (data.id) {
                chat.connManager.updateConnection(data.id, data.name, data.token)
            } else {
                const conn = chat.connManager.addConnection(data.name, data.token)
                if (chat.connections.length === 1) {
                    chat.switchConnection(conn.id)
                }
            }
            chat.showConnectionEditor.value = false
        }

        onMounted(() => {
            chat.loadConnections()
            chat.loadSavedToken()
            const activeConn = chat.getActiveConnection()
            if (activeConn) {
                chat.authToken.value = activeConn.token
                chat.connect()
            } else if (chat.authToken.value && chat.rememberMe.value) {
                chat.connect()
            }
        })

        onUnmounted(() => {
            chat.socketManager.disconnect()
        })

        return {
            ...chat,
            inputText, inputArea, fileInput, cameraInput,
            pendingImages, previewImage, previewScale,
            sendMessage, handlePaste, handleFileSelect, removePendingImage,
            triggerFileInput, triggerCameraInput, handleConnectionSave,
            openImage, closePreview, zoomIn, zoomOut, resetZoom,
            parseMarkdown, formatTime, showTimeDivider, formatDividerDate, getImageSrc
        }
    }
}
