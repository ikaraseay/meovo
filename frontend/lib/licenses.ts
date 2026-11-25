/**
 * 许可协议 —— 文章页「文本协议卡片」的数据来源。
 * ---------------------------------------------------------
 * LICENSE_IDS 同时是 frontmatter 的 license 字段取值（见 frontend/content.config.ts）：
 * 两边从同一份列表派生，改一处不会漏另一处。
 *
 * 协议名与说明走 i18n（key 写成 TranslationKey —— 词条缺失编译期就报错）；
 * 这里只放不随语言变的事实：协议原文链接。
 */
import type { TranslationKey } from '../i18n/ui.ts'

/** 可选的许可协议 —— 顺序即 frontmatter 里书写的顺序 */
export const LICENSE_IDS = [
  'cc-by',
  'cc-by-sa',
  'cc-by-nd',
  'cc-by-nc',
  'cc-by-nc-sa',
  'cc-by-nc-nd',
  'cc0',
  'all-rights',
] as const

export type LicenseId = (typeof LICENSE_IDS)[number]

export interface License {
  /** 协议名 */
  nameKey: TranslationKey
  /** 一句话说明这个协议允许什么 */
  noteKey: TranslationKey
  /** 协议原文链接 —— 「保留所有权利」没有原文，链接就省了 */
  url?: string
}

export const LICENSES: Record<LicenseId, License> = {
  'cc-by': {
    nameKey: 'post.license.name.ccBy',
    noteKey: 'post.license.note.ccBy',
    url: 'https://creativecommons.org/licenses/by/4.0/',
  },
  'cc-by-sa': {
    nameKey: 'post.license.name.ccBySa',
    noteKey: 'post.license.note.ccBySa',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  },
  'cc-by-nd': {
    nameKey: 'post.license.name.ccByNd',
    noteKey: 'post.license.note.ccByNd',
    url: 'https://creativecommons.org/licenses/by-nd/4.0/',
  },
  'cc-by-nc': {
    nameKey: 'post.license.name.ccByNc',
    noteKey: 'post.license.note.ccByNc',
    url: 'https://creativecommons.org/licenses/by-nc/4.0/',
  },
  'cc-by-nc-sa': {
    nameKey: 'post.license.name.ccByNcSa',
    noteKey: 'post.license.note.ccByNcSa',
    url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  },
  'cc-by-nc-nd': {
    nameKey: 'post.license.name.ccByNcNd',
    noteKey: 'post.license.note.ccByNcNd',
    url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
  },
  'cc0': {
    nameKey: 'post.license.name.cc0',
    noteKey: 'post.license.note.cc0',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  'all-rights': {
    nameKey: 'post.license.name.allRights',
    noteKey: 'post.license.note.allRights',
  },
}
