const { ref, reactive, onMounted } = Vue;
const { useRouter } = VueRouter;
const { ElMessage, ElMessageBox } = ElementPlus;

export default {
    template: `
    <div class="admin-wrapper">
        <!-- Login -->
        <div v-if="!token" class="login-box">
            <el-card class="login-card" shadow="hover">
                <template #header>
                    <div class="login-header">
                        <span class="login-icon">🍃</span>
                        <h3 class="card-title">Stealth Admin</h3>
                    </div>
                </template>
                <el-form @submit.prevent="login" class="login-form">
                    <el-form-item>
                        <el-input v-model="password" type="password" placeholder="请输入管理员密码" show-password @keyup.enter="login" class="soft-input" size="large"></el-input>
                    </el-form-item>
                    <el-button type="primary" class="soft-btn full-width" @click="login" :loading="loading" size="large">登录系统</el-button>
                </el-form>
                <div v-if="errorMsg" class="error-text">{{ errorMsg }}</div>
            </el-card>
        </div>

        <!-- Dashboard -->
        <div v-else class="dashboard">
            <div class="nav-bar">
                <div class="brand">
                    <div class="brand-icon">S</div>
                    <h2 class="brand-text">控制台</h2>
                </div>
                <div class="nav-actions">
                    <span class="uptime-badge">运行时间: {{ formatUptime(stats.uptime) }}</span>
                    <el-button plain size="small" @click="logout" class="logout-btn">退出</el-button>
                </div>
            </div>

            <div class="content-container">
                <!-- Stats Grid -->
                <div class="stats-grid">
                    <div class="stat-card primary">
                        <div class="stat-icon">💬</div>
                        <div class="stat-info">
                            <span class="label">消息总数</span>
                            <span class="value">{{ stats.totalMessages }}</span>
                        </div>
                    </div>
                    <div class="stat-card success">
                        <div class="stat-icon">⚡</div>
                        <div class="stat-info">
                            <span class="label">系统状态</span>
                            <span class="value">运行正常</span>
                        </div>
                    </div>
                    <div class="stat-card info">
                        <div class="stat-icon">📦</div>
                        <div class="stat-info">
                            <span class="label">活跃频道</span>
                            <span class="value">{{ stats.apps.length }}</span>
                        </div>
                    </div>
                </div>

                <!-- Main Table -->
                <el-card class="main-card" shadow="never">
                    <template #header>
                        <div class="card-header">
                            <div class="header-title">
                                <span class="title-icon">📂</span>
                                <span class="section-title">频道列表</span>
                                <span class="app-count">{{ stats.apps.length }}</span>
                            </div>
                            <el-button type="primary" class="action-btn" @click="openDialog()">
                                + 新增频道
                            </el-button>
                        </div>
                    </template>
                    
                    <el-table :data="stats.apps" style="width: 100%" :header-cell-style="{background:'#f8f9fa', color:'#868e96', fontWeight: '600'}">
                        <el-table-column prop="id" label="ID" width="140">
                            <template #default="scope">
                                <span class="id-tag">{{ scope.row.id }}</span>
                            </template>
                        </el-table-column>
                        <el-table-column prop="name" label="名称" min-width="120">
                            <template #default="scope">
                                <span class="name-text">{{ scope.row.name }}</span>
                            </template>
                        </el-table-column>
                        <el-table-column label="连接密钥" width="180">
                            <template #default="scope">
                                <span class="token-mask" title="点击复制">{{ scope.row.token.substring(0,8) }}...</span>
                            </template>
                        </el-table-column>
                        <el-table-column label="Gotify" width="100" align="center">
                            <template #default="scope">
                                <div :class="['status-dot', scope.row.gotifyToken ? 'on' : 'off']"></div>
                            </template>
                        </el-table-column>
                        <el-table-column label="操作" width="160" align="right">
                            <template #default="scope">
                                <div class="action-group">
                                    <el-button link type="primary" size="small" @click="openDialog(scope.row)">编辑</el-button>
                                    <el-popconfirm title="确认删除此频道?" @confirm="deleteApp(scope.row.id)" confirm-button-text="删除" cancel-button-text="取消">
                                        <template #reference>
                                            <el-button link type="danger" size="small" :disabled="scope.row.id === 'default'">删除</el-button>
                                        </template>
                                    </el-popconfirm>
                                </div>
                            </template>
                        </el-table-column>
                    </el-table>
                </el-card>
            </div>

            <!-- Dialog -->
            <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑配置' : '新建频道'" width="420px" class="glass-dialog">
                <el-form :model="form" label-width="70px" class="edit-form">
                    <el-form-item label="ID">
                        <el-input v-model="form.id" :disabled="isEdit" placeholder="唯一标识" class="modal-input"></el-input>
                    </el-form-item>
                    <el-form-item label="名称">
                        <el-input v-model="form.name" placeholder="显示名称" class="modal-input"></el-input>
                    </el-form-item>
                    <el-form-item label="密钥">
                        <el-input v-model="form.token" placeholder="访问密码" class="modal-input">
                            <template #append>
                                <el-button @click="generateToken">🎲</el-button>
                            </template>
                        </el-input>
                    </el-form-item>
                    <el-form-item label="Gotify">
                        <el-input v-model="form.gotifyToken" placeholder="Gotify Token (可选)" class="modal-input"></el-input>
                    </el-form-item>
                </el-form>
                <template #footer>
                    <span class="dialog-footer">
                        <el-button @click="dialogVisible = false" class="cancel-btn">取消</el-button>
                        <el-button type="primary" @click="submitForm" class="save-btn">保存变更</el-button>
                    </span>
                </template>
            </el-dialog>
        </div>
    </div>
    `,
    setup() {
        // State
        const password = ref('')
        const token = ref(localStorage.getItem('admin_token') || '')
        const loading = ref(false)
        const errorMsg = ref('')
        const stats = reactive({ uptime: 0, totalMessages: 0, apps: [] })

        // Dialog
        const dialogVisible = ref(false)
        const isEdit = ref(false)
        const form = reactive({ id: '', name: '', token: '', gotifyToken: '' })

        // Logic
        const login = async () => {
            loading.value = true
            try {
                const res = await fetch('/api/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: password.value })
                })
                const data = await res.json()
                if (res.ok) {
                    token.value = data.token
                    localStorage.setItem('admin_token', data.token)
                    errorMsg.value = ''
                    fetchStatus()
                } else {
                    errorMsg.value = '密码错误'
                }
            } catch (e) {
                errorMsg.value = '网络错误'
            } finally {
                loading.value = false
            }
        }

        const logout = () => {
            token.value = ''
            localStorage.removeItem('admin_token')
        }

        const fetchStatus = async () => {
            if (!token.value) return
            try {
                const res = await fetch('/api/admin/status', {
                    headers: { 'Authorization': `Bearer ${token.value}` }
                })
                if (res.status === 401 || res.status === 403) {
                    logout()
                    return
                }
                const data = await res.json()
                stats.uptime = data.uptime
                stats.totalMessages = data.totalMessages
                stats.apps = data.apps
            } catch (e) {
                console.error(e)
            }
        }

        const deleteApp = async (id) => {
            await fetch(`/api/admin/apps/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token.value}` }
            })
            ElMessage.success('已删除')
            fetchStatus()
        }

        const openDialog = (row) => {
            if (row) {
                isEdit.value = true
                Object.assign(form, row)
            } else {
                isEdit.value = false
                form.id = ''
                form.name = ''
                form.token = ''
                form.gotifyToken = ''
            }
            dialogVisible.value = true
        }

        const submitForm = async () => {
            const url = isEdit.value ? `/api/admin/apps/${form.id}` : '/api/admin/apps'
            const method = isEdit.value ? 'PUT' : 'POST'
            
            const res = await fetch(url, {
                method: method,
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token.value}` 
                },
                body: JSON.stringify(form)
            })
            
            if (res.ok) {
                ElMessage.success(isEdit.value ? '已更新' : '已创建')
                dialogVisible.value = false
                fetchStatus()
            } else {
                ElMessage.error('操作失败')
            }
        }

        const generateToken = () => {
            form.token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
        }

        const formatUptime = (seconds) => {
            const min = Math.floor(seconds / 60)
            const hours = Math.floor(min / 60)
            return `${hours}小时 ${min % 60}分`
        }

        onMounted(() => {
            if (token.value) {
                fetchStatus()
            }
        })

        return {
            password, token, loading, errorMsg, stats,
            login, logout, formatUptime, deleteApp,
            dialogVisible, isEdit, form, openDialog, submitForm, generateToken
        }
    }
}
