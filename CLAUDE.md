# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Stealth Chat - 伪装成 VS Code TS-Lint 插件的隐蔽实时聊天系统,通过 Socket.io 实现 VS Code 与移动端之间的双向通信,集成 Gotify 推送和 SQLite 持久化。

**核心特性**: VS Code 插件伪装为 Lint 服务,使用 Output Channel 显示消息,移动端通过浏览器访问聊天界面,服务端转发消息并触发推送通知。

## 常用命令

### 服务端开发
```bash
cd server
npm install              # 安装依赖
npm run dev              # 开发模式(Nodemon 自动重启)
npm run dev:debug        # 调试模式(带 Inspector)
npm test                 # 运行数据库单元测试
npm start                # 生产模式
```

### VS Code 插件开发
```bash
cd extension
npm install              # 安装依赖
npm run compile          # 编译 TypeScript
npm run watch            # 监听模式
# 按 F5 在 VS Code 中启动调试
```

### Docker 部署
```bash
docker-compose up -d --build    # 构建并启动所有服务
docker-compose logs -f chat-server   # 查看服务端日志
docker-compose restart chat-server   # 重启聊天服务
```

### 数据库管理
```bash
# 查看消息数据库
sqlite3 server/data/messages.db
SELECT * FROM messages ORDER BY timestamp DESC LIMIT 10;

# 清空数据库(重启服务会自动创建)
rm server/data/messages.db
```

## 架构设计

### 三层架构

1. **客户端层**
   - **VS Code 插件** (`extension/src/extension.ts`): Socket.io Client,通过 Output Channel 伪装为 TS-Lint 服务
   - **移动端 Web** (`server/src/public/index.html`): 单页应用,支持密钥认证和安全锁定

2. **服务层**
   - **Socket.io 服务器** (`server/src/socket.js`): 处理 WebSocket 连接、认证、消息转发
   - **数据库模块** (`server/src/db.js`): SQLite 消息持久化,自动清理过期消息
   - **Gotify 推送** (`server/src/services/gotify.js`): VS Code 发送消息时触发移动端推送

3. **通信协议**
   - **认证**: 通过 `handshake.auth.token` 验证共享密钥 (`STEALTH_SECRET`)
   - **消息事件**: `chat message` - 双向消息传递,携带 `{text, source}` 参数
   - **历史加载**: `load history` - 客户端请求历史消息,返回 `history loaded` 事件

### 消息流转

**VS Code → 移动端**:
1. 用户按 `Ctrl+Shift+T` 触发 Input Box
2. 插件 emit `chat message` {text, source: 'vscode'}
3. 服务器保存消息到 SQLite → 广播给所有客户端 → 触发 Gotify 推送
4. 移动端显示消息气泡

**移动端 → VS Code**:
1. 用户在聊天界面输入消息
2. emit `chat message` {text, source: 'mobile'}
3. 服务器保存消息 → 广播给所有客户端(不触发推送)
4. VS Code Output Channel 显示消息,Status Bar 显示未读数

### 数据持久化

**SQLite 数据库** (`server/src/db.js`):
- 使用 sql.js (纯 JavaScript SQLite)
- 自动保存每条消息(text, source, timestamp)
- 定期清理: 每小时删除超过 30 天或超过 1000 条的旧消息
- 定期保存: 每 5 分钟将内存数据库写入 `server/data/messages.db`
- 历史加载: 客户端连接时可请求最近 N 条消息

## 关键实现细节

### VS Code 插件伪装机制
- **Display Name**: "TS-Lint Service" 而非聊天工具
- **Output Channel**: 格式化消息为 `[timestamp] [source] text` 样式
- **Status Bar**: 显示未读数和连接状态,点击打开 Output Channel
- **快捷键**: `Ctrl+Shift+T` (避免冲突,可配置)

### 安全认证
- 共享密钥认证: 所有客户端使用相同的 `STEALTH_SECRET`
- 移动端安全: 5 次失败后锁定 60 秒,密钥 Base64 编码存储
- Socket.io 中间件: 连接时验证 `handshake.auth.token`

### 环境变量配置
```bash
STEALTH_SECRET=ChangeMeInProduction  # 共享密钥(必须一致)
GOTIFY_TOKEN=xxx                     # Gotify 应用 Token
GOTIFY_URL=http://gotify:80          # Gotify 服务地址
CLICK_URL=http://localhost:3000      # 推送点击跳转 URL
MESSAGE_RETENTION_DAYS=30            # 消息保留天数
MESSAGE_MAX_COUNT=1000               # 最大消息数量
```

## 开发注意事项

### 修改插件后需要重启
- 编译: `npm run compile` (或使用 `npm run watch` 自动编译)
- 在 VS Code 中按 `F5` 打开扩展宿主窗口进行调试
- 修改 `package.json` 配置后需重新加载窗口

### 服务端热重载
- 开发模式使用 Nodemon,修改 `server/src/` 下文件会自动重启
- 不监听 `node_modules/` 和 `data/` 目录(见 `nodemon.json`)

### 数据库操作
- 所有消息操作通过 `db.js` 模块,避免直接操作 SQL.js
- 消息自动保存,无需手动调用 `saveToFile()`
- 测试时可运行 `npm test` 执行数据库单元测试

### 推送通知触发条件
- 仅当 `msg.source === 'vscode'` 时触发 Gotify 推送
- 移动端发送的消息不会触发推送(避免自己推送给自己)
- 推送失败不会阻塞消息转发

## 文件结构关键点

```
extension/src/extension.ts    # 185 行,包含连接管理、消息收发、历史加载、UI 更新
server/src/socket.js           # 67 行,Socket.io 服务器核心逻辑
server/src/db.js               # 230 行,SQLite 持久化和自动清理
server/src/index.js            # 38 行,Express 入口和健康检查端点
server/src/services/gotify.js  # 36 行,Gotify 推送封装
server/src/public/index.html   # 878 行,移动端单页应用(含认证和聊天界面)
```

## 调试技巧

### 查看 Socket.io 连接状态
服务端日志会输出:
- `[Socket] Client connected: <socket-id>` - 连接成功
- `[Socket] Unauthorized access attempt` - 认证失败
- `[Socket] Message from VS Code, triggering Gotify...` - 触发推送

### VS Code 插件调试
1. 在扩展宿主窗口打开开发者工具 (`Help > Toggle Developer Tools`)
2. 查看控制台输出,搜索 "TS-Lint" 相关日志
3. 检查 Output Channel 中的 "TS-Lint Service" 面板

### 移动端调试
1. 打开浏览器开发者工具
2. 查看 Console 中的连接状态和错误
3. 检查 Network 标签中的 WebSocket 连接

## 扩展开发建议

### 添加新消息类型
1. 修改 `socket.js` 添加新事件监听
2. 更新客户端(extension.ts 和 index.html)发送和接收逻辑
3. 如需持久化,修改 `db.js` 的表结构

### 支持多房间
1. 在 Socket.io 中使用 `socket.join(roomId)` 加入房间
2. 修改广播逻辑为 `io.to(roomId).emit(...)`
3. 更新认证中间件,支持房间级别的权限控制
