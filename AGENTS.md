# Meovo

个人博客，Astro 7 静态站，中英双语。

## Project

- **目录分三层**：
  - `frontend/` —— 站点本体（Astro 的 `srcDir`）：页面、组件、样式、内容集合、i18n、通用 lib。
  - `backend/` —— 后台（自建 CMS）：`lib/admin/`（会话 / 口令 / 文档 / 图库 / 导出）、
    `middleware.ts`（鉴权）、`db/migrations/`（D1 表结构）、`scripts/export-d1-posts.mjs`（构建期导出）。
  - `cloudflare/` —— 部署层：`cloudflare/wrangler.jsonc`（Worker 绑定）、`public/`（静态资源 + `_headers` / `_redirects`）。
  - ⚠️ **Astro 的路由文件必须在 `<srcDir>/pages/` 下**，所以后台的 on-demand 接口
    （`frontend/pages/api/admin/*`、`frontend/pages/media/*`）物理上留在 frontend/，
    逻辑在 `backend/lib/admin/`。中间件同理：Astro 只找 `<srcDir>/middleware.ts`，
    那儿是一行转发（`export { onRequest } from '../backend/middleware.ts'`）。
- **框架**：Astro 7（静态输出 + `@astrojs/cloudflare` 适配器）。包管理用 **pnpm**（本机 npm 缓存损坏）。
- **路由**：`/zh/` 与 `/en/` 双语言前缀，根路径 `/` 重定向到 `/zh/`。页面放在 `frontend/pages/[lang]/`。
- **内容**：文章放 `frontend/content/blog/<locale>/<slug>.md(x)`，entry.id 形如 `zh/hello-world`。
  - **目录即语言**，语言不写在 frontmatter 里
  - 同一篇文章的不同语言版本**文件名必须一致**，系统据此判定互为翻译
  - 标签与分类用 **ASCII slug**（`design`、`css`），显示名走词典 `tag.<slug>` / `category.<slug>`
  - **slug 规则只有一处**：`frontend/lib/slug.ts` 的 `SLUG_PATTERN` ——
    后台提交（`backend/lib/admin/documents.ts`）与 frontmatter schema
    （`frontend/content.config.ts`）都从那儿拿。手写文章绕过后台，schema 就是那道防线
  - 草稿 `draft: true` 与 `pubDate` 未到的文章，生产构建不输出（开发环境可见）
  - frontmatter schema 在 `frontend/content.config.ts`，字段不对**构建会失败**
- **样式**：原生 CSS + `--ui-*` token 契约，零工具类依赖。
  - `frontend/styles/tokens.css` —— 结构刻度（间距/圆角/动效）与共享原语类
  - `frontend/styles/themes/liquid-glass.css` —— 语义色层，浅色 + 深色两套
  - `frontend/styles/prose.css` —— 正文排版 / 代码块 / 目录样式（由 `global.css` 引入）
  - `frontend/styles/motion.css` —— 动效原语与归零（由 `global.css` 引入）
  - 组件的 scoped 样式里**不要**再写 `background` / `border-radius` / `box-shadow`，会盖掉主题
  - **部件 tint**：组件（`GlassWidget.astro`）只内联**色相** `--ui-widget-hue`，
    浅色 / 深色两套配方在 `tokens.css` 的 `.ui-widget` 规则里（深色那组写在
    `html[data-theme='liquid-glass'].dark` 下）—— 组件里不写死 S/L/A。
    两头取舍正好相反：**浅色要看得见色差**（饱和度拉满、alpha 提高，否则一堆白卡看不出区别）；
    **深色要统一**（低饱和 + 低对比 —— 深底会放大彩度，每张卡各成一派色就显老气）
  - `backdrop-filter` **只写标准属性**。同时写 `-webkit-backdrop-filter` 会被 CSS 压缩流程合并掉，
    无前缀那条被丢弃 —— 而 Chromium 不认 `-webkit-` 别名，毛玻璃会整站失效
  - **整个液态玻璃**（一级菜单 / 二级面板底板）用静态滤镜 `#glass-refract`
    （定义在 `frontend/components/FloatingBar.astro` 里）。`tokens.css` 里用
    `html.glass-refract .ui-nav-surface` 分流：Chromium 拿折射，Safari / Firefox 只剩基础毛玻璃
  - ⚠️ **折射的开关不能用 `@supports (backdrop-filter: url(...))` 判断** ——
    Safari 解析 `url()` 没问题、`@supports` 返回 true，但渲染时会把**整条** backdrop-filter
    丢掉（连 blur 一起），液态玻璃会整个消失（WebKit bug 245510，
    `RenderLayerBacking::updateBackdropFilters()` 见到 reference filter 就不调
    `setBackdropFilters()`）
  - **折射能力在 `BaseLayout.astro` 的首屏内联脚本里判**（同步执行，首屏前定好，
    不闪），判完给 `<html>` 挂 `.glass-refract` / `.glass-fallback`；
    `frontend/lib/liquid-glass.ts` 的 `canRefract()` 只读这个 class。
    class 名要在三处对上：内联脚本 / `liquid-glass.ts` 常量 / `tokens.css` 选择器（有测试守着）
  - 降级要用**正向** class（`.glass-fallback`），别用 `:not(.glass-refract)` ——
    反向写法会让 Chromium 在判定落地前多画一层假色散再撤掉
  - **玻璃片**（跟随指针走的镜片 `.glass-lens`）的折射**运行时挂载**：
    `frontend/lib/liquid-glass.ts` 按镜片实测尺寸画一张 Canvas 位移图
    （R 通道 = 横向位移、B 通道 = 纵向位移、128 灰 = 零位移），塞进专属 SVG 滤镜，
    以 `backdrop-filter: url(#glass-refract-N) var(--ui-nav-blur)` 内联到镜片上。
    镜片只有 144×33，静态滤镜的区域撑不住它的位移采样 —— 这才需要单独一张
  - 渲染不出真折射的引擎上，镜片退化成**拟态**：边缘描一圈冷暖色散 + 顶部高光
    （`html.glass-fallback .ui-glass-lens::after`）。形似神不似，但不是没有
  - 位移图和滤镜**必须 1:1 对齐**：画布尺寸 = 滤镜区域尺寸，滤镜区域按元素尺寸
    换算成百分比外扩；不对齐折射会跑到不该在的地方
  - **镜片尺寸只有 JS 一个主人**（`nav-panel.ts` 量了子项就写进来）：CSS 里不写镜片宽高，
    也不做宽高过渡 —— 尺寸逐帧变化的话每帧都要重建一张位移图
    （缓存一帧一条，全是元素从未有过的尺寸）
  - 改 `--ui-nav-blur` 的 blur 会连折射一起抹平（blur 作用在位移之后）
- **动效系统**：三层，一处主人 —— 刻度（`tokens.css` 的 `--ui-motion-*`）、
  原语（`frontend/styles/motion.css` 的 `.ui-anim-fade-up` / `.ui-anim-fade-in` /
  `.ui-anim-pop` / `.ui-anim-stagger`）、归零（**只听系统** `prefers-reduced-motion`
  一套 `!important` 重置）。页面只编排原语，**别再各写各的 `@keyframes`**。
  - **设置里没有动效档**（2026-11-03 删）—— 系统的 `prefers-reduced-motion` 是唯一事实来源，
    站内不再给「顶掉系统」的口子；真要加回来，先想清楚跟系统冲突时听谁的
  - 原语用 `translate` / `scale` **独立属性**，别用 `transform` —— 会被卡片的倾斜占掉，两者打架
  - 桌面卡片入场是**逐张错峰淡入**（`--ui-stagger-index` 由 `draggable.ts` 写），
    容器不再整体淡入
- **装饰性渐变边框**：`.ui-gradient-border` 原语 —— 两层背景 + `background-clip`。
  **只用在不透明底的元素上**（终端卡）：玻璃卡表面半透明，渐变会从底下透上来把整张卡染花
- **代码高亮**：Shiki 双主题（`markdown.shikiConfig.themes` + `defaultColor: false`），
  产物里只有 `--shiki-light` / `--shiki-dark` 变量，**Astro 自己不生成切换 CSS** ——
  明暗切换写在 `prose.css` 的 `html.dark` 规则里
- **文章页**：chrome（标题卡 / 目录 / 结构图 / 协议卡 / 上下篇 / 页脚）+ 目录折叠 / 滚动高亮 /
  代码块复制按钮，都在 `frontend/components/Article.astro` —— 页面只管路由与数据，正文走插槽
  - **窄屏下目录与结构图排在标题卡下面** —— 靠 **DOM 顺序** 实现：窄屏卡片退回文档流，
    DOM 顺序 = 视觉顺序。桌面是绝对定位 + zone，落位由 `desk-layout.ts` 算，与 DOM 顺序无关
  - 窄屏上目录卡紧跟标题卡（`global.css` 里 side 区卡片 `margin-block-start` 收紧一档）——
    它们是「进正文前」要看的东西，隔一整个 gap 就跟标题分成两块不相干的卡片了
  - 窄屏的目录折叠头**不要自带边框**（`prose.css` 的 `.toc-toggle`）：卡本身已经有一圈，
    再套一层就是两层套着的描边 —— 跟结构图那行 `<summary>` 保持同一种素行样式
  - **章节多了，目录与结构图自己滚** —— 两边都有 `max-height: calc(100vh - 12rem)` +
    `overflow: auto`（目录在 `prose.css` 的 `.toc-list`，结构图在 `OutlineMap.astro`
    的 `.outline-scroll`）：别让卡片长到屏幕外面去
  - 目录高亮跟着正文走时，**当前章节要留在目录的可视区里**（`Article.astro`
    的 `keepActiveVisible()`）—— 只滚目录，不动页面
- **协议卡**：文章页正文后面的可拖拽玻璃部件（`zone="tail"`，排在上下篇之前），
  内容在 `frontend/components/PostLicense.astro`。协议取值来自 frontmatter `license`，
  `frontend/lib/licenses.ts` 是唯一事实来源（`LICENSE_IDS` 同时供 schema 派生），缺省 CC BY 4.0；
  协议名与说明走 i18n
  - **开源协议（CC 系列）才给「Markdown 原文」链接** —— 指向
    `/<内容语言>/raw/<slug>.md`（端点 `frontend/pages/[lang]/raw/[...slug].md.ts`，
    静态输出每篇一个 .md，内容是正文原文，不含 frontmatter）
- **正文图片能放大**：`frontend/lib/image-zoom.ts` —— 点开一层覆盖层，
  滚轮对着指针那点缩放（1~4 倍）、按住拖动平移、双击还原、Esc / 点背景关闭。
  夹取边界是纯函数 `clampPan()`（`test/image-zoom.test.ts` 守着）；
  覆盖层的 class 名走 `dom-contract.ts` 的 `CLASS`
- **评论**：读者填昵称 / 邮箱 / 个人网站 → 进 D1 待审队列 → 后台放行才出现在文章页
  - ⚠️ **已停用**（2026-11-02）：文章页不再渲染评论，后台导航里的「评论」入口也去掉了。
    代码还在（组件 / 接口 / 表），恢复只要把 `<Comments slug={getPostSlug(post)} locale={locale} />`
    放回 `Article.astro` 的 `</div>` 之后 —— 别重新写一遍
  - 表在 `backend/db/migrations/0003_comments.sql`；纯逻辑（校验 / 哈希 / 限流）在
    `backend/lib/comments/model.ts`（Node 可测），D1 读写在 `backend/lib/comments/store.ts`
  - 公开接口 `frontend/pages/api/comments.ts`（`prerender = false`）：GET 取已通过审核的评论，
    POST 提交。**公开接口不返回邮箱** —— 只给 Gravatar 头像地址（邮箱的 SHA-256 哈希）
  - 组件 `frontend/components/Comments.astro`，挂在**玻璃桌面之外**（`Article.astro` 里
    `</div>` 之后）：桌面端的卡片是绝对定位的，评论若进桌面就会跟它们抢位置
  - 评论按 **slug** 归线程 —— 中英文版本共用一条，不按语言分开
  - 反垃圾：蜜罐字段 + 按 IP 限流（5 条 / 10 分钟，IP 只存哈希）+ 人工审核
  - 后台审核页 `/<lang>/admin/comments`，接口 `/api/admin/comments`
- **首页那张卡是终端面板**：`frontend/pages/[lang]/index.astro` 的 hero 部件里是一块终端
  （标题栏三点 + `user@host$ whoami` + `> 笔名 ▌` + 命令行文案），
  左边是**字符画**（不是图片）—— 源文件 `frontend/assets/ascii-art.txt`，
  用 Vite 的 `?raw` 导入在构建期内联（声明在 `frontend/assets/raw.d.ts`）。
  流体光标仍挂在 `.hero-sub`（小字区）
  - 头像是**字符画**：`frontend/assets/ascii-art.txt` 用 Vite 的 `?raw` 在构建期内联，
    再按字符上色（`@` 描边 / `#` 深橙 / `-` 橙身 / `.` 白毛）—— 颜色是 `--ui-art-*` 一套 token，
    浅色深色各一套；上色后的 HTML 走 `set:html`，颜色只能内联在 span 上
  - 终端面板的样式在 `frontend/styles/terminal.css`（`.term*` 一族）—— 首页欢迎卡与
    `frontend/pages/404.astro` 共用，别再各写一份
  - 终端的色是**独立一套 token**（`--ui-term-*`）—— **浅色档是纸色、深色档是墨色**，
    两套都写在主题文件里（浅色块 / `.dark` 块）；别把它塞进 `--ui-card-*`（那是玻璃卡的表面）
  - 首页**没有「关于我」卡**了 —— 头像与名字都并进终端面板里（原来那张 profile 卡跟它打架）
- **用户偏好（相对字号 / 行距 / 对比度 / 无障碍）**：存在 localStorage，
  **key 的唯一主人在 `frontend/lib/preferences.ts`**（`PREFS_KEYS`），
  **class 名的唯一主人在 `PREF_CLASSES`**（值取自 `dom-contract.ts` 的 `CLASS`）。
  `BaseLayout.astro` 的首屏内联脚本不能 import 模块，用 `define:vars` 把两张表注入进去 ——
  别在别处再写死一份 key 或 class 名（改了会首屏静默回退）。
  完整设计见 `docs/adr/0004-preference-motion-contrast-system.md`。
  - **相对字号改根字号** —— `html { font-size: calc(100% * var(--ui-root-scale, 1)) }`，
    全站一起缩；`--ui-space-*` 全部 rem，跟着根字号走。行距单独一档（`--ui-prose-lh`），
    不跟字号绑。老的 `prose-scale` key 只作读侧兜底（迁到 `root-scale`），不主动写回
  - **字号与行距是滑块，不是三档按钮** —— 原生 `<input type="range">` +
    `accent-color`，拖动即写 `setPref` 并重排。刻度在 `FloatingBar.astro` 的
    `bindRange()` 里（字号 0.8~1.4、行距 1.4~2.3，步长 0.05）——
    别改回三选一，三档调不出舒服的结果
  - **对比度两档** —— 标准档本身必须过 WCAG AA 4.5:1；高对比档要**一眼看得出**
    （2026-11-03 改造）：表面全改不透明 + 去极光色斑 + 去卡片彩色 tint +
    描边加黑 + 次要文字压深。取值由 `test/contrast.test.ts` 守着 —— 改主题色会有人喊
  - **无障碍三开关** —— 强化焦点环（`--ui-focus-ring-width` / `-offset`）、
    始终显示链接下划线、更大的点击目标（`--ui-target-min-size` 下限 44px）。
    全部是 `<html>` 上的 class，首屏前挂上，不闪
    - **强化焦点环带 `!important`** —— 局部的 `outline: none`（如 `.ui-input:focus-visible`）
      会把环吃掉；焦点是安全底线，强制档要压过所有局部写法（4px / offset 3px）
    - **大点击区的覆盖范围由 `global.css` 一条规则持有** ——
      `:is(.menu-link, .drawer-item, .toc-link, .toc-toggle, .ui-chip, .ui-input, .skip-link)`，
      别再在组件的 scoped 样式里各写各的
- **加载屏就是 404 那台终端** —— `BaseLayout.astro` 的 `.page-loader` 里放一台 `.term`
  （标题栏三点 + `$ cat /index.md` + `loading…` + `> 站点名 ▌`），
  跟 `frontend/pages/404.astro` 共用 `.term` 那套外观与 `--ui-term-*` 配色。
  遮罩在 `html.js:not(.page-ready)` 时可见，布局摆好（双 rAF）后加 `.page-ready` 淡出
- **404 页**是 `frontend/pages/404.astro` —— 一台终端（`cat /404` → No such file +
  字符画猫 + `ls /`），中英文都摆出来（404 没有语言上下文）。
  卡片里有「回到首页」，底下还有一行「如有错误或建议请联系作者邮箱」+
  `site.email` 的 mailto 链接（中英文各一行，邮箱走 `t(locale,'site.email')`）
- **SEO**：canonical / hreflang / OG / Twitter / JSON-LD 都在 `BaseLayout.astro` 里统一输出；
  文章页通过 `head` 插槽补自己的 BlogPosting 与 `article:*`
  - `frontend/pages/sitemap.xml.ts` —— sitemap 是**手写端点**，不是 `@astrojs/sitemap`：
    集成给的 `filter` 跑在 `astro.config.mjs` 里，拿不到内容集合，算不出哪些是 noindex 的回退页，
    会把回退页塞进 sitemap
  - `frontend/pages/[lang]/rss.xml.ts` —— 分语言 RSS（`@astrojs/rss`）
  - `frontend/pages/robots.txt.ts` —— 指向 sitemap
  - `pnpm check:seo` —— 校验 canonical / hreflang 双向互指 / sitemap 与可收录页面集合一致 / RSS / OG
- **导航**：`frontend/components/FloatingBar.astro` —— 悬浮状态栏。桌面端可拖拽悬浮菜单（悬停出「重置位置」），
  移动端可拖拽底部抽屉，语言与明暗模式收在可拖拽 FAB 的设置弹窗里。断点 **1024px**。
- **断点只有一条线 —— 1024px**：桌面写 `@media (min-width: 1024px)`，
  移动端写 `@media not (min-width: 1024px)`，**别写 `max-width: 1023px`** ——
  那会在 1023~1024px 之间留一条缝（2048 宽的屏对半分正好 1023.5px）：
  桌面规则和移动规则都不生效，JS 却已经按移动端处理了。
  JS 侧用 `frontend/lib/breakpoint.ts` 的 `DESKTOP_MQ` / `isDesktop()`。
- **浮层（悬浮栏）**：栏体、二级面板、设置 FAB、设置弹窗是四个独立的 fixed 面，规则见
  `docs/adr/0002-floating-bar-overlay-state.md`。
  - **层级刻度在 `tokens.css` 的 `--ui-z-*`** —— 组件里不写裸 `z-index`，层序由语义决定
    （`test/dom-contract.test.ts` 会扫，裸 z-index 直接让测试红）
  - **「重置布局」是一个动作、两处接线**：`BaseLayout.astro` 复位卡片，
    `FloatingBar.astro` 复位悬浮栏自己的四个面（按钮属性见 `dom-contract.ts` 的 `ATTR.layoutReset`）
  - **同一时刻只有一个覆盖层打开** —— 设置弹窗与二级面板互斥
  - **用户摆出来的位置属于用户** —— 几何状态存在 `frontend/lib/floating-bar-state.ts`，跨页面跨刷新还原
  - **栏体位置记成视口比例（`menu: {fx, fy}`）** —— 不是像素：记比例，
    分辨率变了栏体按比例跟着走，用户摆在视口里的相对位置不丢。
    旧格式的绝对像素按当前视口换算成比例，升级那刻位置不跳
  - **用户没摆过栏体就别落盘** —— 默认的「顶部居中」每次重算，分辨率一变仍然居中；
    落盘的只有用户拖出来的位置
  - **夹取只夹不重置** —— 视口变了按新尺寸夹回可见范围，别改成默认值
  - **分辨率变了要摆两次** —— `resize` 事件触发时媒体查询还没重算，
    那会儿元素可能还藏着、尺寸还是旧的（照那一刻摆会歪）。
    `FloatingBar.astro` 的 `placeAll()` 先立刻摆一次，150ms 后再摆一次并把
    **夹取后**的位置存回去（窄屏栏体是 `display:none`，量不到尺寸就别夹也别存）
- **玻璃桌面（卡片画布）**：`frontend/lib/draggable.ts` 驱动 `frontend/lib/desk-layout.ts` 的布局数学
  （散开 / 内容锚定 / 流动三种模式）。
  - **视口变了要等尺寸落定再重排** —— MQ 的 `change` 事件可能早于视口尺寸更新
    （真实窗口缩放就是这样），照那一刻的旧尺寸排，卡片会卡在窄屏布局里出不来。
    `draggable.ts` 的 `scheduleRelayout()` 把判定挪到 150ms 之后；
    并且**量宽度之前先把卡片退回文档流** —— 量到的必须是自然宽度，
    不能是上一趟布局写进 inline width 的值（那个值一旦量错就自我固化）
  - **默认落位是基线** —— 散开布局按**全量**卡片排（固定卡也占槽位）：
    固定一张、拖走一张，都不挪动别人的落位与倾斜
  - **卡片不许出屏幕** —— 边缘与屏幕边缘至少留 **1vw / 1vh**：
    `clampToViewport` 一处算，拖拽、固定、默认固定全走它
  - **拖拽时卡片水平，放下后复原倾斜** —— 倾斜记在 `baseTilt`（默认落位的倾斜）：
    拖拽开始撤下 `is-tilted`，松手 `placeAbsolute` 复原
  - **正文列是宽度的唯一基准** —— 内容锚定布局里，正文列（`[data-desk-content]`）里的卡片
    （顶部标题卡 / 底部协议卡 / 上下篇）一律取**正文列的宽度**，右缘才跟正文对齐。
    卡片自己的宽度档位（`--sm` / `--lg` / `--xl`）只管没进正文列的时候
  - **侧栏卡片放不下就并到标题卡下面** —— 760px 正文列 + 300px 侧栏要 1424px 才排得下。
    窄桌面由 `fittedContentWidth` 收窄正文列给侧栏让位（保底 480px），
    收到保底还放不下，侧栏卡片就并进顶部堆 —— **排在标题卡下面**，
    别掉到正文末尾（那儿是协议卡 / 上下篇的位置，目录与思维导图掉最后反而难找）
  - **默认固定位置贴着正文列的右缘** —— 不是视口右上角：右上角在窄桌面会正好压在正文上。
    判定「放得下」用**桌面的右缘**（与布局那侧同一把尺），固定 / 取消固定结果一致
- **部署**：Cloudflare **Workers**（适配器 v14 已移除 Pages 支持）。构建 `pnpm build` → `dist/client`（静态资源）+ `dist/server`（Worker）；Node 钉在 `.node-version`，
  pnpm 钉在 `package.json` 的 `packageManager`（Workers Builds 的镜像会读这个字段装对应版本）。
  - **部署有两条等价路径，共用一个账户级 Token**：Cloudflare Workers Builds 直连 GitHub
    （push 自动构建 + 部署）、本地 `bash scripts/ops.sh deploy`。GitHub Actions 只跑
    check / test / build / check:i18n / check:seo，不部署、不放凭据。
  - **唯一凭据是 `config.env` 里的账户级 `CLOUDFLARE_API_TOKEN`**（Workers Scripts Edit、
    D1 Read/Edit、R2 Edit、Account Settings Read），不需要用户级 Token、不需要 `wrangler login`。
    Builds API 只接受用户级 Token，所以构建配置 / Build Token / Deploy Hook 在 Dashboard
    一次性设置。
  - **不再需要 Build variables**：真值在 `config.env`（不入库），构建前由
    `scripts/apply-config.mjs` 填回；Builds 环境没有 `config.env` 时保留仓库里
    `cloudflare/wrangler.jsonc` 与 `astro.config.mjs` 的现有值。
    运行时变量和密钥（含 `ADMIN_PASSWORD_HASH` / `SESSION_SECRET` / `DEPLOY_HOOK_URL`）
    全部由 `bash scripts/ops.sh secrets` 从 `config.env` 写入 Worker。
  - **构建 token 要带 D1 权限**：构建时 wrangler 用的是 Worker
    Settings → Builds → API token 那支 token；默认自动生成的只有 Workers Scripts / KV / R2 / Routes，
    **没有 D1** —— 而 `pnpm build` 的第一步就是从 D1 导出内容。不换 token 的话导出会失败
    （Workers Builds 注入 `WORKERS_CI=1`，导出脚本据此把「必须导出成功」打开 ——
    不会静默部署一个没有后台文章的站点）。
  - **后台改内容靠 Deploy Hook 触发构建**（D1 不在 git 里，push 永远不会发生）：见下面「改内容即构建」。
  - **缓存策略**在 `cloudflare/public/_headers` —— 带哈希的 `/_astro/*` 永久缓存；HTML 走 Pages 默认；
    pages.dev 域名被标 noindex（临时地址不参与收录）
  - **根路径按浏览器的语言跳**（`frontend/pages/index.ts`，`prerender = false`）：
    `Accept-Language` 认 en 给 `/en/`，认 zh 给 `/zh/`，其余给默认语言（中文）。
    协商在 `frontend/i18n/negotiate.ts`（纯函数，有测试）
    ⚠️ `cloudflare/public/_redirects` 里**不能再留 `/` 的 301** —— 静态规则先于 Worker 生效，
    留着就永远只到 /zh/
  - **CI** 在 `.github/workflows/ci.yml` —— check / test / build / check:i18n / check:seo
  - **Node 版本每周自动跟**：`.github/workflows/update-node.yml` 查 nodejs.org 的最新 LTS
    （只取 LTS），有新版就开 PR（分支 `chore/node-version`）改 `.node-version` / `engines.node` / README。
    用 `GITHUB_TOKEN`，依赖仓库设置「Allow GitHub Actions to create and approve pull requests」；
    token 推的分支不会触发 CI，所以 workflow 会再 `gh workflow run` 派发一次
- **i18n**：UI 文案一律走 `t(locale, key, params?)`，词典在 `frontend/i18n/ui.ts`，每条必须同时有 `zh` 和 `en`。
  `pnpm check:i18n` 三件事都查：词条完整（zh / en 都非空）、界面没有硬编码中文、
  **代码里用到的 key 都在词典里**（缺了就静默显示成 key 本身）。
  ⚠️ 它只认 `t()` 调用里的 key —— 写在数据表里的 key（编辑器按钮表那种）抓不到，靠对应单测兜。
- **站点名与笔名是两回事** —— `site.name` 是品牌名（og:site_name / RSS），
  导航栏那个 logo 是**字标**（`nav.wordmark`，中英都是 "Meo"；2026-11-03 从头像图改的），
  `site.author` 是笔名（标题后缀与署名）。
  ⚠️ 仓库里的 `config/site.json` 只放**默认值**（Meovo / 你的笔名 / you@example.com）：
  公开仓库不带个人文字，个人那几处走**后台「设置」**（D1 `settings` → 构建期导出
  `frontend/i18n/overrides.ts`），别手写回 `config/site.json`。
  署名的地方都用笔名：页脚版权、文章页 JSON-LD 的 author、头像的 alt。
- **站点常用文字在 `config/site.json`** —— 站点名 / 笔名 / 标语 / 首页大标题 / 关于页引言 / 邮箱 / 页脚高度，
  单独一个配置文件（入库，一眼看就懂）。仓库里是默认值；个人文字在后台设置（D1），
  不进仓库。其余长尾文案在 `frontend/i18n/ui.ts` 的词典里。
  - 三层叠加，后者盖前者：**词典 → `config/site.json` → `frontend/i18n/overrides.ts`**（后台改的）
  - `config/site.json` 与词典同形：`{"<i18n key>": {"zh": "…", "en": "…"}}`
  - ⚠️ JSON 没有注释 —— 想写说明就写进 AGENTS.md，别往 JSON 里塞字段
  - `pnpm check:i18n` 两个文件都查（词条完整 / 代码里用到的 key 都在）
- **后台的「设置」分区能改全站默认文字** —— 站点信息（`site.*`）与语言包里的每一条词条都能改。
  - 数据在 D1 的 `settings` 表（`backend/db/migrations/0002_settings.sql`），
    **只存改过的**：与默认值一样的不落库，「恢复默认」= 删那一行
  - **页脚高度也走这条管线** —— `footer.minHeight` 是**数值**（px，0 = 不限），
    但照样存成 zh/en 两份同值的文案设置：后台那个控件一次写两份，前台用
    `frontend/lib/footer-height.ts` 读成像素数（坏了的值一律当不限）
  - ⚠️ 数值设置**不进「界面文案」列表**（那里一个键有两列，会被拆成两份）——
    只有「站点信息」区里那一个控件能改它
  - **后台有一张「页脚」卡** —— 页脚上显示的每一句都在那儿改：
    备案号（`footer.icp`，含数字才渲染成链接）、版权行、构建说明、附加内容（`footer.custom`，可多行）。
    这几条**不进「界面文案」列表**，也不在「站点信息」区里 —— 页脚的事一页说清
  - **`footer.custom` 按裸 HTML 渲染**（`set:html`）—— 作者要写链接、图标就写标签。
    跟正文一样不消毒：内容只来自后台那位作者
  - ⚠️ `config/site.json` 的值**可以留空** —— 空 = 站上不显示（作者可以在后台填）。
    但中英要么都填、要么都空；词典（`ui.ts`）里的每条仍必须非空
  - 构建期由 `backend/scripts/export-d1-posts.mjs` 写进 `frontend/i18n/overrides.ts`，
    `frontend/i18n/index.ts` 构建时把它叠在语言包上 —— **改文案要等下一次构建**
  - ⚠️ `frontend/i18n/overrides.ts` 是**生成的**，别手改；它入库是为了让 diff 里看得见改了什么
  - 为什么不用 `import.meta.glob` 读 JSON：语言包要被浏览器端脚本 import，
    Node 原生 ESM 不认 `import.meta.glob`（单元测试直接就崩了）
  组件里不许出现硬编码的用户可见文案。
- **测试住在 `test/`**：单元测试统一放仓库根的 `test/`，不跟源码混在一起。
  测试 import 源码时相对路径必须写全 `.ts`（Node 的 ESM 解析器不认目录 import，
  也不补扩展名）—— `frontend/lib/*` 里的纯 module 都会被 `pnpm test` 直接 import。
- **DOM 契约**：跨 module 的 class 名 / data 属性名 / 层级刻度都收在 `frontend/lib/dom-contract.ts`
  （`CLASS` / `ATTR` / `Z`）。TS 侧引常量；CSS 与标记里仍是字面量 ——
  `test/dom-contract.test.ts` 跨查两边对不对得上。改名先改契约，再改两边。
  - **契约测试双向守**：lib 层读到的 `data-*` 与 class 字面量也得登记 ——
    真正会咬人的是「标记里有人用了契约外的名字」（改名只会静默失灵）。
    反向检查的范围是 lib 层：组件内部自己写自己读的名字不算跨 module。
- **持久化**：走 `frontend/lib/persist.ts` 的 `createStore({ key, version, clean, migrate })` ——
  序列化、版本、清洗只有一处。两个 adapter：`floating-bar-state.ts`（像素）与
  `widget-state.ts`（百分比）。落盘格式是 `{ version, data }`，旧格式靠 `migrate` 迁，
  用户摆过的位置不丢。
- **明暗模式**：`<html>` 上的 `.dark` 类 + `data-theme="liquid-glass"`。首屏前的内联脚本负责定深浅，别删。
- **默认跟随系统** —— 明暗与语言一个口径：
  - 明暗：localStorage 里**没存**就跟随系统（首屏脚本读 `prefers-color-scheme`）；
    设置弹窗里三个选项（浅色 / 深色 / 跟随系统），选「跟随系统」= 把存的值删掉。
    系统换主题时页面**立刻跟上**（`matchMedia` 的 change 事件，`FloatingBar.astro` 里）
  - 语言：设置弹窗里也有「跟随系统」，链到根路径 —— 由 Worker 按 `Accept-Language` 挑
  - 存的值只有 `light` / `dark` 两种；`preferences.ts` 的 `readModeChoice()` 读出「存的是什么」，
    `clearMode()` 回到跟随系统


## 后端（Cloudflare Workers）

- **部署形态**：整站迁到 Cloudflare Workers —— 静态资源与接口一次部署，同域无跨域。
  `cloudflare/wrangler.jsonc` 是**输入**（绑定声明）；适配器在构建时把它解析成
  `dist/server/wrangler.json`（`main` 指向 `entry.mjs`、assets 指向 `../client`），
  **部署用这份**：`pnpm deploy` = `wrangler deploy --config dist/server/wrangler.json`。
  直接 `wrangler deploy`（拿输入配置）会报「entry-point file was not found」。
- **绑定**：`cloudflare/wrangler.jsonc` 里 `DB`（D1 `meovo-content`）与 `MEDIA`（R2 `meovo-media`）——
  库名 / 桶名以那个文件为准，`config.env` 里只是给人看的副本。
  `routes` 里的自定义域名（`custom_domain`）把域名挂到 Worker；
  挂了它之后 workers.dev 默认关闭，域名就是唯一入口。
  取绑定用 `import { env } from 'cloudflare:workers'`（适配器 v14 已移除
  `Astro.locals.runtime`，别再用旧写法）。
- **secret 不在 `wrangler types` 生成的 Env 里** —— 取 secret 走
  `backend/lib/admin/db.ts` 的 `secret(name)`（把类型放宽），别去改生成的类型文件。
  - **本地 secret 放 `cloudflare/.dev.vars`** —— 要跟 wrangler 配置同目录（wrangler 惯例），
    放在仓库根不会被读到。
  - **本地状态目录是 `cloudflare/.wrangler/state`** —— 适配器的 `persistState` 指到这儿，
    跟 wrangler CLI 同一份本地 D1；不指的话 dev server 与 CLI 各写一个库，
    后台发的稿子导出时找不到。
- **站点仍是 `output: 'static'`** —— 只有 on-demand 路由（`export const prerender = false`）
  走 Worker，其余页面照旧预渲染。
  ⚠️ **on-demand 路由忘了 `prerender = false` 会静默出错**：预渲染会把查询参数吃掉，
  接口永远返回空。
- **站内搜索是纯静态的，不查数据库**：归档页 `/[lang]/archive/` 内联一份索引
  （标题、摘要、正文原文），浏览器端匹配 + 高亮，规则在 `frontend/lib/search.ts`。
  - **切分规则只有一处**：`segmentText` —— 中文逐字拆开、拉丁词整体转小写。
    匹配与高亮吃**同一份 token**（切分时带上位置）—— 高亮是匹配的结果，不另找一遍：
    按原文 indexOf 找会把「折-射」里的折射判成没命中，又把 Cloudflare 里的 Cloud 判成命中。
    为什么自己切：D1 的 FTS5 只有 `unicode61` / `trigram`，**都不切中文**
    （实测中文召回为零，`icu61` 根本不可用）。
  - **词组内要求连续**（`matchText`）：搜「折射」命中「液态玻璃的折射效果」，
    不命中「折纸与射线」；词组之间是 AND。
  - **搜索住在归档卡里**（`archive-head` 部件），不另开一张卡：
    输入框、结果列表、命中高亮都在那张卡里。归档卡带 `full`（独占一行）——
    不然散开布局里它会被旁边的卡压住，搜索框右边点不到。
  - **搜索时别的卡片收起，只留归档卡** —— 散开布局是绝对定位的，
    归档卡长高（出结果）会跟旁边的卡叠在一起；桌面高度也要跟着卡片走，
    不然下面留一地空白、页脚还会压上来。
    `draggable.ts` 的 `measure()` 要跳过量不到尺寸的卡片，
    否则收起期间量成 0，恢复显示时卡片就成了一条线。
  - 关键词写进 URL（`?q=`），结果能分享 / 收藏。
- **本机跑 Cloudflare 工具要带可写的 `HOME`**：
  适配器在构建期起 workerd，`~/Library/Preferences` 不可写会直接失败。
  ⚠️ 拉不到 D1 时导出脚本会写一份**空的** `overrides.ts`（个人文字当场没了）——
  拉回来只能靠 `pnpm sync`；构建前先确认 overrides 里还有东西。

## 后台（自建 CMS）

- **后台在 `/<lang>/admin/`** —— 登录 / 文章列表 / 编辑器 / 图库 / 设置，单管理员。
  - 外壳是 `frontend/layouts/AdminLayout.astro`：左侧分区导航（桌面竖排 / 窄屏横排）+ 右侧内容区。
    页头、状态提示条、登出都在外壳里，页面只写自己的内容
  - **后台不挂站点外壳**：`BaseLayout` 的 `chrome={false}` 关掉悬浮导航与页脚 ——
    后台是另一个应用，站点的导航在这儿只是噪音，还会压住页头
  - 文章的常用操作齐了：新建 / 编辑 / 发布 / 撤回（= 隐藏，不导出）/ 删除；
    编辑器里有状态条、最后保存时间、线上链接、删除按钮，离开前提醒未保存
  - **保存与构建是分开的两步** —— 保存只改 D1，**不触发构建**；
    要上线点页头的「构建上线」（`POST /api/admin/build`，`AdminLayout.astro` 里接线）。
    攒着改完一次构建就行，别每改一个字就构建一次。
  - **中英文各摆一块编辑界面**（没有「切语言」这回事）：同一篇文章的两个语言版本
    各占一张卡，各自带标题 / 摘要 / 正文 / 工具栏 / 预览；slug、日期、分类这些共用。
    保存时两种语言一起存 —— 填了标题的那一版才存（只写中文很正常）。
    另一版从 `GET /api/admin/documents?slug=&locale=` 取（同一 slug 换个语言就是它）
  - **编辑器有 markdown 工具栏 + 自动预览**：
    - 按钮表与纯文本改写函数都在 `frontend/lib/editor-tools.ts`（`EDITOR_TOOLS` +
      `wrapSelection` / `prefixLines` / `insertLink` / `insertTable`），组件只管读写 textarea。
      选区算错、光标落错肉眼看不出来 —— 所以有 `test/editor-tools.test.ts`，改按钮先改那张表
    - 预览走 `POST /api/admin/preview`（服务端 marked）；正文停手 400ms 自动刷一次。
      改完正文要自己 `dispatchEvent(new Event('input'))` 才会触发（脏标记与预览都听它）
    - **「悬停显示」插的是 `<span class="spoiler">…</span>`（裸 HTML，不是 markdown 语法）** ——
      站点与预览都渲染裸 HTML，共用 `frontend/styles/prose.css` 的 `.prose .spoiler`
    - **编辑页是「左写右看」对版**：上中文下英文，每种语言一块，
      桌面端左 textarea 右预览，两栏等高、各自滚动（高度 `--ui-editor-height`），
      滚动位置按比例**同步**（`linkPanes()`）；编辑区装不下全文时用滚动同步，
      装得下时按光标所在行定位预览。预览换内容不换位置（否则每敲一个字预览跳回顶上）
  - 列表支持搜索（标题 / slug / 摘要）+ 状态筛选 + 语言筛选
  - 样式全在 `frontend/styles/admin.css` —— 只用 `--ui-*` token，
    层级刻度用 `--ui-z-*`（提示条是 `--ui-z-panel`）
- **鉴权只有一处**：`backend/middleware.ts` 拦 `/<lang>/admin/*` 与 `/api/admin/*` ——
    同一处还管**请求体上限**（看 `Content-Length`，超了 413）——
    上限要卡在解析之前：读进来再判断等于没判断，内存已经花掉了。路由本身只管业务
  没登录的接口回 401 JSON，页面跳登录页。路由本身只管业务。
  - 口令哈希在 Worker secret `ADMIN_PASSWORD_HASH`（SHA-256），会话密钥 `SESSION_SECRET`，
    Cookie `meovo_session`（HttpOnly / Secure / SameSite=Lax / 7 天）。
  - 同 IP 10 分钟内失败 5 次锁（`login_attempts` 表）。
    ⚠️ **先验口令、再限流**：口令对了就放行（并清掉计数），限流只挡「猜口令」——
    反过来的话，先错几次就再也进不去（正确口令也回 429），最让人抓狂。
- **D1 存稿 → 构建期导出 markdown → 走现有静态管线上线**。
  ⚠️ **发布 ≠ 上线**：后台只改 D1，站点要等下一次构建（Cloudflare Workers Builds）。
  构建靠 `DEPLOY_HOOK_URL` 触发：后台的发布 / 保存已发布文章 / 撤回 / 删除 /
  改文案 / 改项目都会敲这个钩子；没配就只改库、不上线（`ops.sh doctor` 会提醒）。
  - 导出脚本 `backend/scripts/export-d1-posts.mjs`（`prebuild` 钩子）：D1 已发布文档 →
    `frontend/content/generated/<locale>/<slug>.md`。先清后写，撤回 / 删除自然下线。
  - `--local` 走本地 D1 演练，不需要任何凭证。
  - **本地拉取线上最新 = `pnpm sync`**（同 export:posts）：
    ① 远端文章 → `frontend/content/generated/`；② 远端文案 → `frontend/i18n/overrides.ts`；
    ③ 远端项目 → **本地 D1**（项目是运行时读库的，不同步本地就看不到后台的改动）
  - 凭证：优先用 `config.env` 的账户级 `CLOUDFLARE_API_TOKEN` 走 REST；
    没有才退回 wrangler 登录态（`wrangler d1 execute --remote`）
  - **提交前的守卫**（`.githooks/pre-commit` → `backend/scripts/check-remote-updates.mjs`）：
    提交前拿线上 D1 与本地快照（`frontend/content/generated/.manifest.json` 里记着
    文章 slug+updated_at / 文案 / 项目）比对，**线上有更新就拦住提交**，让人先 `pnpm sync`。
    装一次：`pnpm hooks:install`（= `git config core.hooksPath .githooks`）。
    连不上线上时放行 —— 离线不该把人堵死
  - 导出的文章收在**第二个内容集合** `blogGenerated` 里（base 不同，entry.id 形态不变）。
    同 (locale, slug) 与手写撞名时**以手写为准**（`getVisiblePosts` 合并时跳过生成物）。
  - **完整性闸门**：上次有文章、这次一篇都没有 → 构建失败（多半是 `database_id` 填错）。
    但「作者撤回了最后一篇」也是一篇都没有 —— 库里还有稿子就算正常下线，不拦。
- **前台是纯静态的** —— 页面在**构建期**就渲染好了，**运行时不碰 D1**：
  D1 只服务后台（读写）与构建流程（导出）。文章、项目、文案都是构建期从 D1 取，
  部署出去的是静态 HTML。改了后台内容 → 触发一次构建 → 站点更新
- **仓库只放模版与主题，不放内容** —— 文章在 D1 里，仓库里不留；
  构建期导出的那几样（`frontend/content/generated/`、`frontend/i18n/overrides.ts`、
  `frontend/data/projects.ts`）**都在 .gitignore 里**：
  - `pnpm sync` —— 从 D1 拉内容到本地（文章/文案/项目）
  - `pnpm clean` —— 把本地的内容副本清掉（本地不留文章）
  - `pnpm check` / `pnpm test` / `pnpm dev` 前会自动补空壳（`--ensure`），
    所以新克隆的仓库不用先拉内容也能跑检查
- **构建是手动的一步（Deploy Hook）**：`DEPLOY_HOOK_URL` 填在 `config.env`，
  `ops.sh secrets` 写入 Worker secret（Cloudflare Workers Builds 的 Deploy Hook，
  `Settings → Builds → Deploy Hooks` 建），后台页头的「构建上线」敲一下 → 构建 → 上线。
  ⚠️ **保存不触发构建** —— 发布 / 改稿 / 撤回 / 删除 / 改文案 / 改项目都只改 D1，
  要上线自己敲那一次钩子。钩子 URL 本身就是一个凭证（谁拿到都能触发构建），只放
  `config.env` 与 Worker secret，两者都不入库。
- **项目**：关于页那张「项目」卡片 —— 名称 / 简介 / 地址，后台 `/<lang>/admin/projects` 可增删改
  - 表在 `backend/db/migrations/0004_projects.sql`；校验在 `backend/lib/admin/projects.ts`（纯函数）
  - **构建期导出**到 `frontend/data/projects.ts`（生成的文件，跟 overrides.ts 一个道理），
    关于页直接 import —— 没有运行时接口，前台不查 D1
    （代价：后台改完项目要等下一次构建才出现在页面上）
- **图库**：图片二进制进 R2，元数据进 D1，公开地址 `/media/<key>`，
  key 形如 `<年月>/<uuid>.<ext>`（带 uuid，所以可以永久缓存）。
  上传三重校验：类型白名单 + 5MB 上限 + 文件头 sniff 与声明类型一致。
- **改过 `cloudflare/wrangler.jsonc` 的绑定要重跑 `pnpm types`** —— `worker-configuration.d.ts`
  不入库，CI 里 `pnpm types` 排在 `pnpm check` 前面。
- ⚠️ **`wrangler types` 的运行时类型把 DOM 的 `Element.append(node)` 盖掉了** ——
  Cloudflare 给 `Element` 加了 `append(content: string | ReadableStream | Response)`。
  脚本里拼 DOM 只能用 `appendChild`（`prepend` / `before` / `after` 同理）。

## 配置与运维

- **仓库是模版：只有模版与主题，没有某个人的部署信息**
  - `cloudflare/wrangler.jsonc` 与 `astro.config.mjs` 里是**占位符**（库 id / 桶名 / 域名），
    真值在 `config.env`（不入库）—— 构建前由 `scripts/apply-config.mjs` 填回去
  - 本地这两个文件标了 skip-worktree（`git update-index --skip-worktree`）：
    git 里是占位符，磁盘上是你的真值，**不会误提交** ✓
  - `.githooks/pre-commit` 里还有一道 `scripts/check-deploy-info.mjs`：拿 `config.env` 的真值
    比对**已暂存内容**（域名 / D1 id / 账号 id / 口令哈希 / 会话密钥），命中就拦住提交 ——
    即使 skip-worktree 丢了也不会把真值提交进公开仓库
  - 换机器：`cp config.env.example config.env` → 填真值 → `pnpm build` 会自动填回配置 ✓
  - `scripts/apply-config.mjs` **只填有值的项** —— 没有 config.env / 环境变量时不动文件，
    干净检出沿用仓库里已提交的值。⚠️ 别把空值拼成替换串：会写成字面量 `"undefined"`，
    `astro build` 直接报 Invalid URL（CI / Cloudflare 构建都跑在干净检出里）
  - `LICENSE` 的版权行是通用占位（`Meovo contributors`），个人名字/邮箱不进仓库
  - `.scratch/`（开发笔记）不进仓库 ✓
- **环境值只写在 `config.env`**（仓库根，**不入库**；模板 `config.env.example` 入库）。
  这是全项目唯一一处要改的环境值来源 —— `scripts/ops.sh` 负责读写它。
  - 站点**文案**不在这里：默认值在 `config/site.json`（仓库里是默认值，可公开）；
    个人文字在后台设置（D1 `settings`）→ 构建期导出 `frontend/i18n/overrides.ts`。
    `config.env` 里有一段指路，别把两处混了
  - `D1_DATABASE_ID` 与 `cloudflare/wrangler.jsonc` 的 `database_id` 要一致
    （导出脚本 `backend/scripts/export-d1-posts.mjs` 优先读 `config.env` 里的这个），
    `ops.sh doctor` 会查两处是否对得上。
  - `SITE_URL` 与 `astro.config.mjs` 的 `site` 要一致（canonical / hreflang 靠它拼绝对地址）。
  - **改这几项用 `bash scripts/ops.sh config set KEY VALUE`** —— 它顺手同步进
    `cloudflare/wrangler.jsonc`（库 id / 桶名 / 域名）/ `astro.config.mjs`。
    别手改那两个文件（会漂）。
- **运维脚本 `scripts/ops.sh`**（等价 `pnpm ops`）：
  - `doctor` —— 体检：工具链 / 依赖 / 配置 / D1 id 一致性 / Cloudflare 登录 / Worker secret /
    站点可达，汇总「通过 / 提醒 / 阻断」，有阻断项 exit 1
  - `config show|get|set|unset|edit|check` —— 配置的查看与修改（保留注释与其它行）
  - `env` —— 把 `config.env` 的后台凭据写进 `cloudflare/.dev.vars`
    （wrangler 只认配置同目录的那个）
  - `login` / `logout` —— 可选的 wrangler 登录（有账户级 Token 时不需要）
  - `status` —— 当前配置 + 站点可达 + 最近部署
- **运行时变量与密钥统一从 `config.env` 上传**：`bash scripts/ops.sh secrets`
  （`wrangler secret bulk`），包括 `ADMIN_PASSWORD_HASH` / `SESSION_SECRET` / `DEPLOY_HOOK_URL`。
  改任何值都改 `config.env` 后重跑，不要逐个 `wrangler secret put`。
- **进程里已有的环境变量优先于 `config.env`** —— `process.loadEnvFile` 不覆盖已有值，
  CI 注入的 secret 因此压得住本地配置。

## Commands

```bash
pnpm dev              # 开发服务器
pnpm build            # 静态构建到 dist/（先跑导出脚本）
pnpm preview          # 预览构建产物
pnpm check            # 类型检查（astro check）
pnpm test             # 单元测试（test/，node --test，依赖 Node ≥ 22.18 的原生类型擦除）
pnpm check:i18n       # 语言包完整性 + 硬编码界面文案扫描
pnpm check:seo        # SEO 一致性（需先 pnpm build）
pnpm types            # 重新生成 worker 类型（改过 cloudflare/wrangler.jsonc 必跑）
pnpm export:posts     # 从 D1 导出已发布文章到 frontend/content/generated/
pnpm export:posts:local  # 同上，走本地 D1（无需凭证）
pnpm run deploy       # wrangler deploy（写 `pnpm deploy` 会被 pnpm 自带的 deploy 子命令抢走）
pnpm ops              # 运维脚本（doctor / config / env / login / logout / status）
```

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
