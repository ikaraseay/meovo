/**
 * 设置 —— 后台改过的默认文字。
 * ---------------------------------------------------------
 * 「默认文字」= 语言包（frontend/i18n/ui.ts）里的全部词条，外加站点信息
 * （品牌名 / 笔名 / 标语都在语言包里，所以同一套机制全覆盖）。
 *
 * 只存**改过的**：与默认值相同的条目不落库 —— 「重置」就是删那一行。
 *
 * 这个 module 是纯函数，不碰 cloudflare:workers，所以 Node 测试能直接 import。
 */

export interface DefaultEntry {
  key: string
  zh: string
  en: string
}

export interface SettingValue {
  zh: string
  en: string
}

export type SettingErrorCode = 'unknown_key' | 'invalid_value'

export interface SettingInput {
  key?: unknown
  zh?: unknown
  en?: unknown
}

export interface NormalizedSetting {
  key: string
  zh: string
  en: string
  /** 与默认值一样 —— 这种不该落库 */
  unchanged: boolean
}

/** 库里存的是 JSON 字符串；坏了就当没有 */
export function parseStoredValue(raw: string): SettingValue | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const value = parsed as Record<string, unknown>
    return {
      zh: typeof value.zh === 'string' ? value.zh : '',
      en: typeof value.en === 'string' ? value.en : '',
    }
  } catch {
    return null
  }
}

export function serializeSettingValue(value: SettingValue): string {
  return JSON.stringify({ zh: value.zh, en: value.en })
}

/**
 * 校验一条改动。
 *
 * - key 必须是语言包里已有的 —— 写进不存在的 key 只会让界面显示成一串键名
 * - 与默认值相同的条目标成 unchanged（调用方据此删行 / 不写）
 */
export function normalizeSetting(
  input: SettingInput,
  defaults: Map<string, DefaultEntry>,
): { ok: boolean; errors: SettingErrorCode[]; value?: NormalizedSetting } {
  const errors: SettingErrorCode[] = []

  const key = typeof input.key === 'string' ? input.key.trim() : ''
  const fallback = defaults.get(key)
  if (!fallback) errors.push('unknown_key')

  const zh = typeof input.zh === 'string' ? input.zh : ''
  const en = typeof input.en === 'string' ? input.en : ''
  if (typeof input.zh !== 'string' || typeof input.en !== 'string') errors.push('invalid_value')

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    errors,
    value: {
      key,
      zh,
      en,
      unchanged: zh === fallback!.zh && en === fallback!.en,
    },
  }
}

/** 默认值 + 覆盖值 → 界面看到的最终文案 */
export function mergeSettingEntries(
  defaults: DefaultEntry[],
  overrides: Map<string, SettingValue>,
): { key: string; zh: string; en: string; defaultZh: string; defaultEn: string; overridden: boolean }[] {
  return defaults.map((entry) => {
    const override = overrides.get(entry.key)
    const zh = override?.zh ?? entry.zh
    const en = override?.en ?? entry.en
    return {
      key: entry.key,
      zh,
      en,
      defaultZh: entry.zh,
      defaultEn: entry.en,
      overridden: override ? override.zh !== entry.zh || override.en !== entry.en : false,
    }
  })
}
