const { ref, computed, nextTick, onMounted, onUnmounted } = Vue

import { useChatConnection } from '../composables/useChatConnection.js'
import { useImageHandler } from '../composables/useImageHandler.js'
import { useImagePreview } from '../composables/useImagePreview.js'
import { formatTime, formatDividerDate, showTimeDivider, parseMarkdown, getImageSrc } from '../utils/formatters.js'

import AuthScreen from '../components/AuthScreen.js'
import ConnectionManager from '../components/ConnectionManager.js'
import ConnectionEditor from '../components/ConnectionEditor.js'
import ImagePreviewModal from '../components/ImagePreviewModal.js'

const QUOTE_SNIPPET_MAX_LENGTH = 120

function parsePositiveId(value) {
    const parsed = Number.parseInt(String(value ?? ''), 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function getSourceLabel(source) {
    return source === 'mobile' ? '我' : 'VSCode'
}

function buildQuoteSnippet(msg) {
    const hasAttachments = Array.isArray(msg?.attachments) && msg.attachments.length > 0
    const text = typeof msg?.text === 'string' ? msg.text.trim() : ''
    const raw = hasAttachments ? `[图片] ${text}`.trim() : text
    if (!raw) {
        return '(空消息)'
    }
    if (raw.length <= QUOTE_SNIPPET_MAX_LENGTH) {
        return raw
    }
    return `${raw.slice(0, QUOTE_SNIPPET_MAX_LENGTH - 3)}...`
}

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
                    <span class="meta-pill">在线 {{ presence.total }} (M{{ presence.mobile }}/V{{ presence.vscode }})</span>
                    <span v-if="peerReadText" class="meta-pill">{{ peerReadText }}</span>
                    <button class="text-btn" @click="runSearch">搜索</button>
                    <button class="text-btn" @click="disconnect">断开</button>
                </div>
            </header>

            <div class="search-inline">
                <input v-model.trim="searchKeyword" @keyup.enter="runSearch" placeholder="搜索热库+归档消息..." />
                <button class="text-btn" @click="runSearch">查找</button>
            </div>
            <div v-if="searchError" class="search-error">{{ searchError }}</div>
            <div v-if="searchResults.length > 0" class="search-results">
                <button
                    v-for="item in searchResults"
                    :key="(item.targetType || 'hot') + '-' + (item.messageId || item.archiveId || item.timestamp)"
                    class="search-hit"
                    @click="jumpToSearchResult(item)"
                >
                    <span class="hit-meta">{{ item.targetType === 'archive' ? '归档' : '热库' }} · {{ formatTime(item.timestamp) }}</span>
                    <span class="hit-text">{{ item.preview }}</span>
                </button>
            </div>

            <main class="message-list" ref="messagesContainer">
                <div v-if="messages.length > 0 && hasMoreHistory" class="load-more-wrapper">
                    <button class="load-more-btn" @click="loadMore" :disabled="isLoadingMore">
                        {{ isLoadingMore ? '加载中...' : '加载更多' }}
                    </button>
                </div>

                <div v-if="messages.length === 0" class="empty-state">
                    <span>暂无消息</span>
                </div>

                <template v-for="(msg, index) in messages" :key="msg.id || (msg.timestamp + '-' + index)">
                    <div v-if="showTimeDivider(msg, messages[index-1])" class="time-divider">
                        <span>{{ formatDividerDate(msg.timestamp) }}</span>
                    </div>
                    <div :class="['message-row', msg.type, { archived: msg.archived }]" :data-message-id="msg.id || ''" :data-archive-id="msg.archiveId || ''">
                        <div v-if="msg.sender !== '我' && msg.type !== 'system'" class="avatar">{{ msg.sender[0] }}</div>
                        <div class="message-content">
                            <div class="bubble">
                                <div v-if="msg.attachments" v-for="att in msg.attachments" :key="att.filename">
                                    <img v-if="att.type === 'image'" :src="getImageSrc(att)" class="chat-img" @click="openImage(getImageSrc(att))">
                                </div>
                                <div class="bubble-inline">
                                    <span class="bubble-main-text" v-html="parseMarkdown(msg.text)"></span>
                                    <button
                                        v-if="msg.quote"
                                        type="button"
                                        class="quote-inline-chip"
                                        @click="jumpToQuotedMessage(msg.quote.messageId)"
                                    >
                                        <span class="quote-inline-prefix">↩ {{ getSourceLabel(msg.quote.source) }}</span>
                                        <span class="quote-inline-text">{{ msg.quote.textSnippet || '(空消息)' }}</span>
                                    </button>
                                </div>
                            </div>
                            <button
                                v-if="msg.id && msg.type !== 'system'"
                                type="button"
                                class="quote-btn"
                                @click="selectQuote(msg)"
                            >
                                引用
                            </button>
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
                <div v-if="quotedMessage" class="quote-draft">
                    <span class="quote-draft-text">{{ quoteDraftLabel }}</span>
                    <button class="quote-draft-clear" type="button" @click="clearQuote">×</button>
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
        const quotedMessage = ref(null)
        const isSending = ref(false)
        let readTimer = null
        const searchKeyword = ref('')
        const searchResults = ref([])
        const searchError = ref('')
        const lastReadTimestamp = ref(0)

        const quoteDraftLabel = computed(() => {
            if (!quotedMessage.value) {
                return ''
            }
            const sender = getSourceLabel(quotedMessage.value.source)
            const snippet = quotedMessage.value.textSnippet || '(空消息)'
            return `${sender}: ${snippet}`
        })

        const clearQuote = () => {
            quotedMessage.value = null
        }

        const selectQuote = (msg) => {
            const messageId = parsePositiveId(msg.id)
            if (!messageId) {
                chat.errorMsg.value = '该消息不支持引用'
                return
            }
            quotedMessage.value = {
                messageId,
                textSnippet: buildQuoteSnippet(msg),
                source: msg.source,
                timestamp: msg.timestamp,
            }
            nextTick(() => {
                if (inputArea.value) {
                    inputArea.value.focus()
                    const end = inputArea.value.value.length
                    inputArea.value.setSelectionRange(end, end)
                }
            })
        }

        const highlightMessageElement = (messageId) => {
            const container = chat.messagesContainer.value
            if (!container) {
                return false
            }
            const target = container.querySelector(`[data-message-id="${messageId}"]`)
            if (!target) {
                return false
            }
            target.scrollIntoView({ behavior: 'smooth', block: 'center' })
            target.classList.remove('message-highlight')
            void target.offsetWidth
            target.classList.add('message-highlight')
            setTimeout(() => target.classList.remove('message-highlight'), 1200)
            return true
        }

        const jumpToQuotedMessage = (targetMessageId) => {
            const messageId = parsePositiveId(targetMessageId)
            if (!messageId) {
                return
            }
            if (highlightMessageElement(messageId)) {
                return
            }
            const requestSent = chat.loadAroundMessage(messageId, (payload) => {
                if (payload?.error) {
                    chat.errorMsg.value = `定位失败: ${payload.error}`
                    return
                }
                if (Array.isArray(payload?.messages) && payload.messages.length > 0) {
                    chat.mergeMessages(payload.messages)
                    nextTick(() => {
                        if (!highlightMessageElement(messageId)) {
                            chat.errorMsg.value = '定位失败：目标消息不可见'
                        }
                    })
                    return
                }
                chat.errorMsg.value = '定位失败：目标消息不存在'
            })
            if (!requestSent) {
                chat.errorMsg.value = '定位失败：当前未连接'
            }
        }

        const highlightArchivedElement = (archiveId) => {
            const container = chat.messagesContainer.value
            if (!container) {
                return false
            }
            const target = container.querySelector(`[data-archive-id="${archiveId}"]`)
            if (!target) {
                return false
            }
            target.scrollIntoView({ behavior: 'smooth', block: 'center' })
            target.classList.remove('message-highlight')
            void target.offsetWidth
            target.classList.add('message-highlight')
            setTimeout(() => target.classList.remove('message-highlight'), 1200)
            return true
        }

        const jumpToArchivedMessage = (targetArchiveId) => {
            const archiveId = parsePositiveId(targetArchiveId)
            if (!archiveId) {
                return
            }
            if (highlightArchivedElement(archiveId)) {
                return
            }
            const requestSent = chat.loadAroundArchivedMessage(archiveId, (payload) => {
                if (payload?.error) {
                    chat.errorMsg.value = `定位失败: ${payload.error}`
                    return
                }
                if (Array.isArray(payload?.messages) && payload.messages.length > 0) {
                    chat.mergeMessages(payload.messages)
                    nextTick(() => {
                        if (!highlightArchivedElement(archiveId)) {
                            chat.errorMsg.value = '定位失败：目标归档消息不可见'
                        }
                    })
                    return
                }
                chat.errorMsg.value = '定位失败：目标归档消息不存在'
            })
            if (!requestSent) {
                chat.errorMsg.value = '定位失败：当前未连接'
            }
        }

        const jumpToSearchResult = (item) => {
            if (item.targetType === 'archive') {
                jumpToArchivedMessage(item.archiveId)
                return
            }
            jumpToQuotedMessage(item.messageId)
        }

        const runSearch = async () => {
            const keyword = searchKeyword.value.trim()
            if (!keyword) {
                searchResults.value = []
                searchError.value = '请输入搜索关键词'
                return
            }
            searchError.value = ''
            try {
                const results = await chat.searchMessages(keyword, 50)
                searchResults.value = Array.isArray(results) ? results : []
            } catch (error) {
                searchResults.value = []
                searchError.value = error.message || '搜索失败'
            }
        }

        const reportRead = () => {
            if (!chat.messages || chat.messages.length === 0) {
                return
            }
            const last = chat.messages[chat.messages.length - 1]
            if (!last || !Number.isFinite(last.timestamp) || last.timestamp <= lastReadTimestamp.value) {
                return
            }
            lastReadTimestamp.value = last.timestamp
            chat.markRead(last.timestamp, parsePositiveId(last.id) || undefined)
        }

        const sendMessage = async () => {
            if ((!inputText.value.trim() && pendingImages.length === 0) || !chat.socketConnected.value || isSending.value) return

            isSending.value = true
            try {
                let attachments

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

                await chat.sendChatMessage({
                    text: inputText.value,
                    source: 'mobile',
                    attachments: attachments && attachments.length > 0 ? attachments : undefined,
                    quote: quotedMessage.value || undefined,
                    clientMessageId: `mobile-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
                })

                inputText.value = ''
                imageHandler.clearPendingImages()
                clearQuote()
                nextTick(() => {
                    if (inputArea.value) inputArea.value.style.height = 'auto'
                    chat.scrollToBottom()
                    reportRead()
                })
            } catch (err) {
                chat.errorMsg.value = err.message || '发送失败'
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
            readTimer = setInterval(reportRead, 1500)
        })

        onUnmounted(() => {
            chat.socketManager.disconnect()
            if (readTimer) {
                clearInterval(readTimer)
                readTimer = null
            }
        })

        return {
            ...chat,
            inputText, inputArea, fileInput, cameraInput,
            pendingImages, previewImage, previewScale,
            quotedMessage, quoteDraftLabel,
            sendMessage, handlePaste, handleFileSelect, removePendingImage,
            triggerFileInput, triggerCameraInput, handleConnectionSave,
            openImage, closePreview, zoomIn, zoomOut, resetZoom,
            selectQuote, clearQuote, jumpToQuotedMessage, jumpToSearchResult, runSearch, getSourceLabel,
            parseMarkdown, formatTime, showTimeDivider, formatDividerDate, getImageSrc,
            searchKeyword, searchResults, searchError,
            reportRead,
        }
    }
}
