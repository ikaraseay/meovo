#!/usr/bin/env bash
# =============================================================================
# 运维脚本
#
#   bash scripts/ops.sh doctor      体检：哪里没配好，一次列清楚
#   bash scripts/ops.sh config      配置的查看 / 修改 / 校验
#   bash scripts/ops.sh env         把 config.env 的后台凭据写进 cloudflare/.dev.vars
#   bash scripts/ops.sh login       登录 Cloudflare
#   bash scripts/ops.sh logout      登出 Cloudflare
#   bash scripts/ops.sh status      当前状态
#
# 环境都在 config.env（从 config.env.example 复制，不入库）：
# 部署要用的 Cloudflare 资源、后台的 secret、站点地址 —— 只有这一处要改。
# =============================================================================
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${CONFIG_FILE:-$PROJECT_ROOT/config.env}"
CONFIG_EXAMPLE="$PROJECT_ROOT/config.env.example"
CLOUDFLARE_DIR="$PROJECT_ROOT/cloudflare"
DEV_VARS="$CLOUDFLARE_DIR/.dev.vars"
WRANGLER_CONFIG="$CLOUDFLARE_DIR/wrangler.jsonc"
ASTRO_CONFIG="$PROJECT_ROOT/astro.config.mjs"
WRANGLER_BIN="$PROJECT_ROOT/node_modules/.bin/wrangler"

C_RESET=$'\033[0m'; C_B=$'\033[1m'; C_DIM=$'\033[2m'
C_G=$'\033[32m'; C_Y=$'\033[33m'; C_R=$'\033[31m'; C_C=$'\033[36m'

step() { printf "\n%s▸ %s%s\n" "$C_C" "$*" "$C_RESET"; }
sub()  { printf "  %s→%s %s\n" "$C_DIM" "$C_RESET" "$*"; }
ok()   { printf "  %s✓%s %s\n" "$C_G" "$C_RESET" "$*"; }
# 警告与错误走 stderr：它们是给人看的，不该混进命令替换的输出里
warn() { printf "  %s!%s %s\n" "$C_Y" "$C_RESET" "$*" >&2; }
err()  { printf "  %s✗%s %s\n" "$C_R" "$C_RESET" "$*" >&2; }
die()  { err "$*"; exit 1; }
note() { printf "  %s%s%s\n" "$C_DIM" "$*" "$C_RESET"; }

require_cmd() { command -v "$1" >/dev/null 2>&1 || die "缺少命令：$1（$2）"; }

# 站点 host 从 SITE_URL 派生（config.env 里只写一处）
# 取 URL 的 HTTP 状态码。
# 本机 DNS 被过滤/劫持/缓存了 NXDOMAIN 时 curl 会解析失败（000），但站点好好的 ——
# 换公共 DNS 拿 IP 再 --resolve 试一次，别把「解析不了」误报成「站点挂了」。
curl_code() {
  local url=$1 host code ip resolver
  code=$(curl -o /dev/null -s -m 10 -w '%{http_code}' "$url" 2>/dev/null || true)
  [ "$code" != "000" ] && { echo "$code"; return; }
  command -v dig >/dev/null 2>&1 || { echo "000"; return; }
  host=$(printf '%s' "$url" | sed -E 's#^[a-z]+://([^/:]+).*#\1#')
  for resolver in "" "@1.1.1.1" "@8.8.8.8"; do
    ip=$(dig +short $resolver "$host" 2>/dev/null | grep -E '^[0-9]+\.' | head -1)
    [ -n "$ip" ] && break
  done
  [ -n "$ip" ] || { echo "000"; return; }
  curl -o /dev/null -s -m 10 -w '%{http_code}' --resolve "$host:443:$ip" "$url" 2>/dev/null || echo "000"
}

site_host() {
  local url="${SITE_URL:-}"
  url="${url#https://}"
  url="${url#http://}"
  printf '%s' "${url%%/*}"
}

# astro.config.mjs 里的站点地址 —— 要跟 config.env 一致
site_in_code() {
  sed -n "s/.*site: *'\([^']*\)'.*/\1/p" "$ASTRO_CONFIG" | head -1
}

# 读配置：没有就从模板复制一份
load_config() {
  if [ ! -f "$CONFIG_FILE" ]; then
    [ -f "$CONFIG_EXAMPLE" ] || die "缺少配置模板：$CONFIG_EXAMPLE"
    cp "$CONFIG_EXAMPLE" "$CONFIG_FILE"
    ok "已从模板创建配置：$CONFIG_FILE"
  fi
  set -a
  # shellcheck disable=SC1090
  . "$CONFIG_FILE"
  set +a
}

# 读单个配置项（不加载整个文件）
config_get() {
  local key="$1"
  [ -f "$CONFIG_FILE" ] || return 0
  sed -n "s/^${key}=//p" "$CONFIG_FILE" | head -1 | sed 's/^"//; s/"$//'
}

# 写单个配置项（保留注释与其它行）
config_set() {
  local key="$1" value="$2"
  [ -f "$CONFIG_FILE" ] || cp "$CONFIG_EXAMPLE" "$CONFIG_FILE"
  local escaped="${value//\\/\\\\}"
  escaped="${escaped//\"/\\\"}"
  if grep -q "^${key}=" "$CONFIG_FILE"; then
    awk -v k="$key" -v v="\"$escaped\"" '$0 ~ "^"k"=" { print k "=" v; next } { print }' "$CONFIG_FILE" > "$CONFIG_FILE.tmp" && mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
  else
    printf '%s="%s"\n' "$key" "$escaped" >> "$CONFIG_FILE"
  fi
}

config_unset() {
  local key="$1"
  [ -f "$CONFIG_FILE" ] || return 0
  grep -v "^${key}=" "$CONFIG_FILE" > "$CONFIG_FILE.tmp" && mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
}

# wrangler：配置在 cloudflare/ 下，路径都相对它
wrangler() {
  [ -x "$WRANGLER_BIN" ] || die "找不到 wrangler：先 pnpm install"
  (cd "$CLOUDFLARE_DIR" && "$WRANGLER_BIN" --config "$WRANGLER_CONFIG" "$@")
}

# 配置项校验 —— doctor 与 config check 共用这一处
PROBLEMS=0
check_one() {
  local label="$1" value="$2" pattern="$3" hint="$4"
  if printf '%s' "$value" | grep -qE "$pattern"; then
    ok "$label = $value"
  else
    warn "$label = ${value:-（空）}  → $hint"
    PROBLEMS=$((PROBLEMS + 1))
  fi
}

config_check() {
  PROBLEMS=0
  check_one "SITE_URL" "${SITE_URL:-}" '^https?://[^[:space:]]+$' '应该是 http(s) 地址'
  check_one "WORKER_NAME" "${WORKER_NAME:-}" '^[a-z0-9-]+$' '只能是小写字母、数字、连字符'
  check_one "D1_DATABASE_NAME" "${D1_DATABASE_NAME:-}" '^[a-z0-9-]+$' '只能是小写字母、数字、连字符'
  check_one "D1_DATABASE_ID" "${D1_DATABASE_ID:-}" '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' '跑 pnpm wrangler d1 create meovo-content，把 id 填进来'
  check_one "R2_BUCKET_NAME" "${R2_BUCKET_NAME:-}" '^[a-z0-9-]+$' '只能是小写字母、数字、连字符'
  check_one "CLOUDFLARE_ACCOUNT_ID" "${CLOUDFLARE_ACCOUNT_ID:-}" '^[0-9a-f]{32}$' 'wrangler whoami 里的 Account ID'
  if [ "${D1_DATABASE_ID:-}" = "00000000-0000-0000-0000-000000000000" ]; then
    warn "D1_DATABASE_ID 还是占位符 → 站点会连到不存在的库"
    PROBLEMS=$((PROBLEMS + 1))
  fi
  return 0
}

# D1 的 id 有两份（config.env 与 wrangler.jsonc）—— 对不上会导出到别的库去
check_database_id_synced() {
  local in_config in_wrangler
  in_config="${D1_DATABASE_ID:-}"
  in_wrangler="$(sed -n 's/.*"database_id": *"\([^"]*\)".*/\1/p' "$WRANGLER_CONFIG" | head -1)"
  if [ -z "$in_wrangler" ]; then
    warn "wrangler.jsonc 里读不到 database_id"
    return 1
  fi
  if [ "$in_config" != "$in_wrangler" ]; then
    warn "D1 id 两处不一致：config.env=$in_config / wrangler.jsonc=$in_wrangler"
    note "     bash scripts/ops.sh config set D1_DATABASE_ID $in_config"
    return 1
  fi
  return 0
}

cmd_config() {
  local cmd="${1:-show}"
  shift || true
  case "$cmd" in
    show)
      step "当前配置（${CONFIG_FILE}）"
      if [ -f "$CONFIG_FILE" ]; then
        # secret 类的值不回显 —— 这个输出可能进 CI 日志
        grep -vE '^\s*#|^\s*$' "$CONFIG_FILE" \
          | sed -E 's/^([A-Z0-9_]*(SECRET|PASSWORD|TOKEN)[A-Z0-9_]*)=.*/\1=***/' \
          | sed 's/^/  /'
      else
        warn "还没有配置文件：cp config.env.example config.env"
      fi
      ;;
    get)
      local key="${1:-}"
      [ -n "$key" ] || die "用法：ops.sh config get KEY"
      printf '%s=%s\n' "$key" "$(config_get "$key")"
      ;;
    set)
      local key="${1:-}" value="${2:-}"
      [ -n "$key" ] || die "用法：ops.sh config set KEY VALUE"
      [ -n "$value" ] || die "$key 不能是空值"
      load_config
      config_set "$key" "$value"
      ok "$key = $value"
      # 有些值在代码里也有一份 —— 改一处，另两处跟着走
      if [ "$key" = "D1_DATABASE_ID" ]; then
        awk -v v="$value" '{ if ($0 ~ /"database_id":/) sub(/"database_id": *"[^"]*"/, "\"database_id\": \"" v "\""); print }' "$WRANGLER_CONFIG" > "$WRANGLER_CONFIG.tmp" && mv "$WRANGLER_CONFIG.tmp" "$WRANGLER_CONFIG"
        ok "已同步到 cloudflare/wrangler.jsonc"
      fi
      if [ "$key" = "SITE_URL" ]; then
        awk -v v="$value" '{ if ($0 ~ /^  site:/) sub(/site: *'"'"'[^'"'"']*'"'"'/, "site: '"'"'" v "'"'"'"); print }' "$ASTRO_CONFIG" > "$ASTRO_CONFIG.tmp" && mv "$ASTRO_CONFIG.tmp" "$ASTRO_CONFIG"
        ok "已同步到 astro.config.mjs"
      fi
      if [ "$key" = "SITE_URL" ]; then
        # 自定义域名也在 wrangler.jsonc 里 —— 改域名时两边都要跟上
        host="$(printf '%s' "$value" | sed -e 's|^https\?://||' -e 's|/.*$||')"
        if [ -n "$host" ]; then
          awk -v v="$host" '{ if ($0 ~ /"pattern":/) sub(/"pattern": *"[^"]*"/, "\"pattern\": \"" v "\""); print }' "$WRANGLER_CONFIG" > "$WRANGLER_CONFIG.tmp" && mv "$WRANGLER_CONFIG.tmp" "$WRANGLER_CONFIG"
          ok "已同步到 cloudflare/wrangler.jsonc 的 routes"
        fi
      fi
      note "改完记得重新构建部署：pnpm build && pnpm run deploy"
      ;;
    unset)
      local key="${1:-}"
      [ -n "$key" ] || die "用法：ops.sh config unset KEY"
      load_config
      config_unset "$key"
      ok "已删除 $key"
      ;;
    edit)
      load_config
      "${EDITOR:-vi}" "$CONFIG_FILE"
      ok "配置已保存"
      ;;
    check)
      load_config
      step "校验配置"
      config_check
      if [ "$PROBLEMS" -gt 0 ]; then
        warn "有 $PROBLEMS 项需要注意"
        exit 1
      fi
      ok "配置看起来没问题"
      ;;
    *)
      die "未知命令：${cmd}（可用：show / get / set / unset / edit / check）"
      ;;
  esac
}

# 本地开发凭据：Wrangler 只认配置文件旁边的 .dev.vars
cmd_env() {
  load_config
  step "写本地开发凭据 → cloudflare/.dev.vars"
  if [ -z "${ADMIN_PASSWORD_HASH:-}" ] || [ -z "${SESSION_SECRET:-}" ]; then
    die "config.env 里缺 ADMIN_PASSWORD_HASH 或 SESSION_SECRET"
  fi
  {
    printf '# 由 scripts/ops.sh env 生成 —— 改 config.env 后重跑，别手改这里\n'
    printf 'ADMIN_PASSWORD_HASH=%s\n' "$ADMIN_PASSWORD_HASH"
    printf 'SESSION_SECRET=%s\n' "$SESSION_SECRET"
  } > "$DEV_VARS"
  ok "已写入 $DEV_VARS"
  note "线上用：pnpm wrangler secret put ADMIN_PASSWORD_HASH / SESSION_SECRET"
}

cmd_login() {
  require_cmd node "需要 Node.js"
  step "登录 Cloudflare"
  note "会打开浏览器让你授权 Cloudflare 账号。"
  wrangler login 2>&1 | sed 's/^/  /' || die "登录失败"
  ok "登录成功"
  wrangler whoami 2>&1 | sed 's/^/  /' || true
}

cmd_logout() {
  step "登出 Cloudflare"
  wrangler logout 2>&1 | sed 's/^/  /' || true
  ok "已登出"
}

cmd_status() {
  load_config
  step "配置"
  printf "  %-20s %s\n" "站点" "${SITE_URL:-未配置}"
  printf "  %-20s %s\n" "Worker" "${WORKER_NAME:-未配置}"
  printf "  %-20s %s\n" "D1" "${D1_DATABASE_NAME:-未配置} / ${D1_DATABASE_ID:-未配置}"
  printf "  %-20s %s\n" "R2" "${R2_BUCKET_NAME:-未配置}"

  step "站点"
  local host
  host="$(site_host)"
  if [ -n "$host" ]; then
    local code
    code="$(curl_code "https://$host/")"
    # 根路径是 301（跳 /zh/）—— 2xx / 3xx 都算活着
    case "$code" in
      2*|3*) ok "https://$host/ → $code" ;;
      *) warn "https://$host/ → $code" ;;
    esac
    code="$(curl_code "https://$host/zh/admin/login")"
    [ "$code" = "200" ] && ok "/zh/admin/login → 200" || warn "/zh/admin/login → $code"
  else
    warn "没配置 SITE_URL"
  fi

  step "最近部署"
  wrangler deployments list 2>/dev/null | tail -6 | sed 's/^/  /' || note "（未登录，跳过）"
}

cmd_doctor() {
  load_config
  PASS=0; WARN=0; FAIL=0
  mark_ok()   { ok   "$*"; PASS=$((PASS + 1)); }
  mark_warn() { warn "$*"; WARN=$((WARN + 1)); }
  mark_fail() { err  "$*"; FAIL=$((FAIL + 1)); }

  step "工具链"
  if command -v node >/dev/null 2>&1; then mark_ok "Node.js $(node -v)"; else mark_fail "没有 Node.js"; fi
  if command -v pnpm >/dev/null 2>&1; then mark_ok "pnpm $(pnpm -v)"; else mark_fail "没有 pnpm"; fi
  if [ -x "$WRANGLER_BIN" ]; then mark_ok "wrangler 已安装"; else mark_fail "没有 wrangler：pnpm install"; fi

  step "依赖"
  if [ -d "$PROJECT_ROOT/node_modules" ]; then mark_ok "依赖已安装"; else mark_fail "依赖未装：pnpm install"; fi

  step "配置"
  if [ -f "$CONFIG_FILE" ]; then mark_ok "配置存在：$CONFIG_FILE"; else mark_fail "缺少配置：cp config.env.example config.env"; fi
  config_check >/dev/null 2>&1 || true
  if [ "$PROBLEMS" -eq 0 ]; then mark_ok "配置项校验通过"; else mark_warn "配置项有问题（ops.sh config check 看详情）"; fi
  if check_database_id_synced; then mark_ok "D1 id 与 wrangler.jsonc 一致"; else mark_fail "D1 id 两处不一致"; fi

  step "Cloudflare 登录"
  if wrangler whoami 2>/dev/null | grep -qi "account"; then
    mark_ok "已登录"
  else
    mark_fail "未登录：bash scripts/ops.sh login"
  fi

  step "Worker secret"
  local secrets
  secrets="$(wrangler secret list 2>/dev/null || true)"
  for name in ADMIN_PASSWORD_HASH SESSION_SECRET; do
    if printf '%s' "$secrets" | grep -q "$name"; then
      mark_ok "$name 已设置"
    else
      mark_fail "$name 没设置：pnpm wrangler secret put $name"
    fi
  done
  # 构建钩子不是「站点能不能跑」的必需项，但没它就等于后台改完内容不会重建
  if printf '%s' "$secrets" | grep -q DEPLOY_HOOK_URL; then
    mark_ok "DEPLOY_HOOK_URL 已设置（后台改完内容会触发构建）"
  else
    mark_warn "DEPLOY_HOOK_URL 没设置：后台发布 / 改稿不会触发构建（Cloudflare → Worker → Settings → Builds → Deploy Hooks 建一个，再 pnpm wrangler secret put --config cloudflare/wrangler.jsonc DEPLOY_HOOK_URL）"
  fi

  step "站点"
  # 站点地址两处都有（config.env 与 astro.config.mjs）—— 对不上 SEO 会算错
  if [ "${SITE_URL:-}" = "$(site_in_code)" ]; then
    mark_ok "站点地址与 astro.config.mjs 一致：${SITE_URL:-}"
  else
    mark_fail "站点地址两处不一致（config.env=${SITE_URL:-} / astro.config.mjs=$(site_in_code)）"
  fi
  local host
  host="$(site_host)"
  if [ -n "$host" ]; then
    local code
    code="$(curl_code "https://$host/")"
    # 根路径本来就会 301 到 /zh/ —— 2xx / 3xx 都算站点活着
    case "$code" in
      2*|3*) mark_ok "站点可用：https://$host/ → ${code}" ;;
      *) mark_fail "站点不通（${code}）—— Worker 的 Custom Domains 里加了 ${host}？" ;;
    esac
    code="$(curl_code "https://$host/zh/admin/login")"
    if [ "$code" = "200" ]; then mark_ok "后台可达：/zh/admin/login"; else mark_warn "后台返回 $code"; fi
  else
    mark_warn "没配置 SITE_URL"
  fi

  step "构建产物"
  if [ -d "$PROJECT_ROOT/dist/client" ]; then mark_ok "产物存在（pnpm build）"; else mark_warn "还没有产物：pnpm build"; fi

  step "汇总"
  printf "  %s通过 %d%s   %s提醒 %d%s   %s阻断 %d%s\n" "$C_G" "$PASS" "$C_RESET" "$C_Y" "$WARN" "$C_RESET" "$C_R" "$FAIL" "$C_RESET"
  if [ "$FAIL" -gt 0 ]; then
    note ""
    err "有 $FAIL 项会挡住部署，按上面的提示处理后重跑：bash scripts/ops.sh doctor"
    exit 1
  fi
  ok "体检通过，可以部署：pnpm build && pnpm run deploy"
}

case "${1:-doctor}" in
  doctor) cmd_doctor ;;
  config) shift; cmd_config "$@" ;;
  env)    cmd_env ;;
  login)  cmd_login ;;
  logout) cmd_logout ;;
  status) cmd_status ;;
  *)      die "未知命令：$1（可用：doctor / config / env / login / logout / status）" ;;
esac
