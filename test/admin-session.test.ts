import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SESSION_TTL_SECONDS,
  signSession,
  verifySession,
} from '../backend/lib/admin/session.ts'

const SECRET = 'test-secret-key'

function futureToken(seconds = 60): Promise<string> {
  return signSession({ exp: Math.floor(Date.now() / 1000) + seconds }, SECRET)
}

test('会话：签发出来的能验过', async () => {
  const token = await futureToken()
  assert.equal(await verifySession(token, SECRET), true)
})

test('会话：换一把密钥就验不过', async () => {
  const token = await futureToken()
  assert.equal(await verifySession(token, 'another-secret'), false)
})

test('会话：载荷被改过就验不过', async () => {
  const token = await futureToken()
  const signature = token.split('.')[1]
  const forged = Buffer.from(JSON.stringify({ exp: 9999999999 })).toString('base64url')
  assert.equal(await verifySession(forged + '.' + signature, SECRET), false)
})

test('会话：签名被改过就验不过', async () => {
  const token = await futureToken()
  const body = token.split('.')[0]
  const forged = Buffer.from('not-a-signature').toString('base64url')
  assert.equal(await verifySession(body + '.' + forged, SECRET), false)
})

test('会话：过期就验不过', async () => {
  const token = await signSession({ exp: Math.floor(Date.now() / 1000) - 1 }, SECRET)
  assert.equal(await verifySession(token, SECRET), false)
})

test('会话：乱七八糟的 token 不炸', async () => {
  assert.equal(await verifySession('', SECRET), false)
  assert.equal(await verifySession('abc', SECRET), false)
  assert.equal(await verifySession('a.b.c', SECRET), false)
  assert.equal(await verifySession(undefined, SECRET), false)
})

test('会话：有效期是 7 天', () => {
  assert.equal(SESSION_TTL_SECONDS, 7 * 24 * 60 * 60)
})
