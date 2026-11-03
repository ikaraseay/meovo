/**
 * 后台 API 的共用小工具 —— 请求体上限。
 *
 * 上限要在**解析之前**看：读进来再判断等于没判断，内存已经花掉了。
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import { bodyTooLarge, MAX_BODY_BYTES } from '../backend/lib/admin/api.ts'

function post(contentLength: string): Request {
  return new Request('https://example.test/api/comments', {
    method: 'POST',
    headers: { 'content-length': contentLength },
  })
}

test('请求体上限：超了直接 413', () => {
  const response = bodyTooLarge(post(String(MAX_BODY_BYTES + 1)))
  assert.equal(response?.status, 413)
})

test('请求体上限：正常大小放行', () => {
  assert.equal(bodyTooLarge(post(String(MAX_BODY_BYTES))), null)
  assert.equal(bodyTooLarge(post('1024')), null)
})

test('请求体上限：没有 content-length 就当不知道', () => {
  const request = new Request('https://example.test/api/comments', { method: 'POST' })
  assert.equal(bodyTooLarge(request), null)
})
