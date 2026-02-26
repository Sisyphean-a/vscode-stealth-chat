const { ElMessage } = ElementPlus

function validatePasswordForm(pwdForm) {
    if (!pwdForm.currentPassword) {
        ElMessage.warning('请输入当前密码')
        return false
    }

    if (pwdForm.newPassword.length < 6) {
        ElMessage.warning('新密码长度至少 6 位')
        return false
    }

    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
        ElMessage.warning('两次输入的密码不一致')
        return false
    }

    return true
}

export function usePasswordActions(api, state, logout) {
    const openPasswordDialog = () => {
        state.pwdForm.currentPassword = ''
        state.pwdForm.newPassword = ''
        state.pwdForm.confirmPassword = ''
        state.pwdDialogVisible.value = true
    }

    const submitPassword = async () => {
        if (!validatePasswordForm(state.pwdForm)) {
            return
        }

        state.pwdLoading.value = true
        try {
            await api.changePassword(state.pwdForm.currentPassword, state.pwdForm.newPassword)
            ElMessage.success('密码已更新，请重新登录')
            state.pwdDialogVisible.value = false
            logout()
        } catch (error) {
            ElMessage.error(error.message || '修改失败')
        } finally {
            state.pwdLoading.value = false
        }
    }

    return {
        openPasswordDialog,
        submitPassword
    }
}
