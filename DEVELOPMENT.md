# 本地开发快速启动指南

## 前提条件

- 已安装 Node.js (v16+)
- 已安装 npm

## 启动步骤

### 1. 安装依赖

```bash
cd server
npm install
```

### 2. 配置环境变量(可选)

复制开发环境配置:

```bash
cp .env.development .env
```

或手动创建 `.env` 文件并配置必要的环境变量。

### 3. 启动开发服务器

```bash
npm run dev
```

服务器将在 `http://localhost:3000` 启动,并自动监听文件变化重启。

### 4. 测试服务

打开浏览器访问:

- 移动端界面: http://localhost:3000
- 健康检查: http://localhost:3000/health

### 5. 调试 VS Code 插件

1. 在 VS Code 中打开 `extension/` 目录
2. 按 `F5` 启动调试
3. 在新窗口中测试插件功能

## 验证改动

运行验证脚本确保改动不破坏功能:

**Windows**:

```powershell
.\scripts\verify.ps1
```

**Linux/Mac**:

```bash
chmod +x scripts/verify.sh
./scripts/verify.sh
```

## 常用命令

```bash
# 开发模式(自动重启)
npm run dev

# 调试模式(带 inspector)
npm run dev:debug

# 运行测试
npm test

# 生产模式
npm start
```

## 数据库位置

开发模式下,数据库文件位于:

```
server/data/dev.db
```

可以使用 SQLite 客户端查看数据库内容。
