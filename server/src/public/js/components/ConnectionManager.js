/**
 * 连接管理器组件
 * 显示已保存的连接列表，支持编辑和删除
 */
export default {
    props: {
        connections: { type: Array, required: true }
    },
    emits: ['close', 'edit', 'add', 'delete'],
    template: `
    <div class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-box">
            <div class="modal-header">
                <h3>管理对话</h3>
                <button class="modal-close" @click="$emit('close')">×</button>
            </div>
            <div class="modal-body">
                <div v-if="connections.length === 0" class="empty-hint">暂无对话配置</div>
                <div v-for="conn in connections" :key="conn.id" class="conn-manage-item">
                    <span class="conn-manage-name">{{ conn.name }}</span>
                    <div class="conn-manage-actions">
                        <button class="btn-edit" @click="$emit('edit', conn)">编辑</button>
                        <button class="btn-delete" @click="$emit('delete', conn.id)">删除</button>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-add" @click="$emit('add')">+ 添加新对话</button>
            </div>
        </div>
    </div>
    `
}
