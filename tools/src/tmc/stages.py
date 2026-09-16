"""作品「面次 → 登场角色」参照表（判定 R2/R3 的面次归属是否成立）。

数据源：THBWiki 作品页的 BOSS 表（每行 = 面次 + 道中/BOSS 曲名 + 该面登场的角色）。
抓取与解析都可复现：``uv run python -m tmc.stages``。
"""
from __future__ import annotations

import argparse
import html
import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request

from . import repo

BASE = "https://raw.githubusercontent.com/Delsin-Yu/THBWiki-Markdown/main/sources"
GAMES_DIR = repo.THBWIKI_DIR / "games"
CACHE = repo.THBWIKI_DIR / "game_stages.json"

#: 与 tmc.fetch_roles 相同的作品列表（只保留有 BOSS 表的正作）
WORKS = (
    "东方红魔乡", "东方妖妖梦", "东方永夜抄", "东方花映塚", "东方风神录", "东方地灵殿", "东方星莲船",
    "东方神灵庙", "东方辉针城", "东方绀珠传", "东方天空璋", "东方鬼形兽", "东方虹龙洞", "东方兽王园",
    "东方锦上京",
)
UA = "Mozilla/5.0 (compatible; tmc-data/0.1; +https://github.com/)"

CN_STAGE = {"一": "1", "二": "2", "三": "3", "四": "4", "五": "5", "六": "6",
            "七": "7", "八": "8", "九": "9", "十": "10",
            "EX": "Extra", "PH": "Phantasm", "最终": "最终", "Extra": "Extra", "Phantasm": "Phantasm"}


def stage_key(label: str) -> str:
    """`"四面道中"` / `"EX面BOSS"` / `"最终面主题曲"` → 统一的面次键。"""
    m = re.match(r"^(EX|PH|Extra|Phantasm|最终|第?[0-9]+|[一二三四五六七八九十])(?:面|关卡)?", label)
    if not m:
        return ""
    token = m.group(1)
    if token.isdigit():
        return token
    token = CN_STAGE.get(token, token)
    return token.replace("第", "")


def _links(row: str) -> list[str]:
    """兼容 Markdown 镜像的相对链接与线上页的绝对链接。"""
    hrefs = re.findall(r'href="([^"]+)"', row)
    out = []
    for href in hrefs:
        href = href.split("#")[0]
        if href.startswith("./") and href.endswith(".md"):
            out.append(html.unescape(href[2:-3]))
        elif href.startswith("/") and not href.startswith("/index.php"):
            out.append(urllib.parse.unquote(href[1:]))
    return out


def parse_game_page(text: str) -> list[dict]:
    idx = text.find("### BOSS")
    if idx < 0:
        anchor = re.search(r'id="BOSS"', text)
        idx = anchor.start() if anchor else -1
    section = text[idx:idx + 40000] if idx >= 0 else text
    rows: list[dict] = []
    for row in re.split(r"<tr[ >]", section)[1:]:
        label = re.search(r"<b>([^<]{1,24})</b>", row)
        title = re.search(r'<i><a href="([^"]+)"[^>]*>([^<]*)</a></i>', row)
        if not (label and title):
            continue
        text_ = html.unescape(title.group(2))
        links = _links(row)
        head = links.index(next((x for x in links if x.endswith(text_) or text_ in x), links[0])) \
            if links else 0
        tail = links[head + 1:]
        cast = [x for x in tail
                if not x.startswith(("文件-", "文件:", "游戏对话", "关卡", "Music", "Template"))]
        rows.append({
            "stage": html.unescape(label.group(1)).strip(),
            "kind": "midboss" if "道中" in label.group(1) else "boss",
            "title": text_,
            "cast": cast[0] if cast else "",
        })
    return rows


PUNCT = "・·．.　 、，,（）()～~ー-～"


def _fold(name: str) -> str:
    return "".join(ch for ch in name if ch not in PUNCT)


def _close(a: str, b: str) -> bool:
    """容忍 1 个字的差异：上游中文别名与 THBWiki 用字常有出入
    （火焰猫磷/火焰猫燐、爱丽丝·玛格特罗依德/玛格特洛依德、莉莉白/莉莉霍瓦特…）。"""
    a, b = _fold(a), _fold(b)
    if a == b or a in b or b in a:
        return True
    if abs(len(a) - len(b)) > 1 or len(a) < 3:
        return False
    if len(a) == len(b):
        return sum(x != y for x, y in zip(a, b)) <= 1
    short, long = (a, b) if len(a) < len(b) else (b, a)
    for skip in range(len(long)):
        if long[:skip] + long[skip + 1:] == short:
            return True
    return False


class StageCast:
    """`作品 → [(面次键, kind, 曲名, 登场角色)]`。"""

    def __init__(self, rows: dict[str, list[dict]]) -> None:
        self._rows = rows

    @classmethod
    def load(cls, path: pathlib.Path | None = None) -> "StageCast":
        path = path or CACHE
        if not path.exists():
            raise FileNotFoundError(f"缺少面次参照表 {path}；先跑 `uv run python -m tmc.stages`")
        return cls(json.loads(path.read_text(encoding="utf-8")))

    def who(self, work: str, stage: str, kind: str = "midboss") -> list[str]:
        """该作品该面次的登场角色名（THBWiki 中文名）。"""
        out = []
        for row in self._rows.get(work, []):
            if stage_key(row["stage"]) == stage and row.get("kind") == kind and row["cast"]:
                out.append(row["cast"])
        return out

    def resolve(self, work: str, stage: str) -> list[str]:
        """把 `最终` 之类的相对面次解析成该作品里实际存在的面次键。"""
        keys = {stage_key(r["stage"]) for r in self._rows.get(work, [])}
        keys.discard("")
        if stage in keys or stage not in ("最终",):
            return [stage]
        numeric = sorted((k for k in keys if k.isdigit()), key=int)
        return [numeric[-1]] if numeric else [stage]

    def has(self, work: str, stage: str, names: list[str]) -> bool:
        """角色的任一中/日文名是否出现在该面次的登场角色里。"""
        wanted = set(self.resolve(work, stage))
        for row in self._rows.get(work, []):
            if stage_key(row["stage"]) not in wanted or not row["cast"]:
                continue
            for name in names:
                if name and _close(name, row["cast"]):
                    return True
        return False


def fetch() -> int:
    GAMES_DIR.mkdir(parents=True, exist_ok=True)
    rows: dict[str, list[dict]] = {}
    for work in WORKS:
        path = GAMES_DIR / f"{work}.md"
        if not path.exists():
            req = urllib.request.Request(f"{BASE}/{urllib.parse.quote(f'{work}.md')}",
                                        headers={"User-Agent": UA})
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
                    path.write_text(resp.read().decode("utf-8", errors="replace"), encoding="utf-8")
            except Exception:  # noqa: BLE001 - 镜像没有就回落到线上页
                req = urllib.request.Request(f"https://thbwiki.cc/{urllib.parse.quote(work)}",
                                            headers={"User-Agent": UA})
                try:
                    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
                        path.write_text(resp.read().decode("utf-8", errors="replace"), encoding="utf-8")
                except Exception as exc:  # noqa: BLE001
                    print(f"  跳过 {work}: {exc}", file=sys.stderr)
                    continue
        parsed = parse_game_page(path.read_text(encoding="utf-8", errors="replace"))
        if parsed:
            rows[work] = parsed
    CACHE.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"作品 {len(rows)} 部 / 面次行 {sum(len(v) for v in rows.values())} → "
          f"{CACHE.relative_to(repo.ROOT)}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--parse", action="store_true", help="只用本地已抓取的作品页重新解析")
    args = ap.parse_args(argv)
    if args.parse:
        rows = {}
        for path in sorted(GAMES_DIR.glob("*.md")):
            if path.name.startswith("tmp_"):
                continue
            parsed = parse_game_page(path.read_text(encoding="utf-8", errors="replace"))
            if parsed:
                rows[path.stem] = parsed
        CACHE.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"解析 {len(rows)} 部作品 → {CACHE.relative_to(repo.ROOT)}")
        return 0
    return fetch()


if __name__ == "__main__":
    raise SystemExit(main())
