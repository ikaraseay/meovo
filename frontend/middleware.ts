/**
 * Astro 的中间件入口 —— 鉴权的实现放在 backend/middleware.ts。
 * ---------------------------------------------------------
 * Astro 只在 <srcDir>/middleware.ts 找用户中间件，而 srcDir 现在是 frontend/，
 * 所以这里只做一次转发。
 */

export { onRequest } from '../backend/middleware.ts'
