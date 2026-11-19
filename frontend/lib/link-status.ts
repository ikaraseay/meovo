/**
 * 友链状态探测 —— 客户端轻量 fetch，超时 = 不可达。
 * ---------------------------------------------------------
 * 静态站没法在构建期探活（D1 不存这个，也不该存），所以交给浏览器：
 * 页面加载后对每个友链发一个 HEAD 请求，5 秒没回就当不可达。
 * 探测结果只影响视觉标记（红点），不阻断跳转。
 */

import { ATTR, CLASS } from './dom-contract'

export interface LinkStatus {
  ok: boolean
}

const TIMEOUT_MS = 5000

/** 用 no-cors 探一次 —— 跨域站也能拿到「到了没有」的信号 */
async function probe(url: string): Promise<boolean> {
  try {
    await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      // 超时由 AbortSignal.timeout 兜住 —— 断开时抛 TimeoutError，catch 里算不可达
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    return true
  } catch {
    return false
  }
}

/** 给页面上所有友链跑一轮探测，结果写进 DOM（红点 / 绿点） */
export async function probeAllLinks(): Promise<void> {
  const rows = document.querySelectorAll<HTMLElement>(`[${ATTR.linkRow}]`)
  if (rows.length === 0) return

  const tasks = [...rows].map(async (row) => {
    const url = row.getAttribute(ATTR.linkUrl)
    const manual = row.getAttribute(ATTR.linkStatus)
    if (!url) return

    // 手动标过状态的尊重手动值
    if (manual === 'ok') {
      row.classList.add(CLASS.linkOk)
      return
    }
    if (manual === 'down') {
      row.classList.add(CLASS.linkDown)
      return
    }

    const ok = await probe(url)
    row.classList.add(ok ? CLASS.linkOk : CLASS.linkDown)
  })

  await Promise.all(tasks)
}
