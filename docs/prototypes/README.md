# 原型（prototypes）

独立 HTML 原型，**不参与构建**（`docs/` 不进 `dist/`）。用途是在方案落地前先把它跑起来看效果，
或者把已经否掉的方案留成「反面证据」——以后再有人问「为什么不用 WebGL、不用现成库」，
直接打开就能看到当时试过什么、结果如何。

每个原型都是自包含的单文件，浏览器直接打开即可，不需要起服务器。

| 原型 | 状态 | 看什么 |
|---|---|---|
| [fluid-cursor.html](fluid-cursor.html) | ✅ 已落地 | 流体光标 |
| [liquid-glass-probe-1-noise-vs-lens.html](liquid-glass-probe-1-noise-vs-lens.html) | ❌ 未采用 | `feTurbulence` 噪声滤镜 / `feImage` 渐变透镜 / 纯透镜 |
| [liquid-glass-probe-2-static-vs-canvas.html](liquid-glass-probe-2-static-vs-canvas.html) | ❌ 未采用 | 噪声（现状） / 静态拉伸映射 / 运行时 canvas 映射 |
| [liquid-glass-probe-3-split-channel.html](liquid-glass-probe-3-split-channel.html) | ❌ 未采用 | 两段 `feImage` 拆 R / B 通道再 `feBlend screen` |
| [liquid-glass-probe-4-alignment-and-support.html](liquid-glass-probe-4-alignment-and-support.html) | 🔧 工具页 | 对齐数学 + `CSS.supports` 能力探测 |
| [liquid-glass-probe-5-region-alignment.html](liquid-glass-probe-5-region-alignment.html) | ✅ 结论进了仓库 | 三种滤镜区域 / `feImage` 写法并排对比 |

## 液态玻璃那一组：为什么最后选了运行时位移图

2026-11-01 给导航栏的**玻璃镜片**（`.glass-lens`）做折射时的实测记录（Chromium）。
调研笔记见 [`../research/liquid-glass-web-implementations.md`](../research/liquid-glass-web-implementations.md)。

| 原型 | 实测结论 |
|---|---|
| probe-1 | `feTurbulence` 噪声路线整块面板彩虹抖动，没有玻璃感；只有渐变透镜能做到中心干净、仅边缘弯折，但形状贴合不了圆角 |
| probe-2 | 静态拉伸映射（B）失败 —— SVG 内的 `mix-blend-mode: difference` 在 `feImage` 上下文**不生效**，两个通道没并进同一张图；运行时 canvas 映射（C）效果最好 |
| probe-3 | 两段 `feImage` 分别给 R / B 通道再 `feBlend screen`（D）仍然不够 —— 缺**形状遮罩**与**中心中性化**，圆角矩形的位移场没法用简单渐变表达 |
| probe-4 | `CSS.supports('backdrop-filter', 'url(#a)')` 是可靠的能力探测（优于 UA 嗅探）；两种滤镜区域写法都会让位移带与元素错位 |
| probe-5 | 只有「**位移图画布尺寸 = 滤镜区域尺寸**」才能 1:1 对齐，边缘折射才贴得住圆角 |

probe-2 / 3 / 5 的结论一起催生了 `frontend/lib/liquid-glass.ts`：按镜片实测尺寸在运行时画一张
Canvas 位移图（R 通道 = 横向位移、B 通道 = 纵向位移、128 灰 = 零位移），喂给专属 SVG 滤镜。

其余原型原样留在这里当反面证据，不删。
