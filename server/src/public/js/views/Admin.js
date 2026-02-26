import { useAdminApi } from '../composables/useAdminApi.js'
import { adminTemplate } from './admin/template.js'
import { useAdminState } from './admin/useAdminState.js'
import { useAppCrud } from './admin/useAppCrud.js'
import { usePasswordActions } from './admin/usePasswordActions.js'

const { onMounted } = Vue

export default {
    template: adminTemplate,
    setup() {
        const api = useAdminApi()
        const state = useAdminState()

        const logout = () => api.logout()

        const login = async () => {
            state.loading.value = true
            try {
                await api.login(state.password.value)
                state.errorMsg.value = ''
                await appCrud.fetchStatus()
            } catch (error) {
                state.errorMsg.value = error.message || '网络错误'
            } finally {
                state.loading.value = false
            }
        }

        const appCrud = useAppCrud(api, state)
        const passwordActions = usePasswordActions(api, state, logout)

        onMounted(() => {
            if (api.token.value) {
                void appCrud.fetchStatus()
            }
        })

        return {
            api,
            login,
            logout,
            ...state,
            ...appCrud,
            ...passwordActions
        }
    }
}
