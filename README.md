# Stealth Chat (Monorepo)

这是一个隐蔽的聊天工具，伪装成 VS Code 的 TS-Lint 插件。

## 🚀 快速启动

1. **环境准备**
   - 确保已安装 Docker 和 Docker Compose。
   - 复制 `.env.example` 为 `.env` 并按需修改。

2. **启动服务**
   在根目录下运行：
   ```powershell
   docker-compose up -d --build
   ```

3. **访问客户端**
   - **手机端**: 访问 `http://localhost:3000` (或你的服务器IP:3000)。
     - 输入密钥 (默认: `ChangeMeInProduction`)。
   - **Gotify**: 访问 `http://localhost:8080` (默认账号: `admin`/`admin`)。

4. **配置 VS Code 插件**
   - 打开本项目的 `extension` 目录进行调试 (或打包安装)。
   - 在设置中搜索 `tsLint`。
   - `Server Url`: `http://localhost:3000`
   - `Secret`: `ChangeMeInProduction` (必须与服务端一致)

## 📂 目录结构

- `extension/`: VS Code 插件源码。
- `server/`: Node.js 后端源码 (Express + Socket.io + Gotify Integration)。
- `docker-compose.yml`: 一键部署配置文件。
