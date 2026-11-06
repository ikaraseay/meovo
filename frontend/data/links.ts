/**
 * 友链数据
 *
 * 加友链改这里就行 —— 关于页会自动渲染，不用动模板。
 * `description` 可以留空。
 * `avatar` 留空则用站点标题首字做文字头像。
 * `status` 留空则运行时探测（客户端 fetch 超时 = 不可达）。
 */
export interface FriendLink {
  /** 站点名 */
  name: string
  /** 站点地址 */
  url: string
  /** 一句话介绍 */
  description?: string
  /** 头像地址（留空则用站点标题首字做文字头像） */
  avatar?: string
  /** 手动标注状态：'ok' | 'down' | 'unknown'（留空 = 运行时探测） */
  status?: 'ok' | 'down' | 'unknown'
}

export const friendLinks: FriendLink[] = [
  // 例：{ name: 'Wofuf', url: 'https://example.com', description: '前端项目' },
  { name: '赵叶轩', url: 'https://www.wxiaoyi.cn', description: '一个热爱技术的开发者' },
]
