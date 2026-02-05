/**
 * 图片预览 Composable
 * 管理图片预览弹窗的状态和缩放控制
 */
const { ref } = Vue

export function useImagePreview() {
    const previewImage = ref(null)
    const previewScale = ref(1)

    const openImage = (src) => {
        previewImage.value = src
        previewScale.value = 1
    }

    const closePreview = () => {
        previewImage.value = null
        previewScale.value = 1
    }

    const zoomIn = () => {
        previewScale.value = Math.min(previewScale.value + 0.25, 3)
    }

    const zoomOut = () => {
        previewScale.value = Math.max(previewScale.value - 0.25, 0.5)
    }

    const resetZoom = () => {
        previewScale.value = 1
    }

    return {
        previewImage,
        previewScale,
        openImage,
        closePreview,
        zoomIn,
        zoomOut,
        resetZoom
    }
}
