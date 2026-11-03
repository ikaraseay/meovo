/**
 * 后台前端的共用小工具 —— 令牌那一段。
 *
 * 令牌（updated_at）是乐观锁的版本号：服务端每次写入都换新的并在响应里回传，
 * 客户端不换掉手里那份，同一页面第二次保存就会 409。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { nextToken } from '../backend/lib/admin/client.ts'

test('令牌：只认服务端回传的新值', () => {
  assert.equal(nextToken('T0', { updatedAt: 'T1' }), 'T1')
})

test('令牌：响应里没有就沿用旧的 —— 别把令牌弄丢', () => {
  assert.equal(nextToken('T0', {}), 'T0')
  assert.equal(nextToken('T0', null), 'T0')
  assert.equal(nextToken('T0', { updatedAt: '' }), 'T0')
  assert.equal(nextToken('T0', { updatedAt: 42 }), 'T0')
})

test('令牌：本来就没有就是空串', () => {
  assert.equal(nextToken(null, {}), '')
})
