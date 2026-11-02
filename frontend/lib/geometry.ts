/**
 * 几何词汇 —— 全站一套坐标系。
 * ---------------------------------------------------------
 * 悬浮栏（floating-bar-layout）和玻璃桌面（desk-layout）量的是同一种东西：
 * 点、尺寸、边界。词汇统一放这里，两个 layout module 共用，
 * 夹取公式（clamp）也只有一份 —— 以前两处各写一遍，改一处就歪。
 */

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

/** 视口 / 桌面参考区 —— 尺寸一样，含义不同 */
export type Viewport = Size

export type Rect = Point & Size

/** 夹取 —— 全站只有这一份 */
export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max))
