import assert from 'node:assert/strict'
import { test } from 'node:test'
import { categoryPath, tagPath } from '../frontend/lib/urls.ts'

test('标签 URL 对中文做路径编码，分类 URL 保留 ASCII slug', () => {
  assert.equal(tagPath('zh', '中文'), '/zh/tags/%E4%B8%AD%E6%96%87/')
  assert.equal(categoryPath('zh', 'design'), '/zh/categories/design/')
})
