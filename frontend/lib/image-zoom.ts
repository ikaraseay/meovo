/**
 * 正文图片的放大查看 —— 点开一张大图，能放大、能拖着挪。
 * ---------------------------------------------------------
 * 一个覆盖层：原图按自然尺寸摆进去，滚轮缩放（对着指针那点放大）、
 * 按住拖动平移、双击还原、Esc 或点背景关闭。
 *
 * 纯 DOM，没依赖。夹取边界是纯函数（test/image-zoom.test.ts 守着）。
 */
import { CLASS } from './dom-contract.ts'

/** 缩放范围 —— 1 是原大小，4 够看清细节了 */
export const MIN_SCALE = 1
export const MAX_SCALE = 4

export interface Size {
  w: number
  h: number
}

/**
 * 把平移夹在图内 —— 图比视口小的时候不许挪，比视口大的时候不许拖出屏幕。
 * 缩放后的图超出视口多少，就只能往那个方向挪那么多。
 */
export function clampPan(
  x: number,
  y: number,
  scaled: Size,
  view: Size,
): { x: number; y: number } {
  const limit = (value: number, max: number) => (max <= 0 ? 0 : Math.min(max, Math.max(-max, value)))
  return {
    x: limit(x, Math.max(0, (scaled.w - view.w) / 2)),
    y: limit(y, Math.max(0, (scaled.h - view.h) / 2)),
  }
}

export interface ImageZoomLabels {
  /** 关闭按钮的名字 */
  close: string
}

/**
 * 给这些图片接上放大查看。
 * 已经在覆盖层里打开时再点一张图，换图不叠层。
 */
export function initImageZoom(images: HTMLImageElement[], labels: ImageZoomLabels): void {
  if (images.length === 0) return

  const overlay = document.createElement('div')
  overlay.className = CLASS.imgZoom
  overlay.hidden = true
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')

  const picture = document.createElement('img')
  picture.className = CLASS.imgZoomImage
  picture.alt = ''
  picture.draggable = false

  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = CLASS.imgZoomClose
  closeButton.textContent = '×'
  closeButton.setAttribute('aria-label', labels.close)

  overlay.appendChild(picture)
  overlay.appendChild(closeButton)
  document.body.appendChild(overlay)

  let scale = 1
  let x = 0
  let y = 0
  let lastFocus: HTMLElement | null = null

  /** 图在屏幕上的自然尺寸（未缩放） */
  function baseSize(): Size {
    return { w: picture.clientWidth, h: picture.clientHeight }
  }

  function apply() {
    const base = baseSize()
    const view = { w: overlay.clientWidth, h: overlay.clientHeight }
    const clamped = clampPan(x, y, { w: base.w * scale, h: base.h * scale }, view)
    x = clamped.x
    y = clamped.y
    picture.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
  }

  function reset() {
    scale = 1
    x = 0
    y = 0
    apply()
  }

  function open(source: HTMLImageElement) {
    lastFocus = document.activeElement as HTMLElement | null
    picture.src = source.currentSrc || source.src
    picture.alt = source.alt
    overlay.hidden = false
    reset()
    closeButton.focus()
  }

  function close() {
    overlay.hidden = true
    picture.removeAttribute('src')
    lastFocus?.focus()
  }

  for (const image of images) {
    image.classList.add(CLASS.imgZoomable)
    // 键盘也要能开 —— 只给鼠标的话这张图等于没有
    image.tabIndex = 0
    image.setAttribute('role', 'button')
    image.addEventListener('click', (event) => {
      event.preventDefault()
      open(image)
    })
    image.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      open(image)
    })
  }

  closeButton.addEventListener('click', close)

  // 点背景关闭 —— 点在图上不算
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close()
  })

  document.addEventListener('keydown', (event) => {
    if (overlay.hidden) return
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  })

  // 滚轮缩放 —— 对着指针那点放大
  overlay.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault()
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * Math.exp(-event.deltaY * 0.0015)))
      if (next === scale) return
      const rect = overlay.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      // 指针下的那个点在图里的位置不变 —— 缩放后它还在指针下
      const localX = (event.clientX - cx - x) / scale
      const localY = (event.clientY - cy - y) / scale
      scale = next
      x = event.clientX - cx - localX * scale
      y = event.clientY - cy - localY * scale
      apply()
    },
    { passive: false },
  )

  // 按住拖动 —— 放大之后才挪得动
  let dragging = false
  let startX = 0
  let startY = 0
  let originX = 0
  let originY = 0

  picture.addEventListener('pointerdown', (event) => {
    if (scale <= MIN_SCALE) return
    dragging = true
    startX = event.clientX
    startY = event.clientY
    originX = x
    originY = y
    picture.setPointerCapture(event.pointerId)
    picture.classList.add(CLASS.isPanning)
  })

  picture.addEventListener('pointermove', (event) => {
    if (!dragging) return
    x = originX + (event.clientX - startX)
    y = originY + (event.clientY - startY)
    apply()
  })

  const endDrag = () => {
    dragging = false
    picture.classList.remove(CLASS.isPanning)
  }
  picture.addEventListener('pointerup', endDrag)
  picture.addEventListener('pointercancel', endDrag)

  // 双击 —— 放大 / 还原
  picture.addEventListener('dblclick', () => {
    scale = scale > MIN_SCALE ? MIN_SCALE : 2
    if (scale === MIN_SCALE) {
      x = 0
      y = 0
    }
    apply()
  })

  // 视口变了 —— 图得重新摆
  window.addEventListener('resize', () => {
    if (!overlay.hidden) apply()
  })
}
