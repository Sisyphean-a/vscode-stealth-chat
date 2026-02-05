/**
 * 格式化工具函数
 */

/**
 * 格式化时间戳为 HH:MM 格式
 */
export const formatTime = (ts) => {
    const date = new Date(ts)
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/**
 * 格式化分隔线日期
 */
export const formatDividerDate = (ts) => {
    const date = new Date(ts)
    const now = new Date()
    if (date.toDateString() === now.toDateString()) {
        return formatTime(ts)
    }
    return `${date.getMonth() + 1}-${date.getDate()} ${formatTime(ts)}`
}

/**
 * 判断是否显示时间分隔线（间隔超过5分钟）
 */
export const showTimeDivider = (current, prev) => {
    if (!prev) return true
    return (current.timestamp - prev.timestamp) > 5 * 60 * 1000
}

/**
 * 简单的 Markdown 链接解析
 */
export const parseMarkdown = (text) => {
    if (!text) return ''
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="image-link">$1</a>')
}

/**
 * 获取图片附件的 src
 */
export const getImageSrc = (att) => {
    if (att.url) return att.url
    if (att.data) return att.data.startsWith('data:') ? att.data : `data:image/png;base64,${att.data}`
    return ''
}
