# Deploy Output Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 消除 `docker compose` 的重复配置警告，并让 `restart-deploy.sh` 的阶段输出更直观。

**Architecture:** 不改变部署流程，只清理噪音源和日志结构：在 `docker-compose.yml` 中移除过时 `version` 并为可选环境变量提供显式空默认值；在部署脚本中增加步骤编号日志，让关键信息先于底层命令输出出现。

**Tech Stack:** Docker Compose、Bash

---

### Task 1: Remove avoidable Compose warnings

**Files:**

- Modify: `docker-compose.yml`

**Step 1: Verify current warning sources**

确认以下来源：

- `version: "3.8"` 触发 obsolete warning
- `GOTIFY_TOKEN=${GOTIFY_TOKEN}` 在变量未定义时触发 blank-string warning
- `APP_APPS=${APP_APPS}` 在变量未定义时触发 blank-string warning

**Step 2: Apply minimal config change**

- 删除 `version`
- 将可选变量改成带空默认值的写法
- 顺手把 `environment` 改成对象式，提升可读性

**Step 3: Verify**

Run: `docker compose -f docker-compose.yml config`
Expected: 不再出现上述 3 类 warning。

### Task 2: Make deploy logs easier to scan

**Files:**

- Modify: `restart-deploy.sh`

**Step 1: Add a simple step logger**

新增统一步骤输出，如：

- `[1/6] 安全停机`
- `[2/6] 备份数据`
- `[3/6] 重建并启动`

**Step 2: Keep underlying command output visible**

不要隐藏 `docker compose` 的真实错误，只优化脚本自己的阶段日志。

**Step 3: Verify**

检查脚本文本，确保主流程按步骤编号输出关键阶段。
