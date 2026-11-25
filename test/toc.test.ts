import assert from 'node:assert/strict'
import { test } from 'node:test'
import { activeHeadingId, contentInset, LINE_TOLERANCE, MIN_INSET } from '../frontend/lib/toc.ts'

test('让位高度 —— 悬浮栏贴在顶部时让到它下面', () => {
  // 栏的下沿在 60 → 章节落在 76（中间留 16 的空当）
  assert.equal(contentInset({ top: 20, bottom: 60 }, 900), 76)
  // 量不到悬浮栏（窄屏）→ 只留一点边距
  assert.equal(contentInset(null, 900), MIN_INSET)
  // 悬浮栏被拖到下半屏 → 挡不到标题
  assert.equal(contentInset({ top: 600, bottom: 640 }, 900), MIN_INSET)
  // 栏高得离谱 → 至少留 MIN_INSET
  assert.equal(contentInset({ top: -120, bottom: -20 }, 900), MIN_INSET)
})

test('当前章节 —— 越过让位线的最后一个标题', () => {
  const heads = [
    { id: 'a', top: -200 },
    { id: 'b', top: -10 },
    { id: 'c', top: 300 },
    { id: 'd', top: 600 },
  ]
  assert.equal(activeHeadingId(heads, 120), 'b')
  // 一条都没越过 → 没有当前章节
  assert.equal(activeHeadingId([{ id: 'a', top: 300 }], 120), undefined)
  // 全越过 → 最后一个
  assert.equal(activeHeadingId(heads, 1000), 'd')
})

test('当前章节 —— 落在让位线上的也算（浏览器落点是亚像素的）', () => {
  // 跳转后标题落在 75.31，让位线是 75 —— 差这点也算越过
  assert.equal(activeHeadingId([{ id: 'a', top: 75.31 }], 75), 'a')
  // 真差得远（超过容差）→ 不算
  assert.equal(activeHeadingId([{ id: 'a', top: 75 + LINE_TOLERANCE + 1 }], 75), undefined)
})
