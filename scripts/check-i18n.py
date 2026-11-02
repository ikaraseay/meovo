#!/usr/bin/env python3
"""
i18n 检查：语言包完整性 + 硬编码界面文案扫描。

用法：
    python3 scripts/check-i18n.py

两个检查：
  1. 语言包每条都得有 zh 和 en
     - zh 不能为空
     - en 必须存在（可以显式写 '' 表示有意留空）
  2. 用户可见的界面文案不许硬编码中文
     - 扫 frontend/components/、frontend/layouts/、frontend/pages/ 下的 .astro 与 .ts
     - 排除注释、<style> 块、console 输出
     - 语言包文件本身不扫（那里本来就该有中文）

退出码：有检查失败 → 1；全部通过 → 0
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DICT_FILE = ROOT / "frontend/i18n/ui.ts"
# 站点常用文字 —— 单独的配置文件（config/site.json），形状跟词典一样
SITE_CONFIG = ROOT / "config/site.json"
SCAN_DIRS = ["frontend/components", "frontend/layouts", "frontend/pages"]

CJK = re.compile(r"[一-鿿㐀-䶿]")
# 语言包条目：'key': { zh: '...', en: '...' }
# 语言包条目：'key': { zh: '...', en: '...' } —— 单行与多行写法都算
# （多行写法里 en 后面常带一个逗号，正则要允许它）
DICT_ENTRY = re.compile(
    r"'(?P<key>[\w.]+)':\s*\{\s*zh:\s*'(?P<zh>[^']*)'\s*,\s*en:\s*'(?P<en>[^']*)'\s*,?\s*\}"
)
# 字符串字面量
STRING_LITERAL = re.compile(r"'([^'\\\n]*)'|\"([^\"\\\n]*)\"|`([^`\\]*)`")
# HTML 标签
HTML_TAG = re.compile(r"<[^>]*>")
# HTML 属性值
HTML_ATTR = re.compile(r"=\s*[\"']([^\"']*)[\"']")


def strip_comments(text: str) -> str:
    """去掉 HTML 注释、JS 行注释与块注释，保留行结构"""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"//.*$", "", text, flags=re.M)
    return text


def strip_style_blocks(text: str) -> str:
    """去掉 <style> ... </style>（样式里的中文注释不算界面文案）"""
    return re.sub(r"<style\b.*?</style>", "", text, flags=re.S | re.I)


def check_dictionary() -> list[str]:
    """检查语言包每条都有 zh 和 en"""
    failures: list[str] = []

    if not DICT_FILE.exists():
        return [f"找不到语言包 {DICT_FILE.relative_to(ROOT)}"]

    source = DICT_FILE.read_text(encoding="utf-8")
    entries = list(DICT_ENTRY.finditer(source))

    if not entries:
        failures.append(f"{DICT_FILE.relative_to(ROOT)} 里一条词条都没解析到")

    for match in entries:
        key = match.group("key")
        zh = match.group("zh")
        en = match.group("en")
        if not zh.strip():
            failures.append(f"词条 {key} 的 zh 是空的")
        if en is None or not en.strip():
            # 显式 en: '' 表示有意留空，但本项目每条都要有英文
            failures.append(f"词条 {key} 的 en 是空的")

    for key, zh, en in site_config_entries():
        if not zh.strip():
            failures.append(f"config/site.json 里的 {key} 的 zh 是空的")
        if not en.strip():
            failures.append(f"config/site.json 里的 {key} 的 en 是空的")

    return failures


def site_config_entries() -> list[tuple[str, str, str]]:
    """config/site.json 里的词条 —— 站点常用文字，形状跟词典一样"""
    if not SITE_CONFIG.exists():
        return []
    try:
        data = json.loads(SITE_CONFIG.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        return [("<解析失败>", str(error), "")]
    if not isinstance(data, dict):
        return []
    entries = []
    for key, value in data.items():
        if not isinstance(value, dict):
            continue
        entries.append((key, str(value.get("zh", "")), str(value.get("en", ""))))
    return entries


def collect_used_keys(text: str) -> set[str]:
    """收集 t(locale, 'xxx.key') 里用到的 key —— 动态拼的（'tag.' + slug）不算"""
    keys = set()
    for match in re.finditer(r"\bt\(\s*[A-Za-z_$][\w$.]*\s*,", text):
        # 从逗号后扫到配对的右括号
        depth = 1
        index = match.end()
        segment = []
        while index < len(text) and depth > 0:
            char = text[index]
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0:
                    break
            segment.append(char)
            index += 1
        for key in re.findall(r"['\"]([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)+)['\"]", "".join(segment)):
            keys.add(key)
    return keys


def check_used_keys() -> list[str]:
    """检查代码里用到的 key 都在词典里 —— 缺了就静默显示成 key 本身"""
    if not DICT_FILE.exists():
        return []

    source = DICT_FILE.read_text(encoding="utf-8")
    known = {match.group("key") for match in DICT_ENTRY.finditer(source)}
    known |= {key for key, _, _ in site_config_entries()}

    failures = []
    for path in scan_files():
        text = strip_style_blocks(strip_comments(path.read_text(encoding="utf-8")))
        for key in sorted(collect_used_keys(text)):
            if key not in known:
                failures.append(f"{path.relative_to(ROOT)} 用了词典里没有的 key：{key}")
    return failures


def scan_files() -> list[Path]:
    """要扫的组件 / 布局 / 页面文件"""
    paths = []
    for rel_dir in SCAN_DIRS:
        directory = ROOT / rel_dir
        if not directory.exists():
            continue
        for path in sorted(directory.rglob("*")):
            if path.suffix not in (".astro", ".ts") or not path.is_file():
                continue
            if path.resolve() == DICT_FILE.resolve():
                continue
            paths.append(path)
    return paths


def check_hardcoded() -> list[str]:
    """扫描组件/布局/页面里的硬编码中文"""
    failures: list[str] = []

    for path in scan_files():
            source = path.read_text(encoding="utf-8")
            text = strip_style_blocks(strip_comments(source))

            for lineno, line in enumerate(text.splitlines(), start=1):
                if not CJK.search(line):
                    continue
                # 忽略 console 输出（不显示给用户）
                if "console." in line:
                    continue

                values: list[str] = []

                # 字符串字面量
                for match in STRING_LITERAL.finditer(line):
                    value = next((g for g in match.groups() if g), "")
                    if CJK.search(value):
                        values.append(value)

                # HTML 属性值
                without_tags = HTML_TAG.sub("", line)
                for match in HTML_ATTR.finditer(without_tags):
                    if CJK.search(match.group(1)):
                        values.append(match.group(1))

                # HTML 文本节点（只在有标签的行上判断，避免和字符串字面量重复报）
                if "<" in line:
                    text_node = without_tags.strip()
                    if text_node and CJK.search(text_node):
                        values.append(text_node)

                for value in dict.fromkeys(values):
                    failures.append(
                        f"{path.relative_to(ROOT)}:{lineno}  硬编码中文 → {value.strip()[:40]}"
                    )

    return failures


def main() -> int:
    print("i18n 检查")

    failures = check_dictionary()
    dict_entries = len(DICT_ENTRY.findall(DICT_FILE.read_text(encoding="utf-8"))) if DICT_FILE.exists() else 0
    dict_entries += len(site_config_entries())
    print(f"  语言包 {dict_entries} 条词条")

    hardcoded = check_hardcoded()
    failures.extend(hardcoded)

    missing_keys = check_used_keys()
    failures.extend(missing_keys)

    if failures:
        print("\n失败：")
        for failure in failures:
            print(f"  ✗ {failure}")
        return 1

    print("  ✓ 语言包完整，每条都有 zh 和 en")
    print("  ✓ 组件/布局/页面里没有硬编码的界面文案")
    print("  ✓ 代码里用到的 key 都在词典里")
    return 0


if __name__ == "__main__":
    sys.exit(main())
