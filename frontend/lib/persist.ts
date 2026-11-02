/**
 * localStorage 持久化内核 —— 序列化、版本、清洗只此一处。
 * ---------------------------------------------------------
 * 以前有两个 store 各写一份：一个没有版本也没有删除，一个有版本但信封格式不同。
 * 现在统一成「一个内核 + 两个 adapter」：
 *   · 内核管：信封格式（{ version, data }）、清洗、坏值、存不了也不炸
 *   · adapter 管：自己那份数据的形状（坐标是像素还是百分比）
 *
 * 落盘格式带版本号 —— 改��格式 +1，旧数据要么 migrate 迁过来，要么整份作废。
 * 用户摆出来的位置不丢：旧格式由 adapter 的 migrate 接住。
 */

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** 一份状态 —— 顶层是「键 → 那一块的值」 */
export type StateMap = Record<string, unknown>

export interface Store<T extends StateMap> {
  /** 读整份状态 —— 坏 JSON / 版本不符 / 存都存不了 → 空 */
  read(): T
  /** 合并写入 —— 只写一块不会抹掉别的 */
  save(patch: Partial<T>): void
  /** 删掉一块（设置弹窗的摆放 / 单张卡片） */
  remove(key: string): void
  /** 清空全部 */
  clear(): void
}

function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

/**
 * 造一个 store。
 *
 * @param key       localStorage 里的键
 * @param version   落盘格式版本 —— 改了格式 +1
 * @param clean     清洗：坏值只丢自己那一块
 * @param migrate   旧格式怎么迁 —— 收到整份旧结构，迁不了就返回 null（当没有）
 * @param storage   存哪儿 —— 不传用 localStorage；测试塞假对象；传 null 就是不存
 */
export function createStore<T extends StateMap>(options: {
  key: string
  version: number
  clean: (value: unknown) => T
  migrate?: (legacy: unknown) => T | null
  storage?: StorageLike | null
}): Store<T> {
  const { key, version, clean, migrate } = options
  const storage = options.storage === undefined ? defaultStorage() : options.storage

  function readRaw(): unknown {
    if (!storage) return null
    try {
      const raw = storage.getItem(key)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  function read(): T {
    const raw = readRaw()
    if (!raw || typeof raw !== 'object') return {} as T
    const envelope = raw as Record<string, unknown>
    // 新信封 { version, data }
    if ('version' in envelope && 'data' in envelope) {
      if (envelope.version !== version) return {} as T
      return clean(envelope.data)
    }
    // 旧结构 —— 交给 adapter 迁
    if (!migrate) return {} as T
    return migrate(raw) ?? ({} as T)
  }

  function write(data: T): void {
    if (!storage) return
    try {
      storage.setItem(key, JSON.stringify({ version, data }))
    } catch {
      // 存不了就算了 —— 本次会话照常用
    }
  }

  return {
    read,
    save(patch) {
      write({ ...read(), ...clean(patch) } as T)
    },
    remove(k) {
      const next = { ...read() } as Record<string, unknown>
      delete next[k]
      write(next as T)
    },
    clear() {
      write({} as T)
    },
  }
}
