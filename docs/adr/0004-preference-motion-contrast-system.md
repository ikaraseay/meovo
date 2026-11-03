# 用户偏好收成一层：相对字号、对比度、动效、无障碍

设置里只有一个「字体大小」，改的却只是正文；主题里有三处文字没过 AA；动效散在每个组件的
`transition` 里，想关只能去系统里关；链接只靠颜色区分。看起来是四件小事，其实是同一件：
**读者对站点的调整权没有主人**。

**为什么「字体大小」只动正文？** 字号写死在 `.prose` 的 `--ui-prose-scale` 上，导航、卡片、
按钮全都不跟着走；而间距刻度 `--ui-space-*` 是 px，放大正文只把字撑大、间距不动，
行宽和留白一起失衡 —— 所以「正文字号」这个档位天生调不出舒服的结果。

**为什么三处文字不过 AA？** 浅色主题的 `--ui-text-muted` / `--ui-text-faint` /
`--ui-text-accent` 是照着「看起来好看」调的，没拿 `--ui-bg` 当底算过对比度：
4.96:1 / 4.79:1 / 4.98:1 看着像 4.5:1，实际都差一点。

**为什么动效关不掉？** 每个组件自己写 `transition` / `@keyframes`，没有统一的开关层；
`prefers-reduced-motion` 只在两三处零散地判过。

**怎么改？**

1. **偏好层只有一处** —— `frontend/lib/preferences.ts`。key 的唯一主人是 `PREFS_KEYS`，
   class 名的唯一主人是 `PREF_CLASSES`（值取自 `dom-contract.ts` 的 `CLASS`）。
   首屏内联脚本不能 import 模块，用 `define:vars` 把两张表注入进去 ——
   别在别处再写死一份 key 或 class 名（改了会首屏静默回退）。
2. **相对字号改根字号** —— `html { font-size: calc(100% * var(--ui-root-scale, 1)) }`，
   全站一起缩；间距刻度 `--ui-space-*` 全部 px → rem，跟着根字号走。
   行距单独一档（`--ui-prose-lh`），不跟字号绑 —— 放大字号不必同时放大行距。
   老的 `prose-scale` key 只作读侧兜底，迁到 `root-scale`，不主动写回。
3. **对比度两档** —— 标准档本身必须过 WCAG AA 4.5:1（改了三个 token），
   高对比档在此之上再抬次要文字、描边与表面不透明度，并压深强调色。
   两档各自的取值由 `test/contrast.test.ts` 守着 —— 改主题色就会有人喊。
4. **动效三层** —— ① 刻度（`--ui-motion-*`）② 原语（`.ui-anim-fade-up` / `.ui-anim-fade-in` /
   `.ui-anim-pop` / `.ui-anim-stagger`）③ 归零（系统 `prefers-reduced-motion` + 用户显式选的
   「减弱」两套 `!important` 重置）。页面只编排原语，不再各写各的 `@keyframes`。
   「完整」能顶掉系统那一条，但**顶不掉用户自己选的「减弱」** —— 用户说的比系统设置更算数。
5. **无障碍三开关** —— 强化焦点环（`--ui-focus-ring-width` / `-offset`）、
   始终显示链接下划线、更大的点击目标（`--ui-target-min-size` 下限 44px）。
   全部是 `<html>` 上的 class，首屏前挂上，不闪。
6. **渐变只做装饰性边框** —— `.ui-gradient-border` 原语，两层背景 + `background-clip`。
   **只用在不透明底的元素上**（终端卡）：玻璃卡表面半透明，渐变会从底下透上来把整张卡染花。

**代价（明确接受）**：根字号放大时，间距刻度跟着放大 —— 桌面端的玻璃桌面是绝对定位的，
卡片落位按视口算，字号放大后卡片相对变「挤」，属可接受的取舍；
`min-height` 对行内盒无效，所以正文里的行内链接不参与「更大的点击目标」
（那正是 WCAG 2.5.8 豁免的句中链接），独立链接（导航 / 卡片里的）照常抬高。

**Consequences**：新增偏好 = `preferences.ts` 加一个 key + `dom-contract.ts` 登记一个 class +
`global.css` 写一条规则 + 设置弹窗加一个控件 + 词典加两条词条。
别在组件里另存一份偏好，也别绕过 `preferences.ts` 直接读写 localStorage。
