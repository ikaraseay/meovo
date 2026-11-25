import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  activeHeadingId,
  contentInset,
  LINE_TOLERANCE,
  MIN_INSET,
  openGroupIds,
  toggleGroupMode,
  type TocGroupMode,
} from '../frontend/lib/toc.ts'

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

test('目录分组：默认全收起 —— 只有当前那组展开', () => {
  const groups = [
    { id: 'a', collapsible: true },
    { id: 'b', collapsible: true },
  ]
  assert.deepEqual(openGroupIds(groups, 'a', new Map()), ['a'])
  // 还没进到任何一节 → 全收起
  assert.deepEqual(openGroupIds(groups, null, new Map()), [])
  // 走过的部分收起：位置在 b，a 不再展开
  assert.deepEqual(openGroupIds(groups, 'b', new Map()), ['b'])
})

test('目录分组：没有子章节的组不可折叠', () => {
  const groups = [{ id: 'a', collapsible: false }]
  assert.deepEqual(openGroupIds(groups, 'a', new Map()), [])
  // 手动展开也不算数 —— 它压根没有可展开的内容
  assert.deepEqual(openGroupIds(groups, 'a', new Map([['a', 'open']])), [])
})

test('目录分组：手动展开的留着，不跟着位置走', () => {
  const groups = [
    { id: 'a', collapsible: true },
    { id: 'b', collapsible: true },
  ]
  const modes = new Map<string, TocGroupMode>([['b', 'open']])
  // 位置在 a，b 是手动展开的 —— 两个都开
  assert.deepEqual(openGroupIds(groups, 'a', modes).sort(), ['a', 'b'])
  // 手动收起的，即使正是当前那组也不展开
  const closed = new Map<string, TocGroupMode>([['a', 'closed']])
  assert.deepEqual(openGroupIds(groups, 'a', closed), [])
})

test('目录分组：双击切换 —— 开着就收，收着就开', () => {
  // 位置驱动的组：当前开着 → 双击收起（此后不跟位置走）
  assert.equal(toggleGroupMode('auto', true), 'closed')
  assert.equal(toggleGroupMode('auto', false), 'open')
  assert.equal(toggleGroupMode('open', true), 'closed')
  assert.equal(toggleGroupMode('closed', false), 'open')
})
