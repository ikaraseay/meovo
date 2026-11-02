# cloudflare/ —— 部署层

整站跑在 Cloudflare Workers。这个目录放**部署要用的东西**：

| 文件 | 作用 |
| --- | --- |
| `cloudflare/wrangler.jsonc` | Worker 绑定声明：D1（`DB`）、R2（`MEDIA`）、静态资源（`ASSETS`） |
| `cloudflare/public/_headers` | 静态资源的缓存策略 |
| `cloudflare/public/_redirects` | 根路径 301 到 `/zh/` |
| `public/favicon.svg`、`og-default.png` | 站点图标与默认 OG 图 |

## 路径规则

wrangler 配置里的路径**相对本目录**：

- `assets.directory` → `../dist/client`（Astro 构建产物）
- `d1_databases[].migrations_dir` → `../backend/db/migrations`

## 部署

```bash
pnpm build     # 先构建：适配器会把 cloudflare/wrangler.jsonc 解析成 dist/server/wrangler.json
pnpm deploy    # wrangler deploy --config dist/server/wrangler.json
```

⚠️ **部署用的是 `dist/server/wrangler.json`（构建产物），不是本目录的 `cloudflare/wrangler.jsonc`**。
前者已经把 `main` 指向 `entry.mjs`、assets 指向 `../client`；后者是输入，
直接拿它跑 `wrangler deploy` 会报「entry-point file was not found」。

## 配置与运维

环境值收在**仓库根的 `config.env`**（不入库，模板 `config.env.example` 入库）——
这是全项目唯一一处要改的环境值来源。运维脚本 `scripts/ops.sh` 负责读写它：

```bash
bash scripts/ops.sh doctor              # 体检：哪里没配好，一次列清楚（有阻断项 exit 1）
bash scripts/ops.sh config show         # 看配置（secret 的值不回显）
bash scripts/ops.sh config check        # 只校验配置
bash scripts/ops.sh config set D1_DATABASE_ID <id>   # 顺手同步进 cloudflare/wrangler.jsonc
bash scripts/ops.sh config set SITE_URL <url>        # 顺手同步进 astro.config.mjs
bash scripts/ops.sh env                 # 把后台凭据写进 cloudflare/.dev.vars
bash scripts/ops.sh login / logout      # Cloudflare 账号
bash scripts/ops.sh status              # 配置 + 站点可达 + 最近部署
```

两处要留意的对应关系：

- `config.env` 的 `D1_DATABASE_ID` **优先于**本目录 `cloudflare/wrangler.jsonc` 的 `database_id`
  （导出脚本 `backend/scripts/export-d1-posts.mjs` 先读它，没有才读 jsonc）。
  两处必须一致 —— `doctor` 会查。
- `config.env` 的 `SITE_URL` 与 `astro.config.mjs` 的 `site` 必须一致
  （canonical / hreflang / sitemap / RSS 都靠它拼绝对地址）。

⚠️ **线上 secret 不写进 `config.env`** —— 用 `pnpm wrangler secret put`。
`config.env` 里的 `ADMIN_PASSWORD_HASH` / `SESSION_SECRET` 只是本地开发用的副本。

## 首次上线（要在 Cloudflare 上做的）

```bash
wrangler d1 create meovo-content          # 把返回的 database_id 填进 cloudflare/wrangler.jsonc
bash scripts/ops.sh config set D1_DATABASE_ID <id>   # 同上（两边一起改，别只改一处）
wrangler r2 bucket create meovo-media
wrangler d1 migrations apply meovo-content --remote --config cloudflare/wrangler.jsonc
wrangler secret put ADMIN_PASSWORD_HASH   # 口令的 SHA-256（十六进制）
wrangler secret put SESSION_SECRET        # 随机长串
```

建完资源后跑一次 `bash scripts/ops.sh doctor` —— 它会告诉你还差什么。

GitHub secret：`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`
（导出脚本要读 D1；`D1_DATABASE_ID` 可选，默认从本目录的 cloudflare/wrangler.jsonc 提取）。

改过绑定要重跑 `pnpm types` —— `worker-configuration.d.ts` 不入库。

## 本地

- **secret**：`cloudflare/.dev.vars`（跟 wrangler 配置同目录，wrangler 惯例）——

  ```
  ADMIN_PASSWORD_HASH=<口令的 SHA-256>
  SESSION_SECRET=<随机长串>
  ```

- **本地 D1 / R2 状态**：`cloudflare/.wrangler/state` —— 适配器的 `persistState`
  指到这儿，跟 wrangler CLI 用的是同一份库；不指的话 dev server 与 CLI 各写一个，
  后台发的稿子导出时找不到。
- **迁移**（本地）：

  ```bash
  wrangler d1 migrations apply meovo-content --local --config cloudflare/wrangler.jsonc
  ```

```bash
pnpm export:posts:local   # 走本地 D1，不需要凭证
```

本机跑 Cloudflare 工具要带可写的 `HOME`：适配器在构建期起 workerd，
`~/Library/Preferences` 不可写会直接失败。
