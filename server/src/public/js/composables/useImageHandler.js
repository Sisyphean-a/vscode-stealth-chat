/**
 * 图片处理 Composable
 * 管理图片选择、粘贴、处理逻辑
 */
const { reactive } = Vue

export function useImageHandler(options = {}) {
    const pendingImages = reactive([])
    const MAX_IMAGE_SIZE = options.maxSize || 5 * 1024 * 1024

    /**
     * 处理粘贴事件
     */
    const handlePaste = (e, onError) => {
        const items = e.clipboardData?.items
        if (!items) return

        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault()
                const file = item.getAsFile()
                if (file) {
                    processImageFile(file, onError)
                }
                break
            }
        }
    }

    /**
     * 处理文件选择
     */
    const handleFileSelect = (e, onError) => {
        const files = e.target.files
        if (!files) return
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                processImageFile(file, onError)
            }
        }
        e.target.value = ''
    }

    /**
     * 处理单个图片文件
     */
    const processImageFile = (file, onError) => {
        if (file.size > MAX_IMAGE_SIZE) {
            const sizeMB = (file.size / 1024 / 1024).toFixed(2)
            if (onError) {
                onError(`图片过大 (${sizeMB}MB)，请选择小于 5MB 的图片`)
            }
            return
        }

        const reader = new FileReader()
        reader.onload = (e) => {
            const dataUrl = e.target?.result
            if (dataUrl) {
                pendingImages.push({
                    data: dataUrl,
                    filename: file.name || 'image.png',
                    size: file.size
                })
            }
        }
        reader.readAsDataURL(file)
    }

    /**
     * 移除待发送图片
     */
    const removePendingImage = (index) => {
        pendingImages.splice(index, 1)
    }

    /**
     * 清空所有待发送图片
     */
    const clearPendingImages = () => {
        pendingImages.splice(0)
    }

    return {
        pendingImages,
        handlePaste,
        handleFileSelect,
        removePendingImage,
        clearPendingImages
    }
}
