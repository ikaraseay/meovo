import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clearFloatingBarState,
  readFloatingBarState,
  removeFloatingBarState,
  saveFloatingBarState,
  type StateStore,
} from '../frontend/lib/floating-bar-state.ts'

/** 假 store —— 只实现 store 用到的两样 */
function fakeStore(initial: Record<string, string> = {}): StateStore & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v
    },
  }
}

test('写进去读出来是同一份', () => {
  const store = fakeStore()
  saveFloatingBarState({ menu: { x: 120, y: 40 }, fab: { right: 20, bottom: 200 } }, store)

  assert.deepEqual(readFloatingBarState(store), {
    menu: { x: 120, y: 40 },
    fab: { right: 20, bottom: 200 },
  })
})

test('按块合并 —— 只写栏体不会抹掉设置按钮', () => {
  const store = fakeStore()
  saveFloatingBarState({ fab: { right: 20, bottom: 200 } }, store)
  saveFloatingBarState({ menu: { x: 10, y: 20 } }, store)

  const state = readFloatingBarState(store)
  assert.deepEqual(state.fab, { right: 20, bottom: 200 })
  assert.deepEqual(state.menu, { x: 10, y: 20 })
})

test('坏 JSON 当没有 —— 不炸', () => {
  const store = fakeStore({ 'floating-bar-state': '{不是 json' })
  assert.deepEqual(readFloatingBarState(store), {})
})

test('坏数值只丢自己那一块', () => {
  const store = fakeStore({
    'floating-bar-state': JSON.stringify({
      menu: { x: '120', y: 40 },
      fab: { right: 20, bottom: 200 },
    }),
  })

  const state = readFloatingBarState(store)
  assert.equal(state.menu, undefined)
  assert.deepEqual(state.fab, { right: 20, bottom: 200 })
})

test('NaN 不算数', () => {
  const store = fakeStore()
  saveFloatingBarState({ menu: { x: Number.NaN, y: 40 } }, store)
  assert.equal(readFloatingBarState(store).menu, undefined)
})

test('存储抛异常时静默 —— 存不了也不能把页面搞崩', () => {
  const broken: StateStore = {
    getItem: () => {
      throw new Error('nope')
    },
    setItem: () => {
      throw new Error('nope')
    },
  }

  assert.deepEqual(readFloatingBarState(broken), {})
  saveFloatingBarState({ menu: { x: 1, y: 2 } }, broken)
})

test('没有 store 时也不炸', () => {
  assert.deepEqual(readFloatingBarState(null), {})
  saveFloatingBarState({ menu: { x: 1, y: 2 } }, null)
})

test('删掉弹窗的摆放 —— 自动落点回得来', () => {
  const store = fakeStore()
  saveFloatingBarState({ popup: { x: 10, y: 20 }, menu: { x: 1, y: 2 } }, store)
  removeFloatingBarState('popup', store)

  const state = readFloatingBarState(store)
  assert.equal(state.popup, undefined)
  assert.deepEqual(state.menu, { x: 1, y: 2 })
})

test('全清 —— 「重置布局」用，悬浮栏的摆放全回默认', () => {
  const store = fakeStore()
  saveFloatingBarState({ menu: { x: 1, y: 2 }, fab: { right: 20, bottom: 200 } }, store)
  clearFloatingBarState(store)

  assert.deepEqual(readFloatingBarState(store), {})
})

