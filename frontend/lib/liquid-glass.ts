/**
 * 玻璃片的折射 —— 边缘掰弯 + 色散
 * ---------------------------------------------------------
 * 位移图只用在跟随指针走的镜片（.glass-lens）上。
 * 一级菜单和二级面板底板是「整个液态玻璃」，继续用静态滤镜 #glass-refract，
 * 不归这里管。
 *
 * 例外是 canRefract()：整个液态玻璃走不走折射，也看它读到的那个 class
 * （开关在 BaseLayout 的首屏内联脚本里，这里只读结果）。
 *
 * 做法：Canvas 2D 画一张「位移图」，喂给 SVG 的 feDisplacementMap。
 *
 * 位移图的编码方式：
 *   R 通道 = 横向位移，B 通道 = 纵向位移，128 灰 = 零位移。
 *   药丸内部是一层方向性渐变场 —— 边缘位移大（背景被掰弯、放大），
 *   中间一圈压回中性（128 灰，背景原样透过去）。
 *
 * 色散：R / G / B 三个通道各用不同 scale 跑一遍位移再合并，
 *       通道之间的位移差就是边缘那圈彩虹。
 *
 * 算法借鉴 rizzytoday/liquid-glass（MIT），调研笔记：
 *   docs/research/liquid-glass-web-implementations.md
 *
 * ⚠️ backdrop-filter 里用 url() 引用 SVG 滤镜，目前只有 Chromium 系真渲染。
 *    Safari / Firefox 解析 url() 没问题，CSS.supports 返回 true，但渲染时会把
 *    **整条** backdrop-filter 丢掉（连 blur 一起）—— 见 canRefract()。
 */

import { CLASS } from './dom-contract.ts'

const NS = 'http://www.w3.org/2000/svg'
const XLINK = 'http://www.w3.org/1999/xlink'

/** 滤镜区域至少外扩这么多像素 —— 位移采样要够得到元素外面的背景 */
const MIN_PAD = 6

/** Safari 在高 scale 下会出 artifact（@dpawlikowski/liquid-glass 的实测经验值） */
const SCALE_MAX = 25

/** 位移图缓存：同一尺寸的玻璃只画一次 */
const mapCache = new Map<string, string>()

let filterSeq = 0
let svgRoot: SVGSVGElement | null = null

/**
 * 这个引擎能不能**真渲染** backdrop-filter: url()。
 *
 * 判据在首屏内联脚本里（`frontend/layouts/BaseLayout.astro`）—— 内联脚本不能 import 模块，
 * 所以那边自己判了一遍，判完给 `<html>` 挂 `.glass-refract` / `.glass-fallback`，这里读同一个 class。
 *
 * 为什么不能只看 CSS.supports：Safari / Firefox 解析 url() 没问题、CSS.supports 返回 true，
 * 但渲染时整条 backdrop-filter 会被丢掉 —— WebKit 的
 * RenderLayerBacking::updateBackdropFilters() 见到 reference filter 就不调
 * setBackdropFilters()，连 blur 一起没（WebKit bug 245510，PR 68614 至今未合并）。
 * 只信 CSS.supports 的话，Safari 里整个液态玻璃会消失。
 */
export function canRefract(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains(CLASS.refract)
}

function rootSvg(): SVGSVGElement {
  if (!svgRoot) {
    svgRoot = document.createElementNS(NS, 'svg')
    svgRoot.setAttribute('width', '0')
    svgRoot.setAttribute('height', '0')
    svgRoot.setAttribute('aria-hidden', 'true')
    svgRoot.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none'
    document.body.appendChild(svgRoot)
  }
  return svgRoot
}

/**
 * 画位移图。
 *
 * 画布尺寸 = 滤镜区域尺寸（元素 + 两侧余量），这样 feImage 铺满滤镜区域时
 * 正好 1:1 对齐 —— 位移图和元素一旦错位，折射就会跑到不该在的地方。
 *
 * 位移图只编码**方向与归一化幅度**（128 灰 = 零位移），
 * 实际像素位移由滤镜里的 scale 决定 —— 所以这张图跟 scale 无关。
 */
function buildMap(w: number, h: number, radius: number, pad: number): string {
  const key = `${w}x${h}x${radius}x${pad}`
  const cached = mapCache.get(key)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = w + pad * 2
  canvas.height = h + pad * 2
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  // 画布四周是中性灰 = 零位移，元素外面的背景不受影响
  ctx.fillStyle = 'rgb(128,128,128)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.save()
  ctx.beginPath()
  ctx.roundRect(pad, pad, w, h, radius)
  ctx.clip()

  ctx.fillStyle = '#000000'
  ctx.fillRect(pad, pad, w, h)

  // 横向位移场：左高右低（负 scale = 向内折射，边缘把背景往里拉）
  const gx = ctx.createLinearGradient(pad + w, pad, pad, pad)
  gx.addColorStop(0, '#000000')
  gx.addColorStop(1, '#ff0000')
  ctx.fillStyle = gx
  ctx.fillRect(pad, pad, w, h)

  // 纵向位移场：上低下高。difference 混合把两个通道并进同一张图
  ctx.globalCompositeOperation = 'difference'
  const gy = ctx.createLinearGradient(pad, pad, pad, pad + h)
  gy.addColorStop(0, '#000000')
  gy.addColorStop(1, '#0000ff')
  ctx.fillStyle = gy
  ctx.fillRect(pad, pad, w, h)

  // 中心中性化：模糊的圆角矩形把中间压回 128（背景不歪）
  ctx.globalCompositeOperation = 'source-over'
  const inset = Math.min(w, h) * 0.035
  ctx.filter = 'blur(11px)'
  ctx.fillStyle = 'hsla(0, 0%, 50%, 0.93)'
  ctx.beginPath()
  ctx.roundRect(pad + inset, pad + inset, w - inset * 2, h - inset * 2, radius)
  ctx.fill()
  ctx.restore()

  const uri = canvas.toDataURL()
  mapCache.set(key, uri)
  return uri
}

/** 建滤镜：区域随元素尺寸改，位移图换 href */
function createFilter(id: string): { filter: SVGFilterElement; image: SVGFEImageElement; maps: SVGFEDisplacementMapElement[] } {
  const filter = document.createElementNS(NS, 'filter')
  filter.setAttribute('id', id)
  filter.setAttribute('color-interpolation-filters', 'sRGB')
  filter.innerHTML = `
    <feImage result="map" preserveAspectRatio="none"/>
    <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="B" scale="0" result="d0"/>
    <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="B" scale="0" result="d1"/>
    <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="B" scale="0" result="d2"/>
    <feColorMatrix in="d0" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cr"/>
    <feColorMatrix in="d1" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cg"/>
    <feColorMatrix in="d2" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="cb"/>
    <feBlend in="cr" in2="cg" mode="screen" result="crg"/>
    <feBlend in="crg" in2="cb" mode="screen"/>`

  rootSvg().appendChild(filter)

  const image = filter.querySelector('feImage') as unknown as SVGFEImageElement
  const maps = [...filter.querySelectorAll('feDisplacementMap')] as unknown as SVGFEDisplacementMapElement[]
  return { filter, image, maps }
}

/**
 * 位移强度与滤镜区域 —— 纯函数，算错的话折射会跑到不该在的地方。
 *
 * 位移图画布尺寸必须 == 滤镜区域尺寸，两者都按元素的实测尺寸推。
 */
export function glassMetrics(w: number, h: number) {
  // 位移强度：窄条（导航栏）和方块（二级面板）各自适配
  const strength = Math.min(w * 0.09, h * 0.22)
  const scale = -Math.min(Math.round(strength), SCALE_MAX)
  const pad = Math.max(Math.ceil(Math.abs(scale) * 0.5), MIN_PAD)
  return {
    scale,
    pad,
    x: (-pad / w) * 100,
    y: (-pad / h) * 100,
    width: ((w + pad * 2) / w) * 100,
    height: ((h + pad * 2) / h) * 100,
  }
}

/**
 * 色散档位：R / G / B 三个通道各差一档**绝对**位移量。
 *
 * 上游 `rizzytoday/liquid-glass` 用的是固定 10px 一档（`aberration: [0, 10, 20]`），
 * 那是给大元素（base scale 180）准备的。镜片 base 只有 7px，固定 10px 会直接翻符号，
 * 所以按 base 缩放，夹在 1~3。
 */
export function glassAberration(scale: number): [number, number, number] {
  const step = Math.min(3, Math.max(1, Math.floor(Math.abs(scale) / 3)))
  return [scale, scale + step, scale + step * 2]
}

/**
 * 给一个元素装上液态玻璃折射。
 *
 * 元素尺寸变了（面板换内容、镜片换条目）会重算位移图。
 *
 * ⚠️ 尺寸必须**一次到位**：位移图画布、滤镜区域、元素盒子三者要 1:1 对齐，
 * 尺寸逐帧变化的话每帧都得重建一张位移图（缓存一帧一条，全是元素
 * 从未有过的尺寸）。所以镜片尺寸由 JS 直接写死，CSS 不做宽高过渡。
 */
export function applyLiquidGlass(el: HTMLElement): void {
  if (!canRefract()) return

  const id = `glass-refract-${++filterSeq}`
  const { filter, image, maps } = createFilter(id)

  // 只写标准属性 —— 同时写 -webkit- 会被 CSS 压缩流程合并掉，无前缀那条被丢弃
  el.style.backdropFilter = `url(#${id}) var(--ui-nav-blur)`

  const render = () => {
    const rect = el.getBoundingClientRect()
    const w = Math.round(rect.width)
    const h = Math.round(rect.height)
    if (!w || !h) return

    const radius = Number.parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
    const { scale, pad, x, y, width, height } = glassMetrics(w, h)

    // 滤镜区域外扩 pad —— 位移要采样到元素外面的背景，否则边缘折射会采空
    filter.setAttribute('x', `${x}%`)
    filter.setAttribute('y', `${y}%`)
    filter.setAttribute('width', `${width}%`)
    filter.setAttribute('height', `${height}%`)

    // 三通道位移量不同 → 边缘出现色散
    const [d0, d1, d2] = maps
    const [s0, s1, s2] = glassAberration(scale)
    d0.setAttribute('scale', String(s0))
    d1.setAttribute('scale', String(s1))
    d2.setAttribute('scale', String(s2))

    const uri = buildMap(w, h, radius, pad)
    if (!uri) return
    image.setAttributeNS(XLINK, 'href', uri)
    image.setAttribute('href', uri)
  }

  render()
  // ResizeObserver 本身按帧合并，且回调在绘制前跑 —— 不需要再套一层 rAF
  new ResizeObserver(render).observe(el)
}
