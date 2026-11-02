/**
 * 玻璃部件的「用户摆放位置」—— 按 id 存**百分比**坐标。
 *
 * 为什么是百分比：用户拖完卡片后若改变浏览器窗口大小，像素坐标会漂移 / 出界；
 * 存成百分比就能按新尺寸等比还原。
 *
 * 参考基准：
 *   · 未固定卡片：xPct 相对桌面宽度、yPct 相对桌面高度。
 *   · 固定卡片（pin）：xPct / yPct 相对**视口**宽高。
 *
 * pinned：卡片是否固定（position: fixed、跟随视口滚动）。
 *
 * 序列化 / 版本 / 清洗都在 persist 内核里，这里只管这份数据的形状。
 */

import { createStore, type StorageLike, type Store } from './persist.ts'

const KEY = 'widget-state'

/** 落盘格式版本 —— 改了坐标格式 / 默认算法后 +1 */
const VERSION = 4

/** 旧版本（v3）的信封：{ version: 3, widgets: {...} } */
const LEGACY_VERSION = 3

export interface WidgetPosition {
  /** 横向百分比（0-100，可略超界） */
  xPct: number
  /** 纵向百分比（0-100，可略超界） */
  yPct: number
  /** 是否固定 */
  pinned?: boolean
}

export type WidgetPositions = Record<string, WidgetPosition>

/** 兼容旧签名 —— 测试塞假对象即可 */
export type WidgetStateStore = StorageLike

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** 坏值只丢自己那一个部件，别连累别的 */
function clean(value: unknown): WidgetPositions {
  if (!value || typeof value !== 'object') return {}
  const out: WidgetPositions = {}
  for (const [id, pos] of Object.entries(value as Record<string, unknown>)) {
    const p = pos as { xPct?: unknown; yPct?: unknown; pinned?: unknown } | undefined
    if (p && finite(p.xPct) && finite(p.yPct)) {
      out[id] = { xPct: p.xPct, yPct: p.yPct, pinned: p.pinned === true }
    }
  }
  return out
}

/** v3 → v4：把 { version: 3, widgets } 里的 widgets 搬过来，用户摆的位置不丢 */
function migrate(legacy: unknown): WidgetPositions | null {
  if (!legacy || typeof legacy !== 'object') return null
  const o = legacy as { version?: unknown; widgets?: unknown }
  if (o.version !== LEGACY_VERSION) return null
  if (!o.widgets || typeof o.widgets !== 'object') return null
  return clean(o.widgets)
}

function widgetStore(storage: StorageLike | null): Store<WidgetPositions> {
  return createStore<WidgetPositions>({
    key: KEY,
    version: VERSION,
    clean,
    migrate,
    storage,
  })
}

export function readWidgetPositions(
  store: WidgetStateStore | null = defaultStorage(),
): WidgetPositions {
  return widgetStore(store).read()
}

/** 按 id 合并写入 —— 只写一个部件，不会把别的部件位置抹掉 */
export function saveWidgetPosition(
  id: string,
  pos: WidgetPosition,
  store: WidgetStateStore | null = defaultStorage(),
): void {
  widgetStore(store).save({ [id]: pos })
}

/** 清空全部部件位置（「重置布局」用） */
export function clearWidgetPositions(store: WidgetStateStore | null = defaultStorage()): void {
  widgetStore(store).clear()
}

/** 删除单个部件的存档位置（卡片上的「复原」按钮用） */
export function removeWidgetPosition(
  id: string,
  store: WidgetStateStore | null = defaultStorage(),
): void {
  widgetStore(store).remove(id)
}
