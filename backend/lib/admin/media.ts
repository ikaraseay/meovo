/**
 * 图库 —— 类型 / 大小 / key 的规矩（纯函数）。
 * ---------------------------------------------------------
 * 图片二进制进 R2，元数据进 D1；公开地址是 /media/<key>。
 */

/** 允许的图片类型 */
export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
] as const

/** 单张上限 5MB —— 太大先压，别把 bucket 塞满 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** 类型 → 扩展名 */
export const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

export function isAllowedImage(mime: string): boolean {
  return Object.hasOwn(EXTENSIONS, mime)
}

export function extensionFor(mime: string): string | null {
  return EXTENSIONS[mime] ?? null
}

/**
 * R2 object key —— <yyyy-mm>/<uuid>.<ext>
 * 公开地址是 /media/<key>，前缀别在 key 里重复一遍。
 * 内容不变就能永久缓存：key 里带 uuid，改图就是换 key。
 */
export function mediaKey(mime: string, uuid: string, date: Date = new Date()): string {
  const ext = extensionFor(mime)
  if (!ext) throw new Error('不支持的图片类型：' + mime)
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return date.getUTCFullYear() + '-' + month + '/' + uuid + '.' + ext
}

/**
 * 文件头 sniff —— 声明的类型得跟文件对得上。
 * 不然一个 HTML 文件也能挂着 image/png 的头存进来。
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  // GIF: GIF87a / GIF89a
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'
  // WebP: RIFF....WEBP
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  // AVIF: ....ftypavif
  if (
    bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70 &&
    bytes[8] === 0x61 && bytes[9] === 0x76 && bytes[10] === 0x69 && bytes[11] === 0x66
  ) {
    return 'image/avif'
  }
  return null
}

/** key 的白名单 —— 只认自家生成的形状，顺手挡掉 .. 穿越 */
const KEY_PATTERN = /^\d{4}-\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif|avif)$/

export function isSafeMediaKey(key: string): boolean {
  return KEY_PATTERN.test(key)
}
