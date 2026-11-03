/**
 * 悬浮栏的「用户可摆放状态」—— 栏体、设置按钮、设置弹窗、抽屉的几何位置。
 *
 * 这些位置是用户自己摆出来的，属于用户：跨页面、跨刷新都得还在。
 * 站点是静态输出且没开 view transitions，站内跳转就是整页加载 ——
 * 组件脚本里的模块级变量活不过一次跳转，状态必须落在 store 里。
 *
 * 序列化 / 版本 / 清洗都在 persist 内核里，这里只管这几块几何的形状。
 */

import { createStore, type StorageLike, type Store } from './persist.ts'

const KEY = 'floating-bar-state'

/** 落盘格式版本 —— 旧格式没有信封，migrate 负责接 */
const VERSION = 1

export type FloatingBarState = {
  /**
   * 栏体：视口里的相对位置（比例 0~1）——
   * 记比例而不是像素：分辨率变了栏体跟着走，用户摆的相对位置不丢。
   * 用户没摆过时这块不存在 —— 用默认的顶部居中，那个不落盘、每次重算。
   */
  menu?: { fx: number; fy: number }
  /** 设置悬浮按钮：距右、距下 */
  fab?: { right: number; bottom: number }
  /** 设置弹窗：左上角坐标 */
  popup?: { x: number; y: number }
  /** 移动端抽屉 */
  drawer?: { height: number; expanded: boolean }
}

/** 兼容旧签名 —— 测试塞假对象即可 */
export type StateStore = StorageLike

/** 视口尺寸 —— 换算旧格式的绝对像素要用 */
export type Viewport = { width: number; height: number }

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

/** 当前视口 —— 浏览器里有；Node（测试）里没有就是 0 */
function currentViewport(): Viewport {
  const g = globalThis as { innerWidth?: number; innerHeight?: number }
  return { width: g.innerWidth ?? 0, height: g.innerHeight ?? 0 }
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** 坏值只丢自己那一块，别连累别的 */
function clean(value: unknown, vp: Viewport): FloatingBarState {
  if (!value || typeof value !== 'object') return {}
  const o = value as Record<string, unknown>
  const state: FloatingBarState = {}

  const menu = o.menu as { fx?: unknown; fy?: unknown; x?: unknown; y?: unknown } | undefined
  if (menu) {
    if (finite(menu.fx) && finite(menu.fy)) {
      state.menu = { fx: menu.fx, fy: menu.fy }
    } else if (finite(menu.x) && finite(menu.y) && vp.width > 0 && vp.height > 0) {
      // 旧格式是绝对像素 —— 按当前视口换算成比例：升级那一刻位置不跳，之后跟着分辨率走
      state.menu = { fx: menu.x / vp.width, fy: menu.y / vp.height }
    }
  }

  const fab = o.fab as { right?: unknown; bottom?: unknown } | undefined
  if (fab && finite(fab.right) && finite(fab.bottom)) state.fab = { right: fab.right, bottom: fab.bottom }

  const popup = o.popup as { x?: unknown; y?: unknown } | undefined
  if (popup && finite(popup.x) && finite(popup.y)) state.popup = { x: popup.x, y: popup.y }

  const drawer = o.drawer as { height?: unknown; expanded?: unknown } | undefined
  if (drawer && finite(drawer.height) && typeof drawer.expanded === 'boolean') {
    state.drawer = { height: drawer.height, expanded: drawer.expanded }
  }

  return state
}

/** 旧格式是平铺的几何、没有信封 —— 搬过来，用户摆的位置不丢 */
function migrate(legacy: unknown, vp: Viewport): FloatingBarState | null {
  if (!legacy || typeof legacy !== 'object') return null
  const o = legacy as Record<string, unknown>
  // 带信封的说明是别的版本 —— 认不出来就当没有
  if ('version' in o || 'data' in o) return null
  return clean(o, vp)
}

function barStore(storage: StorageLike | null, vp: Viewport): Store<FloatingBarState> {
  return createStore<FloatingBarState>({
    key: KEY,
    version: VERSION,
    clean: (value) => clean(value, vp),
    migrate: (legacy) => migrate(legacy, vp),
    storage,
  })
}

/** 读整份状态 —— 存的是坏 JSON 就当没有 */
export function readFloatingBarState(
  store: StateStore | null = defaultStorage(),
  vp: Viewport = currentViewport(),
): FloatingBarState {
  return barStore(store, vp).read()
}

/** 按块合并写入 —— 只写栏体不会把设置按钮的位置抹掉 */
export function saveFloatingBarState(
  patch: FloatingBarState,
  store: StateStore | null = defaultStorage(),
): void {
  barStore(store, currentViewport()).save(patch)
}

/**
 * 删掉一块 —— 设置弹窗靠它回到自动落点：摆过了就存着位置，没摆过（这一块不存在）就用自动落点。
 */
export function removeFloatingBarState(
  key: keyof FloatingBarState,
  store: StateStore | null = defaultStorage(),
): void {
  barStore(store, currentViewport()).remove(key)
}

/** 全清 —— 「重置布局」用：悬浮栏的所有摆放都回到默认 */
export function clearFloatingBarState(store: StateStore | null = defaultStorage()): void {
  barStore(store, currentViewport()).clear()
}
