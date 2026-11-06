/**
 * 内容层公共出口 —— 实现在同目录的四个 module 里：
 *   post-identity.ts   身份 / 语言解析 / 是否发布
 *   content-queries.ts 集合查询 / 分组 / 相邻 / 系列 / 显示名
 *   urls.ts            站内路径
 *   reading-time.ts    阅读时间
 *
 * 保留这个 barrel：页面继续从 `../lib/posts` 取东西，不用一次改所有 import。
 * 已删除的死导出：groupByYear / getAvailableLocales / findTranslation。
 */

export type { Post } from './post-identity.ts'
export {
  getPostLocale,
  getPostSlug,
  getTranslationKey,
  isPublished,
  resolveForLocale,
} from './post-identity.ts'

export {
  getVisiblePosts,
  sortByDateDesc,
  groupByTranslation,
  resolveItems,
  getAdjacentPosts,
  getAllTags,
  getAllCategories,
  getAllSeries,
  getSeriesEntries,
  sortSeriesItems,
  getTagLabel,
  getCategoryLabel,
  type PostItem,
  type SeriesEntry,
} from './content-queries.ts'

export {
  postPath,
  archivePath,
  tagPath,
  categoryPath,
  seriesPath,
  aboutPath,
} from './urls.ts'

export { readingTime } from './reading-time.ts'
