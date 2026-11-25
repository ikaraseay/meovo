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
 *   再点取消，回到绝对定位。适合关系图谱 / 目录这类想一直看到的卡片。
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
  fittedContentWidth,
  fitPinnedRail,
  fromPct,
  restoreFromPct,
  scatterLayout,
  toPct,
  DESK_GAP_X,
  type DeskCard,
  type Position,
} from './desk-layout'
import { createFlowState, updateFlow, type FlowState } from './prose-flow'
import { type Obstacle, type Rect } from './yield-layout'

/** 卡片互相叠的层序上限 —— 必须低于悬浮栏（Z.nav），否则卡片会盖住导航 */
const Z_MAX = Z.widget

/** 正文高度变了（折叠阅读切档 / 展开本段）—— 通知桌面重排，别各调各的 */
export const DESK_RELAYOUT_EVENT = 'meovo:desk-relayout'

/** 请求所有玻璃桌面重排 —— 内容锚定布局里正文长高了，尾部卡片要跟着挪 */
export function relayoutDesks(): void {
  window.dispatchEvent(new Event(DESK_RELAYOUT_EVENT))
}

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
  /** 正在拖 —— 布局与存档都跳过它，别跟拖拽抢位置 */
  dragging: boolean
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
  // 让位：卡片压到正文上时，正文逐行绕开（pretext 算走廊，DOM 画字）
  const proseEl = contentEl?.querySelector<HTMLElement>(`.${CLASS.prose}`) ?? null
  const flowState: FlowState | null = proseEl ? createFlowState(proseEl) : null
  let saved = readWidgetPositions()

  const entries: Entry[] = widgets.map((el) => ({
    el,
    id: el.getAttribute(ATTR.widget)!,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    pinned: false,
    dragging: false,
  }))

  // 卡片一律浮在正文之上。正文列是 position: relative，排在它前面的卡片
  // 不给 z-index 的话，正文会盖住卡片 —— 手把抓不到，卡片也拖不动。
  entries.forEach((entry, i) => {
    entry.el.style.zIndex = String(i + 1)
  })

  let zCounter = entries.length
  /** 上一次布局用的参考尺寸 —— 存档百分比按它换算，读 / 写必须用同一套基准 */
  let refW = 0
  let leftRail = false
  let refH = 0
  const topOffset = () => Math.round(window.innerHeight * 0.1)

  function raise(el: HTMLElement) {
    zCounter += 1
    if (zCounter >= Z_MAX) {
      const ordered = entries.toSorted(
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

  /** 压在正文上的卡片（文档坐标）—— 隐藏的卡量不到，跳过 */
  function collectObstacles(): Obstacle[] {
    const obstacles: Obstacle[] = []
    for (const entry of entries) {
      if (entry.el.getClientRects().length === 0) continue
      obstacles.push({ id: entry.id, rect: rectOf(entry.el) })
    }
    return obstacles
  }

  /** 元素的矩形（文档坐标） */
  function rectOf(el: HTMLElement): Rect {
    const r = el.getBoundingClientRect()
    return {
      top: r.top + window.scrollY,
      bottom: r.bottom + window.scrollY,
      left: r.left + window.scrollX,
      right: r.right + window.scrollX,
    }
  }

  /**
   * 固定卡有没有压到正文列 —— 压到了才需要跟着滚动重排。
   * 固定卡在正文列旁边（常见情况）时，滚动不该打扰正文。
   */
  function pinnedOverlapsContent(): boolean {
    if (!contentEl) return false
    const col = contentEl.getBoundingClientRect()
    for (const entry of entries) {
      if (!entry.pinned) continue
      if (entry.el.getClientRects().length === 0) continue
      const r = entry.el.getBoundingClientRect()
      if (r.right > col.left && r.left < col.right) return true
    }
    return false
  }

  /**
   * 让位：卡片压到正文上时，正文逐行绕开。
   * 返回这一趟的决策签名 —— 签名不再变就说明几何跟决策自洽了。
   */
  function updateYield(): string {
    if (!flowState) return ''
    // 窄屏卡片退回文档流，压不到正文 —— 障碍清空，绕排一并撤掉
    const obstacles = mq.matches ? collectObstacles() : []
    return updateFlow(flowState, obstacles)
  }

  /** 拖拽中让位跟着走 —— 一帧一次，别每个 pointermove 都重排 */
  let yieldFrame = 0
  function scheduleYield() {
    if (yieldFrame) return
    yieldFrame = requestAnimationFrame(() => {
      yieldFrame = 0
      const before = flowState?.prose.offsetHeight ?? 0
      updateYield()
      // 正文高度变了 → 尾部卡片（协议卡 / 上下篇）得跟着挪，
      // 不然它们会被顶上来压在正文上
      if (contentEl && (flowState?.prose.offsetHeight ?? 0) !== before) {
        layoutContentAnchored(contentEl)
      }
    })
  }

  /**
   * 让位 + 重排，迭代到决策不再变化。
   *
   * 让位会改正文高度 → 桌面变高 → 按比例存的卡片位置跟着往下挪 →
   * 让位又落后一截。签名是这一趟的决策（每一行的宽度与偏移）——
   * 签名不再变，就说明几何跟决策对上了，收敛。
   */
  function settle(): void {
    if (!contentEl) return
    let last = ''
    for (let i = 0; i < 8; i++) {
      const sig = updateYield()
      layoutContentAnchored(contentEl)
      if (sig === last) return
      last = sig
    }
    // 迭代用尽：把让位对齐到最后一趟布局
    updateYield()
    layoutContentAnchored(contentEl)
  }

  function placeAbsolute(entry: Entry) {
    const el = entry.el
    el.style.position = 'absolute'
    // 隐藏的卡片量不到尺寸（entry.w = 0）—— 不设内联宽度，让 CSS 兜底
    if (entry.w > 0) el.style.width = `${entry.w}px`
    else el.style.width = ''
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
    // 隐藏的卡片量不到尺寸（entry.w = 0）—— 不设内联宽度，让 CSS 兜底
    if (entry.w > 0) el.style.width = `${entry.w}px`
    else el.style.width = ''
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
      // 正在拖的那张由拖拽自己管 —— 布局别跟它抢
      if (entry.dragging) continue
      const pos = layout.get(entry.id)
      if (!pos) continue
      // 倾斜是默认落位的一部分：固定卡也记着，取消固定就恢复散乱的样子
      entry.baseTilt = pos.tilt
      if (entry.pinned) continue
      entry.x = pos.x
      entry.y = pos.y
      entry.w = pos.width
    }
    applySavedPositions()
  }

  /**
   * 给未固定卡片套用存档。
   *
   * 纵坐标用绝对像素（yPx）还原 —— 按「网页高度百分比」还原的话，
   * 绕排让正文一变高，基准就跟着变，刷新时卡片会跳。
   */
  function applySavedPositions() {
    for (const entry of entries) {
      if (entry.pinned || entry.dragging) continue
      const pos = saved[entry.id]
      if (!pos || pos.pinned) continue
      const y = pos.yPx ?? fromPct(pos.yPct, refH)
      const p = clampToDesk(
        { x: fromPct(pos.xPct, refW), y },
        { width: entry.w, height: entry.h },
        { width: refW, height: refH },
      )
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
      leftRail,
    })

    content.style.marginTop = `${result.contentMarginTop}px`
    refW = deskW
    refH = result.minHeight

    placeEntries(result.positions)

    for (const entry of entries) {
      if (entry.pinned || entry.dragging) continue
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

  /** 侧栏卡片里最宽的那张 —— 正文列要给它们让位 */
  function railCardWidth(): number {
    let w = 0
    for (const entry of entries) {
      if ((entry.el.getAttribute(ATTR.zone) || 'top') !== 'side') continue
      w = Math.max(w, entry.w)
    }
    return w
  }

  /**
   * 正文列宽度 —— 给右边的侧栏让位。
   * 列是居中的，所以左右各留一份侧栏的位；放不下就保底宽度，
   * 侧栏改排到正文下面（压在正文上更糟）。
   */
  function fitContentWidth() {
    if (!contentEl) return
    contentEl.style.width = '' // 回到 CSS 的宽度再量
    const max = contentEl.offsetWidth
    contentEl.style.width = `${fittedContentWidth(desk.clientWidth, railCardWidth(), max)}px`
  }

  /** 正文列的右缘（视口坐标）—— 没有正文列时返回 0 */
  function contentRightEdge(): number {
    if (!contentEl) return 0
    const deskRect = desk.getBoundingClientRect()
    const w = contentEl.offsetWidth
    return deskRect.left + (desk.clientWidth - w) / 2 + w
  }

  /** 首次进入（没有存档）时，把 data-default-pin 的卡片默认固定到**正文右边** */
  function applyDefaultPins() {
    let top = topOffset()
    const right = contentRightEdge()
    // 判定「放得下」用桌面的右缘 —— 与布局那侧同一把尺，固定 / 取消固定结果一致
    const deskRight = desk.getBoundingClientRect().left + desk.clientWidth
    const defaults = entries.filter(({ el, id }) => el.hasAttribute(ATTR.defaultPin) && !saved[id] && el.getClientRects().length > 0)
    const viewportHeight = window.innerHeight
    top = Math.max(top, viewportHeight * 0.01)
    const railX = right + DESK_GAP_X
    const occupied = entries.filter(({ el, pinned, x, w }) => pinned && el.getClientRects().length > 0
      && x < railX + railCardWidth() && x + w > railX)
    const occupiedSlots = occupied.map(entry => ({ top: entry.y, bottom: entry.y + entry.h }))
    let candidates = defaults
    const fit = (cards: Entry[]) => fitPinnedRail(top, viewportHeight * 0.99, cards.map(entry => entry.h), occupiedSlots)
    let positions = fit(candidates)
    leftRail = occupied.length > 0
    if (!positions) {
      candidates = defaults.filter(entry => entry.id === 'article-toc')
      positions = fit(candidates)
      if (!positions) return
      // 目录留在右边，其余随页面滚动的卡片走另一侧。
      if (candidates.length && (!right || railX + candidates[0].w <= deskRight - 16)) leftRail = true
    }
    for (const [index, entry] of candidates.entries()) {
      // 视口右上角会压在正文上 —— 贴着正文列的右缘放
      const x = right ? right + DESK_GAP_X : window.innerWidth - entry.w - 16
      // 窄桌面放不下就不固定：让它回到正文旁边（排不下就掉到正文下面）
      if (right && x + entry.w > deskRight - 16) continue
      entry.pinned = true
      const p = clampToViewport(
        { x, y: positions[index] },
        { width: entry.w, height: entry.h },
        { width: window.innerWidth, height: window.innerHeight },
      )
      entry.x = p.x
      entry.y = p.y
      placePinned(entry)
      entry.el.classList.add(CLASS.pinned)
      entry.el
        .querySelector<HTMLElement>(`[${ATTR.widgetPin}]`)
        ?.setAttribute('aria-pressed', 'true')
    }
  }

  /** 移动端排布：卡片退回文档流，桌面留下的内联几何全部清掉 */
  function layoutMobile() {
    for (const entry of entries) placeFlow(entry)
    if (contentEl) {
      contentEl.style.marginTop = ''
      contentEl.style.marginRight = ''
      contentEl.style.width = ''
    }
    desk.style.minHeight = ''
    // 绕排也撤掉 —— 卡片退回文档流，压不到正文了，绕排留着就是白绕
    if (flowState) updateYield()
  }

  function apply() {
    if (!mq.matches) {
      layoutMobile()
      return
    }

    // 量之前先退回文档流 —— 量到的必须是自然宽度（CSS 给的那一档），
    // 不能是上一趟布局写进 inline width 的值：那个值一旦量错就自我固化，
    // 「窄屏 → 宽屏」之后再也回不来
    for (const entry of entries) placeFlow(entry)
    measure()
    syncPinnedState()
    fitContentWidth()
    syncPinned()
    applyDefaultPins()

    if (contentEl) layoutContentAnchored(contentEl)
    else if (flow) layoutFlowLift()
    else layoutScatter()

    // 让位：卡片压到正文上时正文让开 —— 正文高度变了，桌面跟着重排
    settle()
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
        // 纵坐标记绝对像素 —— 绕排让正文变高，按百分比还原会漂
        yPx: entry.y,
        pinned: false,
      }
      saveWidgetPosition(entry.id, pos)
      saved[entry.id] = pos
    }
  }

  function reset() {
    const keepPinned = entries.filter((e) => e.pinned && saved[e.id]?.pinned)
    clearWidgetPositions()
    saved = readWidgetPositions()
    for (const e of keepPinned) persist(e)
    zCounter = 0
    // 收起展开的卡片并清理监听
    if (expandedEntry) {
      expandedEntry.el.classList.remove(CLASS.expanded)
      if (outsideClickListener) {
        document.removeEventListener('click', outsideClickListener)
        outsideClickListener = null
      }
      expandedEntry = null
    }
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
    apply()
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
        entry.dragging = true
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
        // 拖拽时关掉过渡，避免位置变化被动画导致卡顿
        entry.el.classList.add(CLASS.isDragging)
      },
      onMove: (s) => {
        const p = clampToViewport(
          { x: origLeft + s.dx, y: origTop + s.dy },
          { width, height: entry.h },
          { width: window.innerWidth, height: window.innerHeight },
        )
        entry.el.style.left = `${p.x}px`
        entry.el.style.top = `${p.y}px`
        scheduleYield()
      },
      onEnd: () => {
        const left = parseFloat(entry.el.style.left)
        const top = parseFloat(entry.el.style.top)
        entry.dragging = false

        if (entry.pinned) {
          // 固定卡拖完还是固定的 —— 固定就该一直跟着视口，
          // 正文绕着它排（滚动时也会重排）。
          const p = clampToViewport(
            { x: left, y: top },
            { width, height: entry.h },
            { width: window.innerWidth, height: window.innerHeight },
          )
          entry.x = p.x
          entry.y = p.y
          placePinned(entry)
        } else {
          const deskRect = desk.getBoundingClientRect()
          entry.x = left - deskRect.left
          entry.y = top - deskRect.top
          placeAbsolute(entry)
        }
        // 位置摆好后再恢复过渡 —— 避免 position 切换触发回弹动画
        void entry.el.offsetHeight
        entry.el.classList.remove(CLASS.isDragging)
        persist(entry)
        apply()
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

  /** 当前展开的卡片 —— 用于点击外部收起 */
  let expandedEntry: Entry | null = null
  let outsideClickListener: ((e: MouseEvent) => void) | null = null

  function wireExpand(entry: Entry) {
    const btn = entry.el.querySelector<HTMLElement>(`[${ATTR.widgetExpand}]`)
    if (!btn) return
    btn.addEventListener('click', (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
      toggleExpand(entry)
    })
  }

  function toggleExpand(entry: Entry) {
    const el = entry.el
    const isExpanded = el.classList.contains(CLASS.expanded)
    if (isExpanded) {
      el.classList.remove(CLASS.expanded)
      // 收起时移除外部点击监听
      if (outsideClickListener) {
        document.removeEventListener('click', outsideClickListener)
        outsideClickListener = null
      }
      expandedEntry = null
    } else {
      el.classList.add(CLASS.expanded)
      expandedEntry = entry
      // 展开时添加外部点击监听
      outsideClickListener = (e: MouseEvent) => {
        if (!el.contains(e.target as Node)) {
          toggleExpand(entry)
        }
      }
      document.addEventListener('click', outsideClickListener)
    }
    // 展开/收起后重新检测溢出
    checkOverflow(entry)
  }

  /** 检测卡片内容是否溢出，添加滚动提示渐变 */
  function checkOverflow(entry: Entry) {
    const el = entry.el
    const body = el.querySelector<HTMLElement>(`.${CLASS.widgetBody}`)
    if (!body) return

    // 展开态不显示渐变
    if (el.classList.contains(CLASS.expanded)) {
      el.classList.remove(CLASS.scrollable)
      return
    }

    // 比较内容高度与正文区限制高度
    const style = getComputedStyle(body)
    const maxHeight = parseFloat(style.maxHeight)
    const bodyHeight = body.scrollHeight

    if (!isNaN(maxHeight) && bodyHeight > maxHeight) {
      el.classList.add(CLASS.scrollable)
    } else {
      el.classList.remove(CLASS.scrollable)
    }
  }

  desk.classList.add(CLASS.layingOut)
  apply()
  entries.forEach(wireDrag)
  entries.forEach(wirePin)
  entries.forEach(wireRestore)
  entries.forEach(wireExpand)
  void desk.offsetHeight
  desk.classList.remove(CLASS.layingOut)
  // 错峰进场 —— 索引写进 --ui-stagger-index，样式层按它推迟动画
  entries.forEach((entry, i) => entry.el.style.setProperty('--ui-stagger-index', String(i)))
  // 检测所有卡片的溢出状态
  entries.forEach(checkOverflow)
  desk.classList.add(CLASS.deskReady)

  /**
   * 视口变了就重排 —— 判定挪到防抖之后。
   * 事件到达那一刻 window.innerWidth 可能还是旧的（iOS Safari 旋转屏幕就这样），
   * 那时若按「还是窄屏」直接返回，就再没人重排了 —— 页面卡在窄屏布局里出不来。
   */
  let relayoutTimer = 0
  function scheduleRelayout() {
    window.clearTimeout(relayoutTimer)
    relayoutTimer = window.setTimeout(() => {
      desk.classList.add(CLASS.layingOut)
      apply()
      void desk.offsetHeight
      desk.classList.remove(CLASS.layingOut)
      // 重排后重新检测溢出
      entries.forEach(checkOverflow)
    }, 150)
  }

  const mqListener = (e: MediaQueryListEvent) => {
    if (e.matches) {
      // 变宽：等浏览器把新视口尺寸算进去再排
      scheduleRelayout()
    } else {
      // 变窄：立刻退回文档流 —— 桌面布局在窄屏里会溢出屏幕
      layoutMobile()
    }
  }
  mq.addEventListener('change', mqListener)

  // 窗口尺寸变了：百分比存档按新宽高等比还原（防抖 + 布局期间关过渡）
  window.addEventListener('resize', () => scheduleRelayout())

  /**
   * 固定卡压在正文上时，滚动要重排 —— 固定卡跟着视口走，
   * 文字得一直绕开它。
   *
   * 滚动中不重排：正文高度一变，浏览器的滚动锚定会把读者的滚动
   * 吃掉一半（页面滚不动）。等滚动停下来再重排 ——
   * 文字重新绕开固定卡，浏览器的锚定负责把视图稳住。
   */
  let pinTimer = 0
  window.addEventListener(
    'scroll',
    () => {
      if (!mq.matches || !pinnedOverlapsContent()) return
      window.clearTimeout(pinTimer)
      pinTimer = window.setTimeout(() => settle(), 120)
    },
    { passive: true },
  )

  // 正文高度变了（折叠阅读）：跟 resize 走同一条防抖重排
  window.addEventListener(DESK_RELAYOUT_EVENT, scheduleRelayout)

  return { reset }
}
