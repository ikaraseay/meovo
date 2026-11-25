-- 友链：关于页那张卡片里的友情链接
-- ⚠️ 改了这份文件要再跑一次：wrangler d1 migrations apply meovo-content --remote

CREATE TABLE friend_links (
  id          TEXT PRIMARY KEY,          -- uuid
  name        TEXT NOT NULL,             -- 站点名
  url         TEXT NOT NULL,             -- 站点地址
  avatar      TEXT NOT NULL DEFAULT '',  -- 头像地址（留空 = 用站点 favicon）
  description TEXT NOT NULL DEFAULT '',  -- 一句话简介
  sort_order  INTEGER NOT NULL DEFAULT 0,-- 排序（小在前）
  created_at  TEXT NOT NULL
);

CREATE INDEX idx_friend_links_order ON friend_links(sort_order, created_at);

-- 仓库里原本手写的那条友链 —— 搬进库里，别弄丢
INSERT OR IGNORE INTO friend_links (id, name, url, avatar, description, sort_order, created_at)
VALUES ('seed-wxiaoyi', '赵叶轩', 'https://www.wxiaoyi.cn', '', '一个热爱技术的开发者', 0, '2026-11-25T00:00:00.000Z');
