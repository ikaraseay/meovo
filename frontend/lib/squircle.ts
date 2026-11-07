/**
 * 曲率圆角（squircle）—— 连续曲率过渡，不是普通圆弧
 * ---------------------------------------------------------
 * iOS 风格的 squircle：角部的曲率从边到圆滑过渡，没有突变。
 * 普通 border-radius 是圆弧（曲率在切点突变），squircle 是超椭圆弧（曲率连续）。
 *
 * 做法：用 clip-path: path() 裁出 squircle 形状。
 * clip-path 会裁掉 border 和 box-shadow，所以：
 *   · 阴影靠 filter: drop-shadow() 补回来（它跟着 clip-path 形状走）
 *
 * 为什么用 JS 而不是 CSS：clip-path: path() 的坐标是绝对像素，
 * 元素尺寸变了（窗口缩放、内容撑高）得重算路径。
 */

import { CLASS } from './dom-contract.ts'

/** squircle 的平滑系数 —— 控制角部曲线的饱满程度。
 *  0.5523 ≈ 圆弧（circular），0.7~0.8 ≈ iOS squircle */
const SQUIRCLE_FACTOR = 0.72

/** 缓存已计算的 path，同一尺寸不重算 */
const pathCache = new Map<string, string>()

/** 已装 squircle 的元素 —— removeSquircle() 用 */
const applied = new WeakSet<HTMLElement>()
/** 可遍历的已装元素集合 —— 主题切换时批量刷新用 */
const appliedList = new Set<HTMLElement>()
/** 元素的 ResizeObserver 和 update 函数 —— refreshSquircle() 用 */
const observers = new WeakMap<HTMLElement, { ro: ResizeObserver; update: (force?: boolean) => void }>()

/**
 * 生成 squircle 的 SVG path 字符串。
 *
 * 四个角各用一段 cubic Bézier 近似超椭圆弧，
 * 控制点距离按 SQUIRCLE_FACTOR × radius 算。
 */
function squirclePath(w: number, h: number, r: number): string {
  const key = `${w}|${h}|${r}`
  const cached = pathCache.get(key)
  if (cached) return cached

  const radius = Math.min(r, w / 2, h / 2)
  if (radius <= 0) {
    const path = `M0,0H${w}V${h}H0Z`
    pathCache.set(key, path)
    return path
  }

  const k = radius * SQUIRCLE_FACTOR
  const path = [
    `M${radius},0`,
    `H${w - radius}`,
    `C${w - radius + k},0,${w},0,${w},${radius}`,
    `V${h - radius}`,
    `C${w},${h - radius + k},${w - radius + k},${h},${w - radius},${h}`,
    `H${radius}`,
    `C${radius - k},${h},0,${h - radius + k},0,${h - radius}`,
    `V${radius}`,
    `C${0},${radius - k},${radius - k},0,${radius},0`,
    'Z',
  ].join('')

  pathCache.set(key, path)
  return path
}

/**
 * 给元素装上 squircle 裁切。
 *
 * @param el - 目标元素
 * @param radius - 圆角半径（px），不传则自动读取
 */
export function applySquircle(el: HTMLElement, radius?: number): void {
  if (applied.has(el)) return
  applied.add(el)
  appliedList.add(el)

  let lastW = 0
  let lastH = 0

  const update = (force = false) => {
    const rect = el.getBoundingClientRect()
    const w = el.offsetWidth || Math.round(rect.width)
    const h = el.offsetHeight || Math.round(rect.height)
    if (!w || !h) {
      if (lastW || lastH) {
        el.style.clipPath = ''
        el.style.boxShadow = ''
        el.style.filter = ''
        lastW = 0
        lastH = 0
      }
      return
    }
    const sizeChanged = w !== lastW || h !== lastH
    if (!sizeChanged && !force) return
    lastW = w
    lastH = h

    const shadow = readShadow(el)
    if (sizeChanged) {
      const r = radius ?? readRadius(el)
      const path = squirclePath(w, h, r)
      el.style.clipPath = `path('${path}')`
      el.style.boxShadow = 'none'
    }
    el.style.filter = buildFilter(shadow)
  }

  update()

  const ro = new ResizeObserver(() => update())
  ro.observe(el)
  observers.set(el, { ro, update })
}

/**
 * 手动刷新元素的 squircle 效果。
 * 用于元素从隐藏变为显示时（如弹窗打开），强制重新计算。
 */
export function refreshSquircle(el: HTMLElement): void {
  const entry = observers.get(el)
  if (entry) {
    entry.update(true)
  }
}

/** 撤掉 squircle 效果 */
export function removeSquircle(el: HTMLElement): void {
  el.style.clipPath = ''
  el.style.filter = ''
  applied.delete(el)
  appliedList.delete(el)
}

/** 读元素的 box-shadow，转成 drop-shadow 参数（只处理外部阴影，inset 无法用 drop-shadow 模拟） */
function readShadow(el: HTMLElement): Array<{ x: number; y: number; blur: number; color: string }> {
  const raw = getComputedStyle(el).boxShadow
  if (!raw || raw === 'none') {
    // 默认阴影：柔和的下落阴影
    return [{ x: 0, y: 4, blur: 12, color: 'rgba(0,0,0,0.08)' }]
  }

  const shadows: Array<{ x: number; y: number; blur: number; color: string }> = []
  // 分割多个 shadow（逗号分隔，但 rgba 里也有逗号，所以要小心）
  const parts = splitShadows(raw)
  for (const part of parts) {
    const trimmed = part.trim()
    // 跳过 inset 阴影（drop-shadow 无法模拟）
    if (trimmed.startsWith('inset')) continue
    // 匹配: [color] x y blur [spread]
    const m = trimmed.match(/^(rgba?\([^)]+\)|#[\da-fA-F]+|[\w]+)?\s*(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/)
    if (m) {
      shadows.push({
        x: parseFloat(m[2]),
        y: parseFloat(m[3]),
        blur: parseFloat(m[4]),
        color: m[1] ?? 'rgba(0,0,0,0.1)',
      })
    }
  }
  // 多个阴影叠加会过重，只保留主阴影（第一个非零的）
  if (shadows.length > 1) {
    return [shadows[0]]
  }
  return shadows.length ? shadows : [{ x: 0, y: 4, blur: 12, color: 'rgba(0,0,0,0.08)' }]
}

/** 分割 box-shadow 字符串（处理 rgba 内的逗号） */
function splitShadows(raw: string): string[] {
  const parts: string[] = []
  let current = ''
  let parenDepth = 0
  for (const char of raw) {
    if (char === '(') parenDepth++
    else if (char === ')') parenDepth--
    else if (char === ',' && parenDepth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current) parts.push(current)
  return parts
}

/** 把 box-shadow 参数转成 drop-shadow filter 字符串 */
function buildFilter(shadows: Array<{ x: number; y: number; blur: number; color: string }>): string {
  return shadows.map((s) => `drop-shadow(${s.x}px ${s.y}px ${s.blur}px ${s.color})`).join(' ')
}

/** 从元素的样式里读圆角半径 */
function readRadius(el: HTMLElement): number {
  const style = getComputedStyle(el)
  // 导航栏元素用 --ui-nav-radius-lg，卡片用 --ui-card-radius
  const isNav = el.classList.contains(CLASS.navSurface)
  const cssVar = isNav
    ? style.getPropertyValue('--ui-nav-radius-lg').trim()
    : style.getPropertyValue('--ui-card-radius').trim()
  if (cssVar) {
    const parsed = parseFloat(cssVar)
    if (!isNaN(parsed)) return parsed
  }
  const br = style.borderTopLeftRadius
  return parseFloat(br) || 0
}

/**
 * 批量初始化：给所有卡片和导航栏元素装上 squircle。
 * 页面加载完调一次就行。
 */
export function initSquircles(): void {
  if (typeof document === 'undefined') return
  // 处理普通卡片
  document.querySelectorAll<HTMLElement>(`.${CLASS.card}`).forEach((el) => applySquircle(el))
  // 处理导航栏表面（悬浮栏 / 二级面板 / 设置弹窗等）
  document.querySelectorAll<HTMLElement>(`.${CLASS.navSurface}`).forEach((el) => applySquircle(el))

  // 监听 hidden 属性变化，元素从隐藏变为显示时自动刷新 squircle
  const mo = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'hidden') {
        const el = mutation.target as HTMLElement
        if (!el.hidden && applied.has(el)) {
          refreshSquircle(el)
        }
      }
    }
  })
  // 观察所有已应用 squircle 的元素
  document.querySelectorAll<HTMLElement>(`.${CLASS.card}, .${CLASS.navSurface}`).forEach((el) => {
    mo.observe(el, { attributes: true, attributeFilter: ['hidden'] })
  })

  // 监听主题切换（<html> 的 class 变化，.dark 类切换明暗模式）
  // 主题变了阴影颜色跟着变，需要强制刷新所有元素的 drop-shadow
  const themeMo = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        for (const el of appliedList) {
          const entry = observers.get(el)
          entry?.update(true)
        }
        break
      }
    }
  })
  themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
}
