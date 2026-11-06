#!/usr/bin/env bash
# =============================================================================
# 公共函数：路径、配置读取、输出、Wrangler 包装
#
# 所有运维脚本都先 source 本文件：
#   . "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
#
# 约定与 yds-notifier 的运维脚本保持一致：
#   - warn / err 走 stderr，避免被 $() 吞进变量里
#   - 密钥值一律不回显，只显示长度
#   - 配置只有 config.env 一处真源，逐键读取（不 source 整个文件，避免行尾注释
#     和特殊字符被当成 shell 代码执行）
# =============================================================================
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"
CONFIG_FILE="${CONFIG_FILE:-$PROJECT_ROOT/config.env}"
CONFIG_EXAMPLE="$PROJECT_ROOT/config.env.example"
CLOUDFLARE_DIR="$PROJECT_ROOT/cloudflare"
DEV_VARS="$CLOUDFLARE_DIR/.dev.vars"
WRANGLER_CONFIG="$CLOUDFLARE_DIR/wrangler.jsonc"
ASTRO_CONFIG="$PROJECT_ROOT/astro.config.mjs"
WRANGLER_BIN="$PROJECT_ROOT/node_modules/.bin/wrangler"

# 运维脚本会用到的全部配置键（config_get 的白名单）
ALL_KEYS="SITE_URL WORKER_NAME D1_DATABASE_NAME D1_DATABASE_ID R2_BUCKET_NAME
CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_API_TOKEN ADMIN_PASSWORD_HASH SESSION_SECRET
DEPLOY_HOOK_URL"

# Cloudflare Worker 运行时变量（Variables and Secrets）
CF_KEYS="WORKER_NAME SITE_URL D1_DATABASE_NAME D1_DATABASE_ID R2_BUCKET_NAME
CLOUDFLARE_ACCOUNT_ID ADMIN_PASSWORD_HASH SESSION_SECRET DEPLOY_HOOK_URL"

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

ask_yes_no() {
  local prompt="$1" reply
  printf "  %s%s [y/N] %s" "$C_B" "$prompt" "$C_RESET"
  read -r reply
  [[ "$reply" =~ ^[Yy]$ ]]
}

# 读单个配置项：兼容 KEY="value" # 注释 / KEY='value' / KEY=value
config_get() {
  local key="$1" line
  [ -f "$CONFIG_FILE" ] || return 0
  line="$(sed -n "s/^${key}=//p" "$CONFIG_FILE" | head -1)"
  [ -n "$line" ] || return 0
  case "$line" in
    \"*)  printf '%s' "$line" | sed -E 's/^"([^"]*)".*/\1/' ;;
    \'*)  printf '%s' "$line" | sed -E "s/^'([^']*)'.*/\1/" ;;
    *)    printf '%s' "$line" | sed -E 's/[[:space:]]*#.*//; s/[[:space:]]+$//' ;;
  esac
}

# 写单个配置项（保留注释与其它行）
config_set() {
  local key="$1" value="$2" escaped
  [ -f "$CONFIG_FILE" ] || cp "$CONFIG_EXAMPLE" "$CONFIG_FILE"
  escaped="${value//\\/\\\\}"
  escaped="${escaped//\"/\\\"}"
  if grep -q "^${key}=" "$CONFIG_FILE"; then
    awk -v k="$key" -v v="\"$escaped\"" '
      $0 ~ "^"k"=" { print k "=" v; next } { print }
    ' "$CONFIG_FILE" > "$CONFIG_FILE.tmp" && mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
  else
    printf '%s="%s"\n' "$key" "$escaped" >> "$CONFIG_FILE"
  fi
}

config_unset() {
  local key="$1"
  [ -f "$CONFIG_FILE" ] || return 0
  grep -v "^${key}=" "$CONFIG_FILE" > "$CONFIG_FILE.tmp" && mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
}

# 加载配置：逐键 export，不 source 整个 config.env
load_config() {
  [ -f "$CONFIG_FILE" ] || die "缺少配置：cp config.env.example config.env 并填入真值"
  local k v
  for k in $ALL_KEYS; do
    v="$(config_get "$k")"
    export "$k=$v"
  done
}

# 站点 host 从 SITE_URL 派生
site_host() {
  local url="${SITE_URL:-}"
  url="${url#https://}"
  url="${url#http://}"
  printf '%s' "${url%%/*}"
}

# astro.config.mjs 里的站点地址
site_in_code() {
  sed -n "s/.*site: *'\([^']*\)'.*/\1/p" "$ASTRO_CONFIG" | head -1
}

# JSON 字符串转义（用于 wrangler secret bulk 的临时文件）
json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

# Wrangler 一律在 cloudflare/ 目录下执行
wrangler() {
  [ -x "$WRANGLER_BIN" ] || die "找不到 wrangler：先 pnpm install"
  (cd "$CLOUDFLARE_DIR" && "$WRANGLER_BIN" --config "$WRANGLER_CONFIG" "$@")
}

require_login() {
  local who
  who="$(wrangler whoami 2>/dev/null)" || true
  printf '%s' "$who" | grep -qi "account" \
    || die "还没登录 Cloudflare：bash scripts/ops.sh login"
}

# 取 HTTP 状态码。本机 DNS 被过滤/缓存时 curl 会返回 000，但站点其实是好的 ——
# 换公共 DNS 拿 IP 再 --resolve 试一次，别把「解析不了」误报成「站点挂了」。
curl_code() {
  local url="$1" host code ip resolver
  code="$(curl -o /dev/null -s -m 10 -w '%{http_code}' --noproxy '*' "$url" 2>/dev/null || true)"
  [ "$code" != "000" ] && { printf '%s' "$code"; return; }
  command -v dig >/dev/null 2>&1 || { printf '000'; return; }
  host="$(printf '%s' "$url" | sed -E 's#^[a-z]+://([^/:]+).*#\1#')"
  for resolver in "" "@1.1.1.1" "@8.8.8.8"; do
    ip="$(dig +short $resolver "$host" 2>/dev/null | grep -E '^[0-9]+\.' | head -1)"
    [ -n "$ip" ] && break
  done
  [ -n "$ip" ] || { printf '000'; return; }
  local out
  out="$(curl -o /dev/null -s -m 10 -w '%{http_code}' --noproxy '*' \
    --resolve "$host:443:$ip" "$url" 2>/dev/null || true)"
  printf '%s' "${out:-000}"
}

# 列出待同步的键（脱敏：只显示长度）
print_keys() {
  local title="$1"; shift
  local k v n=0
  step "$title"
  for k in "$@"; do
    v="$(config_get "$k")"
    if [ -n "$v" ]; then
      printf '  %-26s %s\n' "+ $k" "<${#v} 字符>"
      n=$((n + 1))
    else
      note "- ${k}（留空，跳过）"
    fi
  done
  [ "$n" -gt 0 ] || die "没有任何可同步的非空配置，检查 $CONFIG_FILE"
}
