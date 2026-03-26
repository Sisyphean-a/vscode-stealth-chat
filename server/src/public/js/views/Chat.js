const { ref, computed, nextTick, onMounted, onUnmounted } = Vue

import { useChatConnection } from '../composables/useChatConnection.js'
import { useImageHandler } from '../composables/useImageHandler.js'
import { useImagePreview } from '../composables/useImagePreview.js'
import { formatTime, formatDividerDate, showTimeDivider, parseMarkdown, getImageSrc } from '../utils/formatters.js'
import { buildClientMessageId, buildQuoteSnippet, DEFAULT_EMOJI_SET, derivePeerReadState } from '/packages/chat-core/index.js'

import AuthScreen from '../components/AuthScreen.js'
import ConnectionManager from '../components/ConnectionManager.js'
import ConnectionEditor from '../components/ConnectionEditor.js'
import ImagePreviewModal from '../components/ImagePreviewModal.js'

function parsePositiveId(value) {
    const parsed = Number.parseInt(String(value ?? ''), 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function getSourceLabel(source) {
    return source === 'mobile' ? '我' : 'VSCode'
}

function formatPeerReadText(state, readerLabel) {
    const timestamp = Number.isFinite(state?.timestamp) ? Number(state.timestamp) : 0
    if (!timestamp || state?.summaryKind === 'none') {
        return ''
    }
    const date = new Date(timestamp)
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    const timeText = `${hh}:${mm}`
    if (state.summaryKind === 'summaryOnly') {
        return `${readerLabel}读到 ${timeText}`
    }
    if (state.summaryKind === 'earlier') {
        return `${readerLabel}读到较早消息 ${timeText}`
    }
    return `${readerLabel}最新已读 ${timeText}`
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
                    <button class="text-btn" @click="toggleSearchPanel">{{ showSearchPanel ? '收起' : '搜索' }}</button>
                    <button class="text-btn" @click="disconnect">断开</button>
                </div>
            </header>

            <div v-if="showSearchPanel" class="search-inline">
                <input v-model.trim="searchKeyword" @keyup.enter="runSearch" placeholder="搜索热库+归档消息..." />
                <button class="text-btn" @click="runSearch">查找</button>
            </div>
            <div v-if="showSearchPanel && searchError" class="search-error">{{ searchError }}</div>
            <div v-if="showSearchPanel && searchResults.length > 0" class="search-results">
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
                        <span v-if="img.wasCompressed" class="pending-badge">已压缩</span>
                        <button class="remove-pending" :disabled="isSending" @click="removePendingImage(idx)">×</button>
                    <span
                        v-if="msg.type === 'own' && msg.id && msg.id === readAnchorMessageId"
                        class="bubble-read-marker"
                    >
                        Read
                    </span>
                    </div>
                </div>
                <div v-if="sendProgressText" class="send-progress">{{ sendProgressText }}</div>
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
                    <div class="emoji-picker-wrap" ref="emojiPickerWrap">
                        <button type="button" class="emoji-btn" @click="toggleEmojiPicker" title="表情">🙂</button>
                        <div v-if="emojiPickerVisible" class="emoji-panel">
                            <button
                                v-for="(emoji, idx) in emojiList"
                                :key="emoji + '-' + idx"
                                type="button"
                                class="emoji-item"
                                @click="insertEmoji(emoji)"
                            >
                                {{ emoji }}
                            </button>
                        </div>
                    </div>
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
                    <button type="submit" class="send-btn" :class="{ busy: isSending }" :disabled="sendButtonDisabled">
                        <span>{{ sendButtonLabel }}</span>
                    </button>
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
        const sendPhase = ref('idle')
        const sendProgressText = ref('')
        let readTimer = null
        const searchKeyword = ref('')
        const searchResults = ref([])
        const searchError = ref('')
        const showSearchPanel = ref(false)
        const lastReadTimestamp = ref(0)
        const isPageVisible = ref(document.visibilityState === 'visible')
        const isWindowFocused = ref(document.hasFocus())
        const emojiList = DEFAULT_EMOJI_SET
        const emojiPickerVisible = ref(false)
        const emojiPickerWrap = ref(null)
        const peerReadState = computed(() => derivePeerReadState({
            messages: chat.messages,
            ownSource: 'mobile',
            receipt: chat.peerReadReceipt.value,
        }))
        const peerReadText = computed(() => formatPeerReadText(peerReadState.value, 'VSCode'))
        const readAnchorMessageId = computed(() => peerReadState.value.anchorMessageId)

        const adjustInputHeight = () => {
            if (!inputArea.value) {
                return
            }
            inputArea.value.style.height = 'auto'
            inputArea.value.style.height = `${inputArea.value.scrollHeight}px`
        }

        const closeEmojiPicker = () => {
            emojiPickerVisible.value = false
        }

        const toggleEmojiPicker = () => {
            emojiPickerVisible.value = !emojiPickerVisible.value
            if (emojiPickerVisible.value) {
                nextTick(() => {
                    inputArea.value?.focus()
                })
            }
        }

        const insertEmoji = (emoji) => {
            if (!inputArea.value) {
                chat.errorMsg.value = '输入框未就绪，无法插入表情'
                return
            }
            const text = inputText.value || ''
            const start = Number.isFinite(inputArea.value.selectionStart) ? inputArea.value.selectionStart : text.length
            const end = Number.isFinite(inputArea.value.selectionEnd) ? inputArea.value.selectionEnd : text.length
            inputText.value = `${text.slice(0, start)}${emoji}${text.slice(end)}`
            const cursor = start + emoji.length
            closeEmojiPicker()
            nextTick(() => {
                if (!inputArea.value) {
                    return
                }
                inputArea.value.focus()
                inputArea.value.setSelectionRange(cursor, cursor)
                adjustInputHeight()
            })
        }

        const handleDocumentPointerDown = (event) => {
            if (!emojiPickerVisible.value || !emojiPickerWrap.value || !(event.target instanceof Node)) {
                return
            }
            if (emojiPickerWrap.value.contains(event.target)) {
                return
            }
            closeEmojiPicker()
        }

        const handleDocumentKeydown = (event) => {
            if (event.key !== 'Escape' || !emojiPickerVisible.value) {
                return
            }
            closeEmojiPicker()
            nextTick(() => {
                inputArea.value?.focus()
            })
        }

        const quoteDraftLabel = computed(() => {
            if (!quotedMessage.value) {
                return ''
            }
            const sender = getSourceLabel(quotedMessage.value.source)
            const snippet = quotedMessage.value.textSnippet || '(空消息)'
            return `${sender}: ${snippet}`
        })

        const sendButtonDisabled = computed(() => {
            if (isSending.value) {
                return true
            }
            return !inputText.value.trim() && pendingImages.length === 0
        })

        const sendButtonLabel = computed(() => {
            if (sendPhase.value === 'uploading') {
                return '上传中'
            }
            if (sendPhase.value === 'sending') {
                return '发送中'
            }
            return '↑'
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
                const results = await chat.searchMessages(keyword, 50, true)
                searchResults.value = Array.isArray(results) ? results : []
            } catch (error) {
                searchResults.value = []
                searchError.value = error.message || '搜索失败'
            }
        }

        const toggleSearchPanel = () => {
            showSearchPanel.value = !showSearchPanel.value
        }

        const isReadReportingActive = () => isPageVisible.value && isWindowFocused.value

        const resolveLastVisibleMessage = () => {
            const container = chat.messagesContainer.value
            if (!container || !Array.isArray(chat.messages) || chat.messages.length === 0) {
                return null
            }
            const containerRect = container.getBoundingClientRect()
            let lastVisible = null
            for (const message of chat.messages) {
                const messageId = parsePositiveId(message.id)
                if (!messageId) {
                    continue
                }
                const element = container.querySelector(`[data-message-id="${messageId}"]`)
                if (!element) {
                    continue
                }
                const rect = element.getBoundingClientRect()
                const visibleHeight = Math.min(rect.bottom, containerRect.bottom) - Math.max(rect.top, containerRect.top)
                if (visibleHeight <= 0) {
                    continue
                }
                if (!lastVisible || message.timestamp >= lastVisible.timestamp) {
                    lastVisible = message
                }
            }
            return lastVisible
        }

        const reportRead = () => {
            if (!isReadReportingActive()) {
                return
            }
            const lastVisible = resolveLastVisibleMessage()
            if (!lastVisible || !Number.isFinite(lastVisible.timestamp) || lastVisible.timestamp <= lastReadTimestamp.value) {
                return
            }
            lastReadTimestamp.value = lastVisible.timestamp
            chat.markRead(lastVisible.timestamp, parsePositiveId(lastVisible.id) || undefined)
        }

        const handleVisibilityChange = () => {
            isPageVisible.value = document.visibilityState === 'visible'
            if (isPageVisible.value) {
                reportRead()
            }
        }

        const handleWindowFocus = () => {
            isWindowFocused.value = true
            reportRead()
        }

        const handleWindowBlur = () => {
            isWindowFocused.value = false
        }

        const sendMessage = async () => {
            if ((!inputText.value.trim() && pendingImages.length === 0) || !chat.socketConnected.value || isSending.value) return

            isSending.value = true
            sendPhase.value = pendingImages.length > 0 ? 'uploading' : 'sending'
            sendProgressText.value = pendingImages.length > 0 ? `准备上传 ${pendingImages.length} 张图片...` : '正在发送消息...'
            try {
                let attachments

                if (pendingImages.length > 0) {
                    try {
                        attachments = await imageHandler.uploadAllImages(chat.authToken.value, undefined, ({ current, total, image }) => {
                            const filename = image?.filename || `图片 ${current}`
                            sendProgressText.value = `上传图片 ${current}/${total}: ${filename}`
                        })
                    } catch (err) {
                        console.error('[Chat] Image upload failed:', err)
                        chat.errorMsg.value = '图片上传失败: ' + err.message
                        sendPhase.value = 'idle'
                        sendProgressText.value = ''
                        isSending.value = false
                        return
                    }
                }

                sendPhase.value = 'sending'
                sendProgressText.value = '图片上传完成，正在发送消息...'

                await chat.sendChatMessage({
                    text: inputText.value,
                    source: 'mobile',
                    attachments: attachments && attachments.length > 0 ? attachments : undefined,
                    quote: quotedMessage.value || undefined,
                    clientMessageId: buildClientMessageId('mobile'),
                })

                inputText.value = ''
                imageHandler.clearPendingImages()
                clearQuote()
                closeEmojiPicker()
                nextTick(() => {
                    if (inputArea.value) inputArea.value.style.height = 'auto'
                    chat.scrollToBottom()
                    reportRead()
                })
            } catch (err) {
                chat.errorMsg.value = err.message || '发送失败'
            } finally {
                isSending.value = false
                sendPhase.value = 'idle'
                sendProgressText.value = ''
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
            document.addEventListener('mousedown', handleDocumentPointerDown)
            document.addEventListener('keydown', handleDocumentKeydown)
            document.addEventListener('visibilitychange', handleVisibilityChange)
            window.addEventListener('focus', handleWindowFocus)
            window.addEventListener('blur', handleWindowBlur)
        })

        onUnmounted(() => {
            chat.socketManager.disconnect()
            if (readTimer) {
                clearInterval(readTimer)
                readTimer = null
            }
            document.removeEventListener('mousedown', handleDocumentPointerDown)
            document.removeEventListener('keydown', handleDocumentKeydown)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            window.removeEventListener('focus', handleWindowFocus)
            window.removeEventListener('blur', handleWindowBlur)
        })

        return {
            ...chat,
            inputText, inputArea, fileInput, cameraInput, emojiPickerWrap,
            pendingImages, previewImage, previewScale,
            emojiList, emojiPickerVisible,
            quotedMessage, quoteDraftLabel,
            sendMessage, handlePaste, handleFileSelect, removePendingImage,
            toggleEmojiPicker, closeEmojiPicker, insertEmoji,
            triggerFileInput, triggerCameraInput, handleConnectionSave,
            openImage, closePreview, zoomIn, zoomOut, resetZoom,
            selectQuote, clearQuote, jumpToQuotedMessage, jumpToSearchResult, runSearch, toggleSearchPanel, getSourceLabel,
            parseMarkdown, formatTime, showTimeDivider, formatDividerDate, getImageSrc,
            searchKeyword, searchResults, searchError, showSearchPanel,
            peerReadText, readAnchorMessageId,
            reportRead,
        }
    }
}
