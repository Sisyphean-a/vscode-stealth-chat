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
                <form @submit.prevent="sendMessage" class="input-form">
                    <textarea 
                        v-model="inputText" 
                        rows="1" 
                        placeholder="发送消息..." 
                        ref="inputArea"
                        @input="autoResize"
                        @keydown.enter.exact.prevent="sendMessage"
                    ></textarea>
                    <button type="submit" class="send-btn" :disabled="!inputText.trim()">发送</button>
                </form>
            </footer>
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
        let socket = null

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
            if (!inputText.value.trim() || !socketConnected.value) return
            
            socket.emit('chat message', {
                text: inputText.value,
                source: 'mobile'
            })
            
            inputText.value = ''
            nextTick(() => {
                if(inputArea.value) {
                    inputArea.value.style.height = 'auto'
                }
                scrollToBottom()
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
            if (att.data) return `data:image/png;base64,${att.data}`
            return ''
        }
        
        const openImage = (src) => window.open(src)

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
            messages, inputText, messagesContainer, inputArea,
            connect, disconnect, sendMessage, clearSavedToken,
            autoResize, parseMarkdown, formatTime, showTimeDivider, formatDividerDate, 
            getImageSrc, openImage
        }
    }
}
