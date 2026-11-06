#!/usr/bin/env bash
# =============================================================================
# 运维脚本
#
#   bash scripts/ops.sh doctor      体检：哪里没配好，一次列清楚
#   bash scripts/ops.sh status      当前状态（配置 / 线上 / 部署）
#   bash scripts/ops.sh secrets     从 config.env 同步密钥到 Cloudflare
#   bash scripts/ops.sh config      配置的查看 / 修改 / 校验
#   bash scripts/ops.sh env         把 config.env 的后台凭据写进 cloudflare/.dev.vars
#   bash scripts/ops.sh check       本地校验：类型 / 测试 / i18n / seo
#   bash scripts/ops.sh deploy      构建并部署到 Cloudflare Workers
#   bash scripts/ops.sh login       登录 Cloudflare
#   bash scripts/ops.sh logout      登出 Cloudflare
#
# 配置只有 config.env 一处真源（从 config.env.example 复制，不入库）。
# =============================================================================
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() {
  sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit 0
}

# ─────────────────────────────────────────────────────────────────────────────
# 配置：查看 / 修改 / 校验
# ─────────────────────────────────────────────────────────────────────────────
PROBLEMS=0
check_one() {
  local label="$1" value="$2" pattern="$3" hint="$4" sensitive shown
  # 密钥一律不回显，连前几位也不行 —— doctor 输出可能进 CI 日志
  if printf '%s' "$label" | grep -qE 'SECRET|TOKEN|PASSWORD|KEY'; then
    sensitive=1
    shown="<${#value} 字符，已隐藏>"
  else
    sensitive=0
    shown="${value:0:32}"
  fi
  if printf '%s' "$value" | grep -qE "$pattern"; then
    [ "$sensitive" -eq 1 ] && ok "$label 已设置（${#value} 字符）" || ok "$label = $shown"
  else
    [ -n "$value" ] && warn "$label 格式不对（值已隐藏）→ $hint" \
      || warn "$label 未设置 → $hint"
    PROBLEMS=$((PROBLEMS + 1))
  fi
}

config_check() {
  PROBLEMS=0
  check_one "SITE_URL" "${SITE_URL:-}" '^https?://[^[:space:]]+$' '填站点地址'
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

cmd_config() {
  local cmd="${1:-show}"
  shift || true
  case "$cmd" in
    show)
      step "当前配置（${CONFIG_FILE}）"
      if [ -f "$CONFIG_FILE" ]; then
        # 密钥一律不回显 —— 这个输出可能进 CI 日志
        grep -vE '^\s*#|^\s*$' "$CONFIG_FILE" \
          | sed -E 's/^([A-Z0-9_]*(SECRET|TOKEN|PASSWORD|KEY)[A-Z0-9_]*)=.*/\1=***/' \
          | sed 's/^/  /'
      else
        warn "还没有配置：cp config.env.example config.env"
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
      ok "$key 已更新"
      # 有些值在代码里也有一份 —— 改一处，另两处跟着走
      if [ "$key" = "D1_DATABASE_ID" ]; then
        awk -v v="$value" '{ if ($0 ~ /"database_id":/) sub(/"database_id": *"[^"]*"/, "\"database_id\": \"" v "\""); print }' "$WRANGLER_CONFIG" > "$WRANGLER_CONFIG.tmp" && mv "$WRANGLER_CONFIG.tmp" "$WRANGLER_CONFIG"
        ok "已同步到 cloudflare/wrangler.jsonc"
      fi
      if [ "$key" = "SITE_URL" ]; then
        awk -v v="$value" '{ if ($0 ~ /^  site:/) sub(/site: *'"'"'[^'"'"']*'"'"'/, "site: '"'"'" v "'"'"'"); print }' "$ASTRO_CONFIG" > "$ASTRO_CONFIG.tmp" && mv "$ASTRO_CONFIG.tmp" "$ASTRO_CONFIG"
        ok "已同步到 astro.config.mjs"
        # 自定义域名也在 wrangler.jsonc 里 —— 改域名时两边都要跟上
        host="$(printf '%s' "$value" | sed -e 's|^https\?://||' -e 's|/.*$||')"
        if [ -n "$host" ]; then
          awk -v v="$host" '{ if ($0 ~ /"pattern":/) sub(/"pattern": *"[^"]*"/, "\"pattern\": \"" v "\""); print }' "$WRANGLER_CONFIG" > "$WRANGLER_CONFIG.tmp" && mv "$WRANGLER_CONFIG.tmp" "$WRANGLER_CONFIG"
          ok "已同步到 cloudflare/wrangler.jsonc 的 routes"
        fi
      fi
      note "改完记得：bash scripts/ops.sh secrets && bash scripts/ops.sh deploy"
      ;;
    unset)
      local key="${1:-}"
      [ -n "$key" ] || die "用法：ops.sh config unset KEY"
      load_config
      config_unset "$key"
      ok "$key 已删除"
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
      die "未知命令：${cmd}（可用 show / get / set / unset / edit / check）"
      ;;
  esac
}

# ─────────────────────────────────────────────────────────────────────────────
# 密钥同步
# ─────────────────────────────────────────────────────────────────────────────
cmd_secrets() {
  bash "$SCRIPTS_DIR/cf-secrets.sh" "$@"
}

# ─────────────────────────────────────────────────────────────────────────────
# 本地开发凭据
# ─────────────────────────────────────────────────────────────────────────────
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
  note "线上用：bash scripts/ops.sh secrets"
}

# ─────────────────────────────────────────────────────────────────────────────
# 本地校验
# ─────────────────────────────────────────────────────────────────────────────
cmd_check() {
  step "类型检查"
  (cd "$PROJECT_ROOT" && pnpm check 2>&1 | tail -5 | sed 's/^/  /')
  step "单元测试"
  (cd "$PROJECT_ROOT" && pnpm test 2>&1 | tail -5 | sed 's/^/  /')
  step "i18n 检查"
  (cd "$PROJECT_ROOT" && pnpm check:i18n 2>&1 | tail -5 | sed 's/^/  /')
  step "SEO 检查"
  (cd "$PROJECT_ROOT" && pnpm check:seo 2>&1 | tail -5 | sed 's/^/  /')
  ok "本地校验全部通过"
}

# ─────────────────────────────────────────────────────────────────────────────
# 构建与部署
# ─────────────────────────────────────────────────────────────────────────────
cmd_deploy() {
  load_config
  local host
  host="$(site_host)"
  step "准备部署"
  note "站点：${SITE_URL:-未配置}"
  note "Worker：${WORKER_NAME:-未配置}"
  ask_yes_no "确认构建并部署到 Cloudflare？" || { note "已取消"; exit 0; }
  step "构建"
  (cd "$PROJECT_ROOT" && pnpm build 2>&1 | tail -10 | sed 's/^/  /')
  step "部署"
  (cd "$PROJECT_ROOT" && pnpm run deploy 2>&1 | tail -10 | sed 's/^/  /')
  step "验证"
  if [ -n "$host" ]; then
    local code
    code="$(curl_code "https://$host/")"
    case "$code" in
      2*|3*) ok "https://$host/ → $code" ;;
      *) warn "https://$host/ → ${code}（证书刚签发时可能要等几分钟）" ;;
    esac
  else
    warn "没配置 SITE_URL，跳过验证"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# 登录 / 登出
# ─────────────────────────────────────────────────────────────────────────────
cmd_login() {
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

# ─────────────────────────────────────────────────────────────────────────────
# 状态
# ─────────────────────────────────────────────────────────────────────────────
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

# ─────────────────────────────────────────────────────────────────────────────
# 体检
# ─────────────────────────────────────────────────────────────────────────────
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

  # D1 的 id 有两份（config.env 与 wrangler.jsonc）—— 对不上会导出到别的库去
  local in_config in_wrangler
  in_config="${D1_DATABASE_ID:-}"
  in_wrangler="$(sed -n 's/.*"database_id": *"\([^"]*\)".*/\1/p' "$WRANGLER_CONFIG" | head -1)"
  if [ -z "$in_wrangler" ]; then
    mark_warn "wrangler.jsonc 里读不到 database_id"
  elif [ "$in_config" != "$in_wrangler" ]; then
    mark_fail "D1 id 两处不一致：config.env=$in_config / wrangler.jsonc=$in_wrangler"
  else
    mark_ok "D1 id 与 wrangler.jsonc 一致"
  fi

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
      mark_fail "$name 没设置：bash scripts/ops.sh secrets"
    fi
  done
  if printf '%s' "$secrets" | grep -q DEPLOY_HOOK_URL; then
    mark_ok "DEPLOY_HOOK_URL 已设置（后台改完内容会触发构建）"
  else
    mark_warn "DEPLOY_HOOK_URL 没设置：后台发布 / 改稿不会触发构建"
  fi

  step "站点"
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
  ok "体检通过"
}

# ─────────────────────────────────────────────────────────────────────────────
# 入口
# ─────────────────────────────────────────────────────────────────────────────
case "${1:-doctor}" in
  doctor)  cmd_doctor ;;
  status)  cmd_status ;;
  secrets) shift; cmd_secrets "$@" ;;
  config)  shift; cmd_config "$@" ;;
  env)     cmd_env ;;
  check)   cmd_check ;;
  deploy)  cmd_deploy ;;
  login)   cmd_login ;;
  logout)  cmd_logout ;;
  -h|--help) usage ;;
  *)       die "未知命令：$1（可用 doctor / status / secrets / config / env / check / deploy / login / logout）" ;;
esac
