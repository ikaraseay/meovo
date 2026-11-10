import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  echoesOriginal,
  extractParagraphs,
  parseSummary,
  readCache,
  validateSummary,
  writeCache,
} from '../backend/scripts/ai-summary.mjs'
import { foldKey } from '../frontend/lib/text-fold-key.ts'

test('段落口径：标题 / 列表 / 水平线 / 引用 / 含媒体的段落都不算', () => {
  const md = [
    '# 标题',
    '',
    '第一段。这是第一段。',
    '',
    '---',
    '',
    '> 引用块。',
    '',
    '- 列表项。',
    '',
    '![图片](/a.png)',
    '',
    '段里有图 ![alt](/b.png) 的文字。',
    '',
    '第二段。',
  ].join('\n')

  assert.deepEqual(
    extractParagraphs(md).map((p) => p.text),
    ['第一段。这是第一段。', '第二段。'],
  )
})

test('段落键：markdown 的直角引号与渲染后的弯引号是同一个键', () => {
  const [para] = extractParagraphs('He said "hello there". Then left.')
  assert.equal(para.key, foldKey('He said “hello there”. Then left.'))
})

test('段落键：软换行与多余空白不影响键', () => {
  const [para] = extractParagraphs('第一行\n第二行。')
  assert.equal(para.key, foldKey('第一行 第二行。'))
})

test('段落键：不同段落不是同一个键', () => {
  assert.notEqual(foldKey('第一段。'), foldKey('第二段。'))
})

test('段落键：指纹是定死的 —— 算法一改，这个测试就该红（记得同步 +CACHE_VERSION）', () => {
  assert.equal(foldKey('他点点头。可心里清楚，这事真办成，没那么简单。'), 'b2938db0a47b7606')
})

test('摘要缓存：从 D1 读回来还是那批要点', async () => {
  const cache = await readCache(async (sql) => {
    assert.match(sql, /FROM ai_summaries/)
    return [
      {
        key: 'zh/a',
        version: 3,
        updated_at: '2026-01-01',
        summaries: JSON.stringify({ k1: { takeaway: '要点一', reason: '理由一' } }),
      },
    ]
  })
  assert.equal(cache.get('zh/a')?.updated_at, '2026-01-01')
  assert.deepEqual(cache.get('zh/a')?.summaries, { k1: { takeaway: '要点一', reason: '理由一' } })
})

test('摘要缓存：一行脏数据只丢那一行', async () => {
  const cache = await readCache(async () => [
    { key: 'zh/a', version: 3, updated_at: 'x', summaries: '坏 JSON' },
    { key: 'zh/b', version: 3, updated_at: 'x', summaries: '{"k1":{"takeaway":"要点","reason":""}}' },
  ])
  assert.equal(cache.size, 1)
  assert.ok(cache.has('zh/b'))
})

test('摘要缓存：写回 D1 时单引号要双写', async () => {
  let sql = ''
  await writeCache(
    async (s: string) => {
      sql = s
      return []
    },
    'zh/a',
    { updated_at: '2026-01-01', summaries: { k1: { takeaway: "it's fine", reason: '' } } },
  )
  assert.match(sql, /INSERT OR REPLACE INTO ai_summaries/)
  assert.ok(sql.includes("it''s fine"), sql)
})

test('解析：JSON 里的要点与理由都取出来', () => {
  assert.deepEqual(parseSummary('{"takeaway":"要点在这里","reason":"因为有缓存"}'), {
    takeaway: '要点在这里',
    reason: '因为有缓存',
  })
})

test('解析：模型多嘴（前缀 / 代码块）也照样解析', () => {
  const raw = '```json\n{"takeaway":"要点在这里","reason":"因为有缓存"}\n```'
  assert.deepEqual(parseSummary(raw), { takeaway: '要点在这里', reason: '因为有缓存' })
})

test('解析：不是 JSON 就整段当要点，理由留空', () => {
  assert.deepEqual(parseSummary('要点：缓存应该放在 D1 里'), {
    takeaway: '缓存应该放在 D1 里',
    reason: '',
  })
})

test('校验：照搬原文头一句的要点不合格', () => {
  const original = '摘要缓存应该放在 D1 里。因为每次构建都从干净检出开始。'
  assert.ok(echoesOriginal('摘要缓存应该放在 D1 里', original))
  assert.equal(validateSummary({ takeaway: '摘要缓存应该放在 D1 里', reason: '' }, original, 'zh'), false)
})

test('校验：重述过的要点合格', () => {
  const original = '摘要缓存应该放在 D1 里。因为每次构建都从干净检出开始。'
  const summary = { takeaway: 'AI 摘要的缓存必须落到数据库，不能进版本库', reason: '构建每次从干净检出开始' }
  assert.equal(validateSummary(summary, original, 'zh'), true)
})

test('校验：太短的要点不合格', () => {
  assert.equal(validateSummary({ takeaway: '短', reason: '' }, '一段足够长的原文内容在这里。', 'zh'), false)
})
