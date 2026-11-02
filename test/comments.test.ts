import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  COMMENT_MAX_LENGTH,
  COMMENT_MAX_PER_WINDOW,
  gravatarUrl,
  isRateLimited,
  normalizeWebsite,
  sha256Hex,
  validateComment,
} from '../backend/lib/comments/model.ts'

test('一条正常的评论能过校验，邮箱转小写、网站补协议', () => {
  const result = validateComment({
    name: '  路人  ',
    email: 'Reader@Example.com',
    website: 'example.com/path',
    content: ' 写得不错  ',
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.name, '路人')
  assert.equal(result.value.email, 'reader@example.com')
  assert.equal(result.value.website, 'https://example.com/path')
  assert.equal(result.value.content, '写得不错')
})

test('必填项与格式不对时给出字段级错误码', () => {
  const result = validateComment({ name: '', email: 'nope', website: '', content: '' })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.errors.name, 'name_required')
  assert.equal(result.errors.email, 'email_invalid')
  assert.equal(result.errors.content, 'content_required')
})

test('评论太长要拦下来', () => {
  const result = validateComment({
    name: 'a',
    email: 'a@b.com',
    content: 'x'.repeat(COMMENT_MAX_LENGTH + 1),
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.errors.content, 'content_too_long')
})

test('网站只收 http / https', () => {
  assert.equal(normalizeWebsite('example.com'), 'https://example.com/')
  assert.equal(normalizeWebsite('http://example.com/x'), 'http://example.com/x')
  assert.equal(normalizeWebsite('javascript:alert(1)'), null)
  assert.equal(normalizeWebsite('data:text/html,x'), null)
})

test('邮箱哈希与 Gravatar 地址', async () => {
  // SHA-256('abc') 的标准值
  assert.equal(
    await sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  )
  const url = await gravatarUrl(' Reader@Example.com ')
  assert.ok(url.startsWith('https://gravatar.com/avatar/'))
  assert.ok(url.includes('d=404'))
  // 大小写与空格归一后是同一个头像
  assert.equal(url, await gravatarUrl('reader@example.com'))
})

test('窗口内提交太多次要限流', () => {
  assert.equal(isRateLimited(COMMENT_MAX_PER_WINDOW - 1), false)
  assert.equal(isRateLimited(COMMENT_MAX_PER_WINDOW), true)
})
