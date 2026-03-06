import {
    buildImageUploadPlan,
    IMAGE_UPLOAD_OUTPUT_SIZE_LIMIT,
    IMAGE_UPLOAD_TARGET_QUALITY,
} from '/packages/chat-core/index.js'

const { reactive } = Vue

const DEFAULT_MAX_IMAGE_SIZE = 12 * 1024 * 1024
const QUALITY_STEP = 0.08
const MIN_JPEG_QUALITY = 0.66

function formatImageFilename(file) {
    return file?.name || 'image.jpg'
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (event) => resolve(event.target?.result || '')
        reader.onerror = () => reject(new Error('读取图片失败'))
        reader.readAsDataURL(file)
    })
}

function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('解析图片失败'))
        image.src = dataUrl
    })
}

function base64SizeFromDataUrl(dataUrl) {
    const base64Data = typeof dataUrl === 'string' ? dataUrl.split(',')[1] || '' : ''
    return Math.floor((base64Data.length * 3) / 4)
}

function buildScaledSize({ width, height, targetMaxDimension }) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error('图片尺寸无效')
    }

    const longestEdge = Math.max(width, height)
    if (longestEdge <= targetMaxDimension) {
        return { width, height }
    }

    const scale = targetMaxDimension / longestEdge
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale))
    }
}

function renderCanvas({ image, width, height }) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) {
        throw new Error('浏览器不支持图片压缩')
    }
    context.drawImage(image, 0, 0, width, height)
    return canvas
}

function compressCanvas({ canvas, outputMimeType, targetQuality, outputSizeLimit }) {
    let quality = targetQuality
    let compressedDataUrl = canvas.toDataURL(outputMimeType, quality)
    let outputSize = base64SizeFromDataUrl(compressedDataUrl)

    while (outputSize > outputSizeLimit && quality > MIN_JPEG_QUALITY) {
        quality = Math.max(MIN_JPEG_QUALITY, Number((quality - QUALITY_STEP).toFixed(2)))
        compressedDataUrl = canvas.toDataURL(outputMimeType, quality)
        outputSize = base64SizeFromDataUrl(compressedDataUrl)
        if (quality === MIN_JPEG_QUALITY) {
            break
        }
    }

    return {
        dataUrl: compressedDataUrl,
        size: outputSize,
        quality
    }
}

async function optimizeImageForUpload(file) {
    const sourceDataUrl = await readFileAsDataUrl(file)
    const uploadPlan = buildImageUploadPlan({ mimeType: file.type, size: file.size })

    if (!uploadPlan.shouldCompress) {
        return {
            data: sourceDataUrl,
            filename: formatImageFilename(file),
            size: file.size,
            mimeType: file.type || 'image/jpeg',
            originalSize: file.size,
            wasCompressed: false
        }
    }

    const image = await loadImage(sourceDataUrl)
    const scaledSize = buildScaledSize({
        width: image.naturalWidth,
        height: image.naturalHeight,
        targetMaxDimension: uploadPlan.targetMaxDimension
    })
    const canvas = renderCanvas({ image, ...scaledSize })
    const compressed = compressCanvas({
        canvas,
        outputMimeType: uploadPlan.outputMimeType,
        targetQuality: uploadPlan.targetQuality,
        outputSizeLimit: uploadPlan.outputSizeLimit || IMAGE_UPLOAD_OUTPUT_SIZE_LIMIT
    })

    const shouldKeepOriginal = compressed.size >= file.size
    return {
        data: shouldKeepOriginal ? sourceDataUrl : compressed.dataUrl,
        filename: formatImageFilename(file).replace(/\.[^.]+$/, '.jpg'),
        size: shouldKeepOriginal ? file.size : compressed.size,
        mimeType: shouldKeepOriginal ? (file.type || 'image/jpeg') : uploadPlan.outputMimeType,
        originalSize: file.size,
        wasCompressed: !shouldKeepOriginal,
        quality: shouldKeepOriginal ? IMAGE_UPLOAD_TARGET_QUALITY : compressed.quality
    }
}

export function useImageHandler(options = {}) {
    const pendingImages = reactive([])
    const maxImageSize = options.maxSize || DEFAULT_MAX_IMAGE_SIZE

    const processImageFile = async (file, onError) => {
        if (file.size > maxImageSize) {
            const sizeMB = (file.size / 1024 / 1024).toFixed(2)
            onError?.(`图片过大 (${sizeMB}MB)，请选择小于 12MB 的图片`)
            return
        }

        try {
            const processedImage = await optimizeImageForUpload(file)
            pendingImages.push(processedImage)
        } catch (error) {
            onError?.(error instanceof Error ? error.message : '处理图片失败')
        }
    }

    const handlePaste = async (event, onError) => {
        const items = event.clipboardData?.items
        if (!items) return

        for (const item of items) {
            if (!item.type.startsWith('image/')) {
                continue
            }
            event.preventDefault()
            const file = item.getAsFile()
            if (file) {
                await processImageFile(file, onError)
            }
            break
        }
    }

    const handleFileSelect = async (event, onError) => {
        const files = event.target.files
        if (!files) return
        for (const file of files) {
            if (!file.type.startsWith('image/')) {
                continue
            }
            await processImageFile(file, onError)
        }
        event.target.value = ''
    }

    const removePendingImage = (index) => {
        pendingImages.splice(index, 1)
    }

    const clearPendingImages = () => {
        pendingImages.splice(0)
    }

    const uploadImage = async (img, token, serverUrl) => {
        const baseUrl = serverUrl || window.location.origin
        const res = await fetch(`${baseUrl}/api/upload`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                data: img.data,
                filename: img.filename,
                mimeType: img.mimeType
            })
        })

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Upload failed' }))
            throw new Error(err.error || `HTTP ${res.status}`)
        }

        const result = await res.json()
        if (!result.success) {
            throw new Error(result.error || 'Upload failed')
        }
        return result.attachment
    }

    const uploadAllImages = async (token, serverUrl, onProgress) => {
        const attachments = []
        const total = pendingImages.length
        for (let index = 0; index < total; index += 1) {
            const image = pendingImages[index]
            onProgress?.({ current: index + 1, total, image })
            const attachment = await uploadImage(image, token, serverUrl)
            attachments.push(attachment)
        }
        return attachments
    }

    return {
        pendingImages,
        handlePaste,
        handleFileSelect,
        removePendingImage,
        clearPendingImages,
        uploadImage,
        uploadAllImages
    }
}
