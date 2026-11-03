import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  clampToDesk,
  clampToViewport,
  contentAnchoredLayout,
  fittedContentWidth,
  fromPct,
  restoreFromPct,
  scatterLayout,
  toPct,
  type DeskCard,
} from '../frontend/lib/desk-layout.ts'

test('散开：full 卡片独占一行，顶部留 topOffset', () => {
  const cards: DeskCard[] = [
    { id: 'hero', width: 1368, height: 300, full: true },
    { id: 'a', width: 400, height: 200 },
    { id: 'b', width: 300, height: 150 },
  ]
  const { positions, refHeight } = scatterLayout(cards, {
    deskWidth: 1400,
    viewportHeight: 800,
    topOffset: 100,
  })

  const hero = positions.get('hero')!
  assert.equal(hero.x, 12)
  // full 卡片落在「当前最高列」上 —— 列有交错偏移，所以是 100 + 24
  assert.equal(hero.y, 124)
  assert.equal(hero.width, 1368)

  // full 卡片之后，所有列都被推到它下面
  assert.equal(positions.get('a')!.y, 468)
  assert.equal(positions.get('b')!.y, 468)

  // 参考高度至少一屏（减去 MIN_VIEWPORT_HEIGHT）
  assert.ok(refHeight >= 680)
})

test('散开：每张卡片都有位置，且互不重叠', () => {
  const cards: DeskCard[] = Array.from({ length: 6 }, (_, i) => ({
    id: `c${i}`,
    width: 300,
    height: 100,
  }))
  const { positions } = scatterLayout(cards, { deskWidth: 1200, viewportHeight: 800, topOffset: 100 })
  assert.equal(positions.size, 6)
  const list = [...positions.values()]
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]
      const b = list[j]
      const overlap =
        a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + 100 && a.y + 100 > b.y
      assert.ok(!overlap, `c${i} 与 c${j} 重叠`)
    }
  }
})

test('散开：固定卡片保留槽位 —— 固定 / 拖走一张卡不挪动别人', () => {
  const cards: DeskCard[] = [
    { id: 'a', width: 300, height: 100 },
    { id: 'pinned', width: 300, height: 100, pinned: true },
    { id: 'b', width: 300, height: 100 },
  ]
  // 单列：固定卡占着自己的槽位，后面的卡照样顺延
  const { positions } = scatterLayout(cards, { deskWidth: 500, viewportHeight: 800, topOffset: 100 })
  assert.ok(positions.has('pinned'))
  assert.equal(positions.get('pinned')!.y, 244)
  assert.equal(positions.get('b')!.y, 388)
})

test('内容锚定：顶部 / 右侧 / 底部各就各位', () => {
  const cards: DeskCard[] = [
    { id: 'head', width: 720, height: 120, zone: 'top' },
    { id: 'toc', width: 300, height: 200, zone: 'side' },
    { id: 'outline', width: 300, height: 150, zone: 'side' },
    { id: 'nav', width: 560, height: 100, zone: 'tail' },
  ]
  const result = contentAnchoredLayout(cards, {
    deskWidth: 1600,
    topOffset: 100,
    contentWidth: 760,
    contentHeight: 500,
  })

  // 正文顶部留白：100 + (120+44) + 44
  assert.equal(result.contentMarginTop, 308)

  // 正文居中：left = (1600-760)/2 = 420
  // 正文列里的卡片宽度 = 正文列宽度 —— 右缘跟正文对齐
  assert.deepEqual(result.positions.get('head'), { x: 420, y: 100, width: 760 })
  assert.deepEqual(result.positions.get('toc'), { x: 1212, y: 308, width: 300 })
  assert.deepEqual(result.positions.get('outline'), { x: 1212, y: 552, width: 300 })
  // 底部卡片在正文下方：308 + 500 + 44
  assert.deepEqual(result.positions.get('nav'), { x: 420, y: 852, width: 760 })

  // min-height 覆盖到最底部那张卡片
  assert.equal(result.minHeight, 1008)
})

test('内容锚定：侧栏放不下就掉到正文下面 —— 压在正文上更糟', () => {
  const cards: DeskCard[] = [
    { id: 'toc', width: 300, height: 200, zone: 'side' },
  ]
  // 桌面 1200：正文右缘 = (1200+760)/2 = 980，980+32+300 = 1312 放不下
  const result = contentAnchoredLayout(cards, {
    deskWidth: 1200,
    topOffset: 100,
    contentWidth: 760,
    contentHeight: 500,
  })
  const toc = result.positions.get('toc')!
  // 掉到正文下面，而不是悬在正文右边
  assert.equal(toc.x, 220)
  assert.equal(toc.y, 144 + 500 + 44)
  // 宽度跟正文列一致
  assert.equal(toc.width, 760)
})

test('内容锚定：正文列里的卡片右缘跟正文对齐', () => {
  const cards: DeskCard[] = [
    { id: 'head', width: 720, height: 100, zone: 'top' },
    { id: 'license', width: 560, height: 100, zone: 'tail' },
  ]
  const result = contentAnchoredLayout(cards, {
    deskWidth: 1600,
    topOffset: 0,
    contentWidth: 760,
    contentHeight: 400,
  })
  const contentLeft = (1600 - 760) / 2
  for (const id of ['head', 'license']) {
    const pos = result.positions.get(id)!
    assert.equal(pos.x, contentLeft)
    assert.equal(pos.width, 760)
    assert.equal(pos.x + pos.width, contentLeft + 760)
  }
})

test('内容锚定：没有正文卡片时 min-height 仍覆盖正文', () => {
  const result = contentAnchoredLayout([], {
    deskWidth: 1400,
    topOffset: 100,
    contentWidth: 760,
    contentHeight: 500,
  })
  // contentMarginTop = 100 + 44；正文底部 = 144 + 500；min-height 再加 GAP_Y + PAD
  assert.equal(result.contentMarginTop, 144)
  assert.equal(result.minHeight, 700)
})

test('正文列宽度 —— 给右边的侧栏让位', () => {
  // 桌面 1265（1280 视口减去滚动条与页边距）、侧栏卡片 300：列收到 569
  assert.equal(fittedContentWidth(1265, 300, 760), 569)
  // 桌面够宽 → 保持 CSS 给的宽度
  assert.equal(fittedContentWidth(1600, 300, 760), 760)
  // 没有侧栏 → 不动
  assert.equal(fittedContentWidth(1000, 0, 760), 760)
  // 再窄也保底 480 —— 侧栏放不下就改排到正文下面
  assert.equal(fittedContentWidth(1009, 300, 760), 480)
})

test('百分比 ↔ 像素 往返', () => {
  assert.equal(fromPct(50, 800), 400)
  assert.equal(toPct(400, 800), 50)
  assert.equal(toPct(fromPct(37.5, 1200), 1200), 37.5)
  assert.equal(toPct(100, 0), 0)
})

test('桌面内夹取 —— 卡片不出桌面', () => {
  const ref = { width: 1000, height: 800 }
  const size = { width: 200, height: 100 }
  assert.deepEqual(clampToDesk({ x: -50, y: -50 }, size, ref), { x: 0, y: 0 })
  assert.deepEqual(clampToDesk({ x: 900, y: 700 }, size, ref), { x: 800, y: 700 })
})

test('视口夹取 —— 卡片边缘与屏幕边缘至少留 1vw / 1vh', () => {
  const vp = { width: 1200, height: 800 }
  const size = { width: 100, height: 50 }
  assert.equal(clampToViewport({ x: -999, y: 0 }, size, vp).x, 12)
  assert.equal(clampToViewport({ x: 9999, y: 0 }, size, vp).x, 1200 - 12 - 100)
  assert.equal(clampToViewport({ x: 0, y: -999 }, size, vp).y, 8)
  assert.equal(clampToViewport({ x: 0, y: 9999 }, size, vp).y, 800 - 8 - 50)
  // 卡片比视口还宽 —— 区间反转，只能落在下界
  assert.equal(clampToViewport({ x: 0, y: 0 }, { width: 1300, height: 50 }, vp).x, 12)
})

test('存档坐标还原 —— 百分比 → 像素，并夹回范围', () => {
  const size = { width: 200, height: 100 }
  const ref = { width: 1000, height: 800 }
  assert.deepEqual(restoreFromPct({ xPct: 50, yPct: 50 }, size, ref), { x: 500, y: 400 })
  // 存档里超出桌面 —— 夹回来
  assert.deepEqual(restoreFromPct({ xPct: 200, yPct: 200 }, size, ref), { x: 800, y: 700 })
})

