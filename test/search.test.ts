/**
 * 搜索模块的测试。
 *
 * 重点是切分规则 —— 索引与查询共用同一套切分，两边不一致就搜不到。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  segmentText,
  segmentQuery,
  parseQuery,
  matchText,
  highlightParts,
} from '../frontend/lib/search.ts'

test('segmentText：中文逐字拆开', () => {
  assert.equal(segmentText('液态玻璃'), '液 态 玻 璃')
})

test('segmentText：拉丁词整体保留并转小写', () => {
  assert.equal(segmentText('Cloudflare Workers'), 'cloudflare workers')
})

test('segmentText：标点当分隔符丢掉', () => {
  assert.equal(segmentText('你好，世界！'), '你 好 世 界')
})

test('segmentText：中英混排各自成词', () => {
  assert.equal(segmentText('用 Astro 搭博客'), '用 astro 搭 博 客')
})

test('segmentText：空串得到空串', () => {
  assert.equal(segmentText(''), '')
  assert.equal(segmentText('   '), '')
})

test('segmentQuery：连续中文合成一组', () => {
  assert.deepEqual(segmentQuery('液态玻璃'), ['液态玻璃'])
})

test('segmentQuery：拉丁词各自成组', () => {
  assert.deepEqual(segmentQuery('cloudflare workers'), ['cloudflare', 'workers'])
})

test('segmentQuery：中英混排分组', () => {
  assert.deepEqual(segmentQuery('astro 部署'), ['astro', '部署'])
})

test('segmentQuery：标点分隔', () => {
  assert.deepEqual(segmentQuery('折射，玻璃'), ['折射', '玻璃'])
})

test('parseQuery：词组带切分后的 token', () => {
  assert.deepEqual(parseQuery('折射'), [{ text: '折射', tokens: ['折', '射'] }])
})

test('matchText：中文短语要求连续', () => {
  const terms = parseQuery('折射')
  assert.equal(matchText('液态玻璃的折射效果', terms), true)
  assert.equal(matchText('折纸与射线', terms), false)
})

test('matchText：拉丁词大小写不敏感', () => {
  const terms = parseQuery('astro')
  assert.equal(matchText('用 Astro 搭博客', terms), true)
})

test('matchText：多词组是 AND 关系', () => {
  const terms = parseQuery('折射 认证')
  assert.equal(matchText('关于折射与认证的记录', terms), true)
  assert.equal(matchText('只讲折射', terms), false)
})

test('matchText：空查询命中一切', () => {
  assert.equal(matchText('任意文本', []), true)
})

test('highlightParts：命中处标出来', () => {
  const parts = highlightParts('液态玻璃的折射效果', parseQuery('折射'))
  assert.deepEqual(parts, [
    { text: '液态玻璃的', hit: false },
    { text: '折射', hit: true },
    { text: '效果', hit: false },
  ])
})

test('highlightParts：英文大小写不敏感', () => {
  const parts = highlightParts('用 Astro 搭博客', parseQuery('astro'))
  assert.equal(parts.filter((p) => p.hit).length, 1)
  assert.equal(parts.find((p) => p.hit)?.text, 'Astro')
})

test('highlightParts：没命中就整段返回', () => {
  assert.deepEqual(highlightParts('无关文本', parseQuery('折射')), [
    { text: '无关文本', hit: false },
  ])
})

test('highlightParts：多处命中都标出来', () => {
  const parts = highlightParts('折射与折射', parseQuery('折射'))
  assert.equal(parts.filter((p) => p.hit).length, 2)
})

test('命中与高亮同一套规则：折-射效果搜折射，命中就一定要标出来', () => {
  const terms = parseQuery('折射')
  assert.equal(matchText('折-射效果', terms), true)
  const hits = highlightParts('折-射效果', terms).filter((p) => p.hit)
  assert.equal(hits.length, 1)
  assert.equal(hits[0].text, '折-射')
})

test('命中与高亮同一套规则：Cloudflare 不该被 cloud 标黄', () => {
  const terms = parseQuery('cloud')
  assert.equal(matchText('Cloudflare Workers', terms), false)
  assert.deepEqual(highlightParts('Cloudflare Workers', terms), [
    { text: 'Cloudflare Workers', hit: false },
  ])
})

test('命中与高亮同一套规则：正文命中、这个字段没命中的词组不留高亮', () => {
  const terms = parseQuery('折射')
  assert.equal(matchText('正文里有折射', terms), true)
  assert.deepEqual(highlightParts('标题没有这个词', terms), [
    { text: '标题没有这个词', hit: false },
  ])
})
