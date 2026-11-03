/**
 * ASCII slug —— 分类 / 标签 / 系列 id 共用的那一条规则。
 * ---------------------------------------------------------
 * 规则只有这一处：后台提交（backend/lib/admin/documents.ts）与手写文章的
 * frontmatter（frontend/content.config.ts）都从这儿拿 ——
 * 两边标准不一致时，手写的那条会绕过校验直接进构建。
 */

/** 小写字母 / 数字 / 连字符 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
