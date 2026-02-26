const { ref, reactive } = Vue

export function useAdminState() {
    const password = ref('')
    const loading = ref(false)
    const errorMsg = ref('')
    const stats = reactive({ uptime: 0, totalMessages: 0, apps: [] })

    const dialogVisible = ref(false)
    const isEdit = ref(false)
    const form = reactive({
        id: '',
        name: '',
        token: '',
        gotifyToken: '',
        gotifyPriority: 10,
        clickUrl: ''
    })

    const pwdDialogVisible = ref(false)
    const pwdLoading = ref(false)
    const pwdForm = reactive({ currentPassword: '', newPassword: '', confirmPassword: '' })

    const formatUptime = (seconds) => {
        const min = Math.floor(seconds / 60)
        const hours = Math.floor(min / 60)
        return `${hours}小时 ${min % 60}分`
    }

    return {
        password,
        loading,
        errorMsg,
        stats,
        dialogVisible,
        isEdit,
        form,
        pwdDialogVisible,
        pwdLoading,
        pwdForm,
        formatUptime
    }
}
