/* =========================================================
   i18n 核心
   ---------------------------------------------------------
   Astro 是静态站，语言在**构建期**就定了，
   所以 t() 是纯函数，没有响应式那一套。
   ========================================================= */

import { allText, defaultLocale, locales, type Locale, type Translations } from './ui.ts'
import { overrides } from './overrides.ts'

export { locales, defaultLocale }
export type { Locale, TranslationKey } from './ui.ts'

/** 插值参数：条目里的 {name} 会被同名参数替换 */
export type TranslationParams = Record<string, string | number>

/** 默认词典 + 后台改过的文案 */
function withOverrides(base: Translations): Translations {
  const merged: Translations = { ...base }
  for (const [key, value] of Object.entries(overrides)) {
    const current = merged[key]
    merged[key] = {
      zh: value?.zh ?? current?.zh ?? '',
      en: value?.en ?? current?.en ?? '',
    }
  }
  return merged
}

/**
 * 后台改过的文案 —— 构建期由 backend/scripts/export-d1-posts.mjs 写进 overrides.ts。
 *
 * 只存改过的：没被改过的条目不在表里，于是「用默认值」是常态。
 */
const dictionary = withOverrides(allText)

/**
 * 把条目里的 {name} 占位符换成 params 里的值。
 *
 * 没提供对应参数的占位符**原样保留** —— 界面上直接就能看出漏传了什么，
 * 总比悄悄渲染成空字符串好。
 */
function interpolate(text: string, params?: TranslationParams): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder,
  )
}

/**
 * 取一条文案。
 *
 * - 找不到 key → **原样返回 key**（界面上会出现一串键名，这是有意为之：
 *   看得见的缺失比悄悄的空串好定位）
 * - 当前语言缺文案 → 回落到默认语言（中文）
 */
export function t(locale: Locale, key: string, params?: TranslationParams): string {
  const entry = dictionary[key]

  if (!entry) {
    console.warn(`[i18n] 缺少翻译条目：${key}`)
    return key
  }

  const raw = entry[locale] || entry[defaultLocale]

  if (!raw) {
    console.warn(`[i18n] 条目两种语言都为空：${key}`)
    return key
  }

  return interpolate(raw, params)
}

/** 这个键有没有文案 —— 用于「没有就不渲染」的场景 */
export function hasTranslation(key: string): boolean {
  const entry = dictionary[key]
  if (!entry) return false
  return Boolean(entry.zh || entry.en)
}

/**
 * 某个语言在指定界面语言下的名字。
 * 「语言名」和「界面语言」是两回事：英文界面里中文语言名叫 Chinese，
 * 中文界面里也叫「中文」。
 */
export function localeLabel(code: Locale, uiLocale: Locale = code): string {
  return t(uiLocale, code === 'zh' ? 'lang.zh' : 'lang.en')
}

/** 从 URL 路径里认出当前语言；认不出就返回默认语言 */
export function localeFromPath(pathname: string): Locale {
  const first = pathname.split('/').filter(Boolean)[0]
  return (locales as readonly string[]).includes(first) ? (first as Locale) : defaultLocale
}

/**
 * 去掉路径里的语言前缀，剩下的部分（不带前导斜杠）。
 * 切换语言时用它保留当前页面。
 */
export function stripLocalePrefix(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  const rest = (locales as readonly string[]).includes(segments[0]) ? segments.slice(1) : segments
  return rest.join('/')
}
