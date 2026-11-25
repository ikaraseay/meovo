/**
 * 友链申请 —— 把表单拼成一封邮件（mailto）。
 * ---------------------------------------------------------
 * 静态站没有服务端可发信：填完把 mailto 交给系统的邮件客户端，
 * 作者在自己的邮箱里收到这四项。
 */

/** 表单的四项 */
export interface LinkRequest {
  name: string
  url: string
  avatar: string
  description: string
}

/** 四项的标签 —— 调用方按界面语言给 */
export interface LinkRequestLabels {
  name: string
  url: string
  avatar: string
  description: string
}

/** 正文：一行一项 */
export function requestBody(request: LinkRequest, labels: LinkRequestLabels): string {
  return [
    `${labels.name}: ${request.name}`,
    `${labels.url}: ${request.url}`,
    `${labels.avatar}: ${request.avatar}`,
    `${labels.description}: ${request.description}`,
  ].join('\n')
}

/** mailto 链接 —— 主题与正文都要转义（中文与换行不能裸着进 URL） */
export function buildRequestMailto(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
