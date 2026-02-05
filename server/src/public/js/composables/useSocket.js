/**
 * Socket.io 连接 Composable
 * 管理 Socket.io 连接生命周期
 */
const { ref } = Vue

export function useSocket() {
    const connected = ref(false)
    const socketConnected = ref(false)
    const isConnecting = ref(false)
    const errorMsg = ref('')

    let socket = null

    /**
     * 连接到服务器
     */
    const connect = (token, callbacks = {}) => {
        if (!token) {
            errorMsg.value = '请输入密钥'
            return null
        }

        isConnecting.value = true
        errorMsg.value = ''

        socket = io({
            auth: { token }
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
            socketConnected.value = false
            callbacks.onConnectError?.(err)
        })

        socket.on('disconnect', () => {
            socketConnected.value = false
            callbacks.onDisconnect?.()
        })

        socket.on('chat message', (msg) => {
            callbacks.onMessage?.(msg)
        })

        socket.on('history loaded', (history) => {
            callbacks.onHistoryLoaded?.(history)
        })

        return socket
    }

    /**
     * 断开连接
     */
    const disconnect = () => {
        if (socket) {
            socket.disconnect()
            socket = null
        }
        connected.value = false
        socketConnected.value = false
    }

    /**
     * 发送消息
     */
    const emit = (event, data) => {
        if (socket?.connected) {
            socket.emit(event, data)
            return true
        }
        return false
    }

    /**
     * 获取 socket 实例
     */
    const getSocket = () => socket

    return {
        connected,
        socketConnected,
        isConnecting,
        errorMsg,
        connect,
        disconnect,
        emit,
        getSocket
    }
}
