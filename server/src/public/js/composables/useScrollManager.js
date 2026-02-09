/**
 * 滚动管理 Composable
 * 管理消息列表的滚动行为
 */
const { ref, nextTick } = Vue

export function useScrollManager() {
    const messagesContainer = ref(null)

    const scrollToBottom = () => {
        nextTick(() => {
            if (messagesContainer.value) {
                messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
            }
        })
    }

    const preserveScrollPosition = (callback) => {
        const oldScrollHeight = messagesContainer.value?.scrollHeight || 0
        callback()
        nextTick(() => {
            if (messagesContainer.value) {
                const newScrollHeight = messagesContainer.value.scrollHeight
                messagesContainer.value.scrollTop = newScrollHeight - oldScrollHeight
            }
        })
    }

    const autoResize = (e) => {
        e.target.style.height = 'auto'
        e.target.style.height = e.target.scrollHeight + 'px'
    }

    return {
        messagesContainer,
        scrollToBottom,
        preserveScrollPosition,
        autoResize
    }
}
