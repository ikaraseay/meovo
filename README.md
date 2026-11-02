# Meovo

个人博客。**Astro 7 静态站 + Cloudflare Workers**，中英双语，后台自建。

内容存在 Cloudflare D1 里 —— 那是唯一的真身；构建时从 D1 导出成静态文件，
部署出去的是纯静态 HTML，运行时不碰数据库。文章、项目、界面文案都走这条链路：
后台改 → 构建 → 上线。

页面是「液态玻璃」：一桌可拖拽的玻璃卡片，能固定、能摆位；导航栏是真折射
（Chromium 系），别的引擎退化成毛玻璃 + 拟态色散。

## 它是什么

- **前台纯静态**：页面在构建期就渲染好了，**运行时不查 D1** —— D1 只服务后台与构建流程；
- **内容即数据**：后台（D1）写稿，构建期导出 markdown + 文案覆盖 + 项目清单；
- **双语**：`/zh/` 与 `/en/` 对称；同 slug 的两个文件互为翻译，缺一版时另一版顶上并标注；
- **自建后台**：`/<lang>/admin/` —— 文章 / 项目 / 界面文案 / 图库，单管理员，一个口令；
- **液态玻璃主题**：卡片画布 + 折射玻璃 + 明暗跟随系统；
- **纯静态搜索**：归档页内联一份索引，浏览器端匹配 + 高亮；
- **零工具类**：样式是原生 CSS + `--ui-*` token 契约，没有 Tailwind、没有 UI 库。

## 技术栈

| 关注点 | 选型 | 说明 |
|---|---|---|
| 框架 | Astro 7 | 静态输出 + `@astrojs/cloudflare` 适配器 |
| 运行时 | Cloudflare Workers | 静态资源与接口一次部署，同域无跨域 |
| 数据库 | D1（SQLite） | 文章、项目、文案覆盖 |
| 对象存储 | R2 | 图库二进制（`/media/<key>` 公开可永久缓存） |
| 样式 | 原生 CSS + `--ui-*` token | 结构刻度（tokens.css）与语义色层（主题文件）分开 |
| 包管理 | pnpm | Node 钉在 `.node-version` |
| 测试 | `node --test` | 纯 module 直接 import，零测试框架 |

## 快速开始

需要 **Node ≥ 22.23**（`.node-version` 写的 22.23.4）与 pnpm 12。

```bash
pnpm install
cp config.env.example config.env    # 填站点地址 / 库 id / 桶名（注释里写了怎么拿）
pnpm sync                          # 从 D1 拉内容（文章 / 文案 / 项目）到本地
pnpm dev                           # 开发服务器
```

`pnpm sync` 需要能访问 D1：有 `CLOUDFLARE_API_TOKEN` 就走 REST，
没有就借 wrangler 的登录态（`wrangler login` 过即可）。

`config.env` 是**唯一**要改环境值的地方（不入库）。仓库里的
`cloudflare/wrangler.jsonc` 与 `astro.config.mjs` 放的是占位符，
构建前由 `scripts/apply-config.mjs` 把真值填回去。

站点文案（站名 / 笔名 / 邮箱 / 标语）在 `config/site.json` —— 同样是占位值，
换成你自己的。

## 目录结构

```text
frontend/           站点本体（Astro 的 srcDir）
  pages/            路由（[lang]/ 页面、api/ 接口、404）
  components/       组件（Article / FloatingBar / Comments / GlassWidget …）
  styles/           tokens.css（结构刻度）+ themes/（语义色层）+ prose / terminal / admin
  content/          文章（blog/ 手写，generated/ 构建期导出）
  i18n/             词典（ui.ts）+ 站点文案（site.json）+ 生成物（overrides.ts）
  lib/              通用逻辑（拖拽画布 / 布局数学 / 偏好 / 断点 / 搜索）
backend/            后台逻辑
  lib/admin/        会话 / 口令 / 文档 / 项目 / 图库 / 导出
  middleware.ts     鉴权（拦 /<lang>/admin/* 与 /api/admin/*）
  db/migrations/     D1 表结构
  scripts/          构建期导出（内容 → markdown / 文案 / 项目）
cloudflare/         部署层：wrangler.jsonc（绑定）、public/（静态资源与缓存头）
scripts/            运维脚本（ops.sh）、配置填充、口令哈希
test/               单元测试（node --test）
docs/adr/           架构决策记录
```

## 命令

```bash
pnpm dev              # 开发服务器
pnpm build            # 构建（先跑导出）
pnpm preview          # 预览构建产物
pnpm check            # 类型检查（astro check）
pnpm test             # 单元测试
pnpm check:i18n       # 语言包完整性 + 硬编码文案扫描
pnpm check:seo        # canonical / hreflang / sitemap / RSS 一致性
pnpm sync             # 从 D1 拉最新内容到本地
pnpm clean            # 清掉本地的内容副本（本地不留文章）
pnpm ops              # 运维脚本：doctor / config / env / login / status
pnpm run deploy       # 部署到 Cloudflare Workers
```

## 内容系统

D1 是唯一真身，仓库里不留内容：

| 东西 | 存在哪 | 怎么进站 |
|---|---|---|
| 文章 | D1 `documents` | 构建期导出 `frontend/content/generated/<locale>/<slug>.md` |
| 界面文案 | D1 `settings` | 构建期写 `frontend/i18n/overrides.ts`，叠在词典上 |
| 项目 | D1 `projects` | 构建期写 `frontend/data/projects.ts`，关于页直接 import |
| 图片 | R2 | 后台上传，公开地址 `/media/<key>` |

后台在 `/<lang>/admin/`（口令 = Worker secret `ADMIN_PASSWORD_HASH` 里的 SHA-256）。
**发布 ≠ 上线**：后台改的是 D1，站点是构建期产物，得等下一次构建才更新。
配了 Worker secret `DEPLOY_HOOK_URL`（Cloudflare Workers Builds 的 Deploy Hook）后，
发布 / 保存已发布文章 / 撤回 / 删除 / 改文案 / 改项目都会敲一下钩子，构建随即开始。
后台页头还有「**立即构建**」按钮（`POST /api/admin/build`）—— 不改内容也能手动触发一次构建。

## 部署

部署只有一条路径：**[Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)**
直连 GitHub 仓库 —— push 自动构建 + 部署；内容改动走 Deploy Hook。

| 项 | 值 |
|---|---|
| Build command | `pnpm install --frozen-lockfile && pnpm build` |
| Deploy command | `pnpm run deploy` |
| Root directory | `/` |

**仓库里只有占位符**：`cloudflare/wrangler.jsonc` 与 `astro.config.mjs` 的值是
`meovo` / `meovo-content` / `00000000-…` / `example.com` 这样的占位符，
真值在 `config.env`（不入库），构建前由 `scripts/apply-config.mjs` 填回去。
Cloudflare 构建是从仓库检出的，所以真值要配成 **Build variables**
（Settings → Builds → Build variables and secrets）：

| 变量 | 值 |
|---|---|
| `WORKER_NAME` | Worker 名 |
| `SITE_URL` | 站点根地址 |
| `D1_DATABASE_NAME` / `D1_DATABASE_ID` | D1 的库名与 id |
| `R2_BUCKET_NAME` | R2 桶名 |
| `CLOUDFLARE_ACCOUNT_ID` | 账号 id（导出走 REST 时用） |

这些不是凭据（构建日志里可见也无所谓）；真正要保密的
`ADMIN_PASSWORD_HASH` / `SESSION_SECRET` / `DEPLOY_HOOK_URL` 只放 Worker secret。
本地真值靠 `git update-index --skip-worktree` 留在工作区；`.githooks/pre-commit` 里还有
`scripts/check-deploy-info.mjs` 这道守卫，拦住「把真值提交进仓库」。

构建时 wrangler 用的是 Worker **Settings → Builds → API token** 里那支 token。
默认自动生成的那支**没有 D1 权限**，而 `pnpm build` 的第一步就是从 D1 导出内容 ——
所以要在 Build settings 里换一支带 **D1: Edit** 的 user token。
不换的话构建会在导出那步报「拉不到 D1」并失败（Workers Builds 里
`WORKERS_CI=1` 会让导出变成必须成功，不会静默上线一个空站）。

**后台改内容怎么触发构建**：D1 不在 git 里，push 永远不会发生。去
**Settings → Builds → Deploy Hooks** 建一个 hook（branch = `main`），
把 URL 存成 Worker secret：

```bash
pnpm wrangler secret put DEPLOY_HOOK_URL --config cloudflare/wrangler.jsonc
```

这样就不需要把任何 Cloudflare 凭证放进 GitHub（GitHub 上只有代码）。
`.github/workflows/ci.yml` 只跑检查，不部署、不需要 secret。
不想接 Git 的话，`pnpm sync && pnpm build && pnpm run deploy` 手动走一遍也一样。

## 许可

[MIT](LICENSE)。
