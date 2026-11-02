/**
 * 用户偏好 —— 明暗模式 + 正文字号 / 行距。
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

export interface Preferences {
  mode: ThemeMode
  /** 正文字号倍率（字符串，直接写进 --ui-prose-scale） */
  proseScale: string
  /** 正文行距（字符串，直接写进 --ui-prose-lh） */
  proseLh: string
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
  scale: 'prose-scale',
  lh: 'prose-lh',
} as const

function defaultStore(): PreferenceStore | null {
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

const isMode = (v: unknown): v is ThemeMode => v === 'light' || v === 'dark'

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

  let proseScale = ''
  let proseLh = ''
  try {
    proseScale = store?.getItem(PREFS_KEYS.scale) ?? ''
    proseLh = store?.getItem(PREFS_KEYS.lh) ?? ''
  } catch {
    // 读不了就用 CSS 默认值
  }

  return { mode, proseScale, proseLh }
}

/** 把偏好落到根元素上（<html> 的 class / dataset / 内联样式） */
/**
 * 把偏好落到根元素上（<html> 的 class / 内联样式）。
 *
 * 明暗只有一个开关：.dark 类 —— CSS 只认它（data-mode 没人读，是死的）。
 */
export function applyPreferences(root: PreferenceRoot, prefs: Preferences): void {
  root.classList.toggle(CLASS.dark, prefs.mode === 'dark')
  if (prefs.proseScale) root.style.setProperty('--ui-prose-scale', prefs.proseScale)
  if (prefs.proseLh) root.style.setProperty('--ui-prose-lh', prefs.proseLh)
}

export function setMode(mode: ThemeMode, store: PreferenceStore | null = defaultStore()): void {
  try {
    store?.setItem(PREFS_KEYS.mode, mode)
  } catch {
    // 存不了就算了 —— 本次会话生效
  }
}

export function setProseScale(scale: string, store: PreferenceStore | null = defaultStore()): void {
  try {
    store?.setItem(PREFS_KEYS.scale, scale)
  } catch {
    // 同上
  }
}

export function setProseLh(lineHeight: string, store: PreferenceStore | null = defaultStore()): void {
  try {
    store?.setItem(PREFS_KEYS.lh, lineHeight)
  } catch {
    // 同上
  }
}
