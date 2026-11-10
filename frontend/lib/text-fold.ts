/**
 * 折叠阅读 —— 把正文按句子渐进折起（全文 / 每段两句 / 每段一句）。
 * ---------------------------------------------------------
 * 规则折叠 + AI 摘要：「两句」模式取前 2 句（规则），「一句」模式用构建期生成的 AI 摘要。
 * 没有 AI 摘要时回退到规则（取第 1 句）。读者在控件里选层级，选择记进偏好；
 * 每段还能单独展开 / 收起。
 *
 * 切句靠 Intl.Segmenter（中文按 。！？，英文按 .!?），再过一遍缩写合并
 * （Dr. / J. K. 这类不该被当成句末）。纯函数单独可测（test/text-fold.test.ts）。
 *
 *  split 用 DOM Range 的 extractContents —— 它按规范克隆部分选中的祖先，
 *  跨句的链接 / 加粗会被拆成两半但都保留标记，不用 innerHTML 重建正文。
 */
import { ATTR, CLASS } from './dom-contract.ts'
import { readFoldLevel, setPref, type FoldLevel } from './preferences.ts'
import { foldKey } from './text-fold-key.ts'
import { articleSummaries } from '../data/article-summaries.ts'

export type { FoldLevel }

/** 头衔缩写 —— 以这些词加句点结尾的片段不是句末，跟下一段合并 */
const TITLE_ABBREV =
  /(?:^|[\s(])(?:Dr|Mr|Mrs|Ms|Prof|St|Jr|Sr|Fig|No|Vol|pp|vs|approx|dept|est|govt)\.$/i
/** 单个大写字母加句点 —— 姓名首字母（J. / K.） */
const INITIAL = /(?:^|\s)[A-Z]\.$/

/** 这个片段该不该跟下一段连起来（缩写 / 首字母 / 下一段小写开头） */
function joins(prev: string, next: string): boolean {
  const p = prev.trimEnd()
  const n = next.trimStart()
  if (!p.endsWith('.')) return false
  if (TITLE_ABBREV.test(p)) return true
  if (INITIAL.test(p)) return true
  // 句末之后通常大写开头；小写开头说明上一句其实没完
  if (/^[a-z]/.test(n)) return true
  return false
}

/**
 * 把一段纯文本切成句子（保留每句尾随的空白，偏移才对得上原文）。
 * 没有 Intl.Segmenter 的引擎上当一整句 —— 宁可不折，也不乱折。
 */
export function segmentSentences(text: string): string[] {
  if (!text) return []
  let parts: string[]
  try {
    const locale = /[\u4e00-\u9fff]/.test(text) ? 'zh' : 'en'
    const segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' })
    parts = [...segmenter.segment(text)].map((s) => s.segment)
  } catch {
    return [text]
  }
  const merged: string[] = []
  for (const part of parts) {
    const prev = merged[merged.length - 1]
    if (prev !== undefined && joins(prev, part)) merged[merged.length - 1] = prev + part
    else merged.push(part)
  }
  return merged
}

/** 每个句子的句末偏移（累计长度）—— 只数有实际内容的句子，纯空白不算 */
export function sentenceEnds(text: string): number[] {
  const ends: number[] = []
  let pos = 0
  for (const sentence of segmentSentences(text)) {
    pos += sentence.length
    if (sentence.trim().length > 0) ends.push(pos)
  }
  return ends
}

/**
 * 句末偏移落在排除区（行内代码 / 悬停显示等）内部时，挪到该区末尾 ——
 * 不能把一句代码从中间劈开。正好在边界上就不动。
 */
export function snapBoundary(
  offset: number,
  excluded: ReadonlyArray<readonly [number, number]>,
): number {
  for (const [start, end] of excluded) {
    if (offset > start && offset < end) return end
  }
  return offset
}

/** 这些子树里的文字不参与断句（代码 / 按键 / 悬停显示 / 无障碍隐藏） */
const EXCLUDED = 'code, kbd, samp, .' + CLASS.spoiler + ', [aria-hidden="true"]'
/** 含这些的段落不折 —— 图 / 视频折起来就把内容藏没了 */
const MEDIA = 'img, video, iframe, audio, canvas, svg, object, embed'
/** 切 split 后可能留下的空行内壳 —— 清掉免得空链接键盘 tab 得进去却看不见 */
const EMPTY_INLINE = 'a, span, strong, em, b, i, u, s, code, kbd, samp, mark, small, sub, sup'
/** 展开 / 收起箭头（可信常量，不是用户内容） */
const CHEVRON =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>'

export interface TextFoldLabels {
  /** 展开本段 */
  expand: string
  /** 收起本段 */
  collapse: string
  /** 切换层级时读给屏幕阅读器的状态 */
  status: Record<FoldLevel, string>
}

export interface TextFoldOptions {
  /** 折叠状态变了 —— 调用方据此重排桌面 / 同步目录高亮 */
  onChange?: () => void
}

export interface TextFoldInitOptions extends TextFoldOptions {
  /** 文章标识（locale/slug）—— 用来查 AI 摘要 */
  articleKey?: string
}

interface TextChunk {
  node: Text
  start: number
  end: number
}

interface FoldPara {
  restA: HTMLSpanElement
  restB: HTMLSpanElement | null
  /** AI 摘要元素 —— 「一句」模式时显示这个，替代第一句 */
  summaryEl: HTMLSpanElement | null
  toggle: HTMLButtonElement
  expanded: boolean
}

/** 把累计偏移定位到某个文本节点里的局部偏移 */
function locate(chunks: TextChunk[], offset: number): { node: Text; offset: number } | null {
  for (const chunk of chunks) {
    if (offset < chunk.end) return { node: chunk.node, offset: offset - chunk.start }
  }
  return null
}

/** 这个文本节点是不是落在排除子树里 */
function isExcluded(node: Node, root: HTMLElement): boolean {
  let el = node.parentElement
  while (el && el !== root) {
    if (el.matches(EXCLUDED)) return true
    el = el.parentElement
  }
  return false
}

/**
 * 给正文接上折叠阅读。
 * prose 是 .prose 容器，bar 是控件（服务端先 hidden，这里揭开）。
 * 没有任何可折的段落时控件保持隐藏。
 */
export function initTextFold(
  prose: HTMLElement,
  bar: HTMLElement,
  labels: TextFoldLabels,
  options: TextFoldInitOptions = {},
): void {
  const buttons = [...bar.querySelectorAll<HTMLButtonElement>('[' + ATTR.textFoldLevel + ']')]
  const statusEl = bar.querySelector<HTMLElement>('[' + ATTR.textFoldStatus + ']')
  // 控件现在独立一张玻璃卡 —— 没有可折段落时连卡一起藏，别留一张空卡
  const card = bar.closest<HTMLElement>('[' + ATTR.widget + ']')
  let current: FoldLevel = readFoldLevel()
  const paras: FoldPara[] = []

  // AI 摘要 —— 按文章 key 查，没有就用规则回退
  const summaries = options.articleKey ? articleSummaries[options.articleKey] : null

  function applyLevel(level: FoldLevel): void {
    for (const fp of paras) {
      const { restA, restB, summaryEl, toggle } = fp
      if (level === 'full') {
        restA.hidden = false
        if (restB) restB.hidden = false
        if (summaryEl) summaryEl.hidden = true
        toggle.hidden = true
        fp.expanded = false
        continue
      }
      if (fp.expanded) {
        restA.hidden = false
        if (restB) restB.hidden = false
        if (summaryEl) summaryEl.hidden = true
        toggle.hidden = false
        toggle.setAttribute('aria-expanded', 'true')
        toggle.setAttribute('aria-label', labels.collapse)
        continue
      }
      toggle.setAttribute('aria-expanded', 'false')
      toggle.setAttribute('aria-label', labels.expand)
      // 「两句」和「一句」都用 AI 摘要（如果有）；没有就回退到规则切分
      if (summaryEl) {
        // 有 AI 摘要：两句 / 一句都显示摘要，隐藏原文
        restA.hidden = true
        if (restB) restB.hidden = true
        summaryEl.hidden = false
        toggle.hidden = false
      } else if (level === 'one') {
        // 无摘要 + 一句模式：隐藏全部，只留展开按钮
        restA.hidden = true
        if (restB) restB.hidden = true
        toggle.hidden = false
      } else {
        // 无摘要 + 两句模式：第二段露出来，第三段起收起
        restA.hidden = false
        if (restB) {
          restB.hidden = true
          toggle.hidden = false
        } else {
          toggle.hidden = true
        }
      }
    }
  }

  function syncBar(level: FoldLevel): void {
    for (const btn of buttons) {
      const active = btn.getAttribute(ATTR.textFoldLevel) === level
      btn.setAttribute('aria-pressed', String(active))
      btn.classList.toggle(CLASS.active, active)
    }
    if (statusEl) statusEl.textContent = labels.status[level] ?? ''
  }

  function setLevel(level: FoldLevel): void {
    if (level === current) return
    current = level
    for (const fp of paras) fp.expanded = false
    applyLevel(level)
    syncBar(level)
    setPref('foldLevel', level)
    options.onChange?.()
  }

  for (const p of [...prose.querySelectorAll<HTMLParagraphElement>(':scope > p')]) {
    if (p.hasAttribute(ATTR.textFold)) continue
    if (p.querySelector(MEDIA)) continue

    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT)
    const chunks: TextChunk[] = []
    const excludedRanges: Array<readonly [number, number]> = []
    let plain = ''
    let node: Node | null
    while ((node = walker.nextNode())) {
      const text = node as Text
      const start = plain.length
      plain += text.data
      const end = plain.length
      if (end > start) chunks.push({ node: text, start, end })
      if (isExcluded(text, p)) excludedRanges.push([start, end])
    }

    const ends = sentenceEnds(plain)
    if (ends.length < 2) continue
    const total = plain.length
    const cut1 = snapBoundary(ends[0], excludedRanges)
    let cut2: number | null = ends.length >= 3 ? snapBoundary(ends[1], excludedRanges) : null
    if (cut1 <= 0 || cut1 >= total) continue
    if (cut2 !== null && (cut2 <= cut1 || cut2 >= total)) cut2 = null

    const loc1 = locate(chunks, cut1)
    if (!loc1) continue
    const loc2 = cut2 !== null ? locate(chunks, cut2) : null

    // 先切靠后的第二刀，再切第一刀 —— 第一刀的文本节点不会被第二刀动到
    let restB: HTMLSpanElement | null = null
    if (loc2) {
      const range = document.createRange()
      range.setStart(loc2.node, loc2.offset)
      range.setEndAfter(p.lastChild as Node)
      restB = document.createElement('span')
      restB.className = CLASS.textFoldRest
      restB.appendChild(range.extractContents())
      p.appendChild(restB)
    }
    const range = document.createRange()
    range.setStart(loc1.node, loc1.offset)
    if (restB) range.setEndBefore(restB)
    else range.setEndAfter(p.lastChild as Node)
    const restA = document.createElement('span')
    restA.className = CLASS.textFoldRest
    restA.appendChild(range.extractContents())
    if (restB) p.insertBefore(restA, restB)
    else p.appendChild(restA)

    // 切口正好落在行内元素起点时，extractContents 会在头部留一个空壳（<a></a>）——
    // 空链接看不见却 tab 得进去，清掉。只清没有 id、无元素子节点且无文字的空行内壳。
    for (const el of [...p.querySelectorAll(EMPTY_INLINE)]) {
      if (!el.id && el.children.length === 0 && el.textContent === '') el.remove()
    }

    // AI 摘要 —— 「一句」模式时显示这个，替代机械切出来的第一句
    // 按段落文本取，不按下标 —— 构建期与运行时的段落集合并不完全一样
    let summaryEl: HTMLSpanElement | null = null
    const summary = summaries?.[foldKey(plain)]
    if (summary) {
      summaryEl = document.createElement('span')
      summaryEl.className = 'text-fold-summary'
      summaryEl.textContent = summary
      summaryEl.hidden = true
      // 插在 restA 之前 —— 展开时摘要隐藏，原文露出来
      p.insertBefore(summaryEl, restA)
    }

    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = CLASS.textFoldToggle
    toggle.setAttribute('aria-expanded', 'false')
    toggle.setAttribute('aria-label', labels.expand)
    toggle.innerHTML = CHEVRON
    p.appendChild(toggle)
    p.setAttribute(ATTR.textFold, '')

    const fp: FoldPara = { restA, restB, summaryEl, toggle, expanded: false }
    toggle.addEventListener('click', () => {
      fp.expanded = !fp.expanded
      applyLevel(current)
      options.onChange?.()
    })
    paras.push(fp)
  }

  if (paras.length === 0) {
    if (card) card.hidden = true
    return
  }

  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      const level = btn.getAttribute(ATTR.textFoldLevel)
      if (level === 'full' || level === 'two' || level === 'one') setLevel(level)
    })
  }

  bar.hidden = false
  if (card) card.hidden = false
  applyLevel(current)
  syncBar(current)
}