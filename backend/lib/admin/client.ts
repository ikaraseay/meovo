/**
 * 后台前端的共用小工具。
 * ---------------------------------------------------------
 * 接口统一走 api()：错误一律是**代码**，这里按代码查 i18n 词典翻成文案。
 * 页面里不再各写一遍 fetch 与错误处理。
 */

import { hasTranslation, t, type Locale } from '../../../frontend/i18n/index.ts'

export interface ApiError extends Error {
  /** 错误代码 —— 对应词典里的 admin.error.<code> */
  code: string
  /** 校验失败时的逐项错误 */
  errors?: string[]
}

/** 调后台接口；出错就抛带 code 的错误 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: init?.body instanceof FormData ? undefined : { 'content-type': 'application/json' },
    ...init,
  })

  let payload: Record<string, unknown> = {}
  try {
    payload = (await response.json()) as Record<string, unknown>
  } catch {
    payload = {}
  }

  if (!response.ok) {
    const error = new Error(
      typeof payload.error === 'string' ? payload.error : 'request_failed',
    ) as ApiError
    error.code = typeof payload.error === 'string' ? payload.error : 'request_failed'
    if (Array.isArray(payload.errors)) error.errors = payload.errors.map(String)
    throw error
  }

  return payload as T
}

/** 错误代码 → 文案（词典里没有就退回代码本身） */
export function errorText(locale: Locale, code: string): string {
  const key = 'admin.error.' + code
  return hasTranslation(key) ? t(locale, key) : code
}
