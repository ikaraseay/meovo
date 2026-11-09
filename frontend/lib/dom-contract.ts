/**
 * DOM 契约 —— 跨 module 约定的字符串只此一处。
 * ---------------------------------------------------------
 * 这些名字被两个 module 同时依赖（一边渲染、一边消费）：
 *   · class 名 —— 脚本加的、CSS 认的
 *   · data 属性 —— 渲染方写的、脚本读的
 *   · 层级刻度 —— tokens.css 的 --ui-z-*
 *
 * 写成裸字符串时，改名只会静默失效：样式不生效、按钮点了没反应，
 * 而且没有任何报错。
 *
 * 用法：TS 侧引这里的常量；CSS 与标记里仍是字面量 ——
 *      由 test/dom-contract.test.ts 跨查两边对不对得上。
 */

/** class 名 */
export const CLASS = {
  /** <html>：有 JS —— 桌面卡片在布局完成前先藏起 */
  js: 'js',
  /** <html>：页面就绪 —— 撤掉加载遮罩 */
  pageReady: 'page-ready',
  /** 桌面摆好了 —— 卡片淡入 */
  deskReady: 'desk--ready',
  /** 摆位中 —— 关掉部件自身的过渡，别抖动 */
  layingOut: 'is-laying-out',
  /** 卡片被固定 */
  pinned: 'is-pinned',
  /** 卡片被拖歪 */
  tilted: 'is-tilted',
  /** 深色模式 */
  dark: 'dark',
  /** 高对比档 —— 抬次要文字与描边的对比 */
  contrastHigh: 'contrast-high',
  /** 链接一律带下划线 */
  linksAlways: 'links-always',
  /** 更大的点击目标 */
  targetsLarge: 'targets-large',
  /** 强化焦点环 */
  focusStrong: 'focus-strong',
  /** 折射可用（引擎真渲染 url() 滤镜） */
  refract: 'glass-refract',
  /** 折射降级（毛玻璃 + 拟态色散） */
  fallback: 'glass-fallback',
  /** 选中态 —— 二级菜单项、设置项 */
  active: 'is-active',
  /** 二级面板展开 */
  open: 'is-open',
  /** 二级面板的子项列表 */
  navPanelItems: 'nav-panel-items',
  /** 可见 —— 镜片、菜单的「重置位置」按钮 */
  visible: 'is-visible',
  /** 正在按住 —— 触发器的按压反馈 */
  pressing: 'is-pressing',
  /** 后台：提示条（成功 / 失败） */
  adminFlash: 'admin-flash',
  /** 后台：提示条里的错误态 */
  adminFlashError: 'admin-flash--error',
  /** 正文排版容器 */
  prose: 'prose',
  /** 正文里的悬停显示 —— 编辑工具写入、prose.css 上色、折叠阅读排除断句 */
  spoiler: 'spoiler',
  /** 折叠阅读：每段的展开 / 收起箭头 */
  textFoldToggle: 'text-fold-toggle',
  /** 折叠阅读：被折起的尾巴（第二句 / 第三句起） */
  textFoldRest: 'text-fold-rest',
  /** 图片放大层 */
  imgZoom: 'img-zoom',
  /** 放大层里的那张图 */
  imgZoomImage: 'img-zoom__img',
  /** 放大层的关闭按钮 */
  imgZoomClose: 'img-zoom__close',
  /** 可以点开放大的正文图片 */
  imgZoomable: 'img-zoomable',
  /** 放大层里正在拖动 */
  isPanning: 'is-panning',
  /** 卡片展开态 —— 覆盖大半屏幕 */
  expanded: 'is-expanded',
  /** 卡片内容可滚动 */
  scrollable: 'ui-widget--scrollable',
  /** 卡片正文容器 */
  widgetBody: 'ui-widget__body',
  /** 卡片原语 —— 全站统一的卡片外观 */
  card: 'ui-card',
  /** 导航栏表面 —— 悬浮栏 / 二级面板 / 设置弹窗等 */
  navSurface: 'ui-nav-surface',
} as const

/** data 属性名 */
export const ATTR = {
  /** 玻璃桌面容器 */
  desk: 'data-desk',
  /** 桌面：正文留在文档流 */
  deskFlow: 'data-desk-flow',
  /** 桌面里的正文 */
  deskContent: 'data-desk-content',
  /** 卡片 */
  widget: 'data-widget',
  /** 卡片的图钉（固定 / 取消固定） */
  widgetPin: 'data-widget-pin',
  /** 卡片的展开按钮 */
  widgetExpand: 'data-widget-expand',
  /** 卡片的复原按钮 */
  widgetRestore: 'data-widget-restore',
  /** 卡片的拖拽把手 */
  widgetDrag: 'data-widget-drag',
  /** 卡片独占一行 */
  widgetFull: 'data-widget-full',
  /** 卡片所在区域（内容锚定模式：top / side / tail） */
  zone: 'data-zone',
  /** 首次进入默认固定的卡片 */
  defaultPin: 'data-default-pin',
  /** 导航分组（二级菜单的归属） */
  navGroup: 'data-nav-group',
  /** 二级菜单的触发器 */
  navTrigger: 'data-nav-trigger',
  /** 二级面板本体 */
  navPanel: 'data-nav-panel',
  /** 二级面板的一组子项 */
  panelItems: 'data-panel-items',
  /** 二级面板的子项 */
  panelLink: 'data-panel-link',
  /** 「重置布局」按钮 */
  layoutReset: 'data-layout-reset',
  /** 归档页的搜索区 */
  archiveSearch: 'data-archive-search',
  /** 归档页的搜索结果列表 */
  archiveResults: 'data-archive-results',
  /** 归档页的搜索状态行（结果数 / 空结果） */
  archiveStatus: 'data-archive-status',
  /** 归档页的搜索索引（内联 JSON，正文原文） */
  archiveIndex: 'data-archive-index',
  /** 归档页结果行里的标题 / 摘要 —— 高亮写在这两处 */
  archiveTitle: 'data-archive-title',
  archiveSummary: 'data-archive-summary',
  /** 归档页的玻璃桌面 —— 搜索时整块收起 */
  archiveDesk: 'data-archive-desk',
  /** 后台：登录表单 */
  adminLogin: 'data-admin-login',
  /** 后台：错误提示行 */
  adminError: 'data-admin-error',
  /** 后台：状态提示条 */
  adminFlash: 'data-admin-flash',
  /** 后台：页头的「立即构建」按钮 */
  adminBuild: 'data-admin-build',
  /** 后台：编辑器的格式工具栏 */
  adminTools: 'data-admin-tools',
  /** 后台：文档列表容器 */
  adminList: 'data-admin-list',
  /** 后台：文档编辑器表单 */
  adminEditor: 'data-admin-editor',
  /** 后台：markdown 预览区 */
  adminPreview: 'data-admin-preview',
  /** 后台：图库网格 */
  adminGallery: 'data-admin-gallery',
  /** 后台：选图面板 */
  adminMediaPicker: 'data-admin-media-picker',
  /** 后台：评论列表容器 */
  adminComments: 'data-admin-comments',
  /** 后台：项目列表容器 */
  adminProjects: 'data-admin-projects',
  /** 友链行 */
  linkRow: 'data-link-row',
  /** 友链地址（探测用） */
  linkUrl: 'data-link-url',
  /** 友链手动状态（ok / down / unknown） */
  linkStatus: 'data-link-status',
  /** 折叠阅读：标题卡里的层级控件 */
  textFold: 'data-text-fold',
  /** 折叠阅读：每个层级按钮选中的档位（full / two / one） */
  textFoldLevel: 'data-text-fold-level',
  /** 折叠阅读：控件携带的文案（内联 JSON，展开 / 收起 / 状态） */
  textFoldLabels: 'data-text-fold-labels',
  /** 折叠阅读：切档时读给屏幕阅读器的状态行 */
  textFoldStatus: 'data-text-fold-status',
} as const

/**
 * 层级刻度 —— 与 tokens.css 的 --ui-z-* 一一对应。
 *
 * 数值在两处各写一份（CSS 要能引用，JS 要能算），
 * 跨查测试盯着两边一致。层序由语义决定，不是谁写的数大谁赢。
 */
export const Z = {
  /** 极光背景 —— 画在内容下面 */
  bg: -1,
  /** 跳到正文 —— 聚焦时冒出来 */
  skip: 100,
  /** 玻璃卡片互相叠（只在 JS 里用：卡片的 z-index 是内联写的） */
  widget: 9990,
  /** 悬浮栏体 */
  nav: 9999,
  /** 二级面板 */
  panel: 10000,
  /** 设置按钮 */
  fab: 10001,
  /** 设置弹窗 */
  popup: 10002,
  /** 展开的卡片 */
  expanded: 10003,
  /** 加载遮罩 —— 盖住一切 */
  loader: 10010,
} as const
