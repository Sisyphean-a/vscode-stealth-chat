# Backend Storage & Backup Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复发布备份时序、图片清理误删、归档恢复元数据缺失与双库持久化不协调的问题。

**Architecture:** 保持现有 sql.js + 热库/归档库双文件 架构不变，只做最小修复：发布脚本先优雅停机再备份；图片清理先安全落盘再扫描热库/归档库引用，仅删除“超龄且无引用”的文件；归档表补齐恢复所需元数据，并通过双库协调写盘避免单边落盘。

**Tech Stack:** Bash、Node.js、sql.js、Express

---

### Task 1: Fix deploy backup ordering

**Files:**

- Modify:
  estart-deploy.sh

**Step 1: Write the failing expectation**

确认当前脚本 main() 中 ackup_data 先于 graceful_stop_if_running，这会在内存库尚未落盘时复制旧快照。

**Step 2: Apply the minimal change**

将 main() 调整为：graceful_stop_if_running -> backup_data -> start_or_restart。

**Step 3: Verify**

人工检查
estart-deploy.sh 中 main() 的调用顺序。

### Task 2: Preserve referenced uploaded images

**Files:**

- Modify: server/src/utils/imageStorage.js
- Modify: server/src/index.js
- Create: server/src/application/services/imageReferenceScanner.js
- Test: server/src/test-db.js

**Step 1: Write the failing test**

在 server/src/test-db.js 中新增场景：

- 创建临时图片目录与一张“超过保留期”的大图文件
- 保存一条带 /uploads/<filename> 附件的消息并安全落盘
- 执行图片清理
- 断言：被消息引用的老图片不会被删除；未被引用且超龄的图片会被删除

**Step 2: Implement reference scanning**

新增 imageReferenceScanner，从热库 messages 与归档库 rchived_messages 查询 ext LIKE '%/uploads/%' 的消息 payload，解析附件并收集文件名。

**Step 3: Implement safe cleanup**

将 cleanupOldImages 改为可接收 options，删除条件改为“超过保留期且不在引用集合中”。

**Step 4: Wire runtime flow**

在 server/src/index.js 中先执行 db.saveToFile()，再调用图片清理，确保扫描的是最新持久化状态。

**Step 5: Verify**

Run:
pm run -w server test
Expected: 图片清理新增场景通过。

### Task 3: Restore archived metadata and coordinate hot/archive persistence

**Files:**

- Modify: server/src/application/services/archiveCleanupService.js
- Modify: server/src/archiveDb.js
- Modify: server/src/infrastructure/persistence/archive/normalizers.js
- Modify: server/src/infrastructure/persistence/archive/repository.js
- Modify: server/src/infrastructure/persistence/archive/schema.js
- Modify: server/src/infrastructure/persistence/messageRestoreService.js
- Modify: server/src/db.js
- Create: server/src/infrastructure/persistence/storagePairPersistence.js
- Test: server/src/test-db.js

**Step 1: Write the failing tests**

在 server/src/test-db.js 中新增场景：

- 消息带 clientMessageId 与 quoteMessageId，经过归档后恢复，断言恢复后的热消息保留这两个字段
- 直接调用双库协调持久化模块，构造“只剩一个 pending 文件”的中断状态，断言初始化恢复逻辑能补全提交

**Step 2: Extend archive schema**

为 rchived_messages 增加 quote_message_id、client_message_id 列与迁移逻辑。

**Step 3: Preserve metadata through archive/restore**

让归档查询、归档写入、恢复写回都携带 quote_message_id 与 client_message_id。

**Step 4: Coordinate persistence**

新增 storagePairPersistence，使用 \*.pending 阶段文件与提交标记协调热库/归档库写盘；初始化前先恢复未完成提交，写盘时统一导出并分阶段提交。

**Step 5: Verify**

Run:
pm run -w server test
Expected: 新增恢复/持久化场景通过，原有数据库测试保持通过。
