/**
 * 消息管理 Composable
 * 管理消息列表和消息映射逻辑
 */
const { reactive } = Vue

/**
 * 将服务端消息映射为视图模型
 */
const mapServerMessage = (msg) => ({
    text: msg.text,
    type: msg.source === 'mobile' ? 'own' : (msg.source === 'system' ? 'system' : 'remote'),
    sender: msg.source === 'mobile' ? '我' : 'VSCode',
    timestamp: msg.timestamp || Date.now(),
    attachments: msg.attachments
})

export function useMessages() {
    const messages = reactive([])

    const appendMessage = (msg) => {
        messages.push(mapServerMessage(msg))
    }

    const appendSystemMessage = (text) => {
        messages.push({
            text,
            type: 'system',
            sender: 'System',
            timestamp: Date.now()
        })
    }

    const prependMessages = (serverMessages) => {
        const mapped = serverMessages.map(mapServerMessage)
        messages.unshift(...mapped)
    }

    const clearMessages = () => {
        messages.splice(0)
    }

    const getOldestTimestamp = () => {
        return messages.length > 0 ? messages[0].timestamp : null
    }

    return {
        messages,
        appendMessage,
        appendSystemMessage,
        prependMessages,
        clearMessages,
        getOldestTimestamp
    }
}
