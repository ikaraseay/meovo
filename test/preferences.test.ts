import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  applyPreferences,
  PREFS_KEYS,
  readPreferences,
  setPref,
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

test('相对字号：新 key 优先，老的 prose-scale 只作兜底', () => {
  const prefs = readPreferences(fakeStore({ 'root-scale': '1.12', 'prose-lh': '2.05' }))
  assert.equal(prefs.rootScale, '1.12')
  assert.equal(prefs.proseLh, '2.05')
  // 老用户设过的正文字号不能丢 —— 兜底读得到
  assert.equal(readPreferences(fakeStore({ 'prose-scale': '0.9' })).rootScale, '0.9')
  // 两个都在时新的赢
  assert.equal(readPreferences(fakeStore({ 'root-scale': '1.12', 'prose-scale': '0.9' })).rootScale, '1.12')
})

test('对比度 / 动效 / 无障碍开关：坏值一律退回默认', () => {
  const prefs = readPreferences(
    fakeStore({
      contrast: 'nonsense',
      motion: 'nope',
      links: 'x',
      targets: 'y',
      focus: 'z',
    }),
  )
  assert.equal(prefs.contrast, 'standard')
  assert.equal(prefs.motion, 'auto')
  assert.equal(prefs.links, 'auto')
  assert.equal(prefs.targets, 'normal')
  assert.equal(prefs.focus, 'auto')
})

test('applyPreferences 落到根元素', () => {
  const root = fakeRoot()
  applyPreferences(root, {
    mode: 'dark',
    rootScale: '1.12',
    proseLh: '2.05',
    motion: 'reduced',
    contrast: 'high',
    links: 'always',
    targets: 'large',
    focus: 'strong',
  })
  assert.ok(root.classes.has('dark'))
  assert.ok(root.classes.has('motion-reduced'))
  assert.ok(root.classes.has('contrast-high'))
  assert.ok(root.classes.has('links-always'))
  assert.ok(root.classes.has('targets-large'))
  assert.ok(root.classes.has('focus-strong'))
  assert.equal(root.vars['--ui-root-scale'], '1.12')
  assert.equal(root.vars['--ui-prose-lh'], '2.05')
})

test('applyPreferences：light 时移除 dark，空值不覆盖', () => {
  const root = fakeRoot()
  root.classes.add('dark')
  applyPreferences(root, {
    mode: 'light',
    rootScale: '',
    proseLh: '',
    motion: 'auto',
    contrast: 'standard',
    links: 'auto',
    targets: 'normal',
    focus: 'auto',
  })
  assert.ok(!root.classes.has('dark'))
  assert.equal(root.vars['--ui-root-scale'], undefined)
})

test('setPref 写进 store', () => {
  const store = fakeStore()
  setPref('mode', 'dark', store)
  setPref('rootScale', '0.9', store)
  setPref('proseLh', '1.65', store)
  setPref('contrast', 'high', store)
  assert.equal(store.data[PREFS_KEYS.mode], 'dark')
  assert.equal(store.data[PREFS_KEYS.rootScale], '0.9')
  assert.equal(store.data[PREFS_KEYS.proseLh], '1.65')
  assert.equal(store.data[PREFS_KEYS.contrast], 'high')
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
    setPref('mode', 'dark', null)
    setPref('rootScale', '1', null)
    setPref('proseLh', '1.8', null)
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
    setPref('mode', 'dark', broken)
    setPref('rootScale', '1', broken)
    setPref('proseLh', '1.8', broken)
  })
})
