const { ElMessage } = ElementPlus

function resetForm(form) {
    form.id = ''
    form.name = ''
    form.token = ''
    form.gotifyToken = ''
    form.gotifyPriority = 10
    form.clickUrl = ''
}

function validateForm(form) {
    if (!form.id || !form.id.trim()) {
        ElMessage.warning('请输入频道 ID')
        return false
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(form.id)) {
        ElMessage.warning('ID 只能包含字母、数字、下划线和连字符')
        return false
    }

    if (!form.token || form.token.length < 8) {
        ElMessage.warning('密钥长度至少 8 位')
        return false
    }

    return true
}

export function useAppCrud(api, state) {
    const fetchStatus = async () => {
        if (!api.token.value) {
            return
        }

        try {
            const data = await api.fetchStatus()
            state.stats.uptime = data.uptime
            state.stats.totalMessages = data.totalMessages
            state.stats.apps = data.apps
        } catch (error) {
            if (error.message === 'Unauthorized') {
                return
            }
            ElMessage.error(error.message || '获取状态失败')
        }
    }

    const deleteApp = async (id) => {
        try {
            await api.deleteApp(id)
            ElMessage.success('已删除')
            await fetchStatus()
        } catch (error) {
            ElMessage.error(error.message || '删除失败')
        }
    }

    const openDialog = (row) => {
        if (row) {
            state.isEdit.value = true
            Object.assign(state.form, {
                gotifyPriority: 10,
                clickUrl: '',
                ...row
            })
        } else {
            state.isEdit.value = false
            resetForm(state.form)
        }

        state.dialogVisible.value = true
    }

    const submitForm = async () => {
        if (!validateForm(state.form)) {
            return
        }

        try {
            await api.saveApp(state.form, state.isEdit.value)
            ElMessage.success(state.isEdit.value ? '已更新' : '已创建')
            state.dialogVisible.value = false
            await fetchStatus()
        } catch (error) {
            ElMessage.error(error.message || '保存失败')
        }
    }

    const generateToken = () => {
        const bytes = new Uint8Array(16)
        crypto.getRandomValues(bytes)
        state.form.token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    }

    const copyToken = async (tokenValue) => {
        try {
            await navigator.clipboard.writeText(tokenValue)
            ElMessage.success('已复制到剪贴板')
        } catch (error) {
            ElMessage.error('复制失败，请检查浏览器权限')
        }
    }

    return {
        fetchStatus,
        deleteApp,
        openDialog,
        submitForm,
        generateToken,
        copyToken
    }
}
