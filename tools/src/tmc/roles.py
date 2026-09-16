"""THBWiki Music Room 标签索引与 `附加信息` 判定（规则见 docs/rules-classification-v1.md）。"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass

from . import repo

#: 纯"面主题曲"标签 → 道中 BGM
STAGE_RE = re.compile(r"^(第?\d+面主题曲|最终面主题曲|Extra面主题曲|Phantasm面主题曲)$")

#: 完全不含角色的系统标签 → 不归属
SYSTEM_RE = re.compile(
    r"^(标题画面|标题画面曲|标题画面主题曲|对话曲\d*|对话用曲\d*|原对话曲|Ending|结尾画面主题曲|"
    r"Staff画面|Staff画面曲|Staff画面主题曲|剧情曲.*|场景用曲|故事模式战斗曲|角色选择|"
    r"曲名不詳\d*|曲名不明\d*)$"
)

#: 含角色（相机场景）的标签 → 该角色的本人曲
CHARACTER_RE = re.compile(r"角色曲|的主题曲|主题曲|场景用曲|VS|故事模式战斗曲.+|面BOSS|关卡BOSS")


@dataclass(frozen=True)
class Verdict:
    extra: str | None
    rule: str
    evidence: str


class RoleIndex:
    """`作品页 → {查表键 → {标签}}`。"""

    def __init__(self, rows: dict[str, list[list[str]]]) -> None:
        self._index: dict[str, dict[str, set[str]]] = {}
        for work, items in rows.items():
            table: dict[str, set[str]] = {}
            for label, title in items:
                table.setdefault(repo.lookup_key(title), set()).add(label)
            self._index[work] = table

    @classmethod
    def load(cls, path=None) -> "RoleIndex":
        path = path or (repo.THBWIKI_DIR / "rows.json")
        if not path.exists():
            raise FileNotFoundError(
                f"缺少 THBWiki 标签快照 {path}；先跑 `uv run python -m tmc.fetch_roles` 生成")
        with open(path, encoding="utf-8") as fh:
            return cls(json.load(fh))

    def labels(self, work: str, title: str) -> list[str]:
        """先精确查表；查不到时退回"前缀命中且唯一"的宽松匹配。"""
        table = self._index.get(work, {})
        key = repo.lookup_key(title)
        if key in table:
            return sorted(table[key])
        hits = {t: labs for t, labs in table.items() if t.startswith(key) and key}
        if len(hits) == 1:
            return sorted(next(iter(hits.values())))
        return []


def classify(index: RoleIndex, album: str, title: str, debut_work: str | None,
             *, known_pending: bool = False) -> Verdict:
    """按 R0–R6 判定单个 `(专辑, 曲目)` 的 `附加信息`。"""
    if album in repo.HIFUU_ALBUMS:
        return Verdict("秘封曲", "R0", "秘封倶楽部 CD")

    work = next((w for k, _n, _kind, w, _o in repo.ALBUM_SEED if k and _n == album and w), None)
    if work is None:
        work = _album_work(album)
    if not work:
        return Verdict(None, "R4", "该专辑不对应任何 THBWiki 作品页")
    if known_pending and work == "东方锦上京":
        return Verdict(None, "R?", "TH20 尚无 Music Room 页，待正式发售后复核")

    labels = index.labels(work, title)
    if not labels:
        return Verdict(None, "R?", f"{work} 的作品页未收录此曲")

    # 同一曲在同一作品里可能有多个标签（WAV/MIDI 版、剧情曲 + 角色曲……）：
    # 先看"面主题曲"和"角色标签"，最后才回落到系统标签。
    for label in labels:
        if STAGE_RE.match(label):
            same = debut_work == work
            return Verdict("道中曲" if same else "更多道中曲", "R2" if same else "R3",
                           f"标签「{label}」；首发作品={debut_work or '未知'}")
    for label in labels:
        if CHARACTER_RE.search(label) and not SYSTEM_RE.match(label):
            return Verdict("角色曲", "R1/R5", f"标签「{label}」")
    for label in labels:
        if SYSTEM_RE.match(label):
            return Verdict(None, "R4", f"系统曲标签：{label}")
    return Verdict(None, "R?", f"标签无法判定：{labels}")


def _album_work(album: str) -> str:
    for key, name, _kind, work, _order in repo.ALBUM_SEED:
        if name == album:
            return work
    return ""


def build_role_index_from_mirror(mirror_dir=None) -> dict[str, list[list[str]]]:
    """解析 THBWiki-Markdown 的 `<作品>-Music.md`，产出 rows.json 的内容。"""
    from .fetch_roles import parse_music_page  # 延迟导入，避免循环

    mirror = mirror_dir or repo.THBWIKI_DIR
    rows: dict[str, list[list[str]]] = {}
    for path in sorted(mirror.glob("*.md")):
        parsed = parse_music_page(path.read_text(encoding="utf-8", errors="replace"))
        if parsed:
            rows[path.stem] = parsed
    return rows
