/**
 * 正文绕排 —— pretext 逐行算走廊，浏览器画字。
 * ---------------------------------------------------------
 * 卡片压到正文上时，文字绕开它。做法照 pretext 官方 demo（龙形 / 伞形）：
 * 每一行自己算能占多宽、往哪边挪；一截走廊都放不下就跳过这一行 ——
 * 宁可空一行，也不把字挤成一条缝。
 *
 * 分工：
 *   · pretext 算断行 —— 量的是同一套字体，跟浏览器的断行规则一致
 *   · DOM 画字 —— 文字还是真 DOM：可选中、可搜索、屏读器照读。
 *     （不是 canvas —— canvas 画出来的字选不中、搜不到）
 *
 * 一行一个块（.prose-line），行里按走廊分几截（.prose-seg）——
 * 卡片在中间时左右各一截，文字从左截流到右截，把卡片包在中间。
 * 原件（块里原来的子节点）收进 DocumentFragment 留着 ——
 * 卡片挪开后原样放回去，折叠阅读的监听与隐藏状态都不丢。
 */
import {
  layoutNextRichInlineLineRange,
  materializeRichInlineLineRange,
  prepareRichInline,
  type RichInlineLine,
} from '@chenglou/pretext/rich-inline'
import { CLASS } from './dom-contract.ts'
import {
  corridorAt,
  minMeasure,
  type Obstacle,
  type Rect,
  type Segment,
} from './yield-layout.ts'

/** 一块里的一段文字（一个文本节点 = 一个 item） */
interface FlowItem {
  /** 文本节点的原文 */
  text: string
  /** 字体简写（canvas 归一化过） */
  font: string
  letterSpacing: number
  /** 内联祖先链 —— 从块的直接子元素到文本节点的父元素 */
  chain: HTMLElement[]
}

/** 绕排过的一块 */
export interface FlowBlock {
  el: HTMLElement
  /** 原件 —— 撤掉绕排时放回去 */
  saved: DocumentFragment
  /** 摆出来的行块 */
  lines: HTMLElement[]
  /** 这一块的决策签名（每一行的走廊） */
  sig: string
}

export interface FlowState {
  prose: HTMLElement
  blocks: Map<HTMLElement, FlowBlock>
}

export interface FlowOptions {
  /** 一截走廊的下限（px）—— 默认按块宽算 */
  min?: number
}

/** 一段最多排多少行 —— 走廊一直被占满时的兜底 */
const MAX_LINES = 2000
/** 这些元素不参与绕排：图 / 视频 / 硬换行 —— 段落的形状不是一条走廊 */
/* shortcut: <br> 与内联图片不绕排，遇到时整段退回普通排版；需要的话再拆成多组排 */
const NOT_FLOWABLE = 'img, video, audio, iframe, canvas, svg, object, embed, br'

export function createFlowState(prose: HTMLElement): FlowState {
  return { prose, blocks: new Map() }
}

/** 撤掉全部绕排 —— 正文回到原样 */
export function clearFlow(state: FlowState): void {
  for (const block of state.blocks.values()) {
    // 折叠箭头被塞进了行块（绕排时）—— 先摘出来，
    // 别让它跟着行块一起没了（箭头是控件，丢了就没了）
    const toggle = block.el.querySelector(`.${CLASS.textFoldToggle}`)
    toggle?.remove()
    for (const line of block.lines) line.remove()
    block.el.appendChild(block.saved)
    if (toggle) block.el.appendChild(toggle)
  }
  state.blocks.clear()
}

/**
 * 让位走一遍 —— 返回这一趟的决策签名。
 *
 * 撤掉上一趟的绕排（量到的必须是「没绕排」的正文），再从上往下逐块绕排：
 * 卡片压住哪边，这一行的文字就往另一边走；两截走廊都能放字时，
 * 文字从左截流到右截，把卡片包在中间。
 * 上面几段变高了，下面几段的位置跟着挪 —— 位移一次算清，别一趟一趟地飘。
 */
export function updateFlow(
  state: FlowState,
  obstacles: Obstacle[],
  opts: FlowOptions = {},
): string {
  clearFlow(state)
  const cards = obstacles.map((o) => o.rect)
  if (cards.length === 0) return ''

  // 先量所有候选块的原始位置（绕排之前）
  const targets: Array<{ el: HTMLElement; rect: Rect; height: number }> = []
  for (const el of flowCandidates(state.prose)) {
    const rect = contentBox(el)
    if (!cards.some((card) => overlaps(card, rect))) continue
    targets.push({ el, rect, height: el.getBoundingClientRect().height })
  }

  // 从上往下逐个绕排 —— 上面几段变高了，下面的位置跟着挪
  let shift = 0
  let sig = ''
  for (const t of targets) {
    const rect = { ...t.rect, top: t.rect.top + shift, bottom: t.rect.bottom + shift }
    const block = flowBlock(t.el, rect, cards, opts)
    if (!block) continue
    state.blocks.set(t.el, block)
    sig += block.sig + '|'
    shift += t.el.getBoundingClientRect().height - t.height
  }
  return sig
}

/** 能绕排的块：段落与列表项 —— 里面全是行内内容 */
function flowCandidates(prose: HTMLElement): HTMLElement[] {
  return [...prose.querySelectorAll<HTMLElement>('p, li')]
}

/** 元素的内容盒（文档坐标）—— 走廊的左右边界就是它 */
function contentBox(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  const num = (v: string) => parseFloat(v) || 0
  return {
    top: r.top + window.scrollY + num(cs.borderTopWidth) + num(cs.paddingTop),
    bottom:
      r.bottom + window.scrollY - num(cs.borderBottomWidth) - num(cs.paddingBottom),
    left: r.left + window.scrollX + num(cs.borderLeftWidth) + num(cs.paddingLeft),
    right: r.right + window.scrollX - num(cs.borderRightWidth) - num(cs.paddingRight),
  }
}

/** 两个矩形有没有交叠 */
function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

/** 子元素是不是行内级 —— 块级的说明这一块不能逐行绕排 */
function isInlineLevel(el: HTMLElement): boolean {
  const display = getComputedStyle(el).display
  return display === 'contents' || display === 'ruby' || display.startsWith('inline')
}

/**
 * 收集块里的文字 —— 一个文本节点一个 item。
 * 藏起来的（折叠阅读折起的部分）与折叠箭头不进正文。
 */
function collectItems(block: HTMLElement): FlowItem[] | null {
  const items: FlowItem[] = []
  const walk = (parent: Node, chain: HTMLElement[]): boolean => {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node as Text
        if (!text.data) continue
        const style = fontOf(text.parentElement as HTMLElement)
        items.push({
          text: text.data,
          font: style.font,
          letterSpacing: style.letterSpacing,
          chain,
        })
        continue
      }
      if (node.nodeType !== Node.ELEMENT_NODE) continue
      const el = node as HTMLElement
      if (el.hasAttribute('hidden')) continue
      if (el.classList.contains(CLASS.textFoldToggle)) continue
      if (el.matches(NOT_FLOWABLE)) return false
      if (!isInlineLevel(el)) return false
      if (!walk(el, [...chain, el])) return false
    }
    return true
  }
  return walk(block, []) ? items : null
}

/** 元素的字体 —— canvas 认的简写，量出来跟浏览器一致 */
let measureCtx: CanvasRenderingContext2D | null = null
function fontOf(el: HTMLElement): { font: string; letterSpacing: number } {
  const cs = getComputedStyle(el)
  const size = parseFloat(cs.fontSize)
  const weight = cs.fontWeight === 'normal' ? '400' : cs.fontWeight
  const style = cs.fontStyle === 'italic' ? 'italic' : 'normal'
  const font = `${style} ${weight} ${size}px ${cs.fontFamily}`
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (measureCtx) {
    measureCtx.font = font
    // canvas 的字体简写解析失败会静默保留旧值 —— 兜一层
    if (!measureCtx.font.includes(`${size}px`)) {
      measureCtx.font = `${style} ${weight} ${size}px sans-serif`
    }
    return {
      font: measureCtx.font,
      letterSpacing: Number.isFinite(parseFloat(cs.letterSpacing))
        ? parseFloat(cs.letterSpacing)
        : 0,
    }
  }
  return { font, letterSpacing: 0 }
}

/**
 * 绕排一块。
 *
 * 逐行走：每一行按自己的 y 算走廊（走廊宽度随卡片轮廓变），
 * 一截走廊都放不下就跳过这一行（空块占位），文字继续往下找地方。
 */
function flowBlock(
  el: HTMLElement,
  rect: Rect,
  cards: Rect[],
  opts: FlowOptions,
): FlowBlock | null {
  const items = collectItems(el)
  if (!items || items.length === 0) return null

  const prepared = prepareRichInline(
    items.map((item) => ({
      text: item.text,
      font: item.font,
      letterSpacing: item.letterSpacing,
    })),
  )

  const cs = getComputedStyle(el)
  const fontSize = parseFloat(cs.fontSize)
  const lineHeight = parseFloat(cs.lineHeight) || fontSize * 1.6
  // 一行字形占的纵向区间 —— 半行距 + 字高（字形比字号高一点）
  const ink = fontSize * 1.25
  const halfLeading = Math.max(0, (lineHeight - fontSize) / 2)
  const min = opts.min ?? minMeasure(rect)
  const columnWidth = rect.right - rect.left
  // 列本身就比下限还窄 —— 别绕了：绕了整段都是空行
  if (columnWidth < min) return null

  const lines: HTMLElement[] = []
  const sigs: string[] = []
  let cursor = { itemIndex: 0, segmentIndex: 0, graphemeIndex: 0 }
  let y = rect.top
  // 空行只在卡片底下才可能出现 —— 跳过的高度不会超过卡片的高度
  const lastCardBottom = Math.max(...cards.map((c) => c.bottom))
  const skipBudget = Math.ceil((lastCardBottom - rect.top) / lineHeight) + 2
  let skips = 0
  let done = false
  for (let guard = 0; guard < MAX_LINES && !done; guard++) {
    // 走廊按这一行的字形区间算 —— 卡片压到字形才算压到这一行
    const corridor = corridorAt(
      rect,
      cards,
      { top: y + halfLeading, bottom: y + halfLeading + ink },
      min,
    )
    if (corridor.skip) {
      if (++skips > skipBudget) break
      // 走廊太窄 —— 这一行空着，文字往下找地方
      lines.push(skipLine())
      sigs.push('skip')
      y += lineHeight
      continue
    }
    // 一行可能分几截（卡片在中间 → 左右各一截）——
    // 文字像缎带一样从左截流到右截，把卡片包在中间
    const pieces: Array<{ seg: Segment; line: RichInlineLine }> = []
    for (const seg of corridor.segments) {
      const range = layoutNextRichInlineLineRange(prepared, seg.width, cursor)
      if (!range) {
        done = true
        break
      }
      const line = materializeRichInlineLineRange(prepared, range)
      const before = cursor
      cursor = line.end
      // 这一截一个字都放不下 —— 跳过它，别卡死
      if (sameCursor(before, cursor)) continue
      pieces.push({ seg, line })
    }
    lines.push(textLine(pieces, items))
    sigs.push(pieces.map((p) => `${p.seg.width}/${p.seg.offset}`).join('+'))
    y += lineHeight
  }
  if (!done) {
    // 兜底：走廊一直没让出地方 —— 剩下的文字按整宽放下，不能丢
    for (;;) {
      const range = layoutNextRichInlineLineRange(prepared, columnWidth, cursor)
      if (!range) break
      const line = materializeRichInlineLineRange(prepared, range)
      cursor = line.end
      lines.push(textLine([{ seg: { width: columnWidth, offset: 0 }, line }], items))
      sigs.push(`${columnWidth}/0`)
      y += lineHeight
    }
  }

  // 落地：原件收进 fragment，行块插进去
  const toggle = [...el.children].find((c) => c.classList.contains(CLASS.textFoldToggle))
  if (toggle) toggle.remove()
  const saved = document.createDocumentFragment()
  while (el.firstChild) saved.appendChild(el.firstChild)
  for (const line of lines) el.appendChild(line)
  // 折叠箭头是控件 —— 留在最后一行，别让它跟着原件一起消失
  if (toggle) {
    const last = [...lines].reverse().find((l) => !l.classList.contains(CLASS.proseLineSkip))
    const host = last ?? lines[lines.length - 1]
    host?.appendChild(toggle)
  }
  // 决策签名 —— 每一行的走廊。收敛的判据就靠它：
  // 签名不再变，说明这一趟的几何跟决策自洽了。
  return { el, saved, lines, sig: sigs.join(',') }
}

/** 光标有没有动 —— 没动就是这一截塞不下东西 */
function sameCursor(
  a: { itemIndex: number; segmentIndex: number; graphemeIndex: number },
  b: { itemIndex: number; segmentIndex: number; graphemeIndex: number },
): boolean {
  return (
    a.itemIndex === b.itemIndex &&
    a.segmentIndex === b.segmentIndex &&
    a.graphemeIndex === b.graphemeIndex
  )
}

/** 走廊太窄的那一行 —— 空块占位 */
function skipLine(): HTMLElement {
  const el = document.createElement('span')
  el.className = CLASS.proseLine + ' ' + CLASS.proseLineSkip
  return el
}

/**
 * 一行文字 —— 走廊分几截就画几段。
 *
 * 每截是 inline-block：宽度与间距写成内联样式，
 * 文字从左截流到右截，卡片夹在中间。
 */
function textLine(
  pieces: Array<{ seg: Segment; line: RichInlineLine }>,
  items: FlowItem[],
): HTMLElement {
  const el = document.createElement('span')
  el.className = CLASS.proseLine
  let prevEnd = 0 // 上一截的右缘（相对列左缘）
  for (const { seg, line } of pieces) {
    const segEl = document.createElement('span')
    segEl.className = CLASS.proseSeg
    segEl.style.width = `${seg.width}px`
    // 离上一截的距离 —— 中间空出来的地方就是卡片
    segEl.style.marginInlineStart = `${seg.offset - prevEnd}px`
    let first = true
    for (const fragment of line.fragments) {
      const item = items[fragment.itemIndex]
      if (!item) continue
      const text = item.text.slice(fragment.sourceStart, fragment.sourceEnd).trim()
      if (!text) continue
      // item 之间的空白是折叠出来的空隙 —— 画出来
      if (!first && fragment.gapBefore > 0) segEl.appendChild(document.createTextNode(' '))
      segEl.appendChild(cloneChain(item.chain, text))
      first = false
    }
    el.appendChild(segEl)
    prevEnd = seg.offset + seg.width
  }
  return el
}

/**
 * 克隆内联祖先链，把文字塞进去。
 * Range.extractContents 那套（同 text-fold）也是这么保留标记的。
 */
function cloneChain(chain: HTMLElement[], text: string): Node {
  let node: Node = document.createTextNode(text)
  for (let i = chain.length - 1; i >= 0; i--) {
    const clone = chain[i].cloneNode(false) as HTMLElement
    clone.appendChild(node)
    node = clone
  }
  return node
}
