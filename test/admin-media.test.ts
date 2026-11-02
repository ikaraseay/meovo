import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  extensionFor,
  isAllowedImage,
  isSafeMediaKey,
  mediaKey,
  sniffImageType,
} from '../backend/lib/admin/media.ts'

const UUID = '11111111-2222-3333-4444-555555555555'

test('图片：类型白名单', () => {
  assert.equal(isAllowedImage('image/png'), true)
  assert.equal(isAllowedImage('image/jpeg'), true)
  assert.equal(isAllowedImage('image/svg+xml'), false)
  assert.equal(isAllowedImage('text/html'), false)
  assert.ok(ALLOWED_IMAGE_TYPES.length > 0)
})

test('图片：类型对应扩展名', () => {
  assert.equal(extensionFor('image/png'), 'png')
  assert.equal(extensionFor('image/jpeg'), 'jpg')
  assert.equal(extensionFor('application/pdf'), null)
})

test('图片：key 形如 <年月>/<uuid>.<ext>，公开地址是 /media/<key>', () => {
  const key = mediaKey('image/png', UUID, new Date('2026-11-02T00:00:00.000Z'))
  assert.equal(key, '2026-11/' + UUID + '.png')
})

test('图片：key 白名单挡住穿越与怪路径', () => {
  assert.equal(isSafeMediaKey('2026-11/' + UUID + '.png'), true)
  assert.equal(isSafeMediaKey('../../etc/passwd'), false)
  assert.equal(isSafeMediaKey('2026-11/../../secret.png'), false)
  assert.equal(isSafeMediaKey('/2026-11/x.png'), false)
  assert.equal(isSafeMediaKey('2026-11/x.exe'), false)
})

test('图片：文件头嗅探', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
  assert.equal(sniffImageType(png), 'image/png')
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
  assert.equal(sniffImageType(jpeg), 'image/jpeg')
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0])
  assert.equal(sniffImageType(gif), 'image/gif')
  const html = new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c, 0x3e, 0, 0, 0, 0, 0, 0])
  assert.equal(sniffImageType(html), null)
  assert.equal(sniffImageType(new Uint8Array([1, 2, 3])), null)
})

test('图片：大小上限 5MB', () => {
  assert.equal(MAX_IMAGE_BYTES, 5 * 1024 * 1024)
})
