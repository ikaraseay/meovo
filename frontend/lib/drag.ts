/**
 * 统一的拖拽手势 module。
 * ---------------------------------------------------------
 * 只负责「指针按下 → 跟随 → 松开」这一段手势：主键判定、指针捕获、
 * 位移累计、可选自动滚动、点击/拖拽阈值。具体怎么跟随由调用方在 onMove 里决定。
 *
 * 一套手势服务两个 adapter：
 *   · 悬浮栏的四个面（栏体 / 抽屉 / 设置按钮 / 设置弹窗）
 *   · 卡片画布（draggable.ts 的卡片）
 * 两边都走 pointer 事件，不再维护 mousedown/touchmove 与 pointerdown 两套坐标系。
 */

export interface DragState {
  /** 指针当前视口坐标 */
  x: number
  y: number
  /** 相对起点的累计位移（纵向已含自动滚动的补偿） */
  dx: number
  dy: number
  /** 是否已越过拖拽阈值（用于区分「点击」和「拖动」） */
  moved: boolean
  /** 这次结束是不是被浏览器取消的（仅 onEnd 有） */
  cancelled?: boolean
}

export interface DragOptions {
  /** 只允许主键（默认 true） */
  primaryButtonOnly?: boolean
  /** 越过多少像素才算「拖动」（默认 0：一按下就算） */
  threshold?: number
  /** 拖到视口上下边缘时自动滚动（默认 false） */
  autoScroll?: boolean
  /** 返回 false 时本次不开始拖拽（例如移动端不启用） */
  enabled?: () => boolean
  onStart?: (state: DragState) => void
  onMove?: (state: DragState) => void
  onEnd?: (state: DragState) => void
}

/** 自动滚动的触发区与每帧最大步长 */
const AUTO_SCROLL_ZONE = 88
const AUTO_SCROLL_STEP = 14

/** 在元素上挂一次拖拽。返回取消函数（卸掉这次监听）。 */
export function beginDrag(handle: HTMLElement, options: DragOptions = {}): () => void {
  const {
    primaryButtonOnly = true,
    threshold = 0,
    autoScroll = false,
    enabled,
  } = options

  const onDown = (e: PointerEvent) => {
    if (primaryButtonOnly && e.button !== 0) return
    if (enabled && !enabled()) return

    e.preventDefault()
    handle.setPointerCapture(e.pointerId)

    const startX = e.clientX
    const startY = e.clientY
    let moved = false
    let scrollAcc = 0

    const snapshot = (ev: PointerEvent): DragState => ({
      x: ev.clientX,
      y: ev.clientY,
      dx: ev.clientX - startX,
      dy: ev.clientY - startY + scrollAcc,
      moved,
    })

    const body = document.body
    const prevUserSelect = body.style.userSelect
    body.style.userSelect = 'none'

    options.onStart?.({ x: startX, y: startY, dx: 0, dy: 0, moved: false })

    const onMove = (ev: PointerEvent) => {
      if (autoScroll) {
        const before = window.scrollY
        if (ev.clientY < AUTO_SCROLL_ZONE) {
          window.scrollBy(0, -AUTO_SCROLL_STEP * (1 - ev.clientY / AUTO_SCROLL_ZONE))
        } else if (ev.clientY > window.innerHeight - AUTO_SCROLL_ZONE) {
          window.scrollBy(0, AUTO_SCROLL_STEP * (1 - (window.innerHeight - ev.clientY) / AUTO_SCROLL_ZONE))
        }
        scrollAcc += window.scrollY - before
      }

      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY + scrollAcc) >= threshold) {
        moved = true
      }
      if (moved) options.onMove?.(snapshot(ev))
    }

    const finish = (ev: PointerEvent) => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', finish)
      handle.removeEventListener('pointercancel', finish)
      if (handle.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId)
      body.style.userSelect = prevUserSelect
      options.onEnd?.({ ...snapshot(ev), cancelled: ev.type === 'pointercancel' })
    }

    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', finish)
    handle.addEventListener('pointercancel', finish)
  }

  handle.addEventListener('pointerdown', onDown)

  return () => {
    handle.removeEventListener('pointerdown', onDown)
  }
}
