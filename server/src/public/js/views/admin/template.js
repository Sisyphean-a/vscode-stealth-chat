export const adminTemplate = `
<div class="admin-wrapper">
    <!-- Login -->
    <div v-if="!api.token.value" class="login-box">
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
                <el-button plain size="small" @click="openPasswordDialog" class="pwd-btn">修改密码</el-button>
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
                    <el-table-column label="连接密钥" width="200">
                        <template #default="scope">
                            <div class="token-cell">
                                <span class="token-mask" title="点击复制完整密钥" @click="copyToken(scope.row.token)">{{ scope.row.token.substring(0,8) }}...</span>
                                <el-button link type="primary" size="small" @click="copyToken(scope.row.token)" title="复制">📋</el-button>
                            </div>
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

            <el-card class="main-card" shadow="never">
                <template #header>
                    <div class="card-header">
                        <div class="header-title">
                            <span class="title-icon">🗂</span>
                            <span class="section-title">归档消息</span>
                            <span class="app-count">{{ archiveMessages.length }}</span>
                        </div>
                        <div style="display:flex; gap:8px; align-items:center;">
                            <el-select v-model="archiveFilterAppId" placeholder="选择频道" style="min-width: 150px;">
                                <el-option v-for="app in stats.apps" :key="app.id" :label="app.name" :value="app.id" />
                            </el-select>
                            <el-checkbox v-model="includeRestored">含已恢复</el-checkbox>
                            <el-button @click="loadArchiveMessages(false)" :loading="archiveLoading">刷新</el-button>
                            <el-button type="primary" @click="restoreSelectedArchives" :disabled="selectedArchiveIds.length === 0">恢复选中</el-button>
                        </div>
                    </div>
                </template>

                <el-table :data="archiveMessages" style="width: 100%">
                    <el-table-column width="52">
                        <template #default="scope">
                            <el-checkbox
                                :model-value="selectedArchiveIds.includes(scope.row.archiveId)"
                                :disabled="!!scope.row.restoredAt"
                                @change="(checked) => toggleArchiveSelection(scope.row.archiveId, checked)"
                            />
                        </template>
                    </el-table-column>
                    <el-table-column prop="archiveId" label="归档ID" width="90" />
                    <el-table-column prop="appId" label="频道" width="100" />
                    <el-table-column prop="source" label="来源" width="80" />
                    <el-table-column label="时间" width="170">
                        <template #default="scope">
                            <span>{{ new Date(scope.row.timestamp).toLocaleString() }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="内容">
                        <template #default="scope">
                            <span>{{ scope.row.text || '(空消息)' }}</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="状态" width="100">
                        <template #default="scope">
                            <el-tag v-if="scope.row.restoredAt" type="success">已恢复</el-tag>
                            <el-tag v-else type="info">已归档</el-tag>
                        </template>
                    </el-table-column>
                </el-table>
                <div style="margin-top: 12px; display:flex; justify-content:center;">
                    <el-button @click="loadArchiveMessages(true)" :disabled="!archiveHasMore || archiveLoading">
                        {{ archiveLoading ? '加载中...' : (archiveHasMore ? '加载更多' : '没有更多') }}
                    </el-button>
                </div>
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
                <el-form-item label="推送级别">
                    <el-input-number v-model="form.gotifyPriority" :min="0" :max="10" :step="1" controls-position="right" style="width: 100%"></el-input-number>
                </el-form-item>
                <el-form-item label="点击URL">
                    <el-input v-model="form.clickUrl" placeholder="推送点击跳转地址 (可选)" class="modal-input"></el-input>
                </el-form-item>
            </el-form>
            <template #footer>
                <span class="dialog-footer">
                    <el-button @click="dialogVisible = false" class="cancel-btn">取消</el-button>
                    <el-button type="primary" @click="submitForm" class="save-btn">保存变更</el-button>
                </span>
            </template>
        </el-dialog>

        <!-- Password Dialog -->
        <el-dialog v-model="pwdDialogVisible" title="修改管理员密码" width="400px" class="glass-dialog">
            <el-form :model="pwdForm" label-width="80px" class="edit-form">
                <el-form-item label="当前密码">
                    <el-input v-model="pwdForm.currentPassword" type="password" placeholder="请输入当前密码" show-password class="modal-input"></el-input>
                </el-form-item>
                <el-form-item label="新密码">
                    <el-input v-model="pwdForm.newPassword" type="password" placeholder="至少 6 位" show-password class="modal-input"></el-input>
                </el-form-item>
                <el-form-item label="确认密码">
                    <el-input v-model="pwdForm.confirmPassword" type="password" placeholder="再次输入新密码" show-password class="modal-input"></el-input>
                </el-form-item>
            </el-form>
            <template #footer>
                <span class="dialog-footer">
                    <el-button @click="pwdDialogVisible = false" class="cancel-btn">取消</el-button>
                    <el-button type="primary" @click="submitPassword" :loading="pwdLoading" class="save-btn">确认修改</el-button>
                </span>
            </template>
        </el-dialog>
    </div>
</div>
`
