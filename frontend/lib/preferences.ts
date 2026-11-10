/**
 * 用户偏好 —— 明暗模式 + 全站字号 / 行距 + 对比度 + 无障碍。
 * ---------------------------------------------------------
 * 读写 localStorage、把值落到 <html> 上，都收在这里；调用方不用知道 key。
 *
 * 首屏内联脚本（BaseLayout）不能 import 模块，仍自己读一遍 —— 但 key 的**唯一主人**
 * 是这里的 PREFS_KEYS，内联脚本只是同步 preboot 的副本（见候选 #5）。
 */

import { CLASS } from './dom-contract.ts'

export type ThemeMode = 'light' | 'dark'

/** 用户选的模式 —— 没选（默认）就是跟着系统 */
export type ModeChoice = ThemeMode | 'system'

/** 对比度档：标准 / 高对比 */
export type ContrastChoice = 'standard' | 'high'
/** 链接下划线：默认（只有正文带）/ 始终显示 */
export type LinksChoice = 'auto' | 'always'
/** 点击目标：标准 / 加大 */
export type TargetsChoice = 'normal' | 'large'
/** 焦点环：默认 / 强化 */
export type FocusChoice = 'auto' | 'strong'
/** 折叠阅读层级：全文 / 简述（作者原句）/ 要点（AI 的话） */
export type FoldLevel = 'full' | 'brief' | 'key'

export interface Preferences {
  mode: ThemeMode
  /** 全站字号倍率（字符串，直接写进 --ui-root-scale；空 = 用 CSS 默认） */
  rootScale: string
  /** 正文行距（字符串，直接写进 --ui-prose-lh） */
  proseLh: string
  contrast: ContrastChoice
  links: LinksChoice
  targets: TargetsChoice
  focus: FocusChoice
}

/** 最小存储接口 —— 测试里塞假对象即可 */
export interface PreferenceStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem?(key: string): void
}

/** 能落偏好的根元素（真实是 <html>，测试里是假对象） */
export interface PreferenceRoot {
  classList: { toggle(name: string, force?: boolean): void }
  style: { setProperty(name: string, value: string): void }
}

export const PREFS_KEYS = {
  mode: 'theme-mode',
  /** 旧的「正文字号」key —— 只读，兜底迁到 rootScale */
  legacyScale: 'prose-scale',
  /** 全站相对字号 */
  rootScale: 'root-scale',
  proseLh: 'prose-lh',
  contrast: 'contrast',
  links: 'links',
  targets: 'targets',
  focus: 'focus',
  /** 折叠阅读层级 */
  foldLevel: 'text-fold-level',
} as const

/** 可写的偏好 key —— legacyScale 只读（迁移用），不往外开 */
export type PrefKey = Exclude<keyof typeof PREFS_KEYS, 'legacyScale'>

/**
 * 偏好落到 <html> 上的 class 名 —— 首屏内联脚本不能 import 模块，
 * 这张表由 BaseLayout 用 define:vars 注入进去。
 */
export const PREF_CLASSES = {
  contrastHigh: CLASS.contrastHigh,
  linksAlways: CLASS.linksAlways,
  targetsLarge: CLASS.targetsLarge,
  focusStrong: CLASS.focusStrong,
} as const

function defaultStore(): PreferenceStore | null {
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

const isMode = (v: unknown): v is ThemeMode => v === 'light' || v === 'dark'
const isContrast = (v: unknown): v is ContrastChoice => v === 'standard' || v === 'high'
const isLinks = (v: unknown): v is LinksChoice => v === 'auto' || v === 'always'
const isTargets = (v: unknown): v is TargetsChoice => v === 'normal' || v === 'large'
const isFocus = (v: unknown): v is FocusChoice => v === 'auto' || v === 'strong'
const isFoldLevel = (v: unknown): v is FoldLevel => v === 'full' || v === 'brief' || v === 'key'

/** 系统偏好 —— 没有存过 mode 时用 */
function systemPrefersDark(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

/** 存着的模式选择 —— 没存或存的不是 light/dark 就是「跟随系统」 */
export function readModeChoice(store: PreferenceStore | null = defaultStore()): ModeChoice {
  try {
    const stored = store?.getItem(PREFS_KEYS.mode)
    return isMode(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

/** 回到「跟随系统」—— 把存的值删掉，首屏脚本自然就跟系统了 */
export function clearMode(store: PreferenceStore | null = defaultStore()): void {
  try {
    store?.removeItem?.(PREFS_KEYS.mode)
  } catch {
    // 存不了就算了 —— 本次会话已经切回去了
  }
}

/** 折叠阅读层级 —— 没存过或坏值一律「全文」，折叠是读者主动选的 */
export function readFoldLevel(store: PreferenceStore | null = defaultStore()): FoldLevel {
  try {
    const stored = store?.getItem(PREFS_KEYS.foldLevel)
    // 旧档位（两句 / 一句）改过名 —— 读者选过的档位别丢
    if (stored === 'two') return 'brief'
    if (stored === 'one') return 'key'
    return isFoldLevel(stored) ? stored : 'full'
  } catch {
    return 'full'
  }
}

/** 读出当前偏好；坏值/不可用一律退回安全默认 */
export function readPreferences(store: PreferenceStore | null = defaultStore()): Preferences {
  let mode: ThemeMode = 'light'
  try {
    const stored = store?.getItem(PREFS_KEYS.mode)
    if (isMode(stored)) mode = stored
    else mode = systemPrefersDark() ? 'dark' : 'light'
  } catch {
    // 存不了（隐私模式等）—— 跟随系统，跟首屏脚本一个口径
    mode = systemPrefersDark() ? 'dark' : 'light'
  }

  let rootScale = ''
  let proseLh = ''
  let contrast: ContrastChoice = 'standard'
  let links: LinksChoice = 'auto'
  let targets: TargetsChoice = 'normal'
  let focus: FocusChoice = 'auto'
  try {
    // 旧的「正文字号」只作兜底 —— 新的相对字号优先
    rootScale =
      store?.getItem(PREFS_KEYS.rootScale) || store?.getItem(PREFS_KEYS.legacyScale) || ''
    proseLh = store?.getItem(PREFS_KEYS.proseLh) ?? ''
    const c = store?.getItem(PREFS_KEYS.contrast)
    if (isContrast(c)) contrast = c
    const l = store?.getItem(PREFS_KEYS.links)
    if (isLinks(l)) links = l
    const t = store?.getItem(PREFS_KEYS.targets)
    if (isTargets(t)) targets = t
    const f = store?.getItem(PREFS_KEYS.focus)
    if (isFocus(f)) focus = f
  } catch {
    // 读不了就用 CSS 默认值
  }

  return { mode, rootScale, proseLh, contrast, links, targets, focus }
}

/**
 * 把偏好落到根元素上（<html> 的 class / 内联样式）。
 *
 * 明暗只有一个开关：.dark 类 —— CSS 只认它（data-mode 没人读，是死的）。
 * 其余偏好也是「有/无」用 class、「多少」用 CSS 变量。
 */
export function applyPreferences(root: PreferenceRoot, prefs: Preferences): void {
  root.classList.toggle(CLASS.dark, prefs.mode === 'dark')
  root.classList.toggle(CLASS.contrastHigh, prefs.contrast === 'high')
  root.classList.toggle(CLASS.linksAlways, prefs.links === 'always')
  root.classList.toggle(CLASS.targetsLarge, prefs.targets === 'large')
  root.classList.toggle(CLASS.focusStrong, prefs.focus === 'strong')
  if (prefs.rootScale) root.style.setProperty('--ui-root-scale', prefs.rootScale)
  if (prefs.proseLh) root.style.setProperty('--ui-prose-lh', prefs.proseLh)
}

/** 写一条偏好 —— key 只有 PREFS_KEYS 一个主人 */
export function setPref(
  key: PrefKey,
  value: string,
  store: PreferenceStore | null = defaultStore(),
): void {
  try {
    store?.setItem(PREFS_KEYS[key], value)
  } catch {
    // 存不了就算了 —— 本次会话生效
  }
}
