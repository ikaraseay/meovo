import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeProject, normalizeUrl } from '../backend/lib/admin/projects.ts'

test('项目：名称与地址必填，地址补协议', () => {
  const ok = normalizeProject({
    name: '  Meovo ',
    description: ' 这个博客本身 ',
    url: 'example.com',
  })
  assert.equal(ok.ok, true)
  assert.equal(ok.value?.name, 'Meovo')
  assert.equal(ok.value?.description, '这个博客本身')
  assert.equal(ok.value?.url, 'https://example.com/')
})

test('项目：缺名称或地址要报错', () => {
  const result = normalizeProject({})
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('name_required'))
  assert.ok(result.errors.includes('url_required'))
})

test('项目：地址只收 http / https', () => {
  assert.equal(normalizeUrl('javascript:alert(1)'), null)
  assert.equal(normalizeUrl('data:text/html,x'), null)
  assert.equal(normalizeUrl('http://example.com/x'), 'http://example.com/x')
})

test('项目：名称与简介有长度上限', () => {
  const result = normalizeProject({
    name: 'x'.repeat(81),
    description: 'y'.repeat(201),
    url: 'example.com',
  })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('name_too_long'))
  assert.ok(result.errors.includes('description_too_long'))
})
