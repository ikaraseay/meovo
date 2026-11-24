/** 标签可使用任意语言的字母与数字；空格由后台规范化为连字符。 */
export const TAG_PATTERN = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u

export function isTag(value: string): boolean {
  return TAG_PATTERN.test(value)
}
