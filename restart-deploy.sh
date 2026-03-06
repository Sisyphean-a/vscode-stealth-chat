#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
readonly BACKUP_ROOT="${SCRIPT_DIR}/backup"
readonly CHAT_SERVICE="chat-server"
readonly CHAT_PORT="3000"
readonly DEFAULT_HEALTH_URL="http://127.0.0.1:${CHAT_PORT}/health"
readonly STOP_WAIT_SECONDS=30
readonly START_WAIT_SECONDS=30
readonly SKIP_BACKUP="${SKIP_BACKUP:-0}"
readonly SKIP_HEALTHCHECK="${SKIP_HEALTHCHECK:-0}"
readonly HEALTH_URL="${HEALTH_URL:-${DEFAULT_HEALTH_URL}}"

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

fail() {
  printf '[%s] ERROR: %s\n' "$(date '+%F %T')" "$*" >&2
  exit 1
}

require_command() {
  local name="$1"
  command -v "${name}" >/dev/null 2>&1 || fail "缺少命令: ${name}"
}

compose() {
  docker compose -f "${COMPOSE_FILE}" "$@"
}

assert_project_root() {
  [[ -f "${COMPOSE_FILE}" ]] || fail "未找到 ${COMPOSE_FILE}"
}

ensure_data_dirs() {
  mkdir -p "${SCRIPT_DIR}/server/data"
  mkdir -p "${SCRIPT_DIR}/gotify_data"
}

service_running() {
  compose ps --status running --services 2>/dev/null | grep -Fxq "${CHAT_SERVICE}"
}

wait_for_service_stop() {
  local second=0
  while (( second < STOP_WAIT_SECONDS )); do
    if ! service_running; then
      log "${CHAT_SERVICE} 已停止"
      return 0
    fi
    sleep 1
    ((second += 1))
  done
  fail "等待 ${CHAT_SERVICE} 停止超时（${STOP_WAIT_SECONDS}s）"
}

wait_for_service_start() {
  local second=0
  while (( second < START_WAIT_SECONDS )); do
    if service_running; then
      log "${CHAT_SERVICE} 已运行"
      return 0
    fi
    sleep 1
    ((second += 1))
  done
  fail "等待 ${CHAT_SERVICE} 启动超时（${START_WAIT_SECONDS}s）"
}

backup_path_if_exists() {
  local source_path="$1"
  local target_dir="$2"
  if [[ -e "${source_path}" ]]; then
    cp -a "${source_path}" "${target_dir}/"
    log "已备份: ${source_path}"
    return 0
  fi
  log "跳过备份（不存在）: ${source_path}"
}

backup_data() {
  if [[ "${SKIP_BACKUP}" == "1" ]]; then
    log "SKIP_BACKUP=1，已跳过备份"
    return 0
  fi

  local timestamp
  timestamp="$(date '+%Y%m%d-%H%M%S')"
  local target_dir="${BACKUP_ROOT}/${timestamp}"
  mkdir -p "${target_dir}"

  backup_path_if_exists "${SCRIPT_DIR}/server/data" "${target_dir}"
  backup_path_if_exists "${SCRIPT_DIR}/gotify_data" "${target_dir}"
  backup_path_if_exists "${SCRIPT_DIR}/.env" "${target_dir}"

  log "备份完成: ${target_dir}"
}

graceful_stop_if_running() {
  if service_running; then
    log "检测到 ${CHAT_SERVICE} 正在运行，发送 SIGINT 做优雅停机"
    compose kill -s SIGINT "${CHAT_SERVICE}"
    log "执行 stop，防止 unless-stopped 自动拉起旧容器"
    compose stop --timeout "${STOP_WAIT_SECONDS}" "${CHAT_SERVICE}"
    wait_for_service_stop
    return 0
  fi
  log "${CHAT_SERVICE} 当前未运行，进入启动流程"
}

start_or_restart() {
  log "开始重建并启动服务"
  compose up -d --build
  wait_for_service_start
  log "等待服务初始化..."
  sleep 2
}

health_check() {
  if [[ "${SKIP_HEALTHCHECK}" == "1" ]]; then
    log "SKIP_HEALTHCHECK=1，已跳过健康检查"
    return 0
  fi

  require_command curl

  log "执行健康检查: ${HEALTH_URL}"
  local max_retries=5
  local retry=0
  while (( retry < max_retries )); do
    if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then
      log "健康检查通过"
      return 0
    fi
    ((retry += 1))
    log "健康检查失败，${retry}/${max_retries}，等待2秒后重试..."
    sleep 2
  done
  fail "健康检查失败: ${HEALTH_URL}"
}

show_status() {
  log "当前容器状态:"
  compose ps
}

main() {
  require_command docker
  assert_project_root
  ensure_data_dirs

  log "发布脚本开始执行，目录: ${SCRIPT_DIR}"
  graceful_stop_if_running
  backup_data
  start_or_restart
  health_check
  show_status
  log "发布脚本执行完成"
}

main "$@"
