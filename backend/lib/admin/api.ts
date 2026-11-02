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

/** 读 JSON body —— 坏了就当 null，不让解析异常把路由掀翻 */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}
