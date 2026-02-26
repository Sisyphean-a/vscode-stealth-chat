/**
 * 消息管理 Composable
 * 管理消息列表、去重和合并逻辑
 */
const { reactive } = Vue

function parsePositiveId(value) {
    const parsed = Number.parseInt(String(value ?? ''), 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function messageKey(msg) {
    const id = parsePositiveId(msg?.id)
    if (id) {
        return `id:${id}`
    }
    return `ts:${msg?.timestamp || 0}-src:${msg?.source || 'unknown'}-txt:${msg?.text || ''}`
}

function compareMessages(a, b) {
    if (a.timestamp === b.timestamp) {
        return (parsePositiveId(a.id) || 0) - (parsePositiveId(b.id) || 0)
    }
    return a.timestamp - b.timestamp
}

/**
 * 将服务端消息映射为视图模型
 */
const mapServerMessage = (msg) => ({
    id: parsePositiveId(msg.id),
    text: typeof msg.text === 'string' ? msg.text : '',
    type: msg.source === 'mobile' ? 'own' : (msg.source === 'system' ? 'system' : 'remote'),
    sender: msg.source === 'mobile' ? '我' : 'VSCode',
    source: msg.source === 'mobile' ? 'mobile' : 'vscode',
    timestamp: msg.timestamp || Date.now(),
    attachments: msg.attachments,
    quote: msg.quote && parsePositiveId(msg.quote.messageId)
        ? {
            messageId: parsePositiveId(msg.quote.messageId),
            textSnippet: typeof msg.quote.textSnippet === 'string' ? msg.quote.textSnippet : '',
            source: msg.quote.source === 'mobile' ? 'mobile' : 'vscode',
            timestamp: msg.quote.timestamp || Date.now(),
        }
        : null,
})

export function useMessages() {
    const messages = reactive([])

    const upsertMessages = (serverMessages) => {
        const mapped = (serverMessages || [])
            .filter((msg) => msg && typeof msg === 'object')
            .map(mapServerMessage)
        const keyMap = new Map(messages.map((msg) => [messageKey(msg), msg]))
        mapped.forEach((msg) => keyMap.set(messageKey(msg), msg))
        const merged = Array.from(keyMap.values()).sort(compareMessages)
        messages.splice(0, messages.length, ...merged)
    }

    const appendMessage = (msg) => {
        upsertMessages([msg])
    }

    const appendSystemMessage = (text) => {
        messages.push({
            id: null,
            text,
            type: 'system',
            sender: 'System',
            source: 'system',
            timestamp: Date.now(),
            attachments: null,
            quote: null,
        })
    }

    const prependMessages = (serverMessages) => {
        upsertMessages(serverMessages)
    }

    const mergeMessages = (serverMessages) => {
        upsertMessages(serverMessages)
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
        mergeMessages,
        clearMessages,
        getOldestTimestamp,
    }
}
