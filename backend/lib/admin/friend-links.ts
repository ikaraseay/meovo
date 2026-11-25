/**
 * 友链的字段 —— 规范化与校验（纯函数）。
 * ---------------------------------------------------------
 * 与项目同一套规矩：错误用**代码**返回，文案在界面那边查 i18n 词典。
 * 地址只收 http / https —— normalizeUrl 直接复用项目那份。
 */

import { normalizeUrl } from './projects.ts'

export interface FriendLinkInput {
  name?: unknown
  url?: unknown
  avatar?: unknown
  description?: unknown
  sortOrder?: unknown
}

export interface FriendLinkValues {
  name: string
  url: string
  avatar: string
  description: string
  sortOrder: number
}

export type FriendLinkErrorCode =
  | 'name_required'
  | 'name_too_long'
  | 'description_too_long'
  | 'url_required'
  | 'url_invalid'
  | 'avatar_invalid'

export const FRIEND_LINK_NAME_MAX = 80
export const FRIEND_LINK_DESCRIPTION_MAX = 200
export const FRIEND_LINK_AVATAR_MAX = 500

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 校验并规范化一条友链。
 * 头像可留空 —— 留空就退回站点 favicon（前端 LinkAvatar 处理）。
 */
export function normalizeFriendLink(input: FriendLinkInput): {
  ok: boolean
  errors: FriendLinkErrorCode[]
  value?: FriendLinkValues
} {
  const errors: FriendLinkErrorCode[] = []

  const name = text(input.name)
  if (!name) errors.push('name_required')
  else if (name.length > FRIEND_LINK_NAME_MAX) errors.push('name_too_long')

  const description = text(input.description)
  if (description.length > FRIEND_LINK_DESCRIPTION_MAX) errors.push('description_too_long')

  const rawUrl = text(input.url)
  const url = rawUrl ? normalizeUrl(rawUrl) : null
  if (!rawUrl) errors.push('url_required')
  else if (url === null) errors.push('url_invalid')

  const rawAvatar = text(input.avatar)
  const avatar = rawAvatar ? normalizeUrl(rawAvatar) : ''
  if (rawAvatar && (avatar === null || avatar.length > FRIEND_LINK_AVATAR_MAX)) {
    errors.push('avatar_invalid')
  }

  // 排序是内部字段（界面不填），坏了就夹回 0 —— 不为它单开一个错误码
  const rawOrder = Number(input.sortOrder ?? 0)
  const sortOrder = Number.isFinite(rawOrder) ? Math.max(0, Math.floor(rawOrder)) : 0

  if (errors.length > 0) return { ok: false, errors, value: undefined }
  return {
    ok: true,
    errors: [],
    value: {
      name,
      url: url as string,
      avatar: avatar as string,
      description,
      sortOrder,
    },
  }
}
