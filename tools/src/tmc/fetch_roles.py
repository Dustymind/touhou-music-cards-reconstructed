"""抓取并解析 THBWiki Music Room 页（分类规则的权威来源）。

用法::

    uv run python -m tmc.fetch_roles            # 抓取 21 部作品 → .ref/thbwiki/*.md + rows.json
    uv run python -m tmc.fetch_roles --parse    # 只用本地已抓取的 md 重新生成 rows.json
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import urllib.parse
import urllib.request

from . import repo

BASE = "https://raw.githubusercontent.com/Delsin-Yu/THBWiki-Markdown/main/sources"

WORKS = (
    "东方红魔乡", "东方妖妖梦", "东方永夜抄", "东方花映塚", "东方风神录", "东方地灵殿", "东方星莲船",
    "东方神灵庙", "东方辉针城", "东方绀珠传", "东方天空璋", "东方鬼形兽", "东方虹龙洞", "东方兽王园",
    "东方锦上京", "东方萃梦想", "东方绯想天", "东方非想天则", "东方心绮楼", "东方深秘录", "东方凭依华",
    "东方刚欲异闻",
)

ROW_RE = re.compile(
    r'<td id="[^"]*" class="tt-category"[^>]*><div class="poem">(.*?)</div></td>'
    r'<td class="tt-titleja"[^>]*><div class="poem">(.*?)</div></td>',
    re.S,
)


def _clean(fragment: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).replace("\u3000", " ").strip()


def parse_music_page(text: str) -> list[list[str]]:
    """Music Room 页 → `[[标签, 日文曲名], …]`（同一曲只保留一次）。"""
    out: list[list[str]] = []
    seen: set[tuple[str, str]] = set()
    for label, title in ROW_RE.findall(text):
        pair = (_clean(label), _clean(title))
        if pair[1] and pair not in seen:
            seen.add(pair)
            out.append(list(pair))
    return out


def fetch(work: str) -> str | None:
    url = f"{BASE}/{urllib.parse.quote(f'{work}-Music.md')}"
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:  # noqa: S310
            return resp.read().decode("utf-8", errors="replace")
    except Exception as exc:  # noqa: BLE001 - CLI 工具，报错即可
        print(f"  跳过 {work}: {exc}", file=sys.stderr)
        return None


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--parse", action="store_true", help="只解析本地已抓取的 md")
    args = ap.parse_args(argv)

    repo.THBWIKI_DIR.mkdir(parents=True, exist_ok=True)
    rows: dict[str, list[list[str]]] = {}
    for work in WORKS:
        path = repo.THBWIKI_DIR / f"{work}.md"
        if not args.parse:
            text = fetch(work)
            if text:
                path.write_text(text, encoding="utf-8")
        if path.exists():
            parsed = parse_music_page(path.read_text(encoding="utf-8", errors="replace"))
            if parsed:
                rows[work] = parsed
    out = repo.THBWIKI_DIR / "rows.json"
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(len(v) for v in rows.values())
    print(f"作品 {len(rows)} 部 / 标签 {total} 条 → {out.relative_to(repo.ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
