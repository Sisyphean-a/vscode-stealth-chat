/**
 * 图片预览模态框组件
 */
export default {
    props: {
        src: { type: String, required: true },
        scale: { type: Number, default: 1 }
    },
    emits: ['close', 'zoom-in', 'zoom-out', 'reset-zoom'],
    template: `
    <div class="image-modal" @click.self="$emit('close')">
        <div class="modal-toolbar">
            <button class="modal-btn" @click="$emit('zoom-in')" title="放大">+</button>
            <button class="modal-btn" @click="$emit('zoom-out')" title="缩小">−</button>
            <button class="modal-btn" @click="$emit('reset-zoom')" title="重置">⟲</button>
            <button class="modal-btn" @click="$emit('close')" title="关闭">×</button>
        </div>
        <img :src="src" :style="{ transform: 'scale(' + scale + ')' }" alt="预览">
    </div>
    `
}
