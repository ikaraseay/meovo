# Web 端液态玻璃（Liquid Glass）实现调研

> 本文件是本仓库第一份调研笔记，位于 `docs/research/`，用于记录「Web 端液态玻璃」各条实现路线的源码级事实、浏览器与规范事实，以及它们对本仓库（Astro 7 静态站 / 零依赖 / 原生 CSS + SVG）的适配结论。仓库内不依赖本文件运行；本文件只服务后续改造决策。
>
> 调研日期：2026-11-01。文中每条结论都标注了来源与证据等级：
> **【源码读到】**＝直接读了仓库源码；**【一手来源确认】**＝官方文档 / 规范 / issue / PR 原文。

## 阅读指引：哪些进了仓库，哪些只是存档

调研覆盖了 5 条候选路线，**最终只落地一条**，而且只用在玻璃镜片（`.glass-lens`）上：

| 调研里的东西 | 状态 | 去哪了 |
|---|---|---|
| A `rizzytoday/liquid-glass` 的**位移图算法** | ✅ **采用** | 重写成 `frontend/lib/liquid-glass.ts`，只给玻璃镜片用 |
| A 的其余实现（封装 API、事件绑定、样式） | 🗄️ 存档 · 未采用 | 本文 2.A |
| B `vitrio`（SDF 厚度剖面 / 克隆背景 DOM） | 🗄️ 存档 · 未采用 | 本文 2.B |
| C `liquid-glass-react` / `liquidGL`（React / WebGPU） | 🗄️ 存档 · 未采用 | 本文 2.C |
| D `@dpawlikowski/liquid-glass`（纯 CSS 降级） | 🗄️ 存档 · 只借鉴了 scale 钳制 | 本文 2.D / 2.E |
| 2a「纯 SVG 静态位移场」 | ❌ **实测不可行** | 本文 4.5 ① —— 作为反面结论留着 |
| 第 1 步「纯 CSS 改滤镜区域」 | 🗄️ 存档 · 未采用 | 本文 4.3 —— 整个液态玻璃保持原样 |
| 第 3 步「reduced-transparency / 可读性暗化层」 | 🗄️ 存档 · 未做 | 本文 4.3 |

**存档 ≠ 删掉**：这些方案是当时做判断的依据，留着是为了以后再问
「为什么不用 WebGL、不用现成库」时能直接查到原因。
真正在跑的代码只有 `frontend/lib/liquid-glass.ts`，逐文件说明见
[4.6 当前实现落点](#46-当前实现落点)。

---

## 1. 结论速览

### 一句话回答

**存在成熟的可参考实现，但没有一个能直接装进本仓库的现成成品。** 三条路线各自成熟，但都撞在同一个硬墙上：**`backdrop-filter: url()` 只有 Chromium 支持**——想跨引擎折射背景，就必须放弃「实时采样背后 DOM」，改成克隆背景或走 WebGL，而这两条都与本仓库的「零依赖 / 纯 CSS + SVG / Astro 静态站」冲突。

**推荐路线**：以 `rizzytoday/liquid-glass` 的**位移图算法**为蓝本重写本仓库现有滤镜（它与本仓库现有 `#glass-refract` 同源，但用确定性渐变场替代了噪声），用**引擎判据**做降级分流，而不是抄任何 npm 依赖。

> ⚠️ 降级判据**不能**用 `@supports (backdrop-filter: url(...))` —— Safari 对它是假阳性（解析得过、渲染时整条丢弃）。详见 3.2 第 6、7 条。

### 三条路线与适用边界

| 路线 | 核心技术 | 折射「背后实时内容」？ | 跨引擎 | 依赖 | 对本仓库适用性 |
|---|---|---|---|---|---|
| **A. `rizzytoday/liquid-glass`** | Canvas2D 生成位移图 + `feImage` + `feDisplacementMap` + `backdrop-filter: url()` | ✅ | ❌ 仅 Chromium | 零依赖，单文件 JS | **算法可直接抄**（需自己包成 Astro 版） |
| **B. `vitrio`（原 `liquid-glass-js`）** | 同一套 SVG 滤镜，但挂在 `filter: url()` 上，折射「自己克隆的 DOM」 | ❌（折射克隆体） | ✅ Chromium + Gecko（WebKit 走近似） | 零依赖，JS class / web component | **模型可借鉴，实现不可用**（要克隆背景 DOM） |
| **C. `liquid-glass-react` / `liquid-glass-js` / `liquidGL`** | React 组件库 / Canvas2D SDF / WebGPU·WebGL | ✅ / ✅ | 依赖实现 | React / WebGPU | **不适用**（违反零依赖约束） |
| **D. `@dpawlikowski/liquid-glass`** | 纯 CSS + SVG（`feTurbulence`）作用在复制的场景层 | ✅（Chromium）/ 静态背景（其他） | 部分 | 零依赖 | **降级策略与 scale 钳制值得抄** |

### 对本仓库的核心判断（详见第 4 节）

1. **4 个待改进点里，1、2、3 都能靠 A 路线的算法解决，4 解决不了（只能降级）。**
   - 噪声抖动 → 换成 Canvas/SVG 生成的**方向性渐变位移场**（边缘放大、中心中性）。
   - 滤镜区域不足 → 按 `|scale| × 0.5` 精确计算扩展量（本仓库现在写死 ±12%）。
   - feImage 拉伸错位 → 位移图画布尺寸 = 滤镜区域尺寸，1:1 对齐。
   - `backdrop-filter: url()` 不支持 → 按**引擎**判据分流后降级到 `blur()`；**WebKit / Gecko 永远拿不到真折射**。
2. **成本**：A 路线需要运行时 Canvas 绘制（`toDataURL()`）→ 位移图不可静态化，需要 ResizeObserver；窄条元素（48px 高的导航）Y 方向滤镜区域会膨胀到 **184%**（按 scale=30 算），GPU 开销不小。README 自述「>800px 宽的元素可能 GPU 卡顿」。
3. **可读性必须单独处理**：液态玻璃下文字对比度不可控，Apple HIG 明确要求「背后内容亮时加 35% 暗化层」，WCAG 要求正文 4.5:1（详见 3.3）。

---

## 2. 方案逐个源码级拆解

> **以下 A–E 全部是调研时的候选方案，没有一条原样进了仓库。**
> 只有 A 的**位移图算法**被重写采用（见 4.6），其余留在这里作存档 ——
> 想知道「为什么不用 WebGL、不用现成库」，直接看这一节。

### A. `rizzytoday/liquid-glass` —— 零依赖 Canvas2D + SVG 滤镜（最重要）

- 仓库：https://github.com/rizzytoday/liquid-glass
- 许可证：MIT。核心文件：`core/liquid-glass.ts`（12,922 B）、编译产物 `core/liquid-glass.js`（7,867 B）、类型声明 `core/liquid-glass.d.ts`
- README 标注位移图技术来自 [Jhey Tompkins 的 CodePen](https://codepen.io/jh3y)

以下全部为 **【源码读到】**（`core/liquid-glass.ts` 原文）。

#### A.1 位移图生成算法（`buildDisplacementMap`）

这是整个方案的核心：**不用噪声，而是用确定性渐变画出「边缘放大、中心干净」的位移场**。

```ts
// 画布尺寸 = 滤镜区域尺寸（不是元素尺寸！）
const maxDisplace = Math.max(Math.abs(c.scale) * 0.5, 20)
const padX = Math.ceil(maxDisplace)
const padY = Math.ceil(maxDisplace)
const totalW = c.width + padX * 2
const totalH = c.height + padY * 2

const canvas = document.createElement('canvas')
canvas.width = totalW
canvas.height = totalH
const ctx = canvas.getContext('2d')!

// 中性灰 = 零位移（药丸之外全是它）
ctx.fillStyle = 'rgb(128, 128, 128)'
ctx.fillRect(0, 0, totalW, totalH)

const ox = padX
const oy = padY

ctx.save()
ctx.beginPath()
ctx.roundRect(ox, oy, c.width, c.height, c.radius)
ctx.clip()                                  // 裁到药丸形

ctx.fillStyle = '#000000'
ctx.fillRect(ox, oy, c.width, c.height)

// 红色渐变：右 → 左，编码 X 位移
const redGrad = ctx.createLinearGradient(ox + c.width, oy, ox, oy)
redGrad.addColorStop(0, '#000000')
redGrad.addColorStop(1, '#ff0000')
ctx.fillStyle = redGrad
ctx.fillRect(ox, oy, c.width, c.height)

// 蓝色渐变：上 → 下，编码 Y 位移，用 difference 混合合成二维场
ctx.globalCompositeOperation = 'difference'
const blueGrad = ctx.createLinearGradient(ox, oy, ox, oy + c.height)
blueGrad.addColorStop(0, '#000000')
blueGrad.addColorStop(1, '#0000ff')
ctx.fillStyle = blueGrad
ctx.fillRect(ox, oy, c.width, c.height)

// 中心中性化：模糊灰块制造平滑 falloff
ctx.globalCompositeOperation = 'source-over'
const borderPx = Math.min(c.width, c.height) * (c.border * 0.5)
ctx.filter = `blur(${c.blur}px)`
ctx.fillStyle = `hsla(0, 0%, ${c.lightness}%, ${c.alpha})`
ctx.beginPath()
ctx.roundRect(ox + borderPx, oy + borderPx,
              c.width - borderPx * 2, c.height - borderPx * 2, c.radius)
ctx.fill()
ctx.restore()

const uri = canvas.toDataURL()               // data URI，喂给 feImage
_mapCache.set(key, uri)
```

**通道编码约定（关键）**

| 通道 | 含义 | 渐变方向 | 端点值 |
|---|---|---|---|
| **R** | X 位移 | 右 → 左（`createLinearGradient(ox+w, oy, ox, oy)`） | 左端 `#ff0000`（255），右端 `#000000`（0） |
| **B** | Y 位移 | 上 → 下（`createLinearGradient(ox, oy, ox, oy+h)`） | 上端 0，下端 `#0000ff`（255） |
| **G** | 不使用 | — | 恒为 0 |

`difference` 混合的数学效果（G 通道恒 0，所以滤镜里必须写 `yChannelSelector="B"` 而不是 `"G"`）：

```
R_out = |R_red - R_blue| = |R_red - 0| = R_red     → 保留 X 位移场
G_out = |G_red - G_blue| = |0 - 0|       = 0         → 恒 0
B_out = |B_red - B_blue| = |0 - B_blue|  = B_blue    → 保留 Y 位移场
```

**中性灰 128 = 零位移**：按 `feDisplacementMap` 语义，通道值先归一化到 `[0,1]`，再按
`P'(x,y) = P(x + scale·(XC−0.5), y + scale·(YC−0.5))` 采样。
`128/255 ≈ 0.502` ≈ 0.5 → 位移 ≈ 0。所以「药丸外填 128 灰」= 外部零位移。

**位移方向：负 scale = 向内折射 = 放大**

- 默认 `scale: -180`（源码注释：`Negative = inward refraction`）。
- 左边缘 R=255 → XC=1 → `offsetX = -180 × (1 − 0.5) = -90` → **向左 90px 处取样**。
- 下边缘 B=255 → YC=1 → `offsetY = -90` → **向上 90px 处取样**。
- 即：边缘把「更外面」的内容拉进玻璃内部 → 视觉上玻璃向外凸、内容被放大。这正是真实透镜的观感，也是本仓库当前噪声方案（整块随机抖）缺失的东西。

**为什么必须用 Canvas 而不是内联 SVG 数据 URI**（README 原文理由）：`feImage` 把 SVG data URI 当成**图片**渲染，会忽略 CSS 属性——`mix-blend-mode` 被忽略、`filter: blur()` 被忽略 → 中心中性块失效，整块变成一团扭曲。Canvas2D 的 `globalCompositeOperation` 与 `ctx.filter` 是**原生 API**，不经过 CSS 属性求值，永远生效。

#### A.2 滤镜区域 x/y/width/height 如何按 scale 计算

```ts
const maxD = Math.max(Math.abs(c.scale) * 0.5, 20)
const pctX = Math.ceil((maxD / c.width) * 100)
const pctY = Math.ceil((maxD / c.height) * 100)
refs.filter.setAttribute('x', `-${pctX}%`)
refs.filter.setAttribute('y', `-${pctY}%`)
refs.filter.setAttribute('width', `${100 + pctX * 2}%`)
refs.filter.setAttribute('height', `${100 + pctY * 2}%`)
```

- 扩展量 `maxD = |scale| × 0.5` 是**位移的最大可能幅度**（通道值 0 与 1 对称分布在 0.5 两侧），不是 `|scale|`。
- 地板值 20px：`Math.max(..., 20)`，避免小 scale 时区域塌缩。
- 区域用**百分比**表达（`filterUnits` 默认 `objectBoundingBox`），扩展量随元素尺寸缩放。
- 典型值：240×48 的导航条 + `scale: -180` → `pctX = ceil(90/240×100) = 38%`，`pctY = ceil(90/48×100) = 188%` → 区域变成 `x="-38%" y="-188%" width="176%" height="476%"`。
  > 源码里 SVG 模板的硬编码默认值恰好就是 `-38% / -188% / 176% / 476%`——那是「240×48 + scale −180」的实测值，`applyConfig()` 每次都会覆盖它。

**这正好命中本仓库待改进点 2**：本仓库现在写的是 `x="-12%" y="-12%" width="124%" height="124%"`（SVG 规范默认的 ±10% 外扩，见 3.2），而 `scale="30"` 的位移最大只有 15px——**12% 对 48px 高的元素 = 5.76px < 15px**，所以边缘采样会跑到区域外 → 折射在边缘消失。

#### A.3 feImage 的 x/y/width/height 如何摆位

源码里 feImage **没有写任何 x/y/width/height**，只有 `preserveAspectRatio="none"`：

```html
<filter id="..." color-interpolation-filters="sRGB" x="-38%" y="-188%" width="176%" height="476%">
  <feImage result="map" preserveAspectRatio="none" />
```

README「The alignment trap」一节解释了设计意图：

> When you extend the filter region, `feImage` fills the **entire region**, not just the element. A 240x48 displacement map gets stretched to fill a 720x240 region, completely misaligning the pill in the map with the element on screen.
> **Fix:** Pre-size the Canvas to match the full filter region. The pill shape is drawn centered in a larger canvas padded with neutral gray.

即：**画布尺寸 = 滤镜区域尺寸**（`w+2pad × h+2pad`），药丸画在画布正中、四周留中性灰 padding；`feImage` + `preserveAspectRatio="none"` 把图铺满滤镜区域后，因为 1 画布像素 = 1 用户单位（区域尺寸 == 画布尺寸），位移图与元素**像素级 1:1 对齐**。

> **已核实（3.2）**：滤镜图元的 `x/y/width/height` 默认是 `0% / 0% / 100% / 100%`（相对滤镜区域），所以不写就等于「铺满整个滤镜区域」——这个前提成立，A 路线的对齐是对的。

> 本仓库待改进点 3 描述的「feImage 铺满整块 → 位移图与元素错位」，根因与 README 一致——错位不是因为 feImage 本身，而是因为**画布尺寸（元素尺寸）与滤镜区域尺寸（扩展后）不一致**。修法是改画布尺寸，不是改 feImage 的 x/y。

#### A.4 三通道不同 scale 的色散参数

```html
<feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="B" result="dispRed" data-channel="red" />
<feColorMatrix in="dispRed" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red" />
<feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="B" result="dispGreen" data-channel="green" />
<feColorMatrix in="dispGreen" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green" />
<feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="B" result="dispBlue" data-channel="blue" />
<feColorMatrix in="dispBlue" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue" />
<feBlend in="red" in2="green" mode="screen" result="rg" />
<feBlend in="rg" in2="blue" mode="screen" result="output" />
<feGaussianBlur in="output" stdDeviation="0" />
```

三次 `feDisplacementMap` **共用同一张位移图**，只有 `scale` 不同：

| 通道 | scale 计算 | 默认值 |
|---|---|---|
| Red | `scale + aberration[0]` | `-180 + 0 = -180` |
| Green | `scale + aberration[1]` | `-180 + 10 = -170` |
| Blue | `scale + aberration[2]` | `-180 + 20 = -160` |

即默认色散量 **10px 一档**（`aberration: [0, 10, 20]`）。每张 `feColorMatrix` 把该次位移结果**只保留一个颜色通道**（其余置 0，alpha 保持 1），最后用两次 `feBlend mode="screen"` 叠回：

- `screen` 的公式是 `1 − (1−a)(1−b)`，**不会像 `normal` 叠加那样过曝压暗**，三个通道各自位移后相加 = 真实的色散（边缘彩虹边）。
- 本仓库现有的 `feColorMatrix` + `feBlend(screen)` 结构**与此处完全一致**——可以直接沿用，只需换 `in2`（从噪声换成位移图）和 `scale` 取值。

`feGaussianBlur stdDeviation="0"` 是「位移后再模糊」的钩子，由 `displaceBlur` 选项驱动，默认 0（不模糊）。

#### A.5 Chromium 探测与回退

```ts
export const isChromium =
  typeof navigator !== 'undefined' && /Chrome\//.test(navigator.userAgent)
```

- **UA 正则，不是特性检测**。`'Chrome/'` 会命中 Chrome / Edge / Arc / Brave / Opera（都带 `Chrome/`），不会命中 Safari / Firefox。
- 模块加载时求值一次（`const`，不是 getter），SSR/预渲染环境 `navigator` 未定义 → `false`。
- 非 Chromium 分支：

```ts
if (!isChromium) {
  const prev = element.style.backdropFilter
  const prevWebkit = element.style.getPropertyValue('-webkit-backdrop-filter')
  element.style.backdropFilter = fallback              // 默认 'blur(12px)'
  element.style.setProperty('-webkit-backdrop-filter', fallback)
  return { isActive: false, filterElement: dummySvg, update() {}, destroy() { /* 还原 */ } }
}
```

- 回退是**普通毛玻璃**（`blur(12px)`），不是「无效果」。Safari / Firefox 用户看到的是磨砂玻璃，看不到折射。
- ⚠️ 对本仓库的直接冲突：本仓库 AGENTS.md 明确规定「`backdrop-filter` **只写标准属性**，同时写 `-webkit-backdrop-filter` 会被 CSS 压缩流程合并掉」。而 A 路线的 fallback 分支**恰好同时写了两个**——抄这段会触发本仓库已知的 CSS 压缩 bug。抄的时候必须只保留标准属性。

#### A.6 ResizeObserver 重算、销毁、API 形态

```ts
const ro = new ResizeObserver(() => {
  cancelAnimationFrame(resizeRaf)
  resizeRaf = requestAnimationFrame(() => {
    if (currentOpts.width == null || currentOpts.height == null) {
      config = resolveConfig(element, currentOpts)
      applyConfig(config, refs)
      applyStyles(config)
    }
  })
})
ro.observe(element)
```

- **rAF 去抖**：ResizeObserver 回调本身已经是每帧一次，但作者仍加了 rAF 合并。
- **只在用户没显式给 width/height 时才自动重算**（显式给尺寸 = 用户接管）。
- 重算会重新走 `buildDisplacementMap` → `toDataURL()`；`_mapCache` 按 `width:height:radius:scale:border:blur:lightness:alpha` 做 key 缓存，尺寸不变时命中缓存。
- 样式应用：

```ts
element.style.backdropFilter = `url(#${id}) saturate(${c.saturation})`
element.style.setProperty('-webkit-backdrop-filter', `url(#${id}) saturate(${c.saturation})`)
if (c.frost > 0) element.style.background = `hsl(0 0% 0% / ${c.frost})`
```

- **销毁**：`destroy()` 会 `ro.disconnect()`、取消 rAF、`refs.svg.remove()`、清空三个内联样式。**不会**从 `_mapCache` 里删条目（内存泄漏点：缓存无上限）。
- **API 形态**：`createLiquidGlass(element, options?) → { isActive, filterElement, update(opts), destroy() }`。SVG 滤镜是**运行时动态生成**并 append 到 `document.body` 的。

#### A.7 已知限制（README「Gotchas」原文 + 源码读到）

| 限制 | 出处 |
|---|---|
| **`backdrop-filter: url()` 是 Chromium 专属**，Safari 也不支持 | README（见 3.1 的一手佐证） |
| SVG 滤镜**必须与元素在同一文档**，Shadow DOM 失效 | README |
| **元素 >800px 宽可能 GPU 卡顿**，大表面要减小 `scale` | README |
| SVG 元素**不能 `display: none`**（作者用 `width:0;height:0` 代替） | README |
| 滤镜 ID **每个实例必须唯一**（手写 `filterId` 时要自己保证） | README |
| 父级 `opacity < 1` 会创建层叠上下文，干扰效果 | README |
| `_mapCache` 无上限、无淘汰 | 源码读到 |
| `isChromium` 是模块级常量，UA 变化不会重算 | 源码读到 |
| 每次 resize 都 `toDataURL()`（大尺寸 canvas 有编码开销） | 源码读到 |

---

### B. `vitrio`（原包名 `liquid-glass-js`，作者 eamonliu）—— 跨引擎路线

- 仓库：https://github.com/eamonliu/liquid-glass-js ｜ npm：`vitrio`（原 `liquid-glass-js` 0.1.0，发布于 2026-06-10；README 已整体改名 vitrio）
- 许可 MIT；**零依赖**，~13 kB min，TypeScript；同时提供 JS class、`<liquid-glass>` web component、`vitrio/react`、`vitrio/vue`。
- **【源码读到】**：`src/vitrio.ts`（36 KB）、`src/react.ts`、`src/vue.ts`。

**核心模型（README 原文）**：用**圆角矩形 SDF + 厚度剖面** `(1 - (1-t)^k)^(1/k)`（circle → squircle，k ≈ 2 球面 / ≈ 4 squircle）生成高度场位移图，R/G 通道编码逐像素位移，`feImage` → `feDisplacementMap`；位移**向内**，凸面汇聚光线 → 放大。三次不同 scale 做色散；第二张 canvas 由**表面法线**算出高光，以 screen 叠加。

**关键差异：clone 模式**（README 原文）

> To stay cross-browser it uses **clone mode**: the background element you point it at is cloned into a small, clipped overlay that the filter is applied to (Safari/Firefox don't support referencing an SVG filter from `backdrop-filter`). The clone is kept pixel-aligned with the real background.

**渲染分层（README 原文）**

- Chromium / Edge（Blink）+ Firefox（Gecko）：全折射。
- WebKit（Safari 及所有 iOS 浏览器）：**无法渲染 `feImage`**（作者称在 Safari 26 上验证：静态标记、动态 DOM、`data:`/`blob:`/`http:` 源全部输出空白）→ 降级为 compositor 近似（边缘匹配的 transform 放大 + 高光 + 模糊），`chroma` 在 WebKit 无效。
- Gecko 每帧重新光栅化滤镜链跟不上 60 fps → `liteMotion: 'auto'` 在连续移动时暂停折射，静止 ~120 ms 后恢复。

**局限（作者自述）**：clone 是**静态快照**，背景变了要调 `refresh()`；只折射被克隆的 DOM，不是「任意实时内容」的替代品。

**对本仓库**：模型（SDF 高度场 + 法线高光）值得借鉴到 `.glass-lens`；但「克隆背景 DOM + 保持像素对齐」在 Astro 静态站上不成立（页面内容会变：主题切换、滚动、路由切换），且引入运行时 JS 与 web component。

---

### C. `liquid-glass-react`（作者 rdev）—— React 组件库

- npm：`liquid-glass-react` 1.1.1（发布于 2025-06-11），MIT，**0 运行时依赖**，peer 依赖 `react` / `react-dom`。
- 源仓库：https://github.com/rdev/liquid-glass-react （另有 antonalley / wzulfikar / savvyc101 等 fork）
- **【源码读到】**：`src/index.tsx`（22 KB）、`src/shader-utils.ts`（4.1 KB）、`src/utils.ts`（41 KB）。

**它不是 WebGL**。`src/shader-utils.ts` 用 **Canvas2D** 实现「shader」——文件头注明 `// Adapted from https://github.com/shuding/liquid-glass`：

```ts
export const fragmentShaders = {
  liquidGlass: (uv: Vec2): Vec2 => {
    const ix = uv.x - 0.5
    const iy = uv.y - 0.5
    const distanceToEdge = roundedRectSDF(ix, iy, 0.3, 0.2, 0.6)
    const displacement = smoothStep(0.8, 0, distanceToEdge - 0.15)
    const scaled = smoothStep(0, 1, displacement)
    return texture(ix * scaled + 0.5, iy * scaled + 0.5)
  },
}
```

即 **SDF + smoothStep** 生成位移场，与 A 路线同属「Canvas2D 位移图 + SVG 滤镜」家族，只是位移场用 SDF 距离场而非线性渐变。

- 交互特色：鼠标位置驱动的**弹性形变**（`elasticity`），`mouseContainer` 让玻璃响应整个容器的指针位置。
- README 自述：**Safari / Firefox 只部分支持（位移不可见）**。

**对本仓库**：SDF + smoothStep 的位移场模型可借鉴；React 包装、`useRef` 生命周期、弹性交互整套不可用（本仓库零 UI 框架）。

---

### D. `liquidGL`（作者 naughtyduk）—— WebGPU → WebGL2 → WebGL1 → CSS 多级回退

- 仓库：https://github.com/naughtyduk/liquidGL （v3.0.0，npm 包名 `liquid-gl`）
- README 原文：渲染链 **WebGPU → WebGL2 → WebGL1 → CSS backdrop-filter** 全自动，无需配置。
- 核心难点是 WebGL 读不到实时屏幕像素 → 用**离屏渲染页面快照** + 共享 canvas 绕开。
- **对本仓库**：**不适用**。引入 WebGPU/WebGL 与「零依赖 / 纯 CSS」直接冲突；且是「整页固定元素玻璃化」的玩法，成本与本仓库的静态博客定位不匹配。

---

### E. `@dpawlikowski/liquid-glass` —— 纯 CSS + SVG，多模式降级

- npm：`@dpawlikowski/liquid-glass` 0.3.0（发布于 2026-07-02），MIT，0 依赖；仓库 https://github.com/dpawlikowski/liquid-glass
- README 原文：**no WebGL, no canvas, no runtime dependencies**；折射走 `feTurbulence` + `feDisplacementMap`，色散靠 `mix-blend-mode: screen` 伪元素。
- **【源码读到】** `docs/browser-support.md`：两条折射模式——

  1. **Live backdrop mode（首选）**：引擎接受 `backdrop-filter` 里的 SVG 引用 → 真折射背后实时内容。探测方式：
     `@supports (backdrop-filter: url("#liquid-glass-filter"))`
  2. **Refraction sprite fallback**：引擎支持 `backdrop-filter` 但拒绝其中的 SVG 引用 → 用普通 `filter` 对**背景副本**做同样滤镜，只反射静态背景图，玻璃之间不会互相折射。
     调试法：若 `.liquid-glass__refraction` 的计算样式是 `display: none`，说明处于 live backdrop 模式。

- **Safari 约束（原文）**：「Safari can show artifacts with high `feDisplacementMap` values. The library clamps `scale` to `SCALE_MAX` (25); the default (`FILTER_DEFAULTS.scale`, 21) stays comfortably under that.」
- `prefers-reduced-motion: reduce` 关闭波浪动画与 CSS 过渡。

**对本仓库**：它的 **双模式降级 + scale 钳制** 是最值得直接抄的两点。
**`@supports` 特性探测不要抄** —— Safari 对它是假阳性（3.2 第 7 条），照抄会把液态玻璃整个打没。它的 `feTurbulence` 路线正是本仓库现在用的（噪声抖动）——如果最终保留噪声路线，至少应照它把 scale 钳在 25 以内（本仓库当前 `scale="30"` 已超）。

---

## 3. 浏览器支持与规范事实

### 3.1 浏览器支持总表

| 能力 | Chrome / Edge | Firefox | Safari / iOS | 证据等级 |
|---|---|---|---|---|
| `backdrop-filter` 属性本身 | ✅ 76+ | ✅ 103+（123 前在未知 GPU 厂商系统上不支持，bug 1868737） | ✅ 18+ 无前缀；9–17 仅 `-webkit-` | 【一手来源确认】MDN browser-compat-data |
| `backdrop-filter: url(#svg-filter)` | ✅ **唯一支持** | ❌ | ❌ | 【一手来源确认】WebKit bug 245510 / 297732 / PR 68614 |
| `filter: url(#svg-filter)`（普通 `filter`） | ✅ | ✅ | ✅ | 【一手来源确认】WebKit bug 297770 评论 |
| `feImage` 渲染外部图像为滤镜源 | ✅ | ✅ | ❌（Safari 26 实测空输出） | 【源码读到】vitrio README |
| `feDisplacementMap` | ✅ | ✅ | ✅ | 【一手来源确认】MDN |

### 3.2 规范事实

**`backdrop-filter` 与 `filter` 的关键差异**

- `filter` 作用于**元素自身及其子内容**（渲染结果的再处理）。
- `backdrop-filter` 作用于**元素背后已绘制的像素**，采样范围止于最近的 **backdrop root**。
  → 想折射「背后的页面内容」，只能用 `backdrop-filter`（Chromium 独占）；想跨引擎只能自己克隆背景再用 `filter`（B、E 两条路线）。

**滤镜区域（`<filter>` 的 `x/y/width/height`）**

- `filterUnits` 默认 `objectBoundingBox`；区域默认 `-10% / -10% / 120% / 120%`（相对元素 bbox）→ **默认只比元素大 10%**。
- 本仓库现在写的 `x="-12%" y="-12%" width="124%" height="124%"` 就是这个默认值的微调版本，也是「位移一大就采样到区域外 → 折射消失」的根因。

**滤镜图元子区域（每个 primitive 的 `x/y/width/height`）**

- 默认 **`0% / 0% / 100% / 100%`**（相对滤镜区域）→ `feImage` 不写坐标时**铺满整个滤镜区域**。
  来源：MDN 逐元素属性表（`x` 默认 `0%`、`width` 默认 `100%`），其 `spec-urls` 指向 Filter Effects 1 的 `#element-attrdef-filter-primitive-x` 等锚点。
  → 这是 A 路线「画布尺寸 = 滤镜区域尺寸 ⇒ 1:1 对齐」成立的前提。

**`feDisplacementMap` 语义**

- `in` = 被位移的图像（通常是 `SourceGraphic`），`in2` = 位移图。
- `xChannelSelector` / `yChannelSelector`：指定用 `in2` 的哪个颜色通道分别作为 X / Y 位移量来源。
- `scale`：位移幅度系数。采样公式 `P'(x,y) = P(x + scale·(XC−0.5), y + scale·(YC−0.5))`，通道值先归一化到 `[0,1]`。
  → **通道值 0.5（8bit 即 128）= 零位移**；`scale` 绝对值的最大值 = `|scale| × 0.5`。
- `primitiveUnits` 默认 `userSpaceOnUse`，决定 primitive 的 `x/y/width/height` 与 `scale` 的单位体系。

**backdrop root（MDN 原文）**

会创建 backdrop root 的元素：

- 根元素 `html`
- `filter` 值不为 `none` 的元素
- `opacity` 小于 `1` 的元素
- `mask` / `mask-image` / `mask-border` / `clip-path` 值不为 `none` 的元素
- `backdrop-filter` 值不为 `none` 的元素
- `mix-blend-mode` 值不为 `normal` 的元素
- `will-change` 命中上述任一属性的元素

后果（MDN 原文）：

> This means that if a parent element has `opacity: 0.9`, it becomes a backdrop root and any child's `backdrop-filter` will only blur the content between that parent and the child - not the content behind the parent.

→ 与本仓库 `FloatingBar.astro` 里已有的注释（`.nav-panel` 必须是 `.floating-menu` 的**同级**元素，否则子面板的毛玻璃只糊得到内部）完全一致，已验证。

**Safari 不支持 `backdrop-filter: url()` 的一手证据链（全部为一手来源）**

1. [WebKit Bug 245510](https://bugs.webkit.org/show_bug.cgi?id=245510) —— `backdrop-filter: url(#some-svg-filter) doesn't work with SVG filters like feDisplacementMap`（2022-08 报告，至今未修）。WebKit 工程师 Simon Fraser 2025-08-25 回复：**"Accelerated filters (including backdrop-filter) can't use SVG filters, sadly."**（rdar://problem/159117210）
2. [WebKit Bug 297770](https://webkit.org/b/297770) —— `filter: url()` 在元素同时带 `backdrop-filter` 时被忽略（状态 REOPENED）。
3. [WebKit Bug 297732](https://bugs.webkit.org/show_bug.cgi?id=297732) —— 明确写 "Chrome allows developers to use url() as a backdropFilter in a webpage, Webkit and Gecko do not support"（RESOLVED DUPLICATE → 297770）。
4. [WebKit Bug 317059](https://bugs.webkit.org/show_bug.cgi?id=317059) —— 新 bug，正在为 `backdrop-filter` 的 url() 场景补 WPT 用例（Version: Safari 26）。
5. [WebKit PR 68614](https://github.com/WebKit/WebKit/pull/68614) —— 标题即 `backdrop-filter: url() SVG reference filters are not rendered`，2026-07-03 创建，2026-10-06 最后更新，**截至 2026-11-01 仍为 open、未合并**（标签 `merging-blocked`）。相关 PR 68613（CoreImage 源为空的崩溃修复）、69566（WPT 用例）同样未合并。
   → **结论：Safari 26.x 仍不支持 `backdrop-filter: url()`。**

6. **【源码读到】丢的是「整条」backdrop-filter，不只是 url() 那一段** —— WebKit 主线
   `Source/WebCore/rendering/RenderLayerBacking.cpp`：

   ```cpp
   void RenderLayerBacking::updateBackdropFilters(const Style::ComputedStyle& style)
   {
       m_canCompositeBackdropFilters = !style.backdropFilter().hasReferenceFilter()
           && m_graphicsLayer->setBackdropFilters(Style::toPlatform(style.backdropFilter(), style));
   }
   ```

   `hasReferenceFilter()` 为真时**根本不调** `setBackdropFilters()` → `backdrop-filter: url(#f) blur(3px)`
   里的 blur 一起消失，连毛玻璃都不剩。PR 68614 的描述也是同一口径：
   *"RenderLayerBacking::updateBackdropFilters() cannot hand a reference filter to Core Animation,
   and unlike filter: url() there is no software fallback, so the filter is dropped."*

7. **【一手来源确认】`@supports (backdrop-filter: url(...))` 在 Safari 会说谎** ——
   Safari 的 CSS 解析器接受 `url()`（computed style 里也留着 `url("#f")`），所以 `@supports` 返回 **true**；
   但渲染层按第 6 条把整条丢掉。于是**只靠 `@supports` 分流的结果是：Safari 拿到 `url()` → 液态玻璃整个消失**。
   CSS 层面无法区分「解析得过」与「渲染得出」→ 只能按引擎判断
   （`BaseLayout.astro` 的首屏内联脚本：`CSS.supports` + 两个 Chromium 信号任一命中），
   判完给 `<html>` 加 `.glass-refract` / `.glass-fallback` 再由 CSS 分流。
   **推翻了本节早先「必须用 `@supports` 探测，不能写死分支」的结论** ———
   那条只在 `@supports` 诚实时才成立，而 WebKit 恰好不诚实。

**Firefox 不支持 backdrop-filter 里的 SVG 引用**

- WebKit Bug 297770 评论（Karl Dubost, 2025-08）：**"The given example works in Gecko, which also doesn't support using svg filter in backdrop-filter, but allows `filter: url(#...)` when a backdrop-filter is applied."**
- `@dpawlikowski/liquid-glass` 用 `@supports (backdrop-filter: url(...))` 探测后回退到 sprite 模式，是同一结论的工程印证。

### 3.3 无障碍与可读性

**Apple HIG「Materials」（一手来源）** —— https://developer.apple.com/design/human-interface-guidelines/materials

- **不要在内容层用液态玻璃**："Don't use Liquid Glass in the content layer."
- **克制使用**："Use Liquid Glass effects sparingly... Limit these effects to the most important functional elements."
- **两种变体**：
  - *regular*：**模糊并调整背景内容亮度，以维持前景文字可读性**。当背景内容可能造成可读性问题、或组件含大量文字（alert / sidebar / popover）时用这个。
  - *clear*：高度透明，适合浮在**媒体背景**（照片、视频）之上。
- **关键数值**："For optimal contrast and legibility, determine whether to add a dimming layer behind components with clear Liquid Glass: **If the underlying content is bright, consider adding a dark dimming layer of 35% opacity.**"
- **在材质上用 vibrant 颜色**："Help ensure legibility by using vibrant colors on top of materials."
- **厚度与对比度的取舍**：更厚（更不透明）的材质给细笔画文字更好的对比度；更薄（更透明）的材质帮助用户保留背景上下文感。
- HIG 也明确提到材质外观会随**系统「降低透明度 / 增加对比度」辅助功能设置**变化。

**WCAG 2.2 对比度数值（一手来源：w3c/wcag 仓库规范原文）**

| 准则 | 要求 |
|---|---|
| [1.4.3 Contrast (Minimum) AA](https://github.com/w3c/wcag/blob/main/guidelines/sc/20/contrast-minimum.html) | 正文与文字图像对比度 **≥ 4.5:1**；**大号文字 ≥ 3:1**（大号 = 18pt / 14pt 粗体）；纯装饰、失效组件、logo 无要求 |
| [1.4.11 Non-text Contrast AA](https://github.com/w3c/wcag/blob/main/guidelines/sc/21/non-text-contrast.html) | 识别 UI 组件与状态所需的视觉信息、图形对象，对相邻颜色对比度 **≥ 3:1** |

**媒体查询惯例**

- `prefers-reduced-transparency`（MDN，标记为 experimental）：`reduce` / `no-preference`；对应 Windows「个性化 → 颜色 → 透明效果」、macOS「辅助功能 → 显示 → 降低透明度」。用途是「提升部分用户的对比度与可读性」。
- `prefers-reduced-motion`：`@dpawlikowski/liquid-glass` 用它关掉波浪动画与 CSS 过渡。
- 实践惯例：**降级不等于关掉效果，而是把「折射」换成「更实的 tint」**——即 HIG 的「加暗化层」思路：透明层之上要保证 4.5:1，就得给玻璃加足够的不透明底色，而不是靠模糊蒙混过关。

> 本仓库现状：`frontend/styles/themes/liquid-glass.css` 已有一套 `--ui-*` 语义色层与浅/深两套主题，导航玻璃表面（`ui-nav-surface`）带 blur + saturate。**改造玻璃时必须同步验证文字对比度**，尤其是导航文字压在文章正文之上时。

---

## 4. 对本仓库的适配建议

### 4.1 能直接抄的技术点（零依赖、纯 CSS/SVG/原生 JS）

| # | 技术点 | 抄自 | 解决本仓库的哪个问题 |
|---|---|---|---|
| 1 | **方向性渐变位移场**（R 编码 X、B 编码 Y、128 灰 = 零位移、模糊灰块做中心中性化） | A（Canvas2D） | 待改进点 1：整块随机抖 → 边缘折射、中心干净 |
| 2 | **滤镜区域按 scale 精确计算**：`maxD = max(\|scale\|×0.5, 20)`，`x=-ceil(maxD/w×100)%`、`width=(100+2pct)%`，y/height 同理 | A | 待改进点 2：位移采样到区域外 → 折射消失 |
| 3 | **画布尺寸 = 滤镜区域尺寸**，药丸居中 + 四周 128 灰 padding，`feImage` + `preserveAspectRatio="none"` | A | 待改进点 3：feImage 拉伸错位 |
| 4 | **三通道色散**：`scale + [0, 10, 20]`，`feColorMatrix` 拆通道 + `feBlend(screen)` 叠回 | A | 本仓库已有同款结构，**只需换 `in2` 与 scale 取值** |
| 5 | ~~**`@supports (backdrop-filter: url("#glass-refract"))` 特性探测**~~ | E | 待改进点 4：Safari / Firefox 无折射。**已否决** —— Safari 对 `@supports` 是假阳性（3.2 第 7 条），照抄会把整个液态玻璃打没。改用**引擎判据**（首屏内联脚本判完给 `<html>` 挂 class，CSS 按 class 分流） |
| 6 | **scale 上限钳制 ≤ 25** | E（Safari artifact 经验值） | 本仓库当前 `scale="30"` 已超；且 Safari 高 scale 会出 artifact |
| 7 | **backdrop root 规则**：`opacity` / `filter` / `mask` / `clip-path` / `mix-blend-mode` / `will-change` 都不能出现在玻璃祖先上 | MDN | 现有 `.nav-panel` 同级设计已正确，需扩展检查 `.settings-popup`、`.drawer-nav` 等 |
| 8 | **`prefers-reduced-transparency` / `prefers-reduced-motion` 降级** | MDN + E | 可读性：把折射换成更实的 tint |

### 4.2 抄不了的（以及为什么）

| 想抄的 | 为什么不行 |
|---|---|
| Safari / Firefox 的真折射 | `backdrop-filter: url()` 是 Chromium 独占（3.1）；没有纯 CSS/SVG 绕过方案 |
| vitrio 的 **clone 模式**（跨引擎全折射） | 需要克隆背景 DOM 并保持像素对齐；Astro 静态站的背景会变（主题切换、滚动、路由切换），克隆是静态快照，代价与复杂度远超收益 |
| vitrio / liquidGL 的 WebGL·WebGPU | 违反「零依赖 / 纯 CSS」约束；liquidGL 还要离屏渲染整页快照 |
| `liquid-glass-react` / `@dpawlikowski/react` 的 React 组件 | 违反「零 UI 框架依赖」约束 |
| `liquid-glass-react` 的鼠标弹性形变 | 需 React 状态；但**位移场模型**（SDF + smoothStep）可移植到本仓库 `.glass-lens` |
| 静态化整条效果 | 位移图依赖元素尺寸 → 不能纯静态；只能运行时生成，或改用固定尺寸的静态 SVG 位移场 |

### 4.3 推荐路线（按投入产出排序）

> **最终落地范围（实现后回填）**：只把**玻璃片**（跟随指针走的镜片 `.glass-lens`，144×33）
> 换成运行时位移图；整个液态玻璃（一级菜单 / 二级面板底板）继续用静态滤镜 `#glass-refract`，
> 不动。下面第 1、2 步的方案因此只对玻璃片生效。

**第 1 步（纯 CSS 数值改动，零风险，先做）**

- 把滤镜区域从写死的 ±12% 改成按 `scale` 计算：`scale=30` → `maxD = max(15, 20) = 20`；对 48px 高的导航，`pctY = ceil(20/48×100) = 42%` → 区域应为 `y="-42%" height="184%"`。
- 同时把 `scale` 从 30 降到 ≤ 25（Safari artifact 经验值）。
- 收益：立刻解决「折射在边缘消失」；不动滤镜结构，不加运行时 JS。
- **未采纳**：静态滤镜是按一级菜单的尺寸写的，玻璃片只有 144×33 ——
  同样 ±12% 只有 4px 纵向余量，而 `scale=30` 位移能到 15px，镜片的折射直接采样出界。
  玻璃片必须按自己的尺寸单独算区域（走第 2 步）。

**第 2 步（换位移图来源，收益最大）**

- 把 `feTurbulence` 噪声换成**确定性位移场**。两条子路径：
  - 2a **纯 SVG 静态位移场**：`feImage` 引用内联 SVG（渐变 + `feGaussianBlur` 做中心中性化）→ 零运行时 JS，符合本仓库「纯 CSS + SVG」偏好。~~**需实测验证**~~ → **已实测，不可行**（见 4.5）。
  - 2b **Canvas2D 运行时位移图**：直接抄 A 的 `buildDisplacementMap`，配 ResizeObserver。效果最稳，但引入运行时 JS（且本仓库已知「`-webkit-backdrop-filter` 会被 CSS 压缩合并」的坑不能照抄 A 的写法）。**已采纳**（见 4.5）。
- 无论哪条：`feDisplacementMap` 的 `in2` 要指向位移图，`xChannelSelector="R" yChannelSelector="B"`。

**第 3 步（降级与可读性）**

- ~~加 `@supports (backdrop-filter: url("#glass-refract"))`~~：不支持 → 只保留 `blur() + saturate()`（Safari / Firefox 现状）。**已否决**（Safari 假阳性）→ 改用**引擎判据**：`BaseLayout.astro` 的首屏内联脚本判完给 `<html>` 挂 `.glass-refract` / `.glass-fallback`，`tokens.css` 按 class 分流。**已采纳**。
- 加 `@media (prefers-reduced-transparency: reduce)` 与 `prefers-reduced-motion: reduce`：把折射关掉、tint 调实。**未做**。
- 按 HIG 检查玻璃上的文字对比度（4.5:1），必要时加 35% 暗化层。

### 4.4 明确不建议

- 不引入 React / WebGL / 任何 npm 运行时依赖（`vitrio`、`liquid-glass-react`、`liquid-glass-js`、`liquidGL`、`@dpawlikowski/liquid-glass` 都不引入）。
- 不为了「跨引擎折射」去做背景 DOM 克隆。
- 不同时维护「噪声版」和「渐变版」两套滤镜——只保留一套，按第 2 步定型。

### 4.5 实测补记（实现阶段回填）

在 Chromium 内置浏览器里用静态探针页逐条验证，结论如下（**最终只用于玻璃片 `.glass-lens`**，
整个液态玻璃保留静态滤镜 `#glass-refract`）：

**① 静态 SVG 位移场不可行（2a 已被否）。** 三种写法全部失败：

| 试法 | 失败原因 |
| --- | --- |
| `feImage` 引内联 SVG data URI + `mix-blend-mode: difference` 合成横纵位移场 | SVG 内的 `mix-blend-mode` 在 `feImage` 上下文**不生效**，两个通道没并进同一张图 |
| 两张 `feImage` 分别给 R / B 通道 + `feBlend mode="screen"` 合成 | 缺**形状遮罩**与**中心中性化** —— 圆角矩形的位移场无法用简单线性渐变表达，边缘位移贴不住圆角，中心也没压回中性 |
| `userSpaceOnUse` / `objectBoundingBox` 两种滤镜区域写法 | 位移带与元素错位 —— 区域必须按元素实测尺寸换算，且**位移图画布尺寸 = 滤镜区域尺寸**才能 1:1 对齐 |

**② 噪声路线（`feTurbulence`）观感不可用。** 整块面板泛起彩虹抖动，没有玻璃感；只有「渐变透镜」能做到中心干净、仅边缘弯折，但形状贴合不了。

**③ Canvas2D 逐元素位移图可行（2b 已采纳）。** 三种写法并排对比，只有「画布尺寸 = 滤镜区域尺寸」这一种能得到贴住圆角的边缘折射。

**④ 能力探测判据。** `CSS.supports('backdrop-filter', 'url(#a)')` 在 Chromium 返回 `true`，
**在 Safari 也返回 `true`（谎报）** —— Safari 解析得过、渲染时整条丢弃（见 3.2 第 6、7 条）。
所以判据不能只靠 `@supports` / `CSS.supports`，仓库里改成**引擎判据**（在 `BaseLayout.astro`
的**首屏内联脚本**里 —— 必须首屏前定好，否则会闪一下没有折射的玻璃）：
`CSS.supports('backdrop-filter','url(#a)')` **且** `'userAgentData' in navigator`
（Chromium 专有；注意它**只在安全上下文暴露**，http 的局域网 IP 上没有，Android WebView 要 119+）。
判完给 `<html>` 加 `.glass-refract` / `.glass-fallback` → CSS 按 class 分流。
宁可漏判（那类环境只剩毛玻璃 + 拟态色散），不可误判（Safari 里整个玻璃消失）。
`el.style.backdropFilter = 'url(#x)'` 解析后保留（computed style 里能看见 `url("#x")`），
**所以样式层面看不出区别，只能靠引擎判断**。

**⑤ Safari artifact 上限。** `scale` 钳在 ≤ 25 —— 与 `@dpawlikowski/liquid-glass` 的经验值一致；原仓库的 `scale="30"` 已超。

**⑥ 对齐算式（48px 高的导航栏，`scale=30`）。** 现写法 `x="-12%" y="-12%" width="124%" height="124%"` 只外扩 5.76px，而 `scale=30` 的位移可达 15px → 边缘采样出界，折射消失。正确值约 `y="-42%" height="184%"`（`maxD = max(|scale|×0.5, 20)`，再换算成百分比）。

### 4.6 当前实现落点

仓库里真正在跑的只有这几处：

| 文件 | 作用 |
|---|---|
| `frontend/lib/liquid-glass.ts` | Canvas 2D 画位移图 + 注入专属 SVG 滤镜，**只作用于玻璃镜片 `.glass-lens`** |
| `test/liquid-glass.test.ts` | 几何算式 + 色散档位自检（Node 自带 test runner，零新依赖） |
| `frontend/components/FloatingBar.astro` | 保留静态 `#glass-refract`（整个液态玻璃）；脚本末尾只给镜片挂运行时折射 |
| `frontend/styles/tokens.css` | `.ui-nav-surface` 走静态滤镜（`html.glass-refract` 分流降级）；`.ui-glass-lens` 只留基础毛玻璃 + 拟态色散（`html.glass-fallback`） |
| `docs/prototypes/liquid-glass-probe-1…5*.html` | 上面 4.5 的实测原型，存档用（见 `docs/prototypes/README.md`） |

工单：`.scratch/blog-mvp/issues/21-glass-lens-displacement-map.md`。

**色散档位是绝对值，不是百分比**：上游 `aberration: [0, 10, 20]` 是给大元素（base scale 180）
准备的固定像素档；镜片 base 只有 7px，照抄固定 10px 会直接翻符号。仓库里的做法是
`step = clamp(floor(|scale|/3), 1, 3)` → 镜片得到 -7 / -5 / -3。

**没有进仓库的东西**：第 2 节的 B–E 全部方案、4.3 的第 1 步与第 3 步、
以及本文 4.5 ① 被实测否掉的几种写法 —— 它们只是调研记录，不参与构建。

---

## 5. 风险与坑位清单

| # | 坑 | 现象 | 根因 | 规避 |
|---|---|---|---|---|
| 1 | **滤镜区域不足** | 边缘折射突然消失、出现硬边 | 区域默认只比 bbox 大 10%，而位移可达 `\|scale\|/2` | 按 `maxD = max(\|scale\|×0.5, 20)` 精确扩展 x/y/width/height |
| 2 | **feImage 拉伸错位** | 位移图与元素对不上，扭曲位置偏移 | 画布尺寸（元素尺寸）≠ 滤镜区域尺寸（扩展后） | 画布尺寸 = 区域尺寸；药丸居中 + 128 灰 padding |
| 3 | **通道编码写错** | 整块单向平移 / 完全无位移 | `yChannelSelector` 应为 `B`（G 恒 0），不是 `G` | R=X、B=Y，128 灰 = 零位移 |
| 4 | **中性值不是 128** | 整块出现固定方向偏移 | 0.5 归一化 ↔ 8bit 128 | 中性填充必须 `rgb(128,128,128)` |
| 5 | **噪声位移** | 整块面板随机抖动，像故障而非玻璃 | `feTurbulence` 是随机场，无方向性 | 换成确定性渐变 / SDF 位移场 |
| 6 | **Safari / Firefox 丢弃 url()** | 折射没有，**毛玻璃也一起没了** | WebKit 见到 reference filter 就整条丢弃（3.2 第 6 条）；Firefox 同样不支持 | 首屏内联脚本判引擎 → 挂 class → 只给判定的引擎挂 url()，其余只留 `blur()` |
| 7 | **backdrop root** | 毛玻璃只糊得到父元素内部 | 祖先上有 `opacity<1` / `filter` / `mask` / `clip-path` / `mix-blend-mode` / `will-change` | 玻璃祖先保持干净；`.nav-panel` 与 `.floating-menu` 同级 |
| 8 | **滤镜 SVG 不能 `display:none`** | 滤镜完全不生效 | 隐藏后浏览器不渲染滤镜源 | 用 `width:0; height:0`（本仓库 `.glass-defs` 已这样做） |
| 9 | **滤镜 ID 冲突** | 多实例互相污染 | `id` 必须全局唯一 | 固定 id 时保证唯一（本仓库是单例，风险低） |
| 10 | **父级 stacking context** | 效果出现但观感异常 | 父级 `opacity<1` / `transform` 创建层叠上下文 | 逐个祖先检查 |
| 11 | **GPU 性能** | 大面板滚动掉帧 | SVG 滤镜是 GPU 密集；>800px 宽可能卡顿；窄条 Y 区域可膨胀到 184%+ | 镜片只给内容尺寸的小元素；大面板用纯 frost |
| 12 | **CSS 压缩吞前缀** | Chromium 正常、Safari 全废 | 同时写 `-webkit-backdrop-filter` 会被合并流程处理掉 | 只写标准属性（本仓库 AGENTS.md 硬约束） |
| 13 | **Safari 高 scale artifact** | Safari 上出现渲染异常 | 高 `feDisplacementMap` 值在 Safari 有 artifact（`@dpawlikowski` 经验值 ≤25） | scale ≤ 25 |
| 14 | **可读性失控** | 玻璃上的正文对比度不足 | 半透明底 + 复杂背景 | WCAG 4.5:1 / 大字 3:1 / 非文字 3:1；HIG：背后亮时加 35% 暗化层；`prefers-reduced-transparency` 降级为实 tint |
| 15 | **WebKit 修复突然可用** | 降级分支失效 / 观感突变 | WebKit PR 68614 一旦合并，Safari 开始支持 | 改 `BaseLayout.astro` 首屏内联脚本里的引擎判据（`canRefract()` 只读 class，不用改） |
| 16 | **位移图缓存无上限** | 长时间使用内存增长 | `_mapCache` 无淘汰（源码读到） | 自建时加 LRU 或不缓存 |
| 17 | **`@supports` 说谎** | Safari 里液态玻璃整个消失 | Safari 解析 `url()` 成功 → `@supports` 为 true → 渲染层整条丢弃（3.2 第 6、7 条） | 不用 `@supports` 判 url() 能力；改用引擎判据 + `<html>` class 分流 |
| 18 | **判定晚一步** | 闪一下没有折射的玻璃 | 判据放在 deferred 模块脚本里，首绘时 class 还没挂上 | 判据放 `BaseLayout.astro` 的首屏内联脚本（同步执行，首绘前）；降级用**正向** class，别用 `:not()` |
| 19 | **Chromium 判据的漏判** | 这类环境只剩毛玻璃、没有折射 | `navigator.userAgentData` 只在**安全上下文**暴露（http 的局域网 IP 上没有），Android WebView 要 119+ | 接受：落到 `.glass-fallback`（毛玻璃 + 拟态色散），玻璃还在，只是少一层折射 |

---

## 附：来源清单

**源码读到**

- https://github.com/rizzytoday/liquid-glass —— `core/liquid-glass.ts`、`core/liquid-glass.d.ts`、`README.md`
- https://github.com/eamonliu/liquid-glass-js —— `README.md`（vitrio 说明）、`src/` 目录
- https://github.com/rdev/liquid-glass-react —— `src/shader-utils.ts`
- https://github.com/dpawlikowski/liquid-glass —— `README.md`、`docs/browser-support.md`、`src/core/`
- https://github.com/naughtyduk/liquidGL —— `README.md`
- WebKit 主线 `Source/WebCore/rendering/RenderLayerBacking.cpp` —— `updateBackdropFilters()`：
  `hasReferenceFilter()` 为真就不调 `setBackdropFilters()`（整条 backdrop-filter 被丢弃）
  https://github.com/WebKit/WebKit/blob/main/Source/WebCore/rendering/RenderLayerBacking.cpp

**一手来源确认**

- WebKit Bug 245510 https://bugs.webkit.org/show_bug.cgi?id=245510
- WebKit Bug 297770 https://webkit.org/b/297770
- WebKit Bug 297732 https://bugs.webkit.org/show_bug.cgi?id=297732
- WebKit Bug 317059 https://bugs.webkit.org/show_bug.cgi?id=317059
- WebKit PR 68614 https://github.com/WebKit/WebKit/pull/68614（open，未合并）
- WebKit PR 68613 https://github.com/WebKit/WebKit/pull/68613（open，未合并）
- WebKit PR 69566 https://github.com/WebKit/WebKit/pull/69566（open，未合并）
- MDN `backdrop-filter`（backdrop root 清单与后果原文）https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter
- MDN SVG 属性 `x` / `y` / `width` / `height`（滤镜图元子区域默认值 0% / 0% / 100% / 100%，`spec-urls` 指向 Filter Effects 1）https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/x
- MDN `feImage` https://developer.mozilla.org/en-US/docs/Web/SVG/Element/feImage
- MDN `prefers-reduced-transparency` https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency
- MDN browser-compat-data `css.properties.backdrop-filter` https://github.com/mdn/browser-compat-data
- WCAG 2.2 规范原文（w3c/wcag 仓库）https://github.com/w3c/wcag/blob/main/guidelines/sc/20/contrast-minimum.html ｜ https://github.com/w3c/wcag/blob/main/guidelines/sc/21/non-text-contrast.html
- Apple Human Interface Guidelines — Materials https://developer.apple.com/design/human-interface-guidelines/materials
- CSS Filter Effects Level 1（滤镜图元属性定义）https://drafts.csswg.org/filter-effects-1/
- CSS Filter Effects Level 2（`backdrop-filter` 的 `<filter-value-list>` 语法）https://drafts.csswg.org/filter-effects-2/

**环境限制备注**

- 本次调研环境无法直连 `www.w3.org`（TLS 握手失败，curl rc=35），规范条文经由 W3C 官方 GitHub 仓库（`w3c/wcag`）与 MDN 的 `spec-urls` 交叉确认。
- `api.npmjs.org` 的 downloads 接口亦不可达；npm 包版本与发布时间取自 `registry.npmjs.org` 的 `time` 字段。
