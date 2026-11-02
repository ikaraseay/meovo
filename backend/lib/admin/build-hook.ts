/**
 * 构建钩子 —— 后台改了内容，敲一下让站点重建。
 * ---------------------------------------------------------
 * 站点是**构建期产物**：后台写的是 D1，页面是构建时从 D1 导出渲染的。
 * 所以内容改完必须触发一次构建，站点才会变。
 *
 * 钩子地址放在 Worker secret `DEPLOY_HOOK_URL`（Cloudflare Workers Builds 给的
 * deploy hook）。没配就返回 false —— 调用方据此告诉作者「内容改了，但构建没触发」。
 */
import { secret } from './db.ts'

/** 敲一下构建钩子；没配或失败都返回 false（不挡住业务本身） */
export async function triggerBuild(): Promise<boolean> {
  const hook = secret('DEPLOY_HOOK_URL')
  if (!hook) return false
  try {
    const response = await fetch(hook, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    })
    return response.ok
  } catch {
    return false
  }
}
