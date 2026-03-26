/**
 * 聊天连接编排 Composable
 * 协调 Socket.io 连接、认证、消息和连接管理
 */
import { useSocket } from './useSocket.js'
import { useConnections } from './useConnections.js'
import { useAuth } from './useAuth.js'
import { useMessages } from './useMessages.js'
import { useScrollManager } from './useScrollManager.js'

const { ref } = Vue

export function useChatConnection() {
    const socketManager = useSocket()
    const connManager = useConnections()
    const auth = useAuth()
    const msgManager = useMessages()
    const scrollManager = useScrollManager()

    const { connected, socketConnected, isConnecting, isLoadingMore, hasMoreHistory, errorMsg } = socketManager
    const { connections, activeConnectionId } = connManager
    const { authToken, rememberMe } = auth
    const { messages, appendMessage, appendSystemMessage, prependMessages, mergeMessages, clearMessages } = msgManager
    const { messagesContainer, scrollToBottom, preserveScrollPosition } = scrollManager

    // 连接编辑器 UI 状态
    const showConnectionMenu = ref(false)
    const showConnectionManager = ref(false)
    const showConnectionEditor = ref(false)
    const editingConnection = ref(null)
    const newConnectionName = ref('')
    const newConnectionToken = ref('')
    const presence = ref({ total: 0, mobile: 0, vscode: 0 })
    const peerReadReceipt = ref(null)

    const connect = () => {
        if (!authToken.value) {
            socketManager.errorMsg.value = '请输入密钥'
            return
        }

        socketManager.connect(authToken.value, {
            onConnect: () => {
                auth.saveToken()
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
                    mergeMessages(history)
                    scrollToBottom()
                }
            },
            onPresenceUpdate: (payload) => {
                presence.value = payload
            },
            onReadReceipt: (payload) => {
                if (payload.clientType !== 'vscode') {
                    return
                }
                peerReadReceipt.value = payload
            }
        })
    }

    const disconnect = () => {
        socketManager.disconnect()
        clearMessages()
        presence.value = { total: 0, mobile: 0, vscode: 0 }
        peerReadReceipt.value = null
    }

    const switchConnection = (connId) => {
        if (activeConnectionId.value === connId && socketConnected.value) return

        activeConnectionId.value = connId
        connManager.saveActiveConnection()
        clearMessages()
        socketManager.disconnect()
        socketManager.resetLoadMoreState()

        const conn = connManager.getActiveConnection()
        if (conn) {
            authToken.value = conn.token
            connect()
        }
        showConnectionMenu.value = false
    }

    const connectWithNewToken = () => {
        if (!authToken.value.trim()) {
            errorMsg.value = '请输入密钥'
            return
        }

        if (rememberMe.value) {
            const conn = connManager.addConnection(newConnectionName.value || '新对话', authToken.value)
            activeConnectionId.value = conn.id
            connManager.saveActiveConnection()
        }

        connect()
    }

    const deleteConnection = (id) => {
        const wasActive = activeConnectionId.value === id
        connManager.deleteConnection(id)
        if (wasActive && connections.length > 0) {
            switchConnection(connections[0].id)
        }
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
            connManager.updateConnection(editingConnection.value.id, newConnectionName.value || '新对话', newConnectionToken.value)
        } else {
            const conn = connManager.addConnection(newConnectionName.value, newConnectionToken.value)
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

    const loadMore = () => {
        const oldestTimestamp = msgManager.getOldestTimestamp()
        if (!oldestTimestamp) return

        socketManager.loadMoreHistory(oldestTimestamp, (olderMessages) => {
            if (olderMessages && olderMessages.length > 0) {
                preserveScrollPosition(() => {
                    prependMessages(olderMessages)
                })
            }
        })
    }

    const loadAroundMessage = (targetMessageId, callback) => {
        return socketManager.loadAroundMessage(targetMessageId, callback)
    }

    const loadAroundArchivedMessage = (targetArchiveId, callback) => {
        return socketManager.loadAroundArchivedMessage(targetArchiveId, callback)
    }

    const sendChatMessage = (payload) => socketManager.sendChatMessage(payload)
    const searchMessages = (keyword, limit, includeArchived = true) => {
        return socketManager.searchMessages(keyword, limit, includeArchived)
    }
    const markRead = (lastReadTimestamp, lastReadMessageId) => {
        socketManager.markRead(lastReadTimestamp, lastReadMessageId)
    }

    return {
        // 状态
        connected, socketConnected, isConnecting, isLoadingMore, hasMoreHistory, errorMsg,
        authToken, rememberMe,
        messages, messagesContainer,
        connections, activeConnectionId,
        showConnectionMenu, showConnectionManager, showConnectionEditor,
        editingConnection, newConnectionName, newConnectionToken,
        presence, peerReadReceipt,

        // 方法
        connect, disconnect, switchConnection, connectWithNewToken,
        deleteConnection, loadMore, loadAroundMessage, scrollToBottom,
        loadAroundArchivedMessage, sendChatMessage, searchMessages, markRead,
        mergeMessages,
        openAddConnection, openEditConnection, saveConnectionEditor,
        closeConnectionEditor, openConnectionManager,

        // 透传
        socketManager, connManager, auth, scrollManager,
        getActiveConnection: connManager.getActiveConnection,
        loadConnections: connManager.loadConnections,
        loadSavedToken: auth.loadSavedToken,
        emit: socketManager.emit,
        autoResize: scrollManager.autoResize
    }
}
