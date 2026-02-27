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
            if (!state.archiveFilterAppId.value && state.stats.apps.length > 0) {
                state.archiveFilterAppId.value = state.stats.apps[0].id
            }
        } catch (error) {
            if (error.message === 'Unauthorized') {
                return
            }
            ElMessage.error(error.message || '获取状态失败')
        }
    }

    const loadArchiveMessages = async (append = false) => {
        state.archiveLoading.value = true
        try {
            const data = await api.fetchArchiveMessages({
                appId: state.archiveFilterAppId.value,
                limit: 50,
                beforeTimestamp: append ? state.archiveBeforeTimestamp.value : null,
                includeRestored: state.includeRestored.value
            })
            const rows = Array.isArray(data.messages) ? data.messages : []
            if (append) {
                state.archiveMessages.value = [...state.archiveMessages.value, ...rows]
            } else {
                state.archiveMessages.value = rows
            }
            state.archiveHasMore.value = data.hasMore === true
            const last = state.archiveMessages.value[state.archiveMessages.value.length - 1]
            state.archiveBeforeTimestamp.value = last?.timestamp || null
            state.selectedArchiveIds.value = []
        } catch (error) {
            ElMessage.error(error.message || '加载归档失败')
        } finally {
            state.archiveLoading.value = false
        }
    }

    const toggleArchiveSelection = (archiveId, checked) => {
        const id = Number.parseInt(String(archiveId), 10)
        if (!Number.isFinite(id) || id <= 0) {
            return
        }
        const next = new Set(state.selectedArchiveIds.value)
        if (checked) {
            next.add(id)
        } else {
            next.delete(id)
        }
        state.selectedArchiveIds.value = Array.from(next)
    }

    const restoreSelectedArchives = async () => {
        if (!Array.isArray(state.selectedArchiveIds.value) || state.selectedArchiveIds.value.length === 0) {
            ElMessage.warning('请先选择归档消息')
            return
        }
        try {
            const result = await api.restoreArchiveMessages(state.selectedArchiveIds.value)
            ElMessage.success(`已恢复 ${result.restored || 0} 条`)
            await fetchStatus()
            await loadArchiveMessages(false)
        } catch (error) {
            ElMessage.error(error.message || '恢复失败')
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
        loadArchiveMessages,
        toggleArchiveSelection,
        restoreSelectedArchives,
        deleteApp,
        openDialog,
        submitForm,
        generateToken,
        copyToken
    }
}
