/**
 * 二级菜单 —— 长按展开、拖到子项松手选择、玻璃镜片跟随。
 * ---------------------------------------------------------
 * 只跟面板相关的 DOM 打交道（面板 / 镜片 / 触发器）；开/关时通过回调让调用方
 * 处理与设置弹窗的互斥，不直接认识「弹窗」这个概念。
 */

import { applyLiquidGlass } from './liquid-glass'
import { ATTR, CLASS } from './dom-contract'

/** 按住多久算「长按」。300ms 够跟手了；再慢一点的点击也会落到第一项，不会失灵 */
const LONG_PRESS_MS = 300
/** 长按期间允许的抖动 */
const MOVE_TOLERANCE = 8

export interface NavPanelOptions {
  panel: HTMLElement | null
  lens: HTMLElement | null
  triggers: HTMLAnchorElement[]
  /** 面板展开前调用（让设置弹窗等其它覆盖层先关掉） */
  onBeforeOpen?: () => void
}

export interface NavPanelController {
  close: () => void
  open: (trigger: HTMLAnchorElement) => void
}

export function initNavPanel(options: NavPanelOptions): NavPanelController {
  const { panel, lens, triggers } = options

  const noop = (): void => {}
  if (!panel) return { close: noop, open: noop }

  let pressTimer = 0
  let pressStart = { x: 0, y: 0 }
  let pressTrigger: HTMLAnchorElement | null = null
  let dragging = false
  /** 长按之后浏览器还会补一个 click —— 拖到子项上时得吞掉，不然会被触发器的链接抢走 */
  let swallowClick = false

  /** 指针下面那个子菜单项 */
  function itemUnder(x: number, y: number): HTMLElement | null {
    for (const item of panel!.querySelectorAll<HTMLElement>(`[${ATTR.panelLink}]`)) {
      const rect = item.getBoundingClientRect()
      if (rect.width === 0) continue
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return item
    }
    return null
  }

  function open(trigger: HTMLAnchorElement) {
    if (!panel) return
    // 同一时刻只有一个覆盖层 —— 交给调用方关掉别的
    options.onBeforeOpen?.()

    const index = trigger.closest<HTMLElement>(`[${ATTR.navGroup}]`)?.getAttribute(ATTR.navGroup)
    panel.querySelectorAll<HTMLElement>(`[${ATTR.panelItems}]`).forEach((list) => {
      list.classList.toggle(CLASS.active, list.getAttribute(ATTR.panelItems) === index)
    })

    const rect = trigger.getBoundingClientRect()
    panel.style.top = `${rect.bottom + 8}px`
    // 面板居中在触发器下方 —— 别顶出视口
    const half = panel.offsetWidth / 2
    const cx = Math.max(half + 8, Math.min(rect.left + rect.width / 2, window.innerWidth - half - 8))
    panel.style.left = `${cx}px`

    panel.classList.add(CLASS.open)
    trigger.setAttribute('aria-expanded', 'true')
  }

  function close() {
    if (!panel) return
    panel.classList.remove(CLASS.open)
    for (const trigger of triggers) trigger.setAttribute('aria-expanded', 'false')
    hideLens()
  }

  function setActiveItem(item: HTMLElement | null) {
    if (!panel) return
    panel.querySelectorAll<HTMLElement>(`[${ATTR.panelLink}]`).forEach((el) => {
      el.classList.toggle(CLASS.active, el === item)
    })
    if (!lens) return
    if (!item) {
      hideLens()
      return
    }
    const rect = item.getBoundingClientRect()
    const base = panel.getBoundingClientRect()
    // 镜片在面板里，坐标得换成面板内的相对坐标
    // 尺寸一次到位（不做过渡）：折射的位移图按实测尺寸生成，
    // 逐帧变化的尺寸会一帧一张图 —— 细节见 liquid-glass.ts
    lens.style.width = `${rect.width}px`
    lens.style.height = `${rect.height}px`
    lens.style.transform = `translate3d(${rect.left - base.left + rect.width / 2}px, ${rect.top - base.top + rect.height / 2}px, 0) translate(-50%, -50%)`
    lens.classList.add(CLASS.visible)
  }

  function hideLens() {
    lens?.classList.remove(CLASS.visible)
  }

  function startLongPress() {
    if (!pressTrigger) return
    dragging = true
    pressTrigger.classList.add(CLASS.pressing)
    open(pressTrigger)
  }

  function endPress(e: PointerEvent) {
    pressTrigger?.classList.remove(CLASS.pressing)
    if (pressTimer) {
      window.clearTimeout(pressTimer)
      pressTimer = 0
    }
    if (dragging) {
      dragging = false
      const item = itemUnder(e.clientX, e.clientY)
      const href = item?.getAttribute('href')
      if (href) {
        // 拖到了某个子项 —— 浏览器补的那个 click 要吞掉，不然会被触发器的链接抢走
        swallowClick = true
        window.location.href = href
        window.setTimeout(() => {
          swallowClick = false
        }, 400)
      }
      // 没落在子项上就不动：click 照常走，落到第一项。
      // （面板收不收交给「点外面收起」那个监听器）
    }
  }

  window.addEventListener('pointerdown', (e) => {
    const trigger = (e.target as Element).closest?.<HTMLAnchorElement>('[data-nav-trigger]')
    if (!trigger || e.button !== 0) return
    pressTrigger = trigger
    pressStart = { x: e.clientX, y: e.clientY }
    window.clearTimeout(pressTimer)
    pressTimer = window.setTimeout(startLongPress, LONG_PRESS_MS)
  })

  window.addEventListener('pointermove', (e) => {
    if (dragging) {
      setActiveItem(itemUnder(e.clientX, e.clientY))
      return
    }
    if (!pressTimer) return
    if (Math.hypot(e.clientX - pressStart.x, e.clientY - pressStart.y) > MOVE_TOLERANCE) {
      window.clearTimeout(pressTimer)
      pressTimer = 0
    }
  })

  window.addEventListener('pointerup', endPress)
  window.addEventListener('pointercancel', endPress)

  // 长按之后浏览器补的那个 click —— 吞掉，不然会跳到第一项
  for (const trigger of triggers) {
    trigger.addEventListener(
      'click',
      (e) => {
        if (!swallowClick) return
        swallowClick = false
        e.preventDefault()
        e.stopPropagation()
      },
      true,
    )
  }

  // 点外面收起
  document.addEventListener('click', (e) => {
    const target = e.target as Element
    if (target.closest?.('[data-nav-panel]') || target.closest?.('[data-nav-trigger]')) return
    close()
  })

  // 面板展开后（键盘打开的），鼠标移上去镜片也要跟过去
  panel.addEventListener('pointermove', (e) => {
    if (dragging) return
    setActiveItem(itemUnder(e.clientX, e.clientY))
  })

  // 键盘：↓ 展开并聚焦第一项，Esc 收起
  for (const trigger of triggers) {
    trigger.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown') return
      e.preventDefault()
      open(trigger)
      panel
        .querySelector<HTMLElement>(`.nav-panel-items.${CLASS.active} [${ATTR.panelLink}]`)
        ?.focus()
    })
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !panel.classList.contains(CLASS.open)) return
    close()
    pressTrigger?.focus()
  })

  // 镜片的折射按它自己的尺寸挂（见 liquid-glass.ts）
  if (lens) applyLiquidGlass(lens)

  return { close, open }
}
