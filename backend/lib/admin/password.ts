/**
 * 口令与登录限流 —— 纯函数。
 * ---------------------------------------------------------
 * 口令不存明文：Worker secret 里放的是它的 SHA-256，比对时现算现比。
 */

/** 同一 IP 一个窗口内允许的失败次数 */
export const LOGIN_MAX_ATTEMPTS = 5

/** 限流窗口（毫秒） */
export const LOGIN_WINDOW_MS = 10 * 60 * 1000

/** 口令 → SHA-256 十六进制 */
export async function hashPassword(password: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** 常量时间比对 —— 长度不同直接否，其余逐字符累加差异 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** 口令对不对（secret 里存的是哈希） */
export async function verifyPassword(password: string, expectedHash: string): Promise<boolean> {
  if (!expectedHash) return false
  return timingSafeEqual(await hashPassword(password), expectedHash.trim().toLowerCase())
}

/**
 * 这次登录要不要拒。
 * count 是**已经失败过**的次数 —— 第 6 次（count = 5）被拒。
 * 窗口过了就重新算（调用方负责把计数归零）。
 */
export function isRateLimited(
  count: number,
  windowAt: number,
  now: number = Date.now(),
): boolean {
  if (count < LOGIN_MAX_ATTEMPTS) return false
  return now - windowAt < LOGIN_WINDOW_MS
}

/**
 * 记完这次失败之后要不要锁。
 *
 * count 是**算上这次**的失败数 —— 之前的失败数是 count - 1：
 * 第 6 次失败（之前已失败 5 次）才锁，前 5 次回「口令错了」。
 * 计数由 D1 一条语句原子累加，这里只管判定。
 */
export function lockAfterFailure(
  count: number,
  windowAt: number,
  now: number = Date.now(),
): boolean {
  return isRateLimited(count - 1, windowAt, now)
}
