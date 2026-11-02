import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createStore, type StorageLike } from '../frontend/lib/persist.ts'

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v
    },
  } satisfies StorageLike & { data: Record<string, string> }
}

interface State {
  [key: string]: { v: number }
}

/** 坏值只丢自己那一块 */
const clean = (value: unknown): State => {
  if (!value || typeof value !== 'object') return {}
  const out: State = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = (v as { v?: unknown } | undefined)?.v
    if (typeof n === 'number' && Number.isFinite(n)) out[k] = { v: n }
  }
  return out
}

test('落盘是带版本号的信封', () => {
  const storage = fakeStorage()
  const store = createStore<State>({ key: 'k', version: 2, clean, storage })
  store.save({ a: { v: 1 } })

  assert.deepEqual(JSON.parse(storage.data.k), { version: 2, data: { a: { v: 1 } } })
})

test('版本不符整份作废 —— 坐标格式换了旧坐标别再摆', () => {
  const storage = fakeStorage({ k: JSON.stringify({ version: 9, data: { a: { v: 1 } } }) })
  const store = createStore<State>({ key: 'k', version: 2, clean, storage })

  assert.deepEqual(store.read(), {})
})

test('旧格式走 migrate —— 用户摆过的位置不丢', () => {
  const storage = fakeStorage({ k: JSON.stringify({ legacy: true, a: { v: 7 } }) })
  const store = createStore<State>({
    key: 'k',
    version: 2,
    clean,
    migrate: (legacy) => {
      const o = legacy as { legacy?: unknown; a?: { v: number } }
      if (!o.legacy || !o.a) return null
      return { a: o.a }
    },
    storage,
  })

  assert.deepEqual(store.read(), { a: { v: 7 } })
})

test('migrate 迁不了就当没有', () => {
  const storage = fakeStorage({ k: JSON.stringify({ legacy: true }) })
  const store = createStore<State>({
    key: 'k',
    version: 2,
    clean,
    migrate: () => null,
    storage,
  })

  assert.deepEqual(store.read(), {})
})

test('合并写入 —— 只写一块不抹掉别的', () => {
  const storage = fakeStorage()
  const store = createStore<State>({ key: 'k', version: 2, clean, storage })
  store.save({ a: { v: 1 } })
  store.save({ b: { v: 2 } })

  assert.deepEqual(store.read(), { a: { v: 1 }, b: { v: 2 } })
})

test('删掉一块 —— 只删它自己', () => {
  const storage = fakeStorage()
  const store = createStore<State>({ key: 'k', version: 2, clean, storage })
  store.save({ a: { v: 1 }, b: { v: 2 } })
  store.remove('a')

  assert.deepEqual(store.read(), { b: { v: 2 } })
})

test('清空后什么都没有', () => {
  const storage = fakeStorage()
  const store = createStore<State>({ key: 'k', version: 2, clean, storage })
  store.save({ a: { v: 1 } })
  store.clear()

  assert.deepEqual(store.read(), {})
})

test('坏 JSON 当没有 —— 不炸', () => {
  const storage = fakeStorage({ k: '{不是 json' })
  const store = createStore<State>({ key: 'k', version: 2, clean, storage })

  assert.deepEqual(store.read(), {})
})

test('坏值只丢自己那一块', () => {
  const storage = fakeStorage({
    k: JSON.stringify({ version: 2, data: { a: { v: 'x' }, b: { v: 2 } } }),
  })
  const store = createStore<State>({ key: 'k', version: 2, clean, storage })

  assert.deepEqual(store.read(), { b: { v: 2 } })
})

test('存储抛异常时静默 —— 存不了也不能把页面搞崩', () => {
  const broken: StorageLike = {
    getItem: () => {
      throw new Error('nope')
    },
    setItem: () => {
      throw new Error('nope')
    },
  }
  const store = createStore<State>({ key: 'k', version: 2, clean, storage: broken })

  assert.deepEqual(store.read(), {})
  store.save({ a: { v: 1 } })
  store.remove('a')
  store.clear()
})

test('没有存储时也不炸', () => {
  const store = createStore<State>({ key: 'k', version: 2, clean, storage: null })

  assert.deepEqual(store.read(), {})
  store.save({ a: { v: 1 } })
  store.remove('a')
  store.clear()
})
