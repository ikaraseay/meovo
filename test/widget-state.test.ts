import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  readWidgetPositions,
  saveWidgetPosition,
  clearWidgetPositions,
  removeWidgetPosition,
  type WidgetStateStore,
} from '../frontend/lib/widget-state.ts'

function fakeStore(initial: Record<string, string> = {}): WidgetStateStore & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v
    },
  }
}

test('写单个部件读回来是同一份（百分比）', () => {
  const store = fakeStore()
  saveWidgetPosition('hero', { xPct: 12.5, yPct: 40 }, store)

  assert.deepEqual(readWidgetPositions(store), {
    hero: { xPct: 12.5, yPct: 40, pinned: false },
  })
})

test('按 id 合并 —— 写第二个不会抹掉第一个', () => {
  const store = fakeStore()
  saveWidgetPosition('hero', { xPct: 1, yPct: 2 }, store)
  saveWidgetPosition('post-a', { xPct: 70, yPct: 88.8 }, store)

  const state = readWidgetPositions(store)
  assert.deepEqual(state.hero, { xPct: 1, yPct: 2, pinned: false })
  assert.deepEqual(state['post-a'], { xPct: 70, yPct: 88.8, pinned: false })
})

test('版本不符整体作废 —— 坐标格式换了旧坐标别再摆', () => {
  const store = fakeStore({
    'widget-state': JSON.stringify({ version: 99, widgets: { hero: { xPct: 1, yPct: 2 } } }),
  })
  assert.deepEqual(readWidgetPositions(store), {})
})

test('旧像素格式（x/y）不会误读成百分比', () => {
  const store = fakeStore({
    'widget-state': JSON.stringify({ version: 3, widgets: { hero: { x: 120, y: 40 } } }),
  })
  assert.deepEqual(readWidgetPositions(store), {})
})

test('坏 JSON 当没有 —— 不炸', () => {
  const store = fakeStore({ 'widget-state': '{不是 json' })
  assert.deepEqual(readWidgetPositions(store), {})
})

test('坏数值只丢自己那个部件', () => {
  const store = fakeStore({
    'widget-state': JSON.stringify({
      version: 3,
      widgets: { hero: { xPct: '12', yPct: 40 }, a: { xPct: 1, yPct: 2 } },
    }),
  })

  const state = readWidgetPositions(store)
  assert.equal(state.hero, undefined)
  assert.deepEqual(state.a, { xPct: 1, yPct: 2, pinned: false })
})

test('pinned 布尔值往返', () => {
  const store = fakeStore()
  saveWidgetPosition('hero', { xPct: 10, yPct: 20, pinned: true }, store)
  assert.deepEqual(readWidgetPositions(store).hero, { xPct: 10, yPct: 20, pinned: true })
})

test('NaN 不算数', () => {
  const store = fakeStore()
  saveWidgetPosition('hero', { xPct: Number.NaN, yPct: 40 }, store)
  assert.equal(readWidgetPositions(store).hero, undefined)
})

test('删除单个部件 —— 只删它自己', () => {
  const store = fakeStore()
  saveWidgetPosition('hero', { xPct: 1, yPct: 2 }, store)
  saveWidgetPosition('a', { xPct: 3, yPct: 4 }, store)
  removeWidgetPosition('hero', store)

  const state = readWidgetPositions(store)
  assert.equal(state.hero, undefined)
  assert.deepEqual(state.a, { xPct: 3, yPct: 4, pinned: false })
})

test('清空后什么都没有', () => {
  const store = fakeStore()
  saveWidgetPosition('hero', { xPct: 1, yPct: 2 }, store)
  clearWidgetPositions(store)
  assert.deepEqual(readWidgetPositions(store), {})
})

test('存储抛异常时静默 —— 存不了也不能把页面搞崩', () => {
  const broken: WidgetStateStore = {
    getItem: () => {
      throw new Error('nope')
    },
    setItem: () => {
      throw new Error('nope')
    },
  }

  assert.deepEqual(readWidgetPositions(broken), {})
  saveWidgetPosition('hero', { xPct: 1, yPct: 2 }, broken)
  clearWidgetPositions(broken)
  removeWidgetPosition('hero', broken)
})

test('没有 store 时也不炸', () => {
  assert.deepEqual(readWidgetPositions(null), {})
  saveWidgetPosition('hero', { xPct: 1, yPct: 2 }, null)
  clearWidgetPositions(null)
  removeWidgetPosition('hero', null)
})
