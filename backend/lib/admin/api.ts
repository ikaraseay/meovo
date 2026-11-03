/**
 * 后台 API 的共用小工具。
 * ---------------------------------------------------------
 * 统一 JSON 响应形状：成功 {ok:true,...}，失败 {error:'<代码>'}。
 * 错误用**代码**，文案在界面那边按代码查 i18n 词典。
 */

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

export function fail(code: string, status = 400): Response {
  return json({ error: code }, status)
}

/** 请求体上限 —— 图库之外的接口都是小 JSON */
export const MAX_BODY_BYTES = 1024 * 1024
/** 图库要装 5MB 的文件，multipart 还要算上头部与边界 */
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024

/**
 * 请求体太大吗 —— 太大就返回一个 413 的响应（调用方原样返回）。
 *
 * 只看 Content-Length：没有这个头（分块传输）就当不知道，照旧往下走 ——
 * 真要防住得靠运行时，但绝大多数请求都有这个头。
 *
 * 关键是**在解析之前**看：读进来再判断等于没判断，内存已经花掉了。
 */
export function bodyTooLarge(request: Request, max = MAX_BODY_BYTES): Response | null {
  const header = request.headers.get('content-length')
  if (!header) return null
  const length = Number(header)
  if (!Number.isFinite(length) || length <= max) return null
  return fail('too_large', 413)
}

/** 读 JSON body —— 坏了就当 null，不让解析异常把路由掀翻 */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}
