/**
 * ASCII 画 —— 头像那张字符画（角色侧脸）。
 * ---------------------------------------------------------
 * 源文件 frontend/assets/ascii-art.txt（构建期用 Vite 的 ?raw 内联）。
 * 颜色按字符分：@ 发色 / ~ 紫挑染 / O 耳橙 / B 蓝瞳 /
 * . 肤色 / : 浅毛 —— 跟头像那张画对得上（画里只有这 6 种字符）。
 */

import raw from '../assets/ascii-art.txt?raw'

/** 字符 → 颜色 token（--ui-art-*，浅色深色各一套） */
const ART_COLOR: Record<string, string> = {
  '@': '--ui-art-hair',
  '~': '--ui-art-violet',
  'O': '--ui-art-orange',
  'B': '--ui-art-blue',
  '.': '--ui-art-skin',
  ':': '--ui-art-light',
}

/** 画本身：去掉空行，缩进原样留着 */
export const asciiArt: string = raw
  .split('\n')
  .filter((line) => line.trim() !== '')
  .join('\n')

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 上色 —— 输出带内联颜色的 HTML。
 * 为什么内联：这份 HTML 走 set:html，里面的节点拿不到 scoped 样式，
 * 颜色只能写在 style 上（颜色本身还是 token，跟着主题走）。
 */
export function colorizeArt(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      let html = ''
      let run = ''
      let token = ''
      for (const char of line) {
        const next = ART_COLOR[char] ?? ''
        if (next !== token) {
          // 没有对应颜色的（空格等）直接输出文本，别包成 color:var() —— 那是无效值
          if (run) html += token ? `<span style="color:var(${token})">${escapeHtml(run)}</span>` : escapeHtml(run)
          run = ''
          token = next
        }
        run += char
      }
      if (run) html += token ? `<span style="color:var(${token})">${escapeHtml(run)}</span>` : escapeHtml(run)
      return html
    })
    .join('\n')
}
