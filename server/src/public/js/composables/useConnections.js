/**
 * 多连接管理 Composable
 * 管理连接配置的CRUD和持久化
 */
const { ref, reactive } = Vue

const CONNECTIONS_KEY = 'st_connections'
const ACTIVE_CONN_KEY = 'st_active_conn'

export function useConnections() {
    const connections = reactive([])
    const activeConnectionId = ref('')

    const generateId = () => Math.random().toString(36).substring(2, 10)

    /**
     * 从 localStorage 加载连接配置
     */
    const loadConnections = () => {
        const saved = localStorage.getItem(CONNECTIONS_KEY)
        if (saved) {
            try {
                const parsed = JSON.parse(saved)
                connections.splice(0, connections.length, ...parsed)
            } catch (e) { }
        }

        // 兼容旧版单 token 格式
        if (connections.length === 0) {
            const oldToken = localStorage.getItem('st_token')
            if (oldToken) {
                try {
                    const token = atob(oldToken)
                    connections.push({
                        id: generateId(),
                        name: '默认对话',
                        token: token
                    })
                    saveConnections()
                } catch (e) { }
            }
        }

        // 加载活动连接
        const activeId = localStorage.getItem(ACTIVE_CONN_KEY)
        if (activeId && connections.find(c => c.id === activeId)) {
            activeConnectionId.value = activeId
        } else if (connections.length > 0) {
            activeConnectionId.value = connections[0].id
        }
    }

    /**
     * 保存连接配置到 localStorage
     */
    const saveConnections = () => {
        localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(connections))
    }

    /**
     * 保存活动连接ID
     */
    const saveActiveConnection = () => {
        localStorage.setItem(ACTIVE_CONN_KEY, activeConnectionId.value)
    }

    /**
     * 获取当前活动连接
     */
    const getActiveConnection = () => {
        return connections.find(c => c.id === activeConnectionId.value)
    }

    /**
     * 添加新连接
     */
    const addConnection = (name, token) => {
        const conn = {
            id: generateId(),
            name: name || '新对话',
            token: token
        }
        connections.push(conn)
        saveConnections()
        return conn
    }

    /**
     * 更新连接
     */
    const updateConnection = (id, name, token) => {
        const conn = connections.find(c => c.id === id)
        if (conn) {
            conn.name = name
            conn.token = token
            saveConnections()
        }
    }

    /**
     * 删除连接
     */
    const deleteConnection = (id) => {
        const index = connections.findIndex(c => c.id === id)
        if (index !== -1) {
            connections.splice(index, 1)
            saveConnections()
        }
        return index !== -1
    }

    return {
        connections,
        activeConnectionId,
        loadConnections,
        saveConnections,
        saveActiveConnection,
        getActiveConnection,
        addConnection,
        updateConnection,
        deleteConnection
    }
}
