# 0003 · 环境值收口到 config.env

Status: accepted

## 背景

站点要连的外部资源有三类：Cloudflare 的 D1 / R2 / Worker secret、站点自己的域名、
后台的登录凭据。它们散落在好几个地方：

- `cloudflare/wrangler.jsonc` 的 `database_id`
- `astro.config.mjs` 的 `site`
- Worker secret（`wrangler secret put`）
- CI 的 GitHub secret

前两处要手改、后两处要分别在不同平台设置，改一次部署要动四个文件，
而且没人说得清「当前线上到底是哪个值」。

## 决定

**`config.env`（仓库根）是全项目唯一一处要改的环境值来源。**

- 真实值不入库（`.gitignore`），模板 `config.env.example` 入库。
- `scripts/ops.sh` 负责读写它：
  - `config set KEY VALUE` 写配置，并**顺手同步**代码里同一份的值 ——
    `D1_DATABASE_ID` → `cloudflare/wrangler.jsonc` 的 `database_id`，
    `SITE_URL` → `astro.config.mjs` 的 `site`。别手改那两个文件（会漂）。
  - `doctor` 体检时逐项对账：配置项格式、D1 id 两处一致、站点地址两处一致、
    Cloudflare 登录、Worker secret、站点可达。
  - `env` 把后台凭据写进 `cloudflare/.dev.vars` —— wrangler 只认配置同目录的那个。
- **线上 secret 仍走 Worker secret**，不写进 `config.env`。
  `config.env` 里的 `ADMIN_PASSWORD_HASH` / `SESSION_SECRET` 只是本地开发用的副本。
- 导出脚本 `backend/scripts/export-d1-posts.mjs` 读 `config.env`（`D1_DATABASE_ID` 优先，
  没有才从 `wrangler.jsonc` 正则提取）。**进程里已有的环境变量优先于 `config.env`** ——
  `process.loadEnvFile` 不覆盖已有值，CI 注入的 secret 因此压得住本地配置。

## 为什么不是「只留一个文件」

`wrangler.jsonc` 与 `astro.config.mjs` 里的值删不掉（工具直接读它们），
所以「单一来源」在这里的准确含义是：**人只改 `config.env`，脚本负责把值同步到
工具读的地方，并且每次体检都核对两边没漂**。剩下的重复是工具的约束，不是人的负担。

## 验收

- `bash scripts/ops.sh doctor` —— 有阻断项 exit 1
- `bash scripts/ops.sh config check` —— 配置项格式与占位符检查
- `test/ops-config.test.ts` —— 脚本语法、模板校验、secret 不回显、set/get/unset 往返
