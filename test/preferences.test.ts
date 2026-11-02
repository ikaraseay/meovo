import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  applyPreferences,
  PREFS_KEYS,
  readPreferences,
  setMode,
  setProseLh,
  setProseScale,
  type PreferenceRoot,
  type PreferenceStore,
} from '../frontend/lib/preferences.ts'

function fakeStore(initial: Record<string, string> = {}): PreferenceStore & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v
    },
  }
}

function fakeRoot(): PreferenceRoot & { classes: Set<string>; vars: Record<string, string> } {
  const classes = new Set<string>()
  const vars: Record<string, string> = {}
  return {
    classes,
    vars,
    classList: {
      toggle: (name: string, force?: boolean) => {
        if (force ?? !classes.has(name)) classes.add(name)
        else classes.delete(name)
      },
    },
    style: {
      setProperty: (name: string, value: string) => {
        vars[name] = value
      },
    },
  }
}

test('没存过模式：跟随系统（Node 里没有 window → light）；存过就用存的', () => {
  assert.equal(readPreferences(fakeStore()).mode, 'light')
  assert.equal(readPreferences(fakeStore({ 'theme-mode': 'dark' })).mode, 'dark')
  assert.equal(readPreferences(fakeStore({ 'theme-mode': 'nonsense' })).mode, 'light')
})

test('读出字号 / 行距', () => {
  const prefs = readPreferences(fakeStore({ 'prose-scale': '1.12', 'prose-lh': '2.05' }))
  assert.equal(prefs.proseScale, '1.12')
  assert.equal(prefs.proseLh, '2.05')
})

test('applyPreferences 落到根元素', () => {
  const root = fakeRoot()
  applyPreferences(root, { mode: 'dark', proseScale: '1.12', proseLh: '2.05' })
  assert.ok(root.classes.has('dark'))
  assert.equal(root.vars['--ui-prose-scale'], '1.12')
  assert.equal(root.vars['--ui-prose-lh'], '2.05')
})

test('applyPreferences：light 时移除 dark，空值不覆盖', () => {
  const root = fakeRoot()
  root.classes.add('dark')
  applyPreferences(root, { mode: 'light', proseScale: '', proseLh: '' })
  assert.ok(!root.classes.has('dark'))
  assert.equal(root.vars['--ui-prose-scale'], undefined)
})

test('setX 写进 store', () => {
  const store = fakeStore()
  setMode('dark', store)
  setProseScale('0.9', store)
  setProseLh('1.65', store)
  assert.equal(store.data[PREFS_KEYS.mode], 'dark')
  assert.equal(store.data[PREFS_KEYS.scale], '0.9')
  assert.equal(store.data[PREFS_KEYS.lh], '1.65')
})

test('首屏脚本的偏好 key 来自模块 —— 不能写死一份', () => {
  // 内联脚本不能 import 模块，key 靠 define:vars 注入。
  // 这里再写死一份的话，改了模块那份首屏会静默回退到默认值。
  const layout = readFileSync(new URL('../frontend/layouts/BaseLayout.astro', import.meta.url), 'utf8')
  assert.ok(layout.includes('PREFS_KEYS'), 'BaseLayout 要把模块的 key 注入首屏脚本')
  for (const key of Object.values(PREFS_KEYS)) {
    assert.ok(!layout.includes(`'${key}'`), `BaseLayout 里不该写死 ${key}`)
  }
})

test('没有 store / 抛异常时不炸', () => {
  assert.doesNotThrow(() => {
    readPreferences(null)
    setMode('dark', null)
    setProseScale('1', null)
    setProseLh('1.8', null)
  })
  const broken: PreferenceStore = {
    getItem: () => {
      throw new Error('nope')
    },
    setItem: () => {
      throw new Error('nope')
    },
  }
  assert.doesNotThrow(() => {
    readPreferences(broken)
    setMode('dark', broken)
    setProseScale('1', broken)
    setProseLh('1.8', broken)
  })
})
