/**
 * Admin API 服务 Composable
 * 统一管理 Admin 面板的 HTTP 请求
 */
const { ref } = Vue

export function useAdminApi() {
    const token = ref(localStorage.getItem('admin_token') || '')

    const request = async (url, options = {}) => {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        }
        if (token.value) {
            headers['Authorization'] = `Bearer ${token.value}`
        }

        const res = await fetch(url, { ...options, headers })

        if (res.status === 401 || res.status === 403) {
            logout()
            throw new Error('Unauthorized')
        }

        return res
    }

    const login = async (password) => {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        })
        const data = await res.json()
        if (!res.ok) throw new Error('密码错误')
        token.value = data.token
        localStorage.setItem('admin_token', data.token)
        return data
    }

    const logout = () => {
        token.value = ''
        localStorage.removeItem('admin_token')
    }

    const fetchStatus = async () => {
        const res = await request('/api/admin/status')
        return res.json()
    }

    const deleteApp = async (id) => {
        await request(`/api/admin/apps/${id}`, { method: 'DELETE' })
    }

    const saveApp = async (form, isEdit) => {
        const url = isEdit ? `/api/admin/apps/${form.id}` : '/api/admin/apps'
        const method = isEdit ? 'PUT' : 'POST'
        const res = await request(url, {
            method,
            body: JSON.stringify(form)
        })
        if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            throw new Error(data.message || '操作失败')
        }
    }

    const changePassword = async (currentPassword, newPassword) => {
        const res = await request('/api/admin/password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword, newPassword })
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || '修改失败')
        return data
    }

    const fetchArchiveMessages = async ({ appId = '', limit = 50, beforeTimestamp = null, includeRestored = false } = {}) => {
        const query = new URLSearchParams()
        if (appId) {
            query.set('appId', appId)
        }
        query.set('limit', String(limit))
        if (beforeTimestamp) {
            query.set('beforeTimestamp', String(beforeTimestamp))
        }
        query.set('includeRestored', includeRestored ? 'true' : 'false')
        const res = await request(`/api/admin/archive/messages?${query.toString()}`)
        const data = await res.json()
        if (!res.ok) {
            throw new Error(data.error || '获取归档失败')
        }
        return data
    }

    const restoreArchiveMessages = async (archiveIds) => {
        const res = await request('/api/admin/archive/restore', {
            method: 'POST',
            body: JSON.stringify({ archiveIds })
        })
        const data = await res.json()
        if (!res.ok) {
            throw new Error(data.error || '恢复失败')
        }
        return data
    }

    return {
        token,
        login,
        logout,
        fetchStatus,
        deleteApp,
        saveApp,
        changePassword,
        fetchArchiveMessages,
        restoreArchiveMessages
    }
}
