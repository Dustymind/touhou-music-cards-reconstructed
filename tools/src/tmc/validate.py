"""数据不变量校验（M1 验收的一部分）。

用法::

    uv run python -m tmc.validate          # 校验，失败返回 1
    uv run python -m tmc.validate --report # 额外写出 reports/validation-report.md
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import sys
import re
import tomllib
from pathlib import Path

from . import repo

EXTRAS = ("角色曲", "道中曲", "更多道中曲", "秘封曲")
KINDS = ("game", "fighting", "hifuu", "other")


class Problems:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.notes: list[str] = []

    def error(self, msg: str) -> None:
        self.errors.append(msg)

    def note(self, msg: str) -> None:
        self.notes.append(msg)

    @property
    def ok(self) -> bool:
        return not self.errors


def load_albums(p: Problems) -> dict[str, dict]:
    with open(repo.DATA / "albums.toml", "rb") as fh:
        data = tomllib.load(fh)
    albums = {}
    orders = collections.Counter()
    for entry in data.get("album", []):
        name = entry["name"]
        if name in albums:
            p.error(f"专辑重名：{name}")
        albums[name] = entry
        orders[entry["order"]] += 1
        if entry["kind"] not in KINDS:
            p.error(f"专辑 {name} 的 kind 非法：{entry['kind']}")
        if entry["kind"] == "hifuu" and name not in repo.HIFUU_ALBUMS:
            p.error(f"kind=hifuu 但不在秘封清单里：{name}")
    for order, n in orders.items():
        if n > 1:
            p.error(f"专辑 order 重复：{order}")
    for name in repo.HIFUU_ALBUMS:
        if name not in albums:
            p.error(f"缺少秘封专辑：{name}")
        elif albums[name]["kind"] != "hifuu":
            p.error(f"秘封专辑 kind 不是 hifuu：{name}")
    return albums


def load_characters(p: Problems) -> list[dict]:
    chars = []
    keys, names, orders = set(), set(), set()
    for path in sorted((repo.DATA / "characters").glob("*.toml")):
        with open(path, "rb") as fh:
            char = tomllib.load(fh)
        char["_path"] = path
        if char["key"] != path.stem:
            p.error(f"{path.name}: key 与文件名不一致（{char['key']}）")
        if char["key"] in keys:
            p.error(f"key 重复：{char['key']}")
        if char["name"] in names:
            p.error(f"角色名重复：{char['name']}")
        if char["order"] in orders:
            p.error(f"order 重复：{char['order']}")
        keys.add(char["key"]), names.add(char["name"]), orders.add(char["order"])
        if not char.get("card"):
            p.error(f"{char['key']}: card 为空")
        if not char.get("searchNames"):
            p.error(f"{char['key']}: searchNames 为空")
        if not char.get("music"):
            p.error(f"{char['key']}: music 为空")
        chars.append(char)
    return chars


def check_characters(chars: list[dict], albums: dict[str, dict], p: Problems):
    seen_pairs: dict[tuple[str, str], set[str]] = collections.defaultdict(set)
    referenced: set[tuple[str, str]] = set()
    entry_count = 0
    hifuu_entries = 0
    for char in chars:
        local: set[tuple[str, str]] = set()
        for album, title, extra in char["music"]:
            entry_count += 1
            if extra not in EXTRAS:
                p.error(f"{char['key']}: 附加信息非法「{extra}」（{album} / {title}）")
            if album not in albums:
                p.error(f"{char['key']}: 专辑未注册「{album}」")
                continue
            kind = albums[album]["kind"]
            is_hifuu = kind == "hifuu"
            if (extra == "秘封曲") != is_hifuu:
                p.error(f"{char['key']}: 秘封曲与专辑 kind 不符（{album} / {title} / {extra}）")
            if is_hifuu:
                hifuu_entries += 1
            if (album, title) in local:
                p.error(f"{char['key']}: 角色内重复曲目（{album} / {title}）")
            local.add((album, title))
            seen_pairs[(album, title)].add(char["key"])
            referenced.add((album, title))
    shared = {k: v for k, v in seen_pairs.items() if len(v) > 1}
    return {"entries": entry_count, "distinct_tracks": len(seen_pairs), "shared": shared,
            "referenced": referenced, "hifuu_entries": hifuu_entries}


def check_sources(referenced: set[tuple[str, str]], p: Problems):
    stats = {}
    for source_id in ("netease163", "cloudflare_r2", "thbwiki"):
        path = repo.DATA / "sources" / f"{source_id}.json"
        entries = json.loads(path.read_text(encoding="utf-8"))
        table = {(a, t): url for a, t, url in entries}
        if len(table) != len(entries):
            p.error(f"{source_id}: 存在重复的 (专辑,曲目) 键")
        urls = collections.Counter(url for _a, _t, url in entries)
        reused = {u: n for u, n in urls.items() if n > 1}
        if reused:
            p.note(f"{source_id}: {len(reused)} 个 URL 被多个曲目共用（需人工确认，见报告）")
        missing = sorted(referenced - set(table))
        for album, title in missing:
            p.error(f"{source_id}: 缺少被引用的曲目（{album} / {title}）")
        for album, _title, url in entries:
            if not url.startswith("http"):
                p.error(f"{source_id}: URL 形态异常 {url}")
        stats[source_id] = {"entries": len(entries), "reused_urls": len(reused), "missing": len(missing)}
    return stats


STAGE_LABEL = re.compile(r"^(?:第?(\d+)面|(最终)面|(Extra)面|(Phantasm)面)主题曲$")


def check_stage_attribution(chars: list[dict]) -> dict[str, list[str]]:
    """逐条核对「道中曲/更多道中曲」的面次归属（依据 THBWiki 作品页的 BOSS 表）。

    规则：该曲所属作品该面次的登场角色里必须出现本角色（E1：中 BOSS 与面 BOSS 同等）。
    `alias-gap` 表示面次角色看起来就是本角色、但双方中文名用字不同 —— 需要补别名而不是改数据。
    """
    from .roles import RoleIndex
    from .stages import StageCast

    index = RoleIndex.load()
    cast = StageCast.load()
    rows: dict[str, list[str]] = {}
    for char in chars:
        names = [n for n in char["searchNames"] if n]
        for album, title, extra in char["music"]:
            if extra not in ("道中曲", "更多道中曲"):
                continue
            work = next((w for k, _n, _kind, w, _o in repo.ALBUM_SEED
                         if k and _n == album and w), "")
            stage = next((next(g for g in m.groups() if g) for lab in index.labels(work, title)
                          if (m := STAGE_LABEL.match(lab))), "") if work else ""
            if not work or not stage:
                verdict, who = "no-label", "-"
            else:
                who_list = cast.who(work, stage)
                who = "、".join(sorted(set(who_list))) or "-"
                verdict = "verified" if cast.has(work, stage, names) else (
                    "alias-gap" if any(_loose(n, w) for n in names for w in who_list) else "REVIEW")
            rows[f"{char['key']}\t{album}\t{title}"] = [f"{extra}\t{stage or '-'}\t{who}\t{verdict}"]
    return rows


def _loose(a: str, b: str) -> bool:
    """只用于把"名字用字不同"与"角色不对"区分开：比较前两字。"""
    return len(a) >= 2 and len(b) >= 2 and a[:2] == b[:2]


def check_overrides(chars: list[dict], p: Problems) -> int:
    """人工裁定表里的每条都必须真的落在某个角色文件里，且值一致。"""
    from .roles import load_overrides

    table = load_overrides()
    seen: set[tuple[str, str]] = set()
    for char in chars:
        for album, title, extra in char["music"]:
            if (album, title) in table:
                seen.add((album, title))
                want, reason, source = table[(album, title)]
                if extra != want:
                    p.error(f"覆盖表与文件不一致：{album} / {title}（文件 {extra}，覆盖 {want}）")
                if not reason or not source:
                    p.error(f"覆盖表缺少依据/来源：{album} / {title}")
    for key in table:
        if key not in seen:
            p.error(f"覆盖表条目不在任何角色文件里：{key[0]} / {key[1]}")
    return len(table)


def check_pending(chars: list[dict], p: Problems):
    path = repo.ROOT / "reports" / "extra-pending.tsv"
    if not path.exists():
        p.error("缺少 reports/extra-pending.tsv")
        return 0
    rows = [line.split("\t") for line in path.read_text(encoding="utf-8").splitlines()[1:] if line]
    by_key = {c["key"]: c for c in chars}
    for key, album, title, value, reason in rows:
        char = by_key.get(key)
        if char is None:
            p.error(f"extra-pending 指向未知角色：{key}")
            continue
        hit = [e for e in char["music"] if e[0] == album and e[1] == title]
        if not hit:
            p.error(f"extra-pending 条目不在角色文件里：{key} / {album} / {title}")
        elif hit[0][2] != value:
            p.error(f"extra-pending 占位值不符：{key} / {title}（文件 {hit[0][2]}，报告 {value}）")
        if not reason:
            p.error(f"extra-pending 缺少原因：{key} / {title}")
    return len(rows)


def run() -> tuple["Problems", dict]:
    """跑全部不变量校验，返回 (问题集合, 统计)。供 CLI 与测试复用。"""
    p = Problems()
    albums = load_albums(p)
    chars = load_characters(p)
    char_stats = check_characters(chars, albums, p)
    source_stats = check_sources(char_stats["referenced"], p)
    pending = check_pending(chars, p)
    overrides = check_overrides(chars, p)
    stage_rows = check_stage_attribution(chars)
    digest = hashlib.sha256(
        json.dumps(sorted(char_stats["referenced"]), ensure_ascii=False).encode()).hexdigest()[:12]
    return p, {
        "albums": len(albums), "characters": len(chars), "pending": pending,
        "digest": digest, "sources": source_stats, "stage_rows": stage_rows,
        "overrides": overrides,
        **{k: v for k, v in char_stats.items() if k != "referenced"},
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--report", action="store_true", help="写出 reports/validation-report.md")
    args = ap.parse_args(argv)

    p, stats = run()
    char_stats, source_stats, pending = stats, stats["sources"], stats["pending"]

    stage_rows = stats["stage_rows"]
    out = repo.ROOT / "reports" / "stage-check.tsv"
    out.write_text("角色key\t专辑\t曲目\t类别\t面次\t该面登场角色\t结论\n" +
                   "\n".join(f"{k}\t{v[0]}" for k, v in sorted(stage_rows.items())) + "\n",
                   encoding="utf-8")
    counts = collections.Counter(v[0].rsplit("\t", 1)[-1] for v in stage_rows.values())
    for verdict in ("REVIEW", "alias-gap", "no-label"):
        if counts.get(verdict):
            p.note(f"道中曲面次核对：{counts[verdict]} 条 {verdict}（见 reports/stage-check.tsv）")
    # 把用到的面次参照表固化成数据，便于离线复核
    from .stages import StageCast

    meta = repo.DATA / "meta"
    meta.mkdir(parents=True, exist_ok=True)
    lines = ["作品\t面次\t类型\t曲目\t登场角色"]
    for work, entries in StageCast.load()._rows.items():  # noqa: SLF001 - 只读导出
        for row in entries:
            lines.append(f"{work}\t{row['stage']}\t{row['kind']}\t{row['title']}\t{row['cast']}")
    (meta / "stage-cast.tsv").write_text("\n".join(lines) + "\n", encoding="utf-8")

    lines = ["# 校验报告", "",
             f"- 角色：{stats['characters']}", f"- 专辑：{stats['albums']}",
             f"- 曲目条目：{char_stats['entries']}",
             f"- 去重曲目：{char_stats['distinct_tracks']}",
             f"- 秘封曲条目：{char_stats['hifuu_entries']}",
             f"- 跨角色共用曲目：{len(char_stats['shared'])}",
             f"- 待判定（占位）：{pending}", f"- 人工裁定条目：{stats['overrides']}", "",
             "## 源表", ""]
    for source_id, stat in source_stats.items():
        lines.append(f"- {source_id}: {stat['entries']} 条，缺引用 {stat['missing']}，"
                     f"URL 复用 {stat['reused_urls']} 组")
    if char_stats["shared"]:
        lines += ["", "## 跨角色共用曲目（附加信息可不同）", ""]
        for (album, title), keys in sorted(char_stats["shared"].items()):
            lines.append(f"- {album} / {title}: {', '.join(sorted(keys))}")
    if p.notes:
        lines += ["", "## 提示", ""] + [f"- {n}" for n in p.notes]
    if p.errors:
        lines += ["", f"## 错误（{len(p.errors)}）", ""] + [f"- {e}" for e in p.errors]
    text = "\n".join(lines) + "\n"
    if args.report:
        (repo.ROOT / "reports").mkdir(exist_ok=True)
        (repo.ROOT / "reports" / "validation-report.md").write_text(text, encoding="utf-8")
    print(text if p.errors else text.split("## 源表")[0].strip())

    if p.errors:
        print(f"\n❌ 校验失败：{len(p.errors)} 个错误", file=sys.stderr)
        return 1
    print(f"✅ 校验通过（引用集合指纹 {stats['digest']}）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
