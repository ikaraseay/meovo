/**
 * Hero 流体光标
 * ---------------------------------------------------------
 * 指针是一个圆形障碍物，文案对它做实时几何响应：被切到的那一行从光标处
 * 劈开，左右两半分别贴住光标边缘 —— 文字「分开」，但行数不变、版面不动。
 *
 * 渲染分工：
 *   · DOM 里的原文是唯一真相，也是屏读器 / 搜索引擎 / 划词的那一份，
 *     效果生效时只让它透明（opacity，不是 visibility —— 那样就选不中了）
 *   · canvas 只负责画
 *
 * 降级：纯触摸设备（any-pointer: coarse）或用户要求减少动效时，
 * 整个效果不启动，原文保持可见 —— 见 ADR-0001。
 */
import { useEffect, useRef } from 'preact/hooks'
import {
  layoutNextLine,
  prepareWithSegments,
  type LayoutCursor,
  type PreparedTextWithSegments,
} from '@chenglou/pretext'

interface Props {
  /** 文案容器选择器 —— 容器里的文字元素逐个成为文案场，按文档顺序排布 */
  container: string
  /** 磁吸目标选择器 —— 光标靠近时障碍物变大，文案让位加剧 */
  magnets: string
}

/* ---------- 手感参数 ---------- */
const RADIUS = 20 // 障碍物基础半径
const RADIUS_MAGNET = 34 // 靠近磁吸目标时的半径
const PAD = 10 // 障碍物与文字之间的额外留白
const SPRING_K = 170 // 弹簧刚度
const SPRING_D = 22 // 阻尼
const MAGNET_RANGE = 130 // 指针进入磁吸目标这个距离内就放大障碍物
const STEP = 1 / 120 // 弹簧积分子步长，保证不同帧率手感一致

type Band = {
  text: string
  width: number
  x: number
  y: number
}

type Field = {
  el: HTMLElement
  font: string
  color: string
  lineHeight: number
  bands: Band[]
}

type Interval = { left: number; right: number }

/** 圆与一条水平带（band）的相交区间；不相交返回 null */
function circleIntervalForBand(
  cx: number,
  cy: number,
  r: number,
  bandTop: number,
  bandBottom: number
): Interval | null {
  if (bandBottom <= cy - r || bandTop >= cy + r) return null
  const minDy = cy >= bandTop && cy <= bandBottom ? 0 : cy < bandTop ? bandTop - cy : cy - bandBottom
  if (minDy >= r) return null
  const maxDx = Math.sqrt(r * r - minDy * minDy)
  return { left: cx - maxDx - PAD, right: cx + maxDx + PAD }
}

/** 找出被光标切到的字符位置：拉丁文按词边界切，中文逐字切 */
function splitIndex(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  target: number
): number {
  ctx.font = font
  const total = ctx.measureText(text).width
  if (target <= 0) return 0
  if (target >= total) return text.length

  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (ctx.measureText(text.slice(0, mid)).width <= target) lo = mid
    else hi = mid - 1
  }

  const space = text.lastIndexOf(' ', lo)
  return space > 0 ? space + 1 : lo
}

/** 读元素的排版参数，翻译成 Pretext / canvas 认的东西 */
function readStyle(el: HTMLElement, ctx: CanvasRenderingContext2D) {
  const cs = getComputedStyle(el)
  const size = parseFloat(cs.fontSize)
  const weight = cs.fontWeight === 'normal' ? '400' : cs.fontWeight
  const style = cs.fontStyle === 'italic' ? 'italic' : 'normal'
  const letterSpacing = parseFloat(cs.letterSpacing)
  const lineHeight = parseFloat(cs.lineHeight)

  // canvas 的 font 简写解析失败时会静默保留旧值 —— 兜一层
  const font = `${style} ${weight} ${size}px ${cs.fontFamily}`
  ctx.font = font
  if (!ctx.font.includes(`${size}px`)) ctx.font = `${style} ${weight} ${size}px sans-serif`

  return {
    font: ctx.font,
    letterSpacing: Number.isFinite(letterSpacing) ? letterSpacing : 0,
    lineHeight: Number.isFinite(lineHeight) ? lineHeight : size * 1.2,
    color: cs.color,
    align: cs.textAlign,
  }
}

/**
 * 量出各个文案场。
 * 每个场的行断点在整段生命周期里固定 —— 劈开只改字的位置，不改断点，
 * 所以 Hero 的高度永远不变，页面不会跳。
 */
function buildFields(root: HTMLElement, ctx: CanvasRenderingContext2D): Field[] {
  const rootRect = root.getBoundingClientRect()
  const els = Array.from(root.children).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement && (el.textContent ?? '').trim() !== ''
  )

  const fields: Field[] = []
  let previousBottom = -Infinity

  for (const el of els) {
    const style = readStyle(el, ctx)

    // 让 DOM 的断行跟 Pretext 一致（h1 上的 text-wrap: balance 不会一致）
    el.style.textWrap = 'wrap'

    const prepared: PreparedTextWithSegments = prepareWithSegments(
      (el.textContent ?? '').trim(),
      style.font,
      { letterSpacing: style.letterSpacing }
    )

    const rect = el.getBoundingClientRect()
    const left = rect.left - rootRect.left
    const width = rect.width
    // 各场依次排布，场与场之间不留空隙 —— 用 DOM 量出来的位置兜底
    const top = Math.max(rect.top - rootRect.top, previousBottom)

    // 自然排版：断点固定下来，之后每一帧只在这个基础上劈开
    const bands: Band[] = []
    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
    let y = top
    for (;;) {
      const line = layoutNextLine(prepared, width, cursor)
      if (line === null) break
      cursor = line.end
      const x =
        style.align === 'center'
          ? left + (width - line.width) / 2
          : style.align === 'right'
            ? left + width - line.width
            : left
      bands.push({ text: line.text, width: line.width, x, y })
      y += style.lineHeight
    }

    previousBottom = top + bands.length * style.lineHeight
    fields.push({
      el,
      font: style.font,
      color: style.color,
      lineHeight: style.lineHeight,
      bands,
    })
  }

  return fields
}

export default function FluidCursor({ container, magnets }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    // 用 closest 找容器 —— 锚在自己这个实例上，不依赖页面上只有一个 Hero
    const root = canvas?.closest<HTMLElement>(container) ?? null
    if (!canvas || !ctx || !root) return

    // 静态回退：纯触摸设备，或用户要求减少动效 —— 原文保持原生排版
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
    const finePointer = matchMedia('(any-pointer: fine)')
    if (reducedMotion.matches || !finePointer.matches) return

    const pointer = { x: -9999, y: -9999, active: false }
    const spring = { x: -9999, y: -9999, vx: 0, vy: 0 }
    let fields: Field[] = []
    let magnetPoints: { x: number; y: number }[] = []
    let accent = '#ff6b35'
    let raf = 0
    let last = performance.now()
    let acc = 0
    let needsDraw = true

    const build = () => {
      fields = buildFields(root, ctx)
      magnetPoints = [...document.querySelectorAll<HTMLElement>(magnets)].map((el) => {
        const rect = el.getBoundingClientRect()
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      })
      accent = getComputedStyle(document.documentElement).getPropertyValue('--ui-accent').trim()
      for (const field of fields) field.el.style.opacity = '0'
    }

    /** 当前的障碍物。返回容器相对坐标（布局与画布都用这个坐标系） */
    const obstacleAt = (vx: number, vy: number) => {
      if (!pointer.active) return null
      let radius = RADIUS
      for (const point of magnetPoints) {
        if (Math.hypot(vx - point.x, vy - point.y) < MAGNET_RANGE) {
          radius = RADIUS_MAGNET
          break
        }
      }
      const rootRect = root.getBoundingClientRect()
      return { x: vx - rootRect.left, y: vy - rootRect.top, radius }
    }

    const draw = () => {
      const dpr = window.devicePixelRatio || 1
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const pixelWidth = Math.round(width * dpr)
      const pixelHeight = Math.round(height * dpr)
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth
        canvas.height = pixelHeight
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const obstacle = obstacleAt(spring.x, spring.y)

      // 光晕压在文字下面
      if (obstacle) {
        const glowRadius = obstacle.radius * 2.4
        const glow = ctx.createRadialGradient(
          obstacle.x,
          obstacle.y,
          0,
          obstacle.x,
          obstacle.y,
          glowRadius
        )
        glow.addColorStop(0, withAlpha(accent, 0.22))
        glow.addColorStop(0.45, withAlpha(accent, 0.07))
        glow.addColorStop(1, withAlpha(accent, 0))
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(obstacle.x, obstacle.y, glowRadius, 0, Math.PI * 2)
        ctx.fill()
      }

      // 文字
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      let currentFont = ''

      for (const field of fields) {
        if (field.font !== currentFont) {
          ctx.font = field.font
          currentFont = field.font
        }
        ctx.fillStyle = field.color

        for (const band of field.bands) {
          const interval = obstacle
            ? circleIntervalForBand(
                obstacle.x,
                obstacle.y,
                obstacle.radius,
                band.y,
                band.y + field.lineHeight
              )
            : null

          if (interval) {
            const left = Math.max(interval.left, band.x)
            const right = Math.min(interval.right, band.x + band.width)
            if (right > left) {
              const cut = splitIndex(ctx, band.text, field.font, left - band.x)
              if (cut > 0 && cut < band.text.length) {
                const leftText = band.text.slice(0, cut)
                const leftWidth = ctx.measureText(leftText).width
                ctx.fillText(leftText, left - leftWidth, band.y + field.lineHeight / 2)
                ctx.fillText(band.text.slice(cut), right, band.y + field.lineHeight / 2)
                continue
              }
            }
          }

          ctx.fillText(band.text, band.x, band.y + field.lineHeight / 2)
        }
      }
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)

      const dt = Math.min((now - last) / 1000, 0.1)
      last = now

      // 弹簧：半隐式欧拉 + 固定子步长
      acc += dt
      while (acc >= STEP) {
        const ax = (pointer.x - spring.x) * SPRING_K - spring.vx * SPRING_D
        const ay = (pointer.y - spring.y) * SPRING_K - spring.vy * SPRING_D
        spring.vx += ax * STEP
        spring.vy += ay * STEP
        spring.x += spring.vx * STEP
        spring.y += spring.vy * STEP
        acc -= STEP
      }

      const moving =
        Math.abs(pointer.x - spring.x) > 0.05 ||
        Math.abs(pointer.y - spring.y) > 0.05 ||
        Math.abs(spring.vx) > 0.05 ||
        Math.abs(spring.vy) > 0.05

      if (!moving && !needsDraw) return
      needsDraw = false
      draw()
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      pointer.x = event.clientX
      pointer.y = event.clientY
      if (!pointer.active) {
        pointer.active = true
        spring.x = event.clientX
        spring.y = event.clientY
      }
      needsDraw = true
    }

    const onPointerLeave = () => {
      pointer.active = false
      needsDraw = true
    }

    const onResize = () => {
      build()
      needsDraw = true
    }

    // 明暗模式切换会改文字颜色 —— 盯着 <html> 的类，重建一次
    const themeObserver = new MutationObserver(onResize)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    build()
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('resize', onResize)
    document.documentElement.addEventListener('pointerleave', onPointerLeave)
    raf = requestAnimationFrame(frame)
    draw()
    canvas.style.opacity = '1'

    return () => {
      cancelAnimationFrame(raf)
      themeObserver.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('resize', onResize)
      document.documentElement.removeEventListener('pointerleave', onPointerLeave)
      for (const field of fields) field.el.style.opacity = ''
    }
  }, [container, magnets])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        opacity: 0,
        transition: 'opacity var(--ui-transition-fast)',
      }}
    />
  )
}

/** #rrggbb + alpha → rgba() */
function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value
  const n = parseInt(full, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
