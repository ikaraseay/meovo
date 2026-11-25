import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeFriendLink } from '../backend/lib/admin/friend-links.ts'
import { buildRequestMailto, requestBody } from '../frontend/lib/link-exchange.ts'

test('友链：名称与地址必填，地址补协议', () => {
  const ok = normalizeFriendLink({
    name: '  Meovo ',
    url: 'example.com',
    description: ' 这个博客本身 ',
  })
  assert.equal(ok.ok, true)
  assert.equal(ok.value?.name, 'Meovo')
  assert.equal(ok.value?.url, 'https://example.com/')
  assert.equal(ok.value?.description, '这个博客本身')
  assert.equal(ok.value?.avatar, '')
})

test('友链：缺名称或地址要报错', () => {
  const result = normalizeFriendLink({})
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('name_required'))
  assert.ok(result.errors.includes('url_required'))
})

test('友链：地址与头像只收 http / https', () => {
  const bad = normalizeFriendLink({
    name: 'x',
    url: 'javascript:alert(1)',
    avatar: 'data:image/png;base64,AAA',
  })
  assert.ok(bad.errors.includes('url_invalid'))
  assert.ok(bad.errors.includes('avatar_invalid'))
})

test('友链：名称与简介有长度上限', () => {
  const result = normalizeFriendLink({
    name: 'x'.repeat(81),
    description: 'y'.repeat(201),
    url: 'example.com',
  })
  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('name_too_long'))
  assert.ok(result.errors.includes('description_too_long'))
})

test('友链申请：正文一行一项', () => {
  const body = requestBody(
    { name: 'Meovo', url: 'https://meo.dev', avatar: '', description: '写点东西' },
    { name: '网站名称', url: '网站地址', avatar: '头像地址', description: '简介' },
  )
  assert.equal(
    body,
    ['网站名称: Meovo', '网站地址: https://meo.dev', '头像地址: ', '简介: 写点东西'].join('\n'),
  )
})

test('友链申请：mailto 把主题与正文转义', () => {
  const mailto = buildRequestMailto('a@b.com', '友链申请：Meovo', '网站名称: Meovo\n网站地址: https://meo.dev')
  assert.ok(mailto.startsWith('mailto:a@b.com?'))
  assert.ok(mailto.includes('subject=' + encodeURIComponent('友链申请：Meovo')))
  assert.ok(mailto.includes('body=' + encodeURIComponent('网站名称: Meovo\n网站地址: https://meo.dev')))
})
