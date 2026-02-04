# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stealth Chat is a **covert real-time chat system** disguised as a VS Code TS-Lint plugin. It enables bidirectional communication between VS Code and mobile web clients via Socket.io, with Gotify push notification integration.

**Key Design**: Messages appear in VS Code's Output Channel formatted like lint logs. The Status Bar shows connection state and unread counts. To an observer, it looks like a standard development tool.

## Commands

### Server Development

```bash
# Development (with hot reload)
cd server
npm run dev

# Production
npm start

# Debug mode
npm run dev:debug

# Test database
npm test
```

### Extension Development

```bash
# Compile TypeScript
cd extension
npm run compile

# Watch mode for development
npm run watch

# Package for VS Code
npm run vscode:prepublish
```

### Docker Deployment

```bash
# Start all services (Gotify + Chat Server)
docker-compose up -d --build

# View logs
docker-compose logs -f chat-server

# Stop services
docker-compose down
```

Access points after deployment:
- Chat frontend: `http://localhost:3000`
- Admin dashboard: `http://localhost:3000/#/admin` (password: `admin` or env `ADMIN_PASSWORD`)
- Gotify: `http://localhost:8080`

## Architecture

### Multi-Application System

The system supports multiple independent chat channels (Apps), each with:
- Unique **App ID** (e.g., `default`, `vip`)
- **Token** for authentication (used by both VS Code extension and web clients)
- **Gotify Token** for push notifications (optional, per-app)

Configuration priority:
1. **Persistent file**: `server/data/apps.json` (managed via Admin UI)
2. **Environment variable**: `APP_APPS` JSON string (seed data if file doesn't exist)
3. **Legacy fallback**: `STEALTH_SECRET` environment variable (creates a default app)

### Socket.io Communication Flow

1. **Authentication**: Clients connect with token in `socket.handshake.auth.token`
2. **App Resolution**: Server looks up app via `config.findAppByToken(token)`
3. **Room Isolation**: Each client joins a room based on `appId` (e.g., `default`, `vip`)
4. **Message Routing**: Messages broadcast only to the same app's room via `io.to(appId).emit()`

**Event Types**:
- `chat message`: Bidirectional message exchange (from `vscode` or `mobile`)
- `load history`: Request recent messages (limit parameter)
- `history loaded`: Server response with message array

### VS Code Extension Disguise

**Stealth Features**:
- Extension name: `TS-Lint Service`
- Output Channel: `TS-Lint Service` (messages formatted as lint logs)
- Status Bar: `$(check) TS-Lint` (normal) / `$(alert) TS-Lint` (unread)
- Command: `Configure Parameters` (actually sends chat message)
- Keybinding: `Ctrl+Shift+T` / `Cmd+Shift+T`

**WebView Integration**:
- Sidebar panel: `Service Monitor` (actual chat interface)
- Message cache: Stores messages before WebView is initialized
- Auto-reveal: Optional setting to auto-show Output Channel on new message

**Configuration** (`.vscode/settings.json`):
```json
{
  "tsLint.serverUrl": "http://localhost:3000",
  "tsLint.secret": "YourAppToken",
  "tsLint.forceWebsocket": false,
  "tsLint.autoReveal": false
}
```

### Database (SQLite via sql.js)

**Schema**:
```sql
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_id TEXT DEFAULT 'default',
    text TEXT NOT NULL,              -- Plain text or JSON (for attachments)
    source TEXT NOT NULL,             -- 'vscode' | 'mobile'
    timestamp INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_timestamp ON messages(timestamp DESC);
CREATE INDEX idx_app_id ON messages(app_id);
```

**Retention Policy**:
- Time-based: Delete messages older than `MESSAGE_RETENTION_DAYS` (default 30)
- Count-based: Keep max `MESSAGE_MAX_COUNT` per app (default 1000)
- Cleanup: Runs hourly
- Auto-save: Every 5 minutes to `server/data/messages.db`

**Message Format**:
- Text messages: Stored as plain string
- Image messages: Stored as JSON `{"text": "...", "attachments": [...]}`

### Image Handling

**Processing** (`server/src/utils/imageStorage.js`):
- Small images (<100KB): Kept as inline Base64 data URLs
- Large images: Saved to `server/data/uploads/` and referenced by URL
- Cleanup: Deletes images older than retention period (daily task)

**Attachment Structure**:
```javascript
{
  type: "image",
  data: "data:image/png;base64,...",  // For inline images
  url: "/uploads/filename.png",        // For file-based images
  filename: "screenshot.png",
  size: 45678
}
```

### Gotify Push Integration

When VS Code sends a message:
1. Server detects `msg.source === "vscode"`
2. Retrieves app's `gotifyToken` and `gotifyUrl` from config
3. Calls `sendNotification()` with app-specific credentials
4. Mobile receives push notification with click URL

**Gotify Service** (`server/src/services/gotify.js`):
```javascript
sendNotification(title, message, priority, clickUrl, app)
```

## Frontend Architecture

### Chat Frontend (`server/src/public/index.html`)

**Tech Stack**: Vue 3 (CDN mode, no build required)
- Single-file HTML with embedded Vue app
- Custom CSS maintaining VS Code dark theme aesthetic
- Socket.io client for real-time communication

**Key Features**:
- Token-based authentication (enter token → connect)
- Message history loading (configurable limit)
- Image paste support (Ctrl+V)
- Camera capture (mobile)
- Attachment preview with click-to-enlarge

### Admin Dashboard (`server/src/public/js/views/Admin.js`)

**Tech Stack**: Vue 3 + Element Plus (CDN mode, 使用 Vue Router 路由)
- 访问路径: `http://localhost:3000/#/admin`
- Password-protected (env `ADMIN_PASSWORD` or `GOTIFY_ADMIN_PASS`)
- Manage apps: Add, edit, delete
- Token generator (random 32-char hex)
- Real-time stats: Message counts per app

**API Routes** (`server/src/routes/admin.js`):
- `POST /api/admin/auth` - Password authentication
- `GET /api/admin/apps` - List all apps
- `POST /api/admin/apps` - Create app
- `PUT /api/admin/apps/:id` - Update app
- `DELETE /api/admin/apps/:id` - Delete app
- `GET /api/admin/stats` - System statistics

## Development Patterns

### Adding a New Feature to VS Code Extension

1. Edit `extension/src/extension.ts`
2. Run `npm run watch` in `extension/` directory
3. Press `F5` in VS Code to launch Extension Development Host
4. Test the feature
5. Reload window (`Ctrl+R`) to apply changes

### Modifying Web Frontends

**No build required** - 使用 Vue 3 CDN 模式 (版本已锁定):
1. 编辑 `server/src/public/index.html` (入口)
2. 编辑 `server/src/public/js/views/Chat.js` (聊天组件)
3. 编辑 `server/src/public/js/views/Admin.js` (管理组件)
4. 刷新浏览器即可看到更改
5. 服务端变更会由 nodemon 自动重启

### Testing Socket.io Changes

1. Start server: `cd server && npm run dev`
2. Open browser DevTools → Console
3. Connect to `http://localhost:3000` and enter a token
4. Monitor Socket.io events in console
5. Test both VS Code extension and web client simultaneously

### Database Migrations

If schema changes are needed:
1. Modify `db.init()` in `server/src/db.js`
2. Add migration logic similar to the `app_id` column migration (lines 50-58)
3. Check for column existence, alter table if needed, update existing rows
4. Test with both fresh database and existing data

### Environment Configuration

Create `.env` file (see `.env.example`):
```bash
ADMIN_PASSWORD=admin
APP_APPS='[{"id":"default","name":"Default","token":"ChangeMe"}]'
GOTIFY_URL=http://gotify:80/message
MESSAGE_RETENTION_DAYS=30
MESSAGE_MAX_COUNT=1000
CLICK_URL=https://your-domain.com
```

**Note**: Once `server/data/apps.json` exists, `APP_APPS` is ignored. Use Admin UI to manage apps.

## Security Considerations

- **Token-based auth**: All Socket.io connections require valid app token
- **Room isolation**: Apps cannot see each other's messages (enforced by Socket.io rooms)
- **Admin password**: Protect `/admin` routes with strong password
- **No token transmission**: Tokens not logged in production
- **Gotify tokens**: Stored per-app, not exposed to clients

## Troubleshooting

### VS Code Extension Not Connecting

1. Check `tsLint.serverUrl` in settings
2. Verify token matches an app in Admin UI
3. Check server logs: `docker-compose logs -f chat-server`
4. Try `tsLint.forceWebsocket: true` if behind Cloudflare Tunnel

### Messages Not Syncing

1. Confirm both clients joined the same app (check server logs for `App: <name>`)
2. Verify Socket.io connection state in browser DevTools
3. Check if database is writable: `ls -la server/data/`

### Push Notifications Not Working

1. Verify Gotify is running: `curl http://localhost:8080/health`
2. Check app has valid `gotifyToken` in Admin UI
3. Review server logs for Gotify POST errors
4. Test Gotify directly: `curl -X POST "http://localhost:8080/message?token=<TOKEN>" -F "message=test"`

### Database Issues

If database corruption occurs:
1. Stop server
2. Backup: `cp server/data/messages.db server/data/messages.db.bak`
3. Delete: `rm server/data/messages.db`
4. Restart server (new database will be created)
5. Import from backup if needed using `server/src/test-db.js` as reference
