# Cloudflare 后端调研：站内搜索（D1 + FTS5）

> 调研日期 2026-11-02。结论先行：D1 能做搜索，但**中文必须自己在应用层切分**。
>
> **后续（2026-11-02）**：用户复核后拍板 —— **搜索页改为静态，不引入数据库**，
> 只保留归档页 `/[lang]/archive/` 内的静态搜索，Workers 部署形态保留。
> 下文的 D1 调研保留为**取舍依据**：分词器不切中文、懒同步是写-读竞态，
> 这两条结论直接决定了现在的方案（详见文末「最终落地」）。

## 结论

1. **D1 支持 FTS5**，但只带 `unicode61` 与 `trigram` 两个分词器，**没有 `icu61`**。
2. **两个分词器都不切中文** —— 实测中文查询召回为零。切分必须自己做。
3. 部署形态从 Cloudflare **Pages 改为 Workers**：适配器 v14 已移除 Pages 支持。
4. 站点仍是 `output: 'static'`，只有搜索页与搜索接口是 on-demand 路由。

## 一、D1 的 FTS5 能力（实测）

在本地 D1（`wrangler d1 execute --local`）上逐个建表验证：

| 分词器 | 建表 | 说明 |
| --- | --- | --- |
| `unicode61` | ✅ | 默认分词器，字母数字连成词 |
| `trigram` | ✅ | 三字符滑窗，适合子串匹配 |
| `icu61` | ❌ | `no such tokenizer: icu61` |

**中文召回实测**（表里灌入「液态玻璃的折射效果与折射率」等中英混排文本）：

| 查询 | unicode61 | trigram |
| --- | --- | --- |
| `折射`（中文双字） | 0 笔 | 0 笔 |
| `认证`（中文双字） | 0 笔 | 0 笔 |
| `Astro`（英文） | 1 笔 | 1 笔 |

原因：两个分词器都把连续汉字当作**一个 token**。`折射` 不是一个 token，
自然匹配不上 `液态玻璃的折射效果与折射率` 这个整体。

## 二、方案：应用层切分 + unicode61

既然分词器帮不上忙，就自己在应用层切：

- **入库时**：中文逐字拆开、空格连接（`液态玻璃` → `液 态 玻 璃`），
  拉丁词整体保留并转小写（`Cloudflare Workers` → `cloudflare workers`）。
- **查询时**：同一套规则拆开，中文组拼成 FTS5 **短语查询**（`"折 射"` 要求相邻），
  组间用 `AND`。

切分规则只有一处：`frontend/lib/search.ts` 的 `segmentText`，入库与查询共用。
两边不一致就搜不到 —— 这是这个方案唯一的脆弱点，所以有单测守着。

**实测召回**（切分后入库）：

| 查询 | 结果 |
| --- | --- |
| `"静 态 输 出"` | 命中《你好，世界》 |
| `"博 客"` | 命中《你好，世界》 |
| `"主 题"` | 命中《把设计变量变成契约》 |
| `"astro"` | 命中 3 篇 |
| `"静 态" AND "博 客"` | 命中《你好，世界》 |

未切分的英文词反而搜不到（`"astro"` 对上 `'a s t r o'` 不匹配）——
这正说明切分必须**入库与查询同规则**。

### 为什么不用 trigram 兜底

trigram 能做子串匹配，看起来能省掉切分。但：

- trigram 要求查询串 ≥ 3 字符，**中文双字词（`折射`、`认证`）直接搜不到** ——
  而中文双字词恰恰是中文搜索的主力。
- trigram 不做词边界判断，`astro` 会命中 `astrology`。
- 切分方案已经验证可行，多一套分词器就多一套要维护的规则。

## 三、索引管线：构建期种子，不是懒同步

```
pnpm build                                    # 产出 dist/client/search-index.json
node scripts/build-search-index.mjs           # JSON → db/seed-search.sql
wrangler d1 execute meovo-search --file=db/seed-search.sql
```

**为什么不用「请求时懒同步」**：

- 写-读竞态：并发请求同时写同一张表。
- 失败时静默降级：索引写不进去，搜索结果为空，没人知道。
- 索引内容不可评审 —— 种子 SQL 能 diff、能 review。

## 四、部署形态：Pages → Workers

`@astrojs/cloudflare` v14 **已移除 Cloudflare Pages 支持**，只支持 Workers。

- `cloudflare/wrangler.jsonc` 的 `main` 用 `@astrojs/cloudflare/entrypoints/server`
  （旧的 `dist/_worker.js/index.js` 作废）。
- 构建产物变成 `dist/client/`（静态资源）+ `dist/server/`（Worker）。
- `assets.directory` 指向 `./dist/client`。
- D1 绑定写在 `d1_databases`，`binding: 'DB'`。
- 取绑定用 `import { env } from 'cloudflare:workers'` —— 
  v14 已移除 `Astro.locals.runtime`。

## 五、Cloudflare 额度（官方定价页）

| 资源 | 免费额度 |
| --- | --- |
| Workers 请求 | 100,000 / 天 |
| Workers CPU | 10 ms |
| Workers 内存 | 128 MB |
| D1 行读取 | 5,000,000 / 天 |
| D1 行写入 | 100,000 / 天 |
| D1 存储 | 5 GB |

等待 D1 查询**不计入** CPU 时间 —— 搜索这种 IO 密集的活儿不吃 CPU 额度。

## 六、本轮不做（roadmap）

- 评论 / 订阅 / 统计 / 管理后台
- 搜索结果高亮（现在只给标题与摘要）
- 分页 / 无限加载
- CI 里自动写远端索引（需要 `CLOUDFLARE_API_TOKEN` 与真实 database id）

## 七、最终落地：静态搜索（2026-11-02 改）

复核后用户拍板：**不引入数据库**，搜索只在归档页 `/[lang]/archive/` 里做。
Workers 部署形态保留（适配器 v14 已移除 Pages 支持），数据库部分全部撤掉：

| 原方案（D1） | 现方案（静态） |
| --- | --- |
| `db/migrations/0001_search.sql`（FTS5 表） | 撤掉 |
| `db/seed-search.sql` + `scripts/build-search-index.mjs` | 撤掉 |
| `frontend/pages/search-index.json.ts`（索引中间产物） | 撤掉 —— 索引直接内联进归档页 |
| `frontend/pages/api/search.json.ts`（on-demand 接口） | 撤掉 |
| `frontend/pages/[lang]/search.astro`（SSR 搜索页） | 撤掉 —— 归档页内做 |
| `cloudflare/wrangler.jsonc` 的 `d1_databases` | 撤掉 |

**留下的**：搜索规则仍在 `frontend/lib/search.ts`（切分 + 匹配 + 高亮，纯函数，可单测）。
索引在构建期随归档页内联（正文 markdown 原文 + 标题 + 摘要），浏览器端匹配。
中文切分在应用层这条结论不变 —— 换成浏览器端匹配后，切分规则反而只有一处，
不再有「入库切一遍、查询再切一遍」的对齐风险。
