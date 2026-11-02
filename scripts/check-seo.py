#!/usr/bin/env python3
"""
SEO 检查：canonical / hreflang / sitemap / robots / RSS / OG 一致性。

用法：
    pnpm build && python3 scripts/check-seo.py

检查项：
  1. 每个页面恰好一个 canonical，且是绝对地址、指向真实存在的页面
  2. hreflang 齐（各语言 + x-default），指向的页面真实存在
  3. 互指成立：
     · 可收录页面之间双向互指，且各自引用自己
     · noindex 的回退页（未翻译文章的原文页）hreflang 集合与它的 canonical **完全一致**
  4. sitemap 的 URL 集合 == 可收录页面的集合（noindex 的页面不得出现）
  5. sitemap 每条 URL 的语言互指与 head 里一致
  6. robots.txt 存在，且指向 sitemap
  7. 每种语言的 RSS 都存在，条目链接指向真实存在的页面
  8. 每页都有 og:title / og:description / og:url / og:image / twitter:card，
     og:url 与 canonical 一致，og:image 是绝对地址
  9. 每页至少有一段能解析成 JSON 的 ld+json

退出码：有检查失败 → 1；全部通过 → 0
"""

import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
# Cloudflare 适配器把静态产物放在 dist/client/，Worker 在 dist/server/
DIST = ROOT / "dist" / "client"

SM_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
XHTML_NS = {"xhtml": "http://www.w3.org/1999/xhtml"}

TAG_RE = re.compile(r"<(meta|link)\b([^>]*)>", re.I)
ATTR_RE = re.compile(r'([\w:-]+)(?:\s*=\s*"([^"]*)")?')
LD_RE = re.compile(
    r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', re.S | re.I
)


def site_origin() -> str:
    """站点根地址 —— 跟着 astro.config.mjs 的 site 走"""
    config = (ROOT / "astro.config.mjs").read_text(encoding="utf-8")
    match = re.search(r"site:\s*'([^']+)'", config)
    return match.group(1).rstrip("/") if match else ""


def collect_pages() -> dict[str, Path]:
    """构建产物里的页面：路径 → 文件。根路径 / 是重定向页，不算可收录页面。"""
    pages: dict[str, Path] = {}
    for path in sorted(DIST.rglob("index.html")):
        rel = path.relative_to(DIST).as_posix()
        pages["/" + rel[: -len("index.html")]] = path
    return pages


def tags(html: str, name: str):
    for match in TAG_RE.finditer(html):
        if match.group(1).lower() == name:
            yield {k.lower(): (v or "") for k, v in ATTR_RE.findall(match.group(2))}


def path_of(url: str) -> str:
    return urlparse(url).path or "/"


def main() -> int:
    print("SEO 检查")

    if not DIST.exists():
        print("  ✗ 找不到 dist/ —— 先跑 pnpm build")
        return 1

    origin = site_origin()
    if not origin:
        print("  ✗ astro.config.mjs 里读不到 site")
        return 1

    pages = collect_pages()
    failures: list[str] = []

    canonical_by_page: dict[str, str] = {}
    alts_by_page: dict[str, set[str]] = {}
    noindex_pages: set[str] = set()

    # ---------- 逐页检查 ----------
    for url_path, file in pages.items():
        if url_path == "/":
            continue  # 根路径是重定向页
        html = file.read_text(encoding="utf-8")

        canonicals = [
            t["href"]
            for t in tags(html, "link")
            if t.get("rel") == "canonical" and t.get("href")
        ]
        if len(canonicals) != 1:
            failures.append(f"{url_path}  canonical 数量应为 1，实际 {len(canonicals)}")
        else:
            canonical = canonicals[0]
            canonical_by_page[url_path] = canonical
            if not canonical.startswith(origin):
                failures.append(f"{url_path}  canonical 不是绝对地址：{canonical}")
            elif path_of(canonical) not in pages:
                failures.append(f"{url_path}  canonical 指向不存在的页面：{canonical}")

        robots = [t.get("content", "") for t in tags(html, "meta") if t.get("name") == "robots"]
        if any("noindex" in r for r in robots):
            noindex_pages.add(url_path)

        alts = {
            t.get("hreflang"): t.get("href")
            for t in tags(html, "link")
            if t.get("rel") == "alternate" and t.get("hreflang") and t.get("href")
        }
        if "x-default" not in alts:
            failures.append(f"{url_path}  缺 x-default")
        for code, href in alts.items():
            if not href.startswith(origin):
                failures.append(f"{url_path}  hreflang {code} 不是绝对地址：{href}")
            elif path_of(href) not in pages:
                failures.append(f"{url_path}  hreflang {code} 指向不存在的页面：{href}")
        alts_by_page[url_path] = {path_of(h) for h in alts.values() if h}

        og = {
            t.get("property"): t.get("content", "")
            for t in tags(html, "meta")
            if t.get("property", "").startswith("og:")
        }
        twitter = {
            t.get("name"): t.get("content", "")
            for t in tags(html, "meta")
            if t.get("name", "").startswith("twitter:")
        }
        for key in ("og:title", "og:description", "og:url", "og:image"):
            if not og.get(key):
                failures.append(f"{url_path}  缺 {key}")
        if not twitter.get("twitter:card"):
            failures.append(f"{url_path}  缺 twitter:card")
        if og.get("og:image") and not og["og:image"].startswith(origin):
            failures.append(f"{url_path}  og:image 不是绝对地址：{og['og:image']}")
        if og.get("og:url") and canonicals and og["og:url"] != canonicals[0]:
            failures.append(f"{url_path}  og:url 与 canonical 不一致")

        blocks = LD_RE.findall(html)
        if not blocks:
            failures.append(f"{url_path}  没有 ld+json")
        for block in blocks:
            try:
                json.loads(block)
            except json.JSONDecodeError as error:
                failures.append(f"{url_path}  ld+json 解析失败：{error}")

    indexable = {p for p in pages if p != "/"} - noindex_pages

    # ---------- 互指 ----------
    for url_path, targets in alts_by_page.items():
        if url_path in noindex_pages:
            # 回退页是原文的副本：hreflang 集合必须与它的 canonical 完全一致，
            # 且不能把 canonical 列进来（它不在这个翻译组里）
            canonical_path = path_of(canonical_by_page.get(url_path, ""))
            canonical_alts = alts_by_page.get(canonical_path)
            if canonical_alts is None:
                failures.append(f"{url_path}  的 canonical（{canonical_path}）不在构建产物里")
            elif targets != canonical_alts:
                failures.append(
                    f"{url_path}  hreflang 集合与 canonical 不一致："
                    f"{sorted(targets)} ≠ {sorted(canonical_alts)}"
                )
            elif url_path in canonical_alts:
                failures.append(f"{url_path}  是 noindex 副本，不该出现在 canonical 的互指里")
            continue

        if url_path not in targets:
            failures.append(f"{url_path}  hreflang 没有引用自己")
        for target in targets:
            if target not in alts_by_page:
                continue
            if url_path not in alts_by_page[target]:
                failures.append(f"{url_path} → {target}  不是双向互指")

    # ---------- sitemap ----------
    sitemap_file = DIST / "sitemap.xml"
    sitemap_urls: dict[str, set[str]] = {}
    if not sitemap_file.exists():
        failures.append("缺少 dist/sitemap.xml")
    else:
        root = ET.fromstring(sitemap_file.read_text(encoding="utf-8"))
        for url in root.findall("sm:url", SM_NS):
            loc = url.find("sm:loc", SM_NS)
            if loc is None or not loc.text:
                failures.append("sitemap 里有条目缺 <loc>")
                continue
            loc_path = path_of(loc.text)
            if loc_path not in pages:
                failures.append(f"sitemap 指向不存在的页面：{loc.text}")
            links = url.findall("xhtml:link", XHTML_NS)
            if not links:
                failures.append(f"sitemap 条目没有语言互指：{loc.text}")
            sitemap_urls[loc_path] = {
                path_of(link.get("href", "")) for link in links if link.get("href")
            }

        for url_path in sorted(noindex_pages):
            if url_path in sitemap_urls:
                failures.append(f"{url_path}  是 noindex 的回退页，不该出现在 sitemap")

        for missing in sorted(indexable - set(sitemap_urls)):
            failures.append(f"sitemap 漏了页面：{missing}")
        for extra in sorted(set(sitemap_urls) - indexable):
            failures.append(f"sitemap 多了页面：{extra}")

        for url_path, alts in sitemap_urls.items():
            head_alts = alts_by_page.get(url_path)
            if head_alts is not None and alts != head_alts:
                failures.append(f"{url_path}  sitemap 的语言互指与 head 不一致")

    # ---------- robots.txt ----------
    robots_file = DIST / "robots.txt"
    if not robots_file.exists():
        failures.append("缺少 dist/robots.txt")
    else:
        text = robots_file.read_text(encoding="utf-8")
        if f"{origin}/sitemap.xml" not in text:
            failures.append("robots.txt 没有指向 sitemap.xml")

    # ---------- RSS ----------
    # 站点里有多少篇文章（内容系统接上之前是 0 —— 那时空 RSS 是对的）
    post_count = sum(1 for url in sitemap_urls if "/posts/" in url)
    for locale in ("zh", "en"):
        rss_file = DIST / locale / "rss.xml"
        if not rss_file.exists():
            failures.append(f"缺少 dist/{locale}/rss.xml")
            continue
        try:
            root = ET.fromstring(rss_file.read_text(encoding="utf-8"))
        except ET.ParseError as error:
            failures.append(f"{locale}/rss.xml 解析失败：{error}")
            continue
        items = root.findall("./channel/item")
        if not items and post_count:
            # 站点一篇文章都没有时（内容系统还没接上），空的 RSS 是对的
            failures.append(f"{locale}/rss.xml 里没有条目")
        for item in items:
            link = item.findtext("link")
            if not link:
                failures.append(f"{locale}/rss.xml 有条目缺 link")
                continue
            if path_of(link) not in pages:
                failures.append(f"{locale}/rss.xml 指向不存在的页面：{link}")

    # ---------- 结果 ----------
    print(f"  站点根地址 {origin}")
    print(f"  页面 {len(pages) - 1} 个（根路径重定向页不计）")
    print(f"  可收录 {len(indexable)} 个，noindex 回退页 {len(noindex_pages)} 个")
    print(f"  sitemap 条目 {len(sitemap_urls)} 条")

    if failures:
        print("\n失败：")
        for failure in failures:
            print(f"  ✗ {failure}")
        return 1

    print("  ✓ canonical / hreflang 双向互指都成立，回退页与 canonical 集合一致")
    print("  ✓ sitemap 与可收录页面集合完全一致，noindex 页已排除")
    print("  ✓ robots.txt 与各语言 RSS 正常")
    print("  ✓ OG / Twitter / 结构化数据齐全")
    return 0


if __name__ == "__main__":
    sys.exit(main())
