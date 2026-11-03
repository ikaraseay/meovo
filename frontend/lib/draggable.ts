/**
 * 玻璃桌面引擎 —— 把 .ui-widget 摆成可拖拽的自由布局。
 * ---------------------------------------------------------
 * 三种默认布局：
 *   · 散开模式（data-desk）：间隔宽松的瀑布流，顶部预留 10% 给悬浮栏。
 *   · 内容锚定模式（data-desk-flow + [data-desk-content]）：正文留在文档流、
 *     卡片绝对定位在正文四周（top/side/tail），拖卡片不影响正文。
 *   · 流动模式（data-desk-flow 无 content）：卡片留在文档流，拖一下才抬起来。
 *
 * 固定（pin）：点右上角图钉 → 卡片变 position: fixed，跟随视口滚动；
 *   再点取消，回到绝对定位。适合思维导图 / 目录这类想一直看到的卡片。
 * 拖拽期间统一用 fixed（视口坐标），卡片永远贴着鼠标，松手再换算回所属坐标系。
 */

import {
  readWidgetPositions,
  saveWidgetPosition,
  clearWidgetPositions,
  removeWidgetPosition,
} from './widget-state'
import { beginDrag } from './drag'
import { DESKTOP_MQ } from './breakpoint'
import { ATTR, CLASS, Z } from './dom-contract'
import {
  clampToDesk,
  clampToViewport,
  contentAnchoredLayout,
  fromPct,
  restoreFromPct,
  scatterLayout,
  toPct,
  DESK_GAP_Y,
  type DeskCard,
  type Position,
} from './desk-layout'

/** 卡片互相叠的层序上限 —— 必须低于悬浮栏（Z.nav），否则卡片会盖住导航 */
const Z_MAX = Z.widget

interface Entry {
  el: HTMLElement
  id: string
  x: number
  y: number
  w: number
  h: number
  /** 默认落位的倾斜 —— 拖拽时撤下，放下复原 */
  baseTilt?: number
  pinned: boolean
}

/** 页面上的一个玻璃桌面 —— 「重置布局」靠它把卡片摆回默认落位 */
export interface DeskController {
  reset(): void
}

export function initDesk(desk: HTMLElement): DeskController | null {
  const widgets = [...desk.querySelectorAll<HTMLElement>(`[${ATTR.widget}]`)].filter(
    (el) => el.getAttribute(ATTR.widget),
  )
  if (widgets.length === 0) return null

  const mq = window.matchMedia(DESKTOP_MQ)
  const flow = desk.hasAttribute(ATTR.deskFlow)
  const contentEl = flow ? desk.querySelector<HTMLElement>(`[${ATTR.deskContent}]`) : null
  let saved = readWidgetPositions()

  const entries: Entry[] = widgets.map((el) => ({
    el,
    id: el.getAttribute(ATTR.widget)!,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    pinned: false,
  }))

  let zCounter = 0
  /** 上一次布局用的参考尺寸 —— 存档百分比按它换算，读 / 写必须用同一套基准 */
  let refW = 0
  let refH = 0
  const topOffset = () => Math.round(window.innerHeight * 0.1)

  function raise(el: HTMLElement) {
    zCounter += 1
    if (zCounter >= Z_MAX) {
      const ordered = [...entries].sort(
        (a, b) => parseInt(a.el.style.zIndex || '0', 10) - parseInt(b.el.style.zIndex || '0', 10),
      )
      ordered.forEach((entry, i) => {
        entry.el.style.zIndex = String(i + 1)
      })
      zCounter = ordered.length
    }
    el.style.zIndex = String(zCounter)
  }

  function measure() {
    for (const entry of entries) {
      // 隐藏的卡片量不到尺寸（归档页搜索时桌面整块收起）——
      // 量成 0 的话，恢复显示时卡片就成了一条线
      if (entry.el.getClientRects().length === 0) continue
      entry.w = entry.el.offsetWidth
      entry.h = entry.el.offsetHeight
    }
  }

  function placeAbsolute(entry: Entry) {
    const el = entry.el
    el.style.position = 'absolute'
    el.style.width = `${entry.w}px`
    el.style.left = `${entry.x}px`
    el.style.top = `${entry.y}px`
    const tilted = Boolean(entry.baseTilt) && !entry.pinned
    el.classList.toggle(CLASS.tilted, tilted)
    if (tilted) el.style.setProperty('--ui-widget-tilt', `${entry.baseTilt}deg`)
    else el.style.removeProperty('--ui-widget-tilt')
  }

  /** 固定卡片：position: fixed，跟随视口 */
  function placePinned(entry: Entry) {
    const el = entry.el
    el.style.position = 'fixed'
    el.style.width = `${entry.w}px`
    el.style.left = `${entry.x}px`
    el.style.top = `${entry.y}px`
    el.classList.remove(CLASS.tilted)
    el.style.removeProperty('--ui-widget-tilt')
  }

  function placeFlow(entry: Entry) {
    const el = entry.el
    el.style.position = ''
    el.style.width = ''
    el.style.left = ''
    el.style.top = ''
    el.classList.remove(CLASS.tilted)
    el.style.removeProperty('--ui-widget-tilt')
  }

  /**
   * 摆位：先按默认布局排，再让存档覆盖。
   * 顺序反了的话，用户拖过的位置会被默认落位抹掉 —— 两种布局都走这里，别再各写一遍。
   */
  function placeEntries(layout: Map<string, Position>) {
    for (const entry of entries) {
      const pos = layout.get(entry.id)
      if (!pos) continue
      // 倾斜是默认落位的一部分：固定卡也记着，取消固定就恢复散乱的样子
      entry.baseTilt = pos.tilt
      if (entry.pinned) continue
      entry.x = pos.x
      entry.y = pos.y
      entry.w = pos.width
    }
    applySavedPositions(refW, refH)
  }

  /** 给未固定卡片套用存档（百分比 → 像素，基准是桌面宽高） */
  function applySavedPositions(refW: number, refH: number) {
    for (const entry of entries) {
      if (entry.pinned) continue
      const pos = saved[entry.id]
      if (!pos || pos.pinned) continue
      const p = restoreFromPct(pos, { width: entry.w, height: entry.h }, { width: refW, height: refH })
      entry.x = p.x
      entry.y = p.y
    }
  }

  /* ---------- 散开：布局数学在 lib/desk-layout.ts ---------- */
  function layoutScatter() {
    const deskW = desk.clientWidth
    const cards: DeskCard[] = entries.map((e) => ({
      id: e.id,
      width: e.w,
      height: e.h,
      full: e.el.hasAttribute(ATTR.widgetFull),
      pinned: e.pinned,
    }))
    const { positions, refHeight } = scatterLayout(cards, {
      deskWidth: deskW,
      viewportHeight: window.innerHeight,
      topOffset: topOffset(),
    })

    refW = deskW
    refH = refHeight

    placeEntries(positions)

    for (const entry of entries) {
      if (entry.pinned) continue
      const p = clampToDesk(
        { x: entry.x, y: entry.y },
        { width: entry.w, height: entry.h },
        { width: refW, height: refH },
      )
      entry.x = p.x
      entry.y = p.y
      placeAbsolute(entry)
    }
    desk.style.minHeight = `${refH}px`
  }

  /* ---------- 内容锚定：布局数学在 lib/desk-layout.ts ---------- */
  function layoutContentAnchored(content: HTMLElement) {
    const deskW = desk.clientWidth
    const cards: DeskCard[] = entries.map((e) => ({
      id: e.id,
      width: e.w,
      height: e.h,
      zone: (e.el.getAttribute(ATTR.zone) || 'top') as 'top' | 'side' | 'tail',
      pinned: e.pinned,
    }))
    const result = contentAnchoredLayout(cards, {
      deskWidth: deskW,
      topOffset: topOffset(),
      contentWidth: content.offsetWidth,
      contentHeight: content.offsetHeight,
    })

    content.style.marginTop = `${result.contentMarginTop}px`
    refW = deskW
    refH = result.minHeight

    placeEntries(result.positions)

    for (const entry of entries) {
      if (entry.pinned) continue
      placeAbsolute(entry)
    }
    desk.style.minHeight = `${result.minHeight}px`
  }

  /* ---------- 流动（无正文）：默认留在文档流 ---------- */
  function layoutFlowLift() {
    refW = desk.clientWidth
    refH = Math.max(desk.clientHeight, window.innerHeight - 120)
    for (const entry of entries) {
      if (entry.pinned) continue
      const pos = saved[entry.id]
      if (pos && !pos.pinned) {
        const p = restoreFromPct(pos, { width: entry.w, height: entry.h }, { width: refW, height: refH })
        entry.x = p.x
        entry.y = p.y
        placeAbsolute(entry)
      } else {
        placeFlow(entry)
      }
    }
    desk.style.minHeight = ''
  }

  /** 把固定卡片摆成 fixed（存档是视口百分比） */
  function syncPinned() {
    for (const entry of entries) {
      if (!entry.pinned) continue
      const pos = saved[entry.id]
      if (pos && pos.pinned) {
        const p = clampToViewport(
          { x: fromPct(pos.xPct, window.innerWidth), y: fromPct(pos.yPct, window.innerHeight) },
          { width: entry.w, height: entry.h },
          { width: window.innerWidth, height: window.innerHeight },
        )
        entry.x = p.x
        entry.y = p.y
      }
      placePinned(entry)
    }
  }

  /** 恢复固定状态 + 同步图钉视觉（跨页面导航后图钉不能消失） */
  function syncPinnedState() {
    for (const entry of entries) {
      entry.pinned = Boolean(saved[entry.id]?.pinned)
      entry.el.classList.toggle(CLASS.pinned, entry.pinned)
      entry.el
        .querySelector<HTMLElement>(`[${ATTR.widgetPin}]`)
        ?.setAttribute('aria-pressed', String(entry.pinned))
    }
  }

  /** 首次进入（没有存档）时，把 data-default-pin 的卡片默认固定到视口右上 */
  function applyDefaultPins() {
    let top = topOffset()
    for (const entry of entries) {
      if (!entry.el.hasAttribute(ATTR.defaultPin)) continue
      if (saved[entry.id]) continue // 已有存档（用户 pin/拖过），尊重用户
      entry.pinned = true
      const p = clampToViewport(
        { x: window.innerWidth - entry.w - 16, y: top },
        { width: entry.w, height: entry.h },
        { width: window.innerWidth, height: window.innerHeight },
      )
      entry.x = p.x
      entry.y = p.y
      top = p.y + entry.h + DESK_GAP_Y
      entry.el.classList.add(CLASS.pinned)
      entry.el
        .querySelector<HTMLElement>(`[${ATTR.widgetPin}]`)
        ?.setAttribute('aria-pressed', 'true')
    }
  }

  function apply() {
    if (!mq.matches) {
      for (const entry of entries) placeFlow(entry)
      if (contentEl) contentEl.style.marginTop = ''
      desk.style.minHeight = ''
      return
    }

    measure()
    syncPinnedState()
    applyDefaultPins()

    if (contentEl) layoutContentAnchored(contentEl)
    else if (flow) layoutFlowLift()
    else layoutScatter()

    syncPinned()
  }

  /** 把卡片当前像素位置换算成百分比存档（固定 → 视口百分比；未固定 → 桌面百分比） */
  function persist(entry: Entry) {
    if (entry.pinned) {
      const pos = {
        xPct: toPct(entry.x, window.innerWidth),
        yPct: toPct(entry.y, window.innerHeight),
        pinned: true,
      }
      saveWidgetPosition(entry.id, pos)
      saved[entry.id] = pos
    } else {
      const w = refW || desk.clientWidth || window.innerWidth
      const h = refH || desk.clientHeight || window.innerHeight
      const pos = {
        xPct: toPct(entry.x, w),
        yPct: toPct(entry.y, h),
        pinned: false,
      }
      saveWidgetPosition(entry.id, pos)
      saved[entry.id] = pos
    }
  }

  function reset() {
    const keepPinned = entries.filter((e) => e.pinned)
    clearWidgetPositions()
    saved = readWidgetPositions()
    for (const e of keepPinned) persist(e)
    zCounter = 0
    apply()
  }

  /** 切换固定：固定 = fixed 视口坐标，取消 = absolute 桌面坐标 */
  function togglePin(entry: Entry) {
    const el = entry.el
    const rect = el.getBoundingClientRect()
    const deskRect = desk.getBoundingClientRect()
    entry.pinned = !entry.pinned
    el.classList.toggle(CLASS.pinned, entry.pinned)

    if (entry.pinned) {
      // 固定 = 视口坐标，也得留在屏幕里
      const p = clampToViewport(
        { x: rect.left, y: rect.top },
        { width: entry.w, height: entry.h },
        { width: window.innerWidth, height: window.innerHeight },
      )
      entry.x = p.x
      entry.y = p.y
      placePinned(entry)
    } else {
      entry.x = rect.left - deskRect.left
      entry.y = rect.top - deskRect.top
      placeAbsolute(entry)
    }
    persist(entry)
  }

  /** 复原：删除存档、取消固定、重新布局回默认落位 */
  function restoreCard(entry: Entry) {
    removeWidgetPosition(entry.id)
    saved = readWidgetPositions()
    entry.pinned = false
    entry.el.classList.remove(CLASS.pinned)
    entry.el.querySelector<HTMLElement>(`[${ATTR.widgetPin}]`)?.setAttribute('aria-pressed', 'false')
    apply()
  }

  function wireDrag(entry: Entry) {
    entry.el.addEventListener('pointerdown', () => raise(entry.el))

    const handle = entry.el.querySelector<HTMLElement>(`[${ATTR.widgetDrag}]`)
    if (!handle) return

    let origLeft = 0
    let origTop = 0
    let width = 0

    beginDrag(handle, {
      autoScroll: true,
      enabled: () => mq.matches,
      onStart: () => {
        // 拖拽期间统一用 fixed（视口坐标），卡片永远贴着鼠标
        const rect = entry.el.getBoundingClientRect()
        origLeft = rect.left
        origTop = rect.top
        width = rect.width
        entry.el.style.position = 'fixed'
        entry.el.style.left = `${rect.left}px`
        entry.el.style.top = `${rect.top}px`
        entry.el.style.width = `${rect.width}px`
        // 拖拽中卡片保持水平（撤下倾斜），松手再按默认落位复原
        entry.el.classList.remove(CLASS.tilted)
        entry.el.style.removeProperty('--ui-widget-tilt')
      },
      onMove: (s) => {
        const p = clampToViewport(
          { x: origLeft + s.dx, y: origTop + s.dy },
          { width, height: entry.h },
          { width: window.innerWidth, height: window.innerHeight },
        )
        entry.el.style.left = `${p.x}px`
        entry.el.style.top = `${p.y}px`
      },
      onEnd: () => {
        const left = parseFloat(entry.el.style.left)
        const top = parseFloat(entry.el.style.top)

        if (entry.pinned) {
          entry.x = left
          entry.y = top
        } else {
          const deskRect = desk.getBoundingClientRect()
          entry.x = left - deskRect.left
          entry.y = top - deskRect.top
            placeAbsolute(entry)
        }
        persist(entry)
      },
    })
  }

  function wirePin(entry: Entry) {
    const btn = entry.el.querySelector<HTMLElement>(`[${ATTR.widgetPin}]`)
    if (!btn) return

    btn.addEventListener('click', (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
      if (!mq.matches) return
      togglePin(entry)
      btn.setAttribute('aria-pressed', String(entry.pinned))
    })
  }

  function wireRestore(entry: Entry) {
    const btn = entry.el.querySelector<HTMLElement>(`[${ATTR.widgetRestore}]`)
    if (!btn) return
    btn.addEventListener('click', (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
      if (!mq.matches) return
      restoreCard(entry)
    })
  }

  desk.classList.add(CLASS.layingOut)
  apply()
  entries.forEach(wireDrag)
  entries.forEach(wirePin)
  entries.forEach(wireRestore)
  void desk.offsetHeight
  desk.classList.remove(CLASS.layingOut)
  desk.classList.add(CLASS.deskReady)

  const mqListener = (e: MediaQueryListEvent) => {
    if (e.matches) apply()
    else {
      for (const entry of entries) placeFlow(entry)
      if (contentEl) {
        contentEl.style.marginTop = ''
        contentEl.style.marginRight = ''
      }
      desk.style.minHeight = ''
    }
  }
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', mqListener)
  else mq.addListener(mqListener)

  // 窗口尺寸变了：百分比存档按新宽高等比还原（防抖 + 布局期间关过渡）
  let resizeTimer = 0
  window.addEventListener('resize', () => {
    if (!mq.matches) return
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      if (!mq.matches) return
      desk.classList.add(CLASS.layingOut)
      apply()
      void desk.offsetHeight
      desk.classList.remove(CLASS.layingOut)
    }, 150)
  })

  return { reset }
}
