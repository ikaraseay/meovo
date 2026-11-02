/**
 * 项目的字段 —— 规范化与校验（纯函数）。
 * ---------------------------------------------------------
 * 与文档字段同一套规矩：错误用**代码**返回，文案在界面那边查 i18n 词典。
 */

export interface ProjectInput {
  name?: unknown
  description?: unknown
  url?: unknown
  sortOrder?: unknown
}

export interface ProjectValues {
  name: string
  description: string
  url: string
  sortOrder: number
}

export type ProjectErrorCode =
  | 'name_required'
  | 'name_too_long'
  | 'description_too_long'
  | 'url_required'
  | 'url_invalid'

export const PROJECT_NAME_MAX = 80
export const PROJECT_DESCRIPTION_MAX = 200

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** 地址只收 http / https（补协议、挡掉 javascript:） */
export function normalizeUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : 'https://' + value
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  return url.toString()
}

export function normalizeProject(input: ProjectInput): {
  ok: boolean
  errors: ProjectErrorCode[]
  value?: ProjectValues
} {
  const errors: ProjectErrorCode[] = []

  const name = text(input.name)
  if (!name) errors.push('name_required')
  else if (name.length > PROJECT_NAME_MAX) errors.push('name_too_long')

  const description = text(input.description)
  if (description.length > PROJECT_DESCRIPTION_MAX) errors.push('description_too_long')

  const rawUrl = text(input.url)
  const url = rawUrl ? normalizeUrl(rawUrl) : null
  if (!rawUrl) errors.push('url_required')
  else if (url === null) errors.push('url_invalid')

  const sortOrder = Number(input.sortOrder ?? 0)
  if (!Number.isFinite(sortOrder) || sortOrder < 0) errors.push('url_invalid')

  if (errors.length > 0) return { ok: false, errors, value: undefined }
  return {
    ok: true,
    errors: [],
    value: {
      name,
      description,
      url: url as string,
      sortOrder: Math.floor(sortOrder),
    },
  }
}
