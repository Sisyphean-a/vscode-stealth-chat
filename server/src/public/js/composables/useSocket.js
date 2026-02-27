/**
 * Socket.io 连接 Composable
 * 管理 Socket.io 连接生命周期、消息 ACK 与重试
 */
const { ref } = Vue

const ACK_TIMEOUT_MS = 4000
const MAX_SEND_RETRIES = 3
const RETRY_DELAY_MS = 1200

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export function useSocket() {
    const connected = ref(false)
    const socketConnected = ref(false)
    const isConnecting = ref(false)
    const isLoadingMore = ref(false)
    const hasMoreHistory = ref(true)
    const errorMsg = ref('')

    let socket = null
    let moreHistoryCallback = null
    let aroundMessageCallback = null
    let aroundArchivedMessageCallback = null

    const connect = (token, callbacks = {}) => {
        if (!token) {
            errorMsg.value = '请输入密钥'
            return null
        }

        isConnecting.value = true
        errorMsg.value = ''

        socket = io({
            auth: { token, clientType: 'mobile' }
        })

        socket.on('connect', () => {
            connected.value = true
            socketConnected.value = true
            isConnecting.value = false
            errorMsg.value = ''
            socket.emit('load history', 50)
            callbacks.onConnect?.()
        })

        socket.on('connect_error', (err) => {
            isConnecting.value = false
            errorMsg.value = '连接失败: ' + err.message
            connected.value = false
            socketConnected.value = false
            callbacks.onConnectError?.(err)
        })

        socket.on('disconnect', () => {
            connected.value = false
            socketConnected.value = false
            callbacks.onDisconnect?.()
        })

        socket.on('chat message', (msg) => {
            callbacks.onMessage?.(msg)
        })

        socket.on('history loaded', (history) => {
            hasMoreHistory.value = history && history.length >= 50
            callbacks.onHistoryLoaded?.(history)
        })

        socket.on('more history loaded', ({ messages, hasMore }) => {
            isLoadingMore.value = false
            hasMoreHistory.value = hasMore
            moreHistoryCallback?.(messages)
        })

        socket.on('around message loaded', (payload) => {
            const callback = aroundMessageCallback
            aroundMessageCallback = null
            callback?.(payload || { messages: [], targetMessageId: null, error: 'Invalid payload' })
        })

        socket.on('around archived message loaded', (payload) => {
            const callback = aroundArchivedMessageCallback
            aroundArchivedMessageCallback = null
            callback?.(payload || { messages: [], targetArchiveId: null, error: 'Invalid payload' })
        })

        socket.on('presence update', (payload) => {
            callbacks.onPresenceUpdate?.({
                appId: typeof payload?.appId === 'string' ? payload.appId : 'default',
                total: Number.isFinite(payload?.total) ? payload.total : 0,
                mobile: Number.isFinite(payload?.mobile) ? payload.mobile : 0,
                vscode: Number.isFinite(payload?.vscode) ? payload.vscode : 0,
            })
        })

        socket.on('read receipt', (payload) => {
            callbacks.onReadReceipt?.({
                appId: typeof payload?.appId === 'string' ? payload.appId : 'default',
                clientType: payload?.clientType === 'mobile' || payload?.clientType === 'vscode' ? payload.clientType : 'unknown',
                lastReadTimestamp: Number.isFinite(payload?.lastReadTimestamp) ? payload.lastReadTimestamp : Date.now(),
                lastReadMessageId: Number.isFinite(payload?.lastReadMessageId) ? payload.lastReadMessageId : null,
            })
        })

        return socket
    }

    const disconnect = () => {
        if (socket) {
            socket.disconnect()
            socket = null
        }
        moreHistoryCallback = null
        aroundMessageCallback = null
        aroundArchivedMessageCallback = null
        connected.value = false
        socketConnected.value = false
    }

    const emit = (event, data) => {
        if (socket?.connected) {
            socket.emit(event, data)
            return true
        }
        return false
    }

    const emitWithAck = (event, data, timeoutMs = ACK_TIMEOUT_MS) => {
        return new Promise((resolve, reject) => {
            if (!socket?.connected) {
                reject(new Error('当前未连接'))
                return
            }
            let finished = false
            const timer = setTimeout(() => {
                if (finished) {
                    return
                }
                finished = true
                reject(new Error('确认超时'))
            }, timeoutMs)

            socket.emit(event, data, (ack) => {
                if (finished) {
                    return
                }
                finished = true
                clearTimeout(timer)
                resolve(ack)
            })
        })
    }

    const sendChatMessage = async (payload) => {
        let lastError = new Error('发送失败')
        let retriesLeft = MAX_SEND_RETRIES
        while (retriesLeft >= 0) {
            try {
                const ack = await emitWithAck('chat message', payload, ACK_TIMEOUT_MS)
                if (ack?.ok) {
                    return ack
                }
                throw new Error(ack?.error || '发送失败')
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error))
                if (retriesLeft === 0) {
                    throw lastError
                }
                retriesLeft -= 1
                await wait(RETRY_DELAY_MS)
            }
        }
        throw lastError
    }

    const searchMessages = async (keyword, limit = 50) => {
        const ack = await emitWithAck('search messages', { keyword, limit }, 6000)
        if (!ack?.ok) {
            throw new Error(ack?.error || '搜索失败')
        }
        return Array.isArray(ack.results) ? ack.results : []
    }

    const markRead = (lastReadTimestamp, lastReadMessageId) => {
        if (!socket?.connected) {
            return
        }
        socket.emit('mark read', {
            clientType: 'mobile',
            lastReadTimestamp,
            lastReadMessageId,
        })
    }

    const getSocket = () => socket

    const loadMoreHistory = (beforeTimestamp, callback) => {
        if (!socket?.connected || isLoadingMore.value || !hasMoreHistory.value) {
            return false
        }
        isLoadingMore.value = true
        moreHistoryCallback = callback
        socket.emit('load more history', { limit: 50, beforeTimestamp })
        return true
    }

    const loadAroundMessage = (targetMessageId, callback) => {
        if (!socket?.connected) {
            return false
        }
        const parsed = Number.parseInt(String(targetMessageId ?? ''), 10)
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return false
        }
        aroundMessageCallback = callback
        socket.emit('load around message', { targetMessageId: parsed, windowSize: 25 })
        return true
    }

    const loadAroundArchivedMessage = (targetArchiveId, callback) => {
        if (!socket?.connected) {
            return false
        }
        const parsed = Number.parseInt(String(targetArchiveId ?? ''), 10)
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return false
        }
        aroundArchivedMessageCallback = callback
        socket.emit('load around archived message', { targetArchiveId: parsed, windowSize: 25 })
        return true
    }

    const resetLoadMoreState = () => {
        hasMoreHistory.value = true
        isLoadingMore.value = false
    }

    return {
        connected,
        socketConnected,
        isConnecting,
        isLoadingMore,
        hasMoreHistory,
        errorMsg,
        connect,
        disconnect,
        emit,
        emitWithAck,
        sendChatMessage,
        searchMessages,
        markRead,
        getSocket,
        loadMoreHistory,
        loadAroundMessage,
        loadAroundArchivedMessage,
        resetLoadMoreState
    }
}
