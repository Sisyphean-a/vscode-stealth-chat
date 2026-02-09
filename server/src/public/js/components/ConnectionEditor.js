/**
 * 连接编辑器组件
 * 添加或编辑连接配置
 */
const { ref, watchEffect } = Vue

export default {
    props: {
        editing: { type: Object, default: null }
    },
    emits: ['close', 'save'],
    setup(props, { emit }) {
        const name = ref('')
        const token = ref('')

        watchEffect(() => {
            if (props.editing) {
                name.value = props.editing.name
                token.value = props.editing.token
            } else {
                name.value = ''
                token.value = ''
            }
        })

        const save = () => {
            if (!token.value.trim()) return
            emit('save', {
                id: props.editing?.id,
                name: name.value || '新对话',
                token: token.value
            })
        }

        return { name, token, save }
    },
    template: `
    <div class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-box">
            <div class="modal-header">
                <h3>{{ editing ? '编辑对话' : '添加新对话' }}</h3>
                <button class="modal-close" @click="$emit('close')">×</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>名称</label>
                    <input type="text" v-model="name" placeholder="对话名称（可选）" class="form-input">
                </div>
                <div class="form-group">
                    <label>密钥</label>
                    <input type="password" v-model="token" placeholder="应用密钥" class="form-input">
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-cancel" @click="$emit('close')">取消</button>
                <button class="btn-save" @click="save" :disabled="!token.trim()">保存</button>
            </div>
        </div>
    </div>
    `
}
