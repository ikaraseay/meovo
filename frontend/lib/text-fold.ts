/**
 * 折叠阅读 —— 把正文按句子渐进折起（全文 / 简述 / 要点）。
 * ---------------------------------------------------------
 * 三档的分工照 TextFold（chenxiachan/textfold）的分级来：
 *   全文 —— 原样的段落（作者）
 *   简述 —— 每段最像结论的那一句原句（作者，一字不改）
 *   要点 —— 模型写的「要点 + 理由」（模型的话）
 * **两种词不混**：混了简述与要点就分不出档，读者只会觉得两档一样。
 * 没有 AI 要点时退回规则（露出论断句）。读者在控件里选层级，选择记进偏好；
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

/** 中文段落的「论断词」—— 结论句常在这些词附近 */
const CLAIM_MARKERS = [
  '认为', '主张', '应当', '应该', '需要', '必须', '旨在', '在于', '而是', '可见',
  '因此', '所以', '证明', '表明', '说明', '标志', '意味着', '构成', '属于', '界定', '确立', '即：',
]
/** 条件句开头 —— 多半是铺垫，不是结论 */
const COND_LEADS = ['而如果', '如果', '若', '倘若', '假如', '尽管', '虽然', '由于', '随着', '鉴于', '但是']
/** 有中文才用中文启发式 */
const CJK = /[\u4e00-\u9fff]/

/**
 * 这一段的结论句是第几句（0 起）。
 *
 * 中文段落常以引子或条件句开头，真正的结论在一两句之后 —— 照 TextFold 的打分：
 * 含论断词加分，含冒号加分，以条件词开头减分，基础分随句序递减（越靠前越可能是结论）。
 * 没有中文就取第一句。
 *
 * @param plain 段落纯文本
 * @param ends 句末偏移（累计长度）
 * @returns 结论句的序号
 */
export function pickClaimSentence(plain: string, ends: number[]): number {
  if (!CJK.test(plain)) return 0
  let best = 0
  let bestScore = -99
  const limit = Math.min(4, ends.length)
  for (let i = 0; i < limit; i++) {
    const text = plain.slice(i === 0 ? 0 : ends[i - 1], ends[i])
    if (text.trim().length < 10) continue
    let score = 0.4 - 0.6 * i
    if (CLAIM_MARKERS.some((m) => text.includes(m))) score += 3
    if (text.includes('：') || text.includes(':')) score += 1.5
    if (COND_LEADS.some((m) => text.startsWith(m))) score -= 2.5
    if (score > bestScore) {
      best = i
      bestScore = score
    }
  }
  return best
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
  /** 结论句之前的铺垫 —— 折叠两档都藏起来 */
  lead: HTMLSpanElement | null
  /** 结论句 —— 简述档显示的就是它（作者原话） */
  claim: HTMLSpanElement
  /** 结论句之后的展开 —— 折叠两档都藏起来 */
  rest: HTMLSpanElement | null
  /** AI 写的要点 + 理由 —— 要点档显示的是它（模型的话） */
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

  /** 展开状态：作者的原文全露出来 */
  function showAll(fp: FoldPara): void {
    if (fp.lead) fp.lead.hidden = false
    fp.claim.hidden = false
    if (fp.rest) fp.rest.hidden = false
  }

  function applyLevel(level: FoldLevel): void {
    for (const fp of paras) {
      const { lead, claim, rest, summaryEl, toggle } = fp
      if (level === 'full') {
        showAll(fp)
        if (summaryEl) summaryEl.hidden = true
        toggle.hidden = true
        fp.expanded = false
        continue
      }
      if (fp.expanded) {
        // 展开的这一段：作者的原文全露出来，模型的话让位
        showAll(fp)
        if (summaryEl) summaryEl.hidden = true
        toggle.hidden = false
        toggle.setAttribute('aria-expanded', 'true')
        toggle.setAttribute('aria-label', labels.collapse)
        continue
      }
      toggle.setAttribute('aria-expanded', 'false')
      toggle.setAttribute('aria-label', labels.expand)
      if (level === 'key' && summaryEl) {
        // 要点档：只留模型的话，作者的原句全藏起来
        if (lead) lead.hidden = true
        claim.hidden = true
        if (rest) rest.hidden = true
        summaryEl.hidden = false
      } else {
        // 简述档（要点档没有模型的话时也退回这一档）：只留论断那一句
        if (lead) lead.hidden = true
        claim.hidden = false
        if (rest) rest.hidden = true
        if (summaryEl) summaryEl.hidden = true
      }
      toggle.hidden = false
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

    // 结论句 —— 简述档留的就是它（作者原话，一字不改）
    const claimIdx = pickClaimSentence(plain, ends)
    const claimStart = claimIdx === 0 ? 0 : snapBoundary(ends[claimIdx - 1], excludedRanges)
    const claimEnd = Math.min(snapBoundary(ends[claimIdx], excludedRanges), total)
    if (claimStart >= claimEnd) continue
    const hasLead = claimStart > 0
    const hasRest = claimEnd < total
    if (!hasLead && !hasRest) continue

    // 锚点：从后往前插 —— 后面的切口先动，前面的偏移才还准
    let anchorEnd: HTMLElement | null = null
    if (hasRest) {
      const loc = locate(chunks, claimEnd)
      if (!loc) continue
      const range = document.createRange()
      range.setStart(loc.node, loc.offset)
      range.setEnd(loc.node, loc.offset)
      anchorEnd = document.createElement('span')
      range.insertNode(anchorEnd)
    }
    const locStart = locate(chunks, claimStart)
    if (!locStart) continue
    const startRange = document.createRange()
    startRange.setStart(locStart.node, locStart.offset)
    startRange.setEnd(locStart.node, locStart.offset)
    const anchorStart = document.createElement('span')
    startRange.insertNode(anchorStart)

    // 尾巴（结论句之后）—— 先切
    let rest: HTMLSpanElement | null = null
    if (anchorEnd) {
      const range = document.createRange()
      range.setStartAfter(anchorEnd)
      range.setEndAfter(p.lastChild as Node)
      rest = document.createElement('span')
      rest.className = CLASS.textFoldRest
      rest.appendChild(range.extractContents())
      anchorEnd.replaceWith(rest)
    }

    // 结论句
    const claimRange = document.createRange()
    claimRange.setStartAfter(anchorStart)
    if (rest) claimRange.setEndBefore(rest)
    else claimRange.setEndAfter(p.lastChild as Node)
    const claim = document.createElement('span')
    claim.className = CLASS.textFoldClaim
    claim.appendChild(claimRange.extractContents())
    anchorStart.replaceWith(claim)

    // 铺垫（结论句之前）
    let lead: HTMLSpanElement | null = null
    if (hasLead) {
      const range = document.createRange()
      range.setStart(p, 0)
      range.setEndBefore(claim)
      lead = document.createElement('span')
      lead.className = CLASS.textFoldRest
      lead.appendChild(range.extractContents())
      p.insertBefore(lead, claim)
    }

    // 切口正好落在行内元素起点时，extractContents 会在头部留一个空壳（<a></a>）——
    // 空链接看不见却 tab 得进去，清掉。只清没有 id、无元素子节点且无文字的空行内壳。
    for (const el of [...p.querySelectorAll(EMPTY_INLINE)]) {
      if (!el.id && el.children.length === 0 && el.textContent === '') el.remove()
    }

    // AI 的要点 + 理由 —— 要点档显示的是它（模型的话）
    // 按段落文本取，不按下标 —— 构建期与运行时的段落集合并不完全一样
    let summaryEl: HTMLSpanElement | null = null
    const entry = summaries?.[foldKey(plain)]
    if (entry) {
      summaryEl = document.createElement('span')
      summaryEl.className = CLASS.textFoldSummary
      summaryEl.textContent = entry.takeaway
      if (entry.reason) {
        const reasonEl = document.createElement('span')
        reasonEl.className = CLASS.textFoldReason
        reasonEl.textContent = entry.reason
        summaryEl.appendChild(reasonEl)
      }
      summaryEl.hidden = true
      // 插在结论句之后 —— 展开时摘要隐藏，原文露出来
      p.insertBefore(summaryEl, claim.nextSibling)
    }

    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = CLASS.textFoldToggle
    toggle.setAttribute('aria-expanded', 'false')
    toggle.setAttribute('aria-label', labels.expand)
    toggle.innerHTML = CHEVRON
    p.appendChild(toggle)
    p.setAttribute(ATTR.textFold, '')

    const fp: FoldPara = { lead, claim, rest, summaryEl, toggle, expanded: false }
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
      if (level === 'full' || level === 'brief' || level === 'key') setLevel(level)
    })
  }

  bar.hidden = false
  if (card) card.hidden = false
  applyLevel(current)
  syncBar(current)
}