const { ref, reactive, nextTick, onMounted, onUnmounted, watchEffect } = Vue;

export default {
    template: `
    <div class="chat-wrapper" style="height: 100%; display: flex; flex-direction: column;">
        <!-- Login Screen -->
        <div v-if="!connected" class="auth-container">
            <div class="auth-box">
                <h1 class="auth-title">Stealth Chat</h1>
                <p class="auth-subtitle">请输入密钥开始聊天</p>

                <input
                    type="password"
                    class="auth-input"
                    v-model="authToken"
                    placeholder="应用密钥"
                    @keyup.enter="connect"
                >

                <div class="auth-options">
                    <label class="checkbox-wrapper">
                        <input type="checkbox" v-model="rememberMe">
                        <span>记住密钥</span>
                    </label>
                    <span v-if="hasSavedToken" class="action-link" @click="clearSavedToken">清除记录</span>
                </div>

                <button class="primary-btn" @click="connect">进入聊天</button>
                <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
            </div>
        </div>

        <!-- Chat Screen -->
        <div v-else class="chat-interface">
            <header class="chat-header">
                <div class="header-left">
                    <div class="status-dot" :class="{ active: socketConnected }"></div>
                    <h2>Stealth Chat</h2>
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
    </div>
    `,
    setup() {
        // State
        const connected = ref(false)
        const socketConnected = ref(false)
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

        const connect = () => {
            if (!authToken.value) {
                errorMsg.value = "请输入密钥"
                return
            }

            // Connect
            socket = io({
                auth: { token: authToken.value }
            })

            socket.on('connect', () => {
                connected.value = true
                socketConnected.value = true
                errorMsg.value = ''
                saveToken()
                socket.emit('load history', 50)
                appendSystemMessage('已安全连接')
            })

            socket.on('connect_error', (err) => {
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
            loadSavedToken()
            // 如果有保存的密钥且勾选了记住我，则自动连接
            if (authToken.value && rememberMe.value) {
                connect()
            }
        })

        onUnmounted(() => {
            if (socket) socket.disconnect()
        })

        return {
            connected, socketConnected, authToken, rememberMe, errorMsg, hasSavedToken,
            messages, inputText, messagesContainer, inputArea, fileInput,
            pendingImages, previewImage, previewScale,
            connect, disconnect, sendMessage, clearSavedToken,
            autoResize, parseMarkdown, formatTime, showTimeDivider, formatDividerDate,
            getImageSrc, openImage, closePreview, zoomIn, zoomOut, resetZoom,
            handlePaste, triggerFileInput, handleFileSelect, removePendingImage
        }
    }
}
