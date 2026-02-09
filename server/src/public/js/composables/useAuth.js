/**
 * 认证 Composable
 * 管理 token 的持久化存储
 */
const { ref } = Vue

const TOKEN_KEY = 'st_token'

export function useAuth() {
    const authToken = ref('')
    const rememberMe = ref(false)
    const hasSavedToken = ref(false)

    const loadSavedToken = () => {
        const saved = localStorage.getItem(TOKEN_KEY)
        if (saved) {
            try {
                authToken.value = atob(saved)
                rememberMe.value = true
                hasSavedToken.value = true
            } catch (e) { }
        }
    }

    const saveToken = () => {
        if (rememberMe.value) {
            localStorage.setItem(TOKEN_KEY, btoa(authToken.value))
            hasSavedToken.value = true
        } else {
            localStorage.removeItem(TOKEN_KEY)
            hasSavedToken.value = false
        }
    }

    const clearSavedToken = () => {
        localStorage.removeItem(TOKEN_KEY)
        authToken.value = ''
        rememberMe.value = false
        hasSavedToken.value = false
    }

    return {
        authToken,
        rememberMe,
        hasSavedToken,
        loadSavedToken,
        saveToken,
        clearSavedToken
    }
}
