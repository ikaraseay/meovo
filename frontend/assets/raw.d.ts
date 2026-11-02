/**
 * Vite 的 ?raw 导入 —— 文件内容当字符串内联（构建期读，不是运行时）。
 * 头像的 ASCII 画就是用这个读的（frontend/assets/ascii-art.txt）。
 */
declare module '*?raw' {
  const content: string
  export default content
}
