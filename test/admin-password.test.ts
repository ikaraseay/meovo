import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_MS,
  hashPassword,
  isRateLimited,
  lockAfterFailure,
  timingSafeEqual,
  verifyPassword,
} from '../backend/lib/admin/password.ts'

test('口令：哈希稳定，同一个口令两个哈希一样', async () => {
  const first = await hashPassword('correct horse')
  const second = await hashPassword('correct horse')
  assert.equal(first, second)
  assert.equal(first.length, 64)
})

test('口令：同一个口令不同哈希不等', async () => {
  const a = await hashPassword('one')
  const b = await hashPassword('two')
  assert.notEqual(a, b)
})

test('口令：对的就是对，错的拒', async () => {
  const hash = await hashPassword('s3cret')
  assert.equal(await verifyPassword('s3cret', hash), true)
  assert.equal(await verifyPassword('s3cret ', hash), false)
  assert.equal(await verifyPassword('nope', hash), false)
})

test('口令：secret 没配就一律拒', async () => {
  assert.equal(await verifyPassword('anything', ''), false)
})

test('口令：常量时间比对 —— 长度不同直接否', () => {
  assert.equal(timingSafeEqual('abc', 'abc'), true)
  assert.equal(timingSafeEqual('abc', 'abd'), false)
  assert.equal(timingSafeEqual('abc', 'abcd'), false)
})

test('限流：窗口内失败够数就拒，窗口过了放行', () => {
  const now = Date.now()
  assert.equal(isRateLimited(LOGIN_MAX_ATTEMPTS - 1, now, now), false)
  assert.equal(isRateLimited(LOGIN_MAX_ATTEMPTS, now, now), true)
  assert.equal(isRateLimited(LOGIN_MAX_ATTEMPTS, now - LOGIN_WINDOW_MS - 1000, now), false)
})

test('限流：前 5 次失败回「口令错了」，第 6 次才锁', () => {
  const now = Date.now()
  // count 是「算上这次」的失败数
  for (let count = 1; count <= LOGIN_MAX_ATTEMPTS; count++) {
    assert.equal(lockAfterFailure(count, now, now), false, '第 ' + count + ' 次不该锁')
  }
  assert.equal(lockAfterFailure(LOGIN_MAX_ATTEMPTS + 1, now, now), true)
})
