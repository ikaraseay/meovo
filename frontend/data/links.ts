/**
 * 友链数据
 *
 * 加友链改这里就行 —— `/<lang>/links/` 页面会自动渲染，不用动模板。
 * `description` 可以留空。
 */
export interface FriendLink {
  /** 站点名 */
  name: string
  /** 站点地址 */
  url: string
  /** 一句话介绍 */
  description?: string
}

export const friendLinks: FriendLink[] = [
  // 例：{ name: 'Wofuf', url: 'https://example.com', description: '前端项目' },
  { name: '赵叶轩', url: 'https://www.wxiaoyi.cn', description: '一个热爱技术的开发者' },
]
