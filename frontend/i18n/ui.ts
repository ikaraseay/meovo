/* =========================================================
   UI 文案词典
   ---------------------------------------------------------
   约定（借鉴 Wofuf-edge 的 docs/I18N.md）：
     · 每条文案同时带中英两种语言
     · 站点源语言是中文（defaultLocale = 'zh'），
       所以「当前语言缺文案」时回落到**默认语言**，不是英文
     · 界面文案一律走 t()，组件里不许出现硬编码的用户可见文案

   新增条目必须同时写 zh 和 en。
   ========================================================= */

import siteConfig from '../../config/site.json' with { type: 'json' }

export const locales = ['zh', 'en'] as const

export type Locale = (typeof locales)[number]

/** 源语言与默认语言 —— 也是缺文案时的回落目标 */
export const defaultLocale: Locale = 'zh'

export type TranslationItem = { zh: string; en: string }

export type Translations = Record<string, TranslationItem>

export const ui = {
  // 导航
  'nav.home': { zh: '首页', en: 'Home' },
  'nav.about': { zh: '关于', en: 'About' },
  'nav.archive': { zh: '归档', en: 'Archive' },
  'nav.tags': { zh: '标签', en: 'Tags' },
  'nav.categories': { zh: '分类', en: 'Categories' },
  'nav.series': { zh: '系列', en: 'Series' },
  'nav.allPosts': { zh: '全部文章', en: 'All posts' },

  // 语言切换
  'lang.label': { zh: '语言', en: 'Language' },
  'lang.zh': { zh: '中文', en: 'Chinese' },
  'lang.system': { zh: '跟随系统', en: 'System' },
  'lang.en': { zh: 'English', en: 'English' },

  // 明暗模式
  'theme.label': { zh: '主题', en: 'Theme' },
  'theme.toggle': { zh: '切换明暗模式', en: 'Toggle colour scheme' },
  'theme.light': { zh: '浅色', en: 'Light' },
  'theme.dark': { zh: '深色', en: 'Dark' },
  'theme.system': { zh: '跟随系统', en: 'System' },

  // 悬浮状态栏
  'nav.reset': { zh: '重置位置', en: 'Reset position' },
  'widget.drag': { zh: '拖动这个部件', en: 'Drag this widget' },
  'desk.pin': { zh: '固定 / 取消固定', en: 'Pin / unpin' },
  'desk.restore': { zh: '复原到默认位置', en: 'Restore default position' },
  'layout.reset': { zh: '重置布局', en: 'Reset layout' },
  'settings.title': { zh: '设置', en: 'Settings' },
  'settings.open': { zh: '打开设置', en: 'Open settings' },
  'settings.close': { zh: '关闭', en: 'Close' },
  // 相对字号 —— 全站一起缩（相对浏览器的默认字号）
  'settings.relativeSize': { zh: '相对字号', en: 'Relative size' },
  'settings.sizeSmall': { zh: '小', en: 'Small' },
  'settings.sizeMedium': { zh: '标准', en: 'Standard' },
  'settings.sizeLarge': { zh: '大', en: 'Large' },
  'settings.lineHeight': { zh: '行距', en: 'Line height' },
  'settings.heightCompact': { zh: '紧凑', en: 'Compact' },
  'settings.heightStandard': { zh: '标准', en: 'Standard' },
  'settings.heightRelaxed': { zh: '宽松', en: 'Relaxed' },

  // 对比度
  'settings.contrast': { zh: '对比度', en: 'Contrast' },
  'settings.contrastStandard': { zh: '标准', en: 'Standard' },
  'settings.contrastHigh': { zh: '高对比', en: 'High' },

  // 动效
  'settings.motion': { zh: '动效', en: 'Motion' },
  'settings.motionFull': { zh: '完整', en: 'Full' },
  'settings.motionReduced': { zh: '减弱', en: 'Reduced' },
  'settings.motionAuto': { zh: '自动', en: 'Auto' },

  // 无障碍
  'settings.accessibility': { zh: '无障碍', en: 'Accessibility' },
  'settings.focusStrong': { zh: '强化焦点环', en: 'Strong focus ring' },
  'settings.linksAlways': { zh: '链接下划线', en: 'Link underlines' },
  'settings.targetsLarge': { zh: '大点击区', en: 'Larger targets' },

  // 首页
  'home.profileTitle': { zh: '关于我', en: 'About me' },
  'home.latest': { zh: '最新文章', en: 'Latest posts' },
  'home.sample.tag': { zh: '示例', en: 'Sample' },
  'home.readMore': { zh: '阅读全文', en: 'Read more' },

  // 文章
  'post.readMore': { zh: '阅读全文', en: 'Read more' },
  'post.publishedOn': { zh: '发布于 {date}', en: 'Published {date}' },
  'post.updatedOn': { zh: '更新于 {date}', en: 'Updated {date}' },
  'post.series': { zh: '系列：{title}', en: 'Series: {title}' },
  'post.category': { zh: '分类', en: 'Category' },
  'post.tags': { zh: '标签', en: 'Tags' },
  'post.draft': { zh: '草稿', en: 'Draft' },
  'post.scheduled': { zh: '定时发布', en: 'Scheduled' },
  'post.noTranslation': {
    zh: '本文暂无{locale}版本，以下显示{original}原文。',
    en: 'This post has no {locale} version yet. Showing the {original} original below.',
  },
  'post.noTranslationShort': { zh: '暂无{locale}版', en: 'No {locale} version' },
  'post.translations': { zh: '语言版本', en: 'Language versions' },
  'post.toc': { zh: '目录', en: 'Contents' },
  'post.structure': { zh: '文章结构', en: 'Outline' },
  'post.readingTime': { zh: '阅读约 {minutes} 分钟', en: '{minutes} min read' },
  'post.prev': { zh: '上一篇', en: 'Previous' },
  'post.next': { zh: '下一篇', en: 'Next' },
  'post.navigation': { zh: '文章导航', en: 'Post navigation' },
  'post.copyCode': { zh: '复制', en: 'Copy' },
  'post.copied': { zh: '已复制', en: 'Copied' },
  'post.license.title': { zh: '本文协议', en: 'Post license' },
  'post.license.name.ccBy': { zh: 'CC BY 4.0', en: 'CC BY 4.0' },
  'post.license.name.ccByNc': { zh: 'CC BY-NC 4.0', en: 'CC BY-NC 4.0' },
  'post.license.name.allRights': { zh: '保留所有权利', en: 'All Rights Reserved' },
  'post.license.note.ccBy': { zh: '允许转载，需署名并链回原文。', en: 'You may repost with attribution and a link back to the original.' },
  'post.license.note.ccByNc': { zh: '允许转载（禁止商用），需署名并链回原文。', en: 'You may repost non-commercially, with attribution and a link back.' },
  'post.license.note.allRights': { zh: '保留所有权利，转载需事先授权。', en: 'All rights reserved. Reposting requires permission.' },

  // 评论
  'comments.title': { zh: '评论', en: 'Comments' },
  'comments.count': { zh: '{count} 条', en: '{count}' },
  'comments.empty': { zh: '还没有评论。', en: 'No comments yet.' },
  'comments.form.title': { zh: '发表评论', en: 'Leave a comment' },
  'comments.form.hint': {
    zh: '邮箱不会公开 —— 只用来取头像。',
    en: 'Your email is never published — it is only used for the avatar.',
  },
  'comments.form.submit': { zh: '提交评论', en: 'Post comment' },
  'comments.submitted': { zh: '已提交，审核通过后会显示。', en: 'Submitted — it will appear after review.' },
  'comments.field.name': { zh: '昵称', en: 'Name' },
  'comments.field.email': { zh: '邮箱', en: 'Email' },
  'comments.field.website': { zh: '个人网站', en: 'Website' },
  'comments.field.content': { zh: '评论内容', en: 'Comment' },
  'comments.field.optional': { zh: '（选填）', en: '(optional)' },
  'comments.error.name_required': { zh: '填一下昵称。', en: 'Please add a name.' },
  'comments.error.name_too_long': { zh: '昵称太长了。', en: 'That name is too long.' },
  'comments.error.email_required': { zh: '填一下邮箱。', en: 'Please add an email.' },
  'comments.error.email_invalid': { zh: '邮箱格式不对。', en: 'That email does not look right.' },
  'comments.error.website_invalid': { zh: '网址不对。', en: 'That website address does not look right.' },
  'comments.error.content_required': { zh: '写点内容吧。', en: 'Please write a comment.' },
  'comments.error.content_too_long': { zh: '评论太长了。', en: 'That comment is too long.' },
  'comments.error.rate_limited': { zh: '提交太频繁了，过会儿再来。', en: 'Too many comments — try again later.' },
  'comments.error.invalid_request': { zh: '请求不完整。', en: 'Incomplete request.' },
  'comments.error.failed': { zh: '提交失败，稍后再试。', en: 'Could not post the comment — try again later.' },
  'comments.error.invalid_slug': { zh: '文章地址不对。', en: 'That post address looks wrong.' },

  // 404
  'error404.title': { zh: '404 · 页面走丢了', en: '404 · page not found' },
  'error404.body': {
    zh: '这个页面走丢了 —— 要不去别处看看？',
    en: 'This page wandered off. Mind checking the directory above?',
  },
  'error404.home': { zh: '回到首页', en: 'Back home' },
  'error404.archive': { zh: '去归档翻翻', en: 'Browse the archive' },

  // 标签显示名 —— 标签的**标识**是 ASCII slug，URL 里用的是它，显示名走词典
  'tag.astro': { zh: 'Astro', en: 'Astro' },
  'tag.css': { zh: 'CSS', en: 'CSS' },
  'tag.mdx': { zh: 'MDX', en: 'MDX' },
  'tag.draft': { zh: '草稿', en: 'Draft' },
  'tag.scheduled': { zh: '定时发布', en: 'Scheduled' },

  // 分类显示名
  'category.announcement': { zh: '公告', en: 'Announcements' },
  'category.design': { zh: '设计', en: 'Design' },
  'category.writing': { zh: '写作', en: 'Writing' },

  // 归档 / 标签 / 分类
  'archive.title': { zh: '归档', en: 'Archive' },
  'archive.empty': { zh: '还没有文章。', en: 'No posts yet.' },
  'archive.postCount': { zh: '{count} 篇文章', en: '{count} posts' },
  'tags.title': { zh: '标签', en: 'Tags' },
  'tags.all': { zh: '全部标签', en: 'All tags' },
  'categories.title': { zh: '分类', en: 'Categories' },
  'categories.all': { zh: '全部分类', en: 'All categories' },
  'series.title': { zh: '系列', en: 'Series' },
  'series.empty': { zh: '还没有系列文章。', en: 'No series posts yet.' },

  // 关于 / 友链
  'about.title': { zh: '关于本站', en: 'About this site' },
  'about.atAGlance': { zh: '本站一览', en: 'At a glance' },
  'about.posts': { zh: '文章', en: 'Posts' },
  'about.builtWith': { zh: '技术栈', en: 'Built with' },
  'about.links': { zh: '友情链接', en: 'Friend links' },
  'about.projects': { zh: '项目', en: 'Projects' },
  'about.linksIntro': {
    zh: '一些值得一看的站点。',
    en: 'A few sites worth visiting.',
  },
  'links.title': { zh: '友情链接', en: 'Friend links' },
  'links.intro': { zh: '这些是我常读的站点。', en: 'Sites I read often.' },
  'links.empty': { zh: '还没有友链。', en: 'No friend links yet.' },

  'list.postCount': { zh: '{count} 篇文章', en: '{count} posts' },

  // 页脚

  // 搜索
  'search.title': { zh: '搜索', en: 'Search' },
  'search.placeholder': { zh: '输入关键词', en: 'Search posts...' },
  'search.resultCount': { zh: '{count} 条结果', en: '{count} results' },
  'search.empty': { zh: '没有找到相关内容。', en: 'No matching posts.' },
  'footer.search': { zh: '搜索', en: 'Search' },
  // 无障碍
  'a11y.skipToContent': { zh: '跳到正文', en: 'Skip to content' },
  'a11y.mainNav': { zh: '主导航', en: 'Main navigation' },

  // 后台 —— 登录 / 文档 / 图库
  'admin.title': { zh: '后台', en: 'Admin' },
  'admin.login.title': { zh: '登录后台', en: 'Sign in' },
  'admin.login.submit': { zh: '登录', en: 'Sign in' },
  // 后台导航
  'admin.nav.documents': { zh: '文章', en: 'Posts' },
  'admin.nav.gallery': { zh: '图库', en: 'Gallery' },
  'admin.nav.settings': { zh: '设置', en: 'Settings' },
  'admin.nav.documentsHint': { zh: '写稿、发布、撤回', en: 'Write, publish, unpublish' },
  'admin.nav.galleryHint': { zh: '图片素材库', en: 'Image library' },
  'admin.nav.settingsHint': { zh: '站点信息与文案', en: 'Site info and copy' },
  'admin.nav.comments': { zh: '评论', en: 'Comments' },
  'admin.nav.commentsHint': { zh: '审核与删除', en: 'Review and delete' },
  'admin.nav.projects': { zh: '项目', en: 'Projects' },
  'admin.nav.projectsHint': { zh: '关于页的项目', en: 'About page projects' },
  // 评论页
  'admin.comments.title': { zh: '评论', en: 'Comments' },
  'admin.comments.intro': {
    zh: '读者留言先到待审队列 —— 通过后才会出现在文章页。',
    en: 'Reader comments wait in the queue — approve one to publish it.',
  },
  'admin.comments.empty': { zh: '还没有评论。', en: 'No comments yet.' },
  'admin.comments.pending': { zh: '待审核', en: 'Pending' },
  'admin.comments.approved': { zh: '已发布', en: 'Published' },
  'admin.comments.spam': { zh: '垃圾', en: 'Spam' },
  'admin.comments.approve': { zh: '通过', en: 'Approve' },
  'admin.comments.spamAction': { zh: '标记垃圾', en: 'Mark as spam' },
  'admin.comments.post': { zh: '文章', en: 'Post' },
  'admin.comments.count': { zh: '{count} 条', en: '{count}' },
  // 项目页
  'admin.projects.title': { zh: '项目', en: 'Projects' },
  'admin.projects.intro': {
    zh: '关于页那张卡片里的项目 —— 名称、简介与地址。',
    en: 'The projects in the About card — name, description and URL.',
  },
  'admin.projects.new': { zh: '新建项目', en: 'New project' },
  'admin.projects.name': { zh: '名称', en: 'Name' },
  'admin.projects.description': { zh: '简介', en: 'Description' },
  'admin.projects.url': { zh: '地址', en: 'URL' },
  'admin.projects.create': { zh: '添加', en: 'Add' },
  'admin.projects.empty': { zh: '还没有项目。', en: 'No projects yet.' },
  // 设置页
  'admin.settings.title': { zh: '站点设置', en: 'Site settings' },
  'admin.settings.intro': {
    zh: '这里的每一句都是站点上的默认文字 —— 改完下次构建生效。',
    en: 'Every string shown on the site lives here — changes take effect on the next build.',
  },
  'admin.settings.info': { zh: '站点信息', en: 'Site info' },
  'admin.settings.copy': { zh: '界面文案', en: 'Interface copy' },
  'admin.settings.infoHint': { zh: '品牌名、笔名、标语与邮箱。', en: 'Brand, pen name, tagline and email.' },
  'admin.settings.footer': { zh: '页脚', en: 'Footer' },
  'admin.settings.footerHint': {
    zh: '页脚上显示的每一句都在这儿改 —— 改完点右上角「立即构建」才上线。',
    en: 'Everything the footer shows is edited here — rebuild to publish it.',
  },
  'admin.settings.footerCustom': {
    zh: '附加内容（可多行，支持 HTML 标签）',
    en: 'Extra content (multi-line, HTML allowed)',
  },
  'admin.settings.icpHint': {
    zh: '含数字才渲染成备案链接，例如「萌ICP备12345678号」。',
    en: 'A filing link is rendered only when it contains digits, e.g. ICP 12345678.',
  },
  'admin.settings.footerHeight': { zh: '页脚卡片最小高度（px）', en: 'Footer card min height (px)' },
  'admin.settings.footerHeightHint': { zh: '内容少时留白，内容多时不裁切。0 = 不限制。', en: 'Extra space when there is little content, never clipped when there is a lot. 0 = no limit.' },
  'admin.settings.search': { zh: '搜索', en: 'Search' },
  'admin.settings.searchPlaceholder': { zh: '按文案或键名搜索…', en: 'Search by text or key…' },
  'admin.settings.module': { zh: '模块', en: 'Module' },
  'admin.settings.allModules': { zh: '全部模块', en: 'All modules' },
  'admin.settings.save': { zh: '保存改动', en: 'Save changes' },
  'admin.settings.saved': { zh: '已保存 —— 下次构建后生效。', en: 'Saved — it takes effect on the next build.' },
  'admin.settings.dirty': { zh: '{count} 处未保存', en: '{count} unsaved changes' },
  'admin.settings.reset': { zh: '恢复默认', en: 'Reset' },
  'admin.settings.resetAll': { zh: '全部恢复默认', en: 'Reset all' },
  'admin.settings.overridden': { zh: '已修改', en: 'Modified' },
  'admin.settings.confirmResetAll': {
    zh: '把所有文案恢复成默认？',
    en: 'Reset every string to its default?',
  },
  'admin.settings.hintKey': { zh: '键名', en: 'Key' },
  'admin.settings.hintZh': { zh: '中文', en: 'Chinese' },
  'admin.settings.hintEn': { zh: 'English', en: 'English' },
  'admin.action.view': { zh: '查看', en: 'View' },
  'admin.card.basics': { zh: '基本信息', en: 'Basics' },
  'admin.card.taxonomy': { zh: '分类与标签', en: 'Taxonomy' },
  'admin.card.body': { zh: '正文', en: 'Body' },
  'admin.editor.newIntro': { zh: '写完保存，改完一起构建上线。', en: 'Save it, then build once to publish.' },
  'admin.editor.editIntro': { zh: '改完记得保存 —— 改动攒着一起构建上线。', en: 'Remember to save; changes go live on the next build.' },
  'admin.action.settings': { zh: '设置', en: 'Settings' },
  'admin.filter.search': { zh: '搜索标题或 slug', en: 'Search title or slug' },
  'admin.filter.status': { zh: '状态', en: 'Status' },
  'admin.filter.locale': { zh: '语言', en: 'Language' },
  'admin.filter.all': { zh: '全部', en: 'All' },
  'admin.filter.statusAll': { zh: '全部状态', en: 'Any status' },
  'admin.filter.localeAll': { zh: '全部语言', en: 'Any language' },
  'admin.docsIntro': { zh: '写稿、发布、撤回与删除。', en: 'Write, publish, unpublish and delete.' },
  'admin.list.count': { zh: '{count} 篇', en: '{count} posts' },
  'admin.list.noMatch': { zh: '没有匹配的文档。', en: 'No matching documents.' },
  'admin.editor.unsaved': { zh: '有未保存的改动 —— 确定离开？', en: 'You have unsaved changes — leave anyway?' },
  'admin.editor.lastSaved': { zh: '最后保存：{time}', en: 'Last saved: {time}' },
  'admin.editor.notPublished': { zh: '这篇还没发布，站点上看不到。', en: 'Not published — it is not on the site yet.' },
  'admin.action.new': { zh: '新建文档', en: 'New document' },
  'admin.editor.new': { zh: '新建文档', en: 'New document' },
  'admin.editor.edit': { zh: '编辑文档', en: 'Edit document' },
  'admin.action.gallery': { zh: '图库', en: 'Gallery' },
  'admin.action.logout': { zh: '登出', en: 'Sign out' },
  'admin.action.build': { zh: '构建上线', en: 'Build & publish' },
  'admin.action.edit': { zh: '编辑', en: 'Edit' },
  'admin.action.publish': { zh: '发布', en: 'Publish' },
  'admin.action.unpublish': { zh: '撤回', en: 'Unpublish' },
  'admin.action.delete': { zh: '删除', en: 'Delete' },
  'admin.action.save': { zh: '保存', en: 'Save' },
  'admin.action.preview': { zh: '预览', en: 'Preview' },
  'admin.lang.zh': { zh: '中文', en: 'Chinese' },
  'admin.lang.en': { zh: 'English', en: 'English' },
  'admin.editor.toolbar': { zh: '格式工具栏', en: 'Formatting toolbar' },
  'admin.editor.bold': { zh: '加粗', en: 'Bold' },
  'admin.editor.italic': { zh: '斜体', en: 'Italic' },
  'admin.editor.strikethrough': { zh: '删除线', en: 'Strikethrough' },
  'admin.editor.underline': { zh: '下划线', en: 'Underline' },
  'admin.editor.hoverReveal': { zh: '悬停显示', en: 'Reveal on hover' },
  'admin.editor.inlineCode': { zh: '行内代码', en: 'Inline code' },
  'admin.editor.codeBlock': { zh: '代码块', en: 'Code block' },
  'admin.editor.link': { zh: '链接', en: 'Link' },
  'admin.editor.image': { zh: '图片', en: 'Image' },
  'admin.editor.heading': { zh: '标题', en: 'Heading' },
  'admin.editor.quote': { zh: '引用', en: 'Quote' },
  'admin.editor.bulletList': { zh: '无序列表', en: 'Bullet list' },
  'admin.editor.orderedList': { zh: '有序列表', en: 'Ordered list' },
  'admin.editor.table': { zh: '表格', en: 'Table' },
  'admin.action.insertImage': { zh: '插入图片', en: 'Insert image' },
  'admin.action.import': { zh: '导入 .md', en: 'Import .md' },
  'admin.action.copy': { zh: '复制链接', en: 'Copy link' },
  'admin.action.upload': { zh: '上传图片', en: 'Upload image' },
  'admin.field.title': { zh: '标题', en: 'Title' },
  'admin.field.slug': { zh: 'Slug', en: 'Slug' },
  'admin.field.description': { zh: '摘要', en: 'Summary' },
  'admin.field.pubDate': { zh: '发布日期', en: 'Publish date' },
  'admin.field.updatedDate': { zh: '更新日期', en: 'Updated date' },
  'admin.field.category': { zh: '分类', en: 'Category' },
  'admin.field.tags': { zh: '标签', en: 'Tags' },
  'admin.field.license': { zh: '许可协议', en: 'License' },
  'admin.field.seriesId': { zh: '系列 ID', en: 'Series ID' },
  'admin.field.seriesTitle': { zh: '系列标题', en: 'Series title' },
  'admin.field.seriesOrder': { zh: '系列序号', en: 'Series order' },
  'admin.field.body': { zh: '正文', en: 'Body' },
  'admin.field.password': { zh: '口令', en: 'Passphrase' },
  'admin.field.alt': { zh: '替代文字', en: 'Alt text' },
  'admin.hint.slug': { zh: '小写字母、数字与连字符；中英文同 slug 即互为翻译。', en: 'Lowercase letters, digits and dashes; the same slug in zh and en makes them translations.' },
  'admin.hint.published': { zh: '已发布 —— 站点要等下一次构建才更新。', en: 'Published — the site updates on the next build.' },
  'admin.hint.draft': { zh: '已撤回 —— 不再导出，站点上的那篇会在下次构建后消失。', en: 'Unpublished — it is no longer exported and disappears from the site after the next build.' },
  'admin.hint.saved': { zh: '已保存 —— 站点要等下一次构建才更新。', en: 'Saved — the site updates on the next build.' },
  'admin.hint.buildStarted': { zh: '构建已开始，稍等片刻。', en: 'Build started.' },
  'admin.hint.buildFailed': { zh: '构建没触发 —— 没配构建钩子（DEPLOY_HOOK_URL）或钩子调用失败。', en: 'No build was triggered — DEPLOY_HOOK_URL is missing or the hook call failed.' },
  'admin.hint.deleted': { zh: '已删除。', en: 'Deleted.' },
  'admin.hint.imported': { zh: '已导入，检查一下字段再保存。', en: 'Imported — check the fields before saving.' },
  'admin.hint.copied': { zh: '链接已复制。', en: 'Link copied.' },
  'admin.hint.uploaded': { zh: '已上传。', en: 'Uploaded.' },
  'admin.list.empty': { zh: '还没有文档 —— 点「新建文档」写第一篇。', en: 'No documents yet — create the first one.' },
  'admin.gallery.title': { zh: '图库', en: 'Gallery' },
  'admin.gallery.intro': { zh: '图片素材 —— 正文里用 /media/<key> 引用。', en: 'Image assets — reference them as /media/<key> in the body.' },
  'admin.gallery.empty': { zh: '图库还是空的 —— 传一张图进来。', en: 'The gallery is empty — upload an image.' },
  'admin.status.published': { zh: '已发布', en: 'Published' },
  'admin.status.draft': { zh: '草稿', en: 'Draft' },
  'admin.confirm.delete': { zh: '删掉这篇？删了就找不回来了。', en: 'Delete this document? It cannot be undone.' },
  'admin.confirm.deleteMedia': { zh: '删掉这张图？引用它的文档会缺图。', en: 'Delete this image? Documents referencing it will show a broken image.' },
  'admin.error.invalid_password': { zh: '口令不对。', en: 'Wrong passphrase.' },
  'admin.error.rate_limited': { zh: '试太多次了，10 分钟后再来。', en: 'Too many attempts. Try again in 10 minutes.' },
  'admin.error.unauthorized': { zh: '请先登录。', en: 'Sign in first.' },
  'admin.error.not_found': { zh: '找不到。', en: 'Not found.' },
  'admin.error.invalid_request': { zh: '请求不完整。', en: 'Incomplete request.' },
  'admin.error.validation_failed': { zh: '字段没填对。', en: 'Some fields are invalid.' },
  'admin.error.name_required': { zh: '名称不能为空。', en: 'The name is required.' },
  'admin.error.name_too_long': { zh: '名称太长了。', en: 'That name is too long.' },
  'admin.error.description_too_long': { zh: '简介太长了。', en: 'That description is too long.' },
  'admin.error.url_required': { zh: '地址不能为空。', en: 'The URL is required.' },
  'admin.error.url_invalid': { zh: '地址不对（只收 http / https）。', en: 'That URL is not valid (http / https only).' },
  'admin.error.slug_taken': { zh: '这个 slug 在该语言下已经有一篇了。', en: 'This slug is already used in that language.' },
  'admin.error.conflict': { zh: '别处刚改过这篇 —— 刷新页面再保存。', en: 'This document changed elsewhere — reload before saving.' },
  'admin.error.file_required': { zh: '没收到文件。', en: 'No file received.' },
  'admin.error.type_not_allowed': { zh: '只收 png / jpg / webp / gif / avif。', en: 'Only png, jpg, webp, gif and avif are accepted.' },
  'admin.error.type_mismatch': { zh: '文件内容与类型对不上。', en: 'The file content does not match its type.' },
  'admin.error.too_large': { zh: '图片超过 5MB。', en: 'The image is larger than 5MB.' },
  'admin.error.request_failed': { zh: '请求失败。', en: 'Request failed.' },
  'admin.error.unknown_key': { zh: '语言包里没有这个键。', en: 'This key is not in the dictionary.' },
  'admin.error.invalid_value': { zh: '文案得是文字。', en: 'The copy must be text.' },
  'admin.error.title_required': { zh: '标题不能为空。', en: 'The title is required.' },
  'admin.error.slug_invalid': { zh: 'slug 只能用小写字母、数字与连字符。', en: 'Slug may only contain lowercase letters, digits and dashes.' },
  'admin.error.locale_invalid': { zh: '语言只能是 zh 或 en。', en: 'Language must be zh or en.' },
  'admin.error.license_invalid': { zh: '协议取值不对。', en: 'Unknown license.' },
  'admin.error.category_invalid': { zh: '分类要用 ASCII slug。', en: 'Category must be an ASCII slug.' },
  'admin.error.tag_invalid': { zh: '标签要用 ASCII slug。', en: 'Tags must be ASCII slugs.' },
  'admin.error.date_invalid': { zh: '日期格式不对。', en: 'Invalid date.' },
  'admin.error.series_invalid': { zh: '系列要同时填 ID 与标题。', en: 'A series needs both an ID and a title.' },
  'admin.error.series_order_invalid': { zh: '系列序号要是正整数。', en: 'Series order must be a positive integer.' },
} satisfies Translations

/**
 * 站点常用文字 —— 真正的源头是 `config/site.json`（入库的配置文件）。
 *
 * 站点名 / 笔名 / 标语 / 首页大标题 / 关于页引言 —— 这几条最常改，
 * 单独放在配置文件里：改它不用翻代码，diff 里也看得见。
 *
 * 其余词条仍在上面的词典里（那是长尾文案，不值得单独成文件）。
 * 两处重复的 key 以**配置文件为准**。
 */
export const siteText: Translations = siteConfig as Translations

export const allText: Translations = { ...ui, ...siteText }

export type TranslationKey = keyof typeof ui | keyof typeof siteText
