/**
 * D1 查询 —— 三条路，输出形状一样（数组 of 行）。
 * ---------------------------------------------------------
 *   远端 + token ：Cloudflare REST API（CI 那样，secret 注入）
 *   远端无 token ：借 wrangler 的登录态（本机 `wrangler login` 过就能用）
 *   本地         ：wrangler 的 --local（开发与演练）
 *
 * 库名与 id 都取自 cloudflare/wrangler.jsonc —— 换库不用改脚本。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** wrangler.jsonc 里的 d1_databases —— 库名与 id */
export function readD1Config(wranglerConfig) {
  try {
    const config = readFileSync(wranglerConfig, 'utf8')
    return {
      id: config.match(/"database_id"\s*:\s*"([^"]+)"/)?.[1] ?? '',
      name: config.match(/"database_name"\s*:\s*"([^"]+)"/)?.[1] ?? '',
      binding: config.match(/"binding"\s*:\s*"([^"]+)"/)?.[1] ?? '',
    }
  } catch {
    return { id: '', name: '', binding: '' }
  }
}

/** wrangler 的 JSON 输出 —— 形状：[ { results, success } ] */
function runWrangler(root, wranglerConfig, args) {
  const output = execFileSync(
    join(root, 'node_modules/.bin/wrangler'),
    ['d1', 'execute', ...args, '--json', '--config', wranglerConfig],
    { encoding: 'utf8', cwd: root },
  )
  const payload = JSON.parse(output)
  if (!payload[0]?.success) throw new Error('D1 查询失败：' + output)
  return payload[0].results ?? []
}

/** 本地 D1 */
function queryLocal(root, wranglerConfig, name, sql) {
  return runWrangler(root, wranglerConfig, [name, '--local', '--command', sql])
}

/** 远端 D1 —— 借 wrangler 的登录态 */
function queryRemote(root, wranglerConfig, name, sql) {
  return runWrangler(root, wranglerConfig, [name, '--remote', '--command', sql])
}

/** 远端 D1 —— REST（CI：有 token 更快，也不用装 wrangler） */
async function queryRest({ accountId, databaseId, token }, sql) {
  const url =
    'https://api.cloudflare.com/client/v4/accounts/' +
    accountId +
    '/d1/database/' +
    databaseId +
    '/query'
  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ sql }),
  })
  if (!response.ok) {
    throw new Error('D1 查询失败：' + response.status + ' ' + (await response.text()))
  }
  const payload = await response.json()
  if (!payload.success) {
    throw new Error('D1 查询失败：' + JSON.stringify(payload.errors ?? payload))
  }
  return payload.result?.[0]?.results ?? []
}

/**
 * 建一个查询函数。
 * @param {{root: string, wranglerConfig: string, useLocal?: boolean, token?: string, accountId?: string, databaseId?: string}} options
 */
export function createQuery(options) {
  const { root, wranglerConfig, useLocal = false, token, accountId, databaseId } = options
  const name = readD1Config(wranglerConfig).name || 'meovo-content'
  return async function query(sql) {
    if (useLocal) return queryLocal(root, wranglerConfig, name, sql)
    if (!token || !accountId) return queryRemote(root, wranglerConfig, name, sql)
    return queryRest({ accountId, databaseId, token }, sql)
  }
}
