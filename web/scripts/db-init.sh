#!/usr/bin/env bash
#
# 数据库初始化脚本
#
# 用法:
#   初始化新数据库（prod/Supabase）:
#     DATABASE_URL="postgresql://..." ./scripts/db-init.sh
#
#   在已有数据库上标记 baseline 已应用（dev/Neon）:
#     ./scripts/db-init.sh --baseline-only
#
set -euo pipefail
cd "$(dirname "$0")/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[db-init]${NC} $*"; }
warn() { echo -e "${YELLOW}[db-init]${NC} $*"; }
err()  { echo -e "${RED}[db-init]${NC} $*" >&2; }

if [ -z "${DATABASE_URL:-}" ]; then
  err "DATABASE_URL 未设置。请先设置环境变量或在 .env 中配置。"
  exit 1
fi

BASELINE_ONLY=false
if [ "${1:-}" = "--baseline-only" ]; then
  BASELINE_ONLY=true
fi

# ── Step 1: 运行迁移 ──
if [ "$BASELINE_ONLY" = true ]; then
  log "标记 baseline migration 为已应用..."
  npx prisma migrate resolve --applied 0_baseline
else
  log "运行数据库迁移..."
  npx prisma migrate deploy
fi

# ── Step 2: 生成 Prisma Client ──
log "生成 Prisma Client..."
npx prisma generate

# ── Step 3: 运行 seed ──
if [ "${SKIP_SEED:-}" = "1" ]; then
  warn "跳过 seed (SKIP_SEED=1)"
else
  log "运行 seed..."
  npx prisma db seed || warn "seed 执行失败（非阻塞）"
fi

log "数据库初始化完成 ✓"
echo ""
echo "  连接: $(echo "$DATABASE_URL" | sed 's/:[^:@]*@/:***@/')"
echo ""
