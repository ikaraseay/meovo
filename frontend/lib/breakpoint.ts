/**
 * 桌面 / 移动的唯一分界 —— 1024px。
 *
 * CSS 侧必须配套这两条，一对一：
 *   桌面  @media (min-width: 1024px)
 *   移动  @media not (min-width: 1024px)
 *
 * ⚠️ 移动那条**不能**写 max-width: 1023px —— 那会在 1023~1024px 之间留一条缝：
 * 桌面规则和移动规则都不生效，JS 却已经按移动端处理了。
 * 分屏窗口正好落在缝里（2048 宽的屏对半分 = 1023.5px），
 * 结果是桌面菜单和移动抽屉同时显示、卡片之间没了间距、正文被抽屉压住。
 *
 * CSS 拿不到这里的常量（媒体查询里不能用自定义属性），
 * 所以 CSS 那侧的 1024 由 test/dom-contract.test.ts 盯着，别改歪了。
 */
export const DESKTOP_MIN_WIDTH = 1024

/** 桌面判定 —— matchMedia 用 */
export const DESKTOP_MQ = `(min-width: ${DESKTOP_MIN_WIDTH}px)`

/** 当前视口是不是桌面 */
export const isDesktop = () => window.matchMedia(DESKTOP_MQ).matches
