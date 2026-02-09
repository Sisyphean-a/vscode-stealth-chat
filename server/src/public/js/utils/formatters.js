/**
 * 格式化工具函数
 */

/**
 * HTML 实体转义，防止 XSS
 */
export const escapeHtml = (text) => {
    if (!text) return ''
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }
    return text.replace(/[&<>"']/g, (c) => map[c])
}

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
    const escaped = escapeHtml(text)
    return escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
        if (/^https?:\/\//i.test(url)) {
            return `<a href="${url}" target="_blank" class="image-link">${label}</a>`
        }
        return `[${label}](${url})`
    })
}

/**
 * 获取图片附件的 src
 */
export const getImageSrc = (att) => {
    if (att.url) return att.url
    if (att.data) return att.data.startsWith('data:') ? att.data : `data:image/png;base64,${att.data}`
    return ''
}
