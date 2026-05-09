# Stealth Chat Client Marketplace 发布设计

## 背景

当前仓库已经具备可运行的 VS Code 扩展端，但扩展仍以 `TS-Lint Service` 的伪装名称对外暴露，不适合直接发布到 VS Code Marketplace。与此同时，扩展目录缺少商店所需的独立说明文档、图标和展示素材，也没有面向公开用户的元数据配置。

本次设计的目标不是把它包装成一个大众化聊天工具，而是把它整理成一个低调、真实、配套型的公开扩展：用户一眼能看出它和聊天有关，但也能看出它依赖既有的 Stealth Chat 服务端，而不是一个开箱即用的通用 IM。

## 目标

将 VS Code 扩展整理为可公开发布的 `Stealth Chat Client`，满足 Marketplace 上架的基础要求，并保持“极简、低调、配套工具感”的产品呈现。

## 非目标

- 不修改服务端公开品牌，不新增 SaaS 化营销页面。
- 不在本轮重做聊天交互逻辑，只处理发布所需的文案、资产、元数据和必要兼容层。
- 不把现有架构改造成多扩展产品矩阵。

## 产品定位

### 公开名称

- Marketplace 名称：`Stealth Chat Client`
- npm / 扩展包名：`stealth-chat-client`

### 对外描述原则

- 明确出现 `chat` / `message` 语义，不再使用伪装名称。
- 文案克制，不做“团队协作平台”“下一代通信工具”这类泛化表述。
- 始终强调它是 `Stealth Chat` 的 VS Code 客户端，需要配套服务端使用。

### 推荐商店短描述

`A lightweight VS Code client for Stealth Chat.`

### 推荐商店长描述基调

- 第一段说明：它是什么。
- 第二段说明：适合谁。
- 第三段说明：怎么连接到现有服务端。
- 避免过度承诺，如“secure”“private”“encrypted”，除非仓库现状确实实现并可验证。

## 视觉方向

### 设计原则

- 极简、安静、无营销腔。
- 使用暖浅底色与深灰正文，避免高饱和科技感。
- 图形元素只保留一个核心符号，不做复杂插画。

### 图标方案

- 新增扩展商店图标：`extension/media/icon.png`
- 尺寸：`256x256`
- 视觉元素：单个简化对话气泡轮廓，内部只留一条短横线，表现“消息客户端”。
- 风格：圆角、细边框、留白充分，不使用渐变高光和拟物阴影。
- 背景：暖米白或浅沙色。
- 前景：深石墨灰。

### Activity Bar 图标

- 新增单色 `SVG`：`extension/media/activitybar-icon.svg`
- 用于 `viewsContainers.activitybar.icon`
- 保持线性、低细节，适配 VS Code 深浅主题。

### Marketplace 展示图

- 新增封面图：`extension/media/marketplace-cover.png`
- 尺寸目标：约 `1280x640`
- 内容只包含：
  - `Stealth Chat Client`
  - 一句副标题：`A lightweight VS Code client for Stealth Chat`
  - 一张裁切后的真实界面截图或抽象化界面框线
- 不堆特性列表，不放徽章墙。

### README 截图

- 新增 2 张截图：
  - `extension/media/screenshot-chat.png`
  - `extension/media/screenshot-settings.png`
- 截图只展示真实 UI，不做花哨标注。

## Marketplace 元数据设计

需要调整 `extension/package.json` 的以下字段：

### 基础字段

- `name`: `stealth-chat-client`
- `displayName`: `Stealth Chat Client`
- `description`: `A lightweight VS Code client for Stealth Chat.`
- `icon`: `media/icon.png`
- `license`: 复用现有许可证标识

### 链接字段

- `repository`: 保留现有 GitHub 仓库
- `homepage`: 指向仓库主页或扩展专用 README 锚点
- `bugs`: 指向 GitHub Issues
- `qna`: 关闭 Marketplace Q&A，统一收口到 GitHub Issues

### 发现性字段

- `categories`: 保持克制，优先使用与消息/辅助工具相近的官方分类；如需保守可保持 `Other`
- `keywords`: 控制在少量精确词，不堆 SEO
  - 推荐：`stealth chat`, `chat client`, `messages`, `socket.io`, `companion`

### 展示字段

- `galleryBanner`:
  - `color`: `#E9E1D3`
  - `theme`: `light`

## 扩展内文案重命名

所有面向用户可见的扩展文案从 `TS-Lint Service` 切换为 `Stealth Chat Client`，包含：

- Activity Bar 标题
- Webview `<title>`
- 输出面板名称
- 状态栏提示
- 命令标题与分类
- 设置页标题
- 连接状态日志

文案风格要求：

- 简短直白
- 不说废话
- 不带品牌口号

示例：

- `Stealth Chat Client connected`
- `Stealth Chat Client disconnected`
- `Focus Stealth Chat`
- `Switch Connection`

## 配置命名与兼容策略

### 新前缀

将公开配置前缀从 `tsLint.*` 切换到 `stealthChat.*`。

### 迁移范围

- `tsLint.serverUrl` -> `stealthChat.serverUrl`
- `tsLint.secret` -> `stealthChat.secret`
- `tsLint.forceWebsocket` -> `stealthChat.forceWebsocket`
- `tsLint.autoReveal` -> `stealthChat.autoReveal`
- `tsLint.displayMode` -> `stealthChat.displayMode`
- `tsLint.connections` -> `stealthChat.connections`
- `tsLint.activeConnection` -> `stealthChat.activeConnection`
- `tsLint.backgroundSyncEnabled` -> `stealthChat.backgroundSyncEnabled`
- `tsLint.backgroundSyncIntervalMs` -> `stealthChat.backgroundSyncIntervalMs`
- `tsLint.backgroundSyncCursors` -> `stealthChat.backgroundSyncCursors`

### 迁移方式

- 扩展激活时检查旧配置是否存在。
- 若新配置为空且旧配置存在，则复制旧值到新键。
- 迁移只做一次，且不删除旧键，避免用户回退版本时丢配置。
- 所有运行时读取逻辑优先读新键，必要时兜底旧键。

### 设计理由

直接硬切会导致已安装用户丢失连接配置；保留一次性迁移和运行时兜底，可以兼顾公开命名与历史兼容。

## 文档结构设计

### `extension/README.md`

这是 Marketplace 主入口文档，不再复用 monorepo 根 README。结构如下：

1. 标题与一句话定位
2. 功能概览
3. 截图
4. 快速开始
5. 连接前提（需要已部署的 Stealth Chat server）
6. 配置项
7. 图片消息与同步说明
8. 问题反馈入口

要求：

- 全文以扩展用户为中心
- 不讲服务端部署细节，服务端部署只链接回仓库根 README
- 图片全部使用相对路径引用 `media/`

### `extension/CHANGELOG.md`

- 从 `1.0.0` 开始整理
- 明确首个公开版做了什么
- 后续按版本维护，不写空泛条目

### `extension/SUPPORT.md`

- 提供 Issue 提交入口
- 简要写明反馈时需要附带的信息：
  - VS Code 版本
  - 扩展版本
  - 服务端地址形态
  - 日志或截图

## 发布素材组织

新增目录：

- `extension/media/`

建议文件清单：

- `icon.png`
- `activitybar-icon.svg`
- `marketplace-cover.png`
- `screenshot-chat.png`
- `screenshot-settings.png`

所有 README 与 Marketplace 引用统一走该目录，避免素材散落在仓库根目录。

## 实现边界

### 必须完成

- 扩展公开名称与元数据切换
- 扩展内可见文案切换
- 配置前缀迁移与兼容
- 商店图标与展示图
- 扩展目录 README / CHANGELOG / SUPPORT
- VSIX 打包验证，确保素材被正确包含

### 不在本轮完成

- 服务端品牌同步重构
- 新的协议能力
- 视觉大改版或聊天交互重写

## 验证标准

### 功能验证

- 旧 `tsLint.*` 配置安装升级后仍可正常连接
- 新安装用户只看到 `stealthChat.*` 配置
- 扩展命令、侧边栏、设置页不再出现 `TS-Lint Service`
- 图片消息、连接切换、历史加载、后台同步行为不回归

### 打包验证

- `npm run -w extension check-types` 通过
- `npm run -w extension vsix:package` 通过
- 生成的 VSIX 中包含 `media/` 素材与文档文件
- 生成的 VSIX 中不包含测试脚本和不必要开发文件

### 展示验证

- README 在 GitHub 与 VS Code Marketplace 中都能正常渲染
- 图标在浅色/深色主题侧边栏里可辨认
- Marketplace 页面整体观感保持克制、简洁

## 风险与约束

### 配置迁移风险

如果只改 `package.json` 的配置前缀，而不做运行时读取迁移，现有用户会直接失去连接配置。这是必须规避的高优先级风险。

### 命名替换风险

仓库里 `TS-Lint Service` 出现位置较多，若遗漏输出面板、状态提示、Webview 标题或命令分类，会形成公开品牌与实际 UI 不一致的问题。

### 商店素材风险

若只补 `icon` 而不补扩展目录 README，Marketplace 页面仍会显得不完整；若 README 继续沿用 monorepo 内容，则会把服务端、Docker、Gotify 等信息直接暴露给扩展用户，信息层级会失衡。

## 结论

`Stealth Chat Client` 的正确发布方式不是单纯改个名字，而是同步完成三件事：

1. 公开命名和用户可见文案彻底去伪装
2. 配置前缀完成兼容迁移
3. 商店所需的文档与视觉素材一次补齐

只有这样，扩展才会既像一个正式产品，又保持“低调配套工具”的气质。
