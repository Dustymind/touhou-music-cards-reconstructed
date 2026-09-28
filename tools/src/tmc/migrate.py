"""把上游 v3 的 JSON 数据迁移成本项目的数据格式。

产出：

* ``data/characters/<slug>.toml``  一角色一文件（真相源）
* ``data/albums.toml``             专辑注册表
* ``data/sources/*.json``          三份音乐源表（数组形式）
* ``docs/reports/migration-report.md``  迁移报告
* ``docs/reports/extra-pending.tsv``    未能由 THBWiki 标签判定的条目（M2 处理）

用法::

    uv run python -m tmc.migrate
"""
from __future__ import annotations

import argparse
import collections
import json
import re
import unicodedata
from dataclasses import dataclass, field

from . import repo
from .roles import RoleIndex, classify, load_overrides

#: 无法判定时的占位值（同时写入 extra-pending.tsv，M2 必须清零）
PROVISIONAL_EXTRA = "角色曲"

#: 人工补充的搜索别名 `data/meta/character-aliases.tsv`（key → [别名, …]）
ALIASES_FILE = "character-aliases.tsv"

#: 人工补配的曲目 `data/meta/character-tracks.tsv`（key → [(专辑, 曲目, 附加信息, 依据, 来源), …]）
TRACKS_FILE = "character-tracks.tsv"


def load_track_additions() -> dict[str, list[tuple[str, str, str, str, str]]]:
    path = repo.DATA / "meta" / TRACKS_FILE
    table: dict[str, list[tuple[str, str, str, str, str]]] = {}
    if not path.exists():
        return table
    for line in path.read_text(encoding="utf-8").splitlines()[1:]:
        if not line.strip():
            continue
        cells = (line.split("\t") + [""] * 5)[:6]
        key, album, title, extra, reason, source = cells
        if key and album and title and extra:
            table.setdefault(key, []).append((album, title, extra, reason, source))
    return table


def load_aliases() -> dict[str, list[str]]:
    path = repo.DATA / "meta" / ALIASES_FILE
    table: dict[str, list[str]] = {}
    if not path.exists():
        return table
    for line in path.read_text(encoding="utf-8").splitlines()[1:]:
        if not line.strip():
            continue
        cells = line.split("\t")
        if len(cells) >= 2 and cells[1]:
            table.setdefault(cells[0], []).append(cells[1])
    return table


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _toml_str(value: str) -> str:
    return f'"{_escape(value)}"'


def choose_slug(name: str, search_names: list[str], taken: set[str]) -> str:
    """从 searchNames 里挑一个 ASCII 罗马字做稳定 key。

    规则：候选 = 全 ASCII 的别名；优先"含空格且非全小写"的最后一个（英文名优于训令式罗马字，
    例如 `Alice Margatroid` 优于 `Arisu Magatoroido`），否则取第一个候选。
    """
    ascii_names = [s for s in search_names if s and s.isascii()]
    spaced = [s for s in ascii_names if " " in s and s != s.lower()]
    raw = (spaced[-1] if spaced else (ascii_names[0] if ascii_names else name))
    slug = unicodedata.normalize("NFKC", raw).lower()
    slug = "".join(ch if ch.isalnum() else "-" for ch in slug).strip("-")
    slug = "-".join(part for part in slug.split("-") if part) or "character"
    candidate, n = slug, 2
    while candidate in taken:
        candidate, n = f"{slug}-{n}", n + 1
    taken.add(candidate)
    return candidate


def debut_work_of(name: str, tags: list[str], albums: set[str]) -> str | None:
    """首发作品：PC-98 覆写表优先，其次 tags 里最早的作品。"""
    if name in repo.PC98_DEBUT:
        code = repo.PC98_DEBUT[name]
        work = {"th01": "东方灵异传", "th03": "东方梦时空", "th05": "东方怪绮谈"}.get(code, "")
        return work or None
    works = [repo.TAG_WORK[t] for t in tags if t in repo.TAG_WORK]
    works = [w for w in works if w]
    if not works:
        return None
    return min(works, key=lambda w: repo.WORK_ORDER.get(w, 99))


@dataclass
class Migration:
    characters: int = 0
    entries: int = 0
    pending: list[tuple[str, str, str, str, str]] = field(default_factory=list)
    reasons: collections.Counter = field(default_factory=collections.Counter)
    source_stats: dict[str, dict[str, int]] = field(default_factory=dict)


def _load_upstream() -> dict:
    with open(repo.UPSTREAM_PUBLIC / "character.json", encoding="utf-8") as fh:
        return json.load(fh)


def migrate_characters(index: RoleIndex, report: Migration,
                       overrides: dict | None = None,
                       aliases: dict[str, list[str]] | None = None,
                       additions: dict[str, list[tuple[str, str, str, str, str]]] | None = None) -> None:
    aliases = aliases or {}
    additions = additions or {}
    upstream = _load_upstream()
    taken: set[str] = set()
    for order, (name, cfg) in enumerate(upstream.items(), start=1):
        cards = cfg["card"] if isinstance(cfg["card"], list) else [cfg["card"]]
        musics = cfg["music"] if isinstance(cfg["music"], list) else [cfg["music"]]
        tags = cfg.get("tags", []) or []
        albums = {repo.split_track_path(p)[0] for p in musics}
        debut = debut_work_of(name, tags, albums)
        slug = choose_slug(name, cfg["searchNames"], taken)
        search_names = list(cfg["searchNames"])
        for extra in aliases.get(slug, []):
            if extra not in search_names:
                search_names.append(extra)
                report.reasons["alias-added"] += 1

        lines = [
            f"key = {_toml_str(slug)}",
            f"name = {_toml_str(name)}",
            f"order = {order}",
            "card = [" + ", ".join(_toml_str(c) for c in cards) + "]",
            "searchNames = [" + ", ".join(_toml_str(s) for s in search_names) + "]",
            "",
            "music = [",
        ]
        seen: set[tuple[str, str]] = set()
        for path in musics:
            album, title = repo.split_track_path(path)
            key = (unicodedata.normalize("NFC", album), unicodedata.normalize("NFC", title))
            if key in seen:                        # 上游存在同一角色内重复条目
                report.reasons["duplicate-dropped"] += 1
                continue
            seen.add(key)
            verdict = classify(index, key[0], key[1], debut, overrides=overrides)
            extra = verdict.extra or PROVISIONAL_EXTRA
            report.reasons[verdict.rule] += 1
            if verdict.extra is None:
                report.pending.append((slug, key[0], key[1], extra, verdict.evidence))
            lines.append(f"  [{_toml_str(key[0])}, {_toml_str(key[1])}, {_toml_str(extra)}],")
            report.entries += 1
        for album, title, extra, reason, source in additions.get(slug, []):
            key = (unicodedata.normalize("NFC", album), unicodedata.normalize("NFC", title))
            if key in seen:
                report.reasons["addition-skipped-duplicate"] += 1
                continue
            seen.add(key)
            lines.append(f"  [{_toml_str(key[0])}, {_toml_str(key[1])}, {_toml_str(extra)}],")
            report.entries += 1
            report.reasons["R-ADD"] += 1
        lines += ["]", ""]
        (repo.DATA / "characters" / f"{slug}.toml").write_text("\n".join(lines), encoding="utf-8")
        report.characters += 1


def migrate_albums() -> None:
    lines = ["# 专辑注册表：name 是角色文件与源表里引用的字符串，key 是持久化用的稳定键。",
             "# kind ∈ game | fighting | hifuu | other；order 只决定界面展示顺序。", ""]
    for key, name, kind, work, order in repo.ALBUM_SEED:
        lines += ["[[album]]",
                  f"key = {_toml_str(key)}",
                  f"name = {_toml_str(name)}",
                  f"kind = {_toml_str(kind)}",
                  f"pack = \"originals\"",
                  f"order = {order}"]
        if work:
            lines.append(f"work = {_toml_str(work)}")
        lines.append("")
    (repo.DATA / "albums.toml").write_text("\n".join(lines), encoding="utf-8")


#: 迁移用到的三张表 —— **历史**清单，故意不跟注册表走（`LEGACY_SOURCES` 指的是上游旧文件名）；
#: 运行时的镜像清单在 `build.mirror_source_ids()`（review R7④）
SOURCES = ("netease163", "cloudflare_r2", "thbwiki")

#: 源表 URL 的规范化重写（实测依据见注释）。
URL_REWRITES = {
    # 上游三张源表里网易云全是 http://。实测 https://music.163.com/song/media/outer/url?id=…
    # 返回 302，落点为 CDN；把落点换成 https 亦返回 206 + audio/mpeg，故 https 页面下可用。
    "http://music.163.com/": "https://music.163.com/",
}

#: 手工核对过的 URL 修正（上游源表里的已知错误；依据写在注释里）
URL_FIXES = {
    # 上游把 TH19 的《獣の知性》指向了 TH18 的 th18_18.mp3（TH18 的 プレイヤーズスコア 才是它），
    # THBWiki 兽王园 Music Room 里《獣の知性》的音频是 th19_01.mp3。
    ("東方獣王園 ～ Unfinished Dream of All Living Ghost", "獣の知性"):
        "https://upload.thwiki.cc/a/ae/th19_01.mp3",
}
LEGACY_SOURCES = {"netease163": "sources_163.json", "cloudflare_r2": "sources_cloudflare_r2.json",
                  "thbwiki": "sources_thbwiki.json"}


def migrate_sources(referenced: set[tuple[str, str]], report: Migration) -> None:
    # 等价键 → 角色数据里的"规范拼写"：源表若用了旧写法（如 U+FF5E 与 U+301C 的波浪线），
    # 在这里统一回角色数据的写法，从根上消灭"两张表差一个字符"的失配。
    canonical = {repo.lookup_key(a + "\u0000" + t): (a, t) for a, t in referenced}
    referenced_lookup = set(canonical)
    for source_id in SOURCES:
        with open(repo.UPSTREAM_PUBLIC / LEGACY_SOURCES[source_id], encoding="utf-8") as fh:
            raw: dict[str, str] = json.load(fh)
        groups: dict[tuple[str, str], list[tuple[str, str]]] = collections.defaultdict(list)
        for path, url in raw.items():
            album, title = repo.split_track_path(path)
            groups[(unicodedata.normalize("NFC", album), unicodedata.normalize("NFC", title))].append((path, url))

        # 一次"等价键"折叠：波浪线/全角差异造成的改名残留会在这一步暴露
        equivalents: dict[str, list[tuple[tuple[str, str], str]]] = collections.defaultdict(list)
        for key, items in groups.items():
            equivalents[repo.lookup_key(key[0] + "\u0000" + key[1])].append((key, items[0][1]))

        entries, dropped_dup, dropped_stale, url_conflict = [], 0, 0, 0
        for lookup, group in equivalents.items():
            if len(group) > 1:
                dropped_stale += len(group) - 1
            album, title = canonical.get(lookup, group[0][0])
            url = group[0][1]
            for old, new in URL_REWRITES.items():
                if url.startswith(old):
                    url = new + url[len(old):]
            url = URL_FIXES.get((album, title), url)
            if len({g[1] for g in group}) > 1:
                url_conflict += 1
            entries.append([album, title, url])

        order = {name: o for _k, name, _kind, _w, o in repo.ALBUM_SEED}
        entries.sort(key=lambda e: (order.get(e[0], 999), e[0], e[1]))
        payload = json.dumps(entries, ensure_ascii=False, indent=1) + "\n"
        (repo.DATA / "sources" / f"{source_id}.json").write_text(payload, encoding="utf-8")
        report.source_stats[source_id] = {
            "upstream": len(raw), "written": len(entries),
            "merged_duplicate_keys": dropped_dup, "dropped_stale_variants": dropped_stale,
            "url_conflicts": url_conflict,
        }



def _character_names() -> set[str]:
    """全部角色的名字与别名（用于判断标签是否真的绑定了角色）。"""
    names: set[str] = set()
    for path in (repo.DATA / "characters").glob("*.toml"):
        import tomllib as _tomllib

        with open(path, "rb") as fh:
            char = _tomllib.load(fh)
        names.add(char["name"])
        names.update(char["searchNames"])
    return {name for name in names if len(name) >= 2}


def write_unowned(index, referenced: set[tuple[str, str]], report: Migration) -> None:
    """把"源表里有、没有任何角色引用"的曲目登记成清单。

    分三类，便于以后决定要不要补配：
    - `系统曲`：THBWiki 标签不含角色（标题/Ending/Staff/剧情/系统曲）；
    - `含角色标签`：标签里有角色或面次，但我们的角色档案没引用 —— **待补配候选**；
    - `无标签`：秘封 CD / OST 里没有 Music Room 条目的曲目。
    """
    from .roles import STAGE_RE

    known_names = _character_names()

    union: dict[tuple[str, str], str] = {}
    for source_id in SOURCES:
        with open(repo.DATA / "sources" / f"{source_id}.json", encoding="utf-8") as fh:
            for album, title, _url in json.load(fh):
                union.setdefault((album, title), source_id)

    rows = []
    counts = collections.Counter()
    for (album, title) in sorted(union):
        if (album, title) in referenced:
            continue
        work = next((w for _k, name, _kind, w, _o in repo.ALBUM_SEED if name == album and w), "")
        labels = index.labels(work, title) if work else []
        def binds_character(label: str) -> bool:
            # 只有标签里真的出现某个角色名（或 VS/面BOSS 形式）才算"绑定了角色"
            if re.search(r"面BOSS|VS[^场]*场景用曲", label):
                return True
            return any(name in label for name in known_names)

        stage_labels = [label for label in labels if STAGE_RE.match(label)]
        character_labels = [label for label in labels if not STAGE_RE.match(label) and binds_character(label)]
        if labels and all(not binds_character(label) and not STAGE_RE.match(label) for label in labels):
            kind, note = "系统曲", "；".join(labels)
        elif stage_labels or character_labels:
            kind, note = "含角色标签", "；".join(stage_labels + character_labels)
        elif labels:
            kind, note = "其它标签", "；".join(labels)
        else:
            kind, note = "无标签", "该专辑没有 Music Room 条目（秘封 CD / 格斗碟未使用曲等）"
        counts[kind] += 1
        rows.append((album, title, kind, note, union[(album, title)]))

    meta = repo.DATA / "meta"
    meta.mkdir(parents=True, exist_ok=True)
    with open(meta / "unowned-tracks.tsv", "w", encoding="utf-8") as fh:
        fh.write("专辑\t曲目\t分类\t标签/说明\t来源表\n")
        for row in rows:
            fh.write("\t".join(row) + "\n")
    report.reasons["unowned-total"] = len(rows)
    for kind, count in counts.most_common():
        report.reasons[f"unowned-{kind}"] = count


def write_reports(report: Migration) -> None:
    reports = repo.REPORTS
    reports.mkdir(exist_ok=True)
    with open(reports / "extra-pending.tsv", "w", encoding="utf-8") as fh:
        fh.write("角色key\t专辑\t曲目\t占位值\t原因\n")
        for row in sorted(report.pending):
            fh.write("\t".join(row) + "\n")
    lines = ["# M1 迁移报告", "",
             f"- 角色文件：{report.characters}", f"- 曲目条目：{report.entries}",
             f"- 待判定条目：{len(report.pending)}", "",
             "## 判定规则命中分布", ""]
    for rule, count in sorted(report.reasons.items()):
        lines.append(f"- {rule}: {count}")
    lines += ["", "## 未归属曲目（data/meta/unowned-tracks.tsv）", ""]
    for key, count in sorted(report.reasons.items()):
        if key.startswith("unowned-"):
            lines.append(f"- {key.removeprefix('unowned-')}: {count}")
    lines += ["", "## 源表迁移", ""]
    for source_id, stat in report.source_stats.items():
        lines.append(f"- {source_id}: 上游 {stat['upstream']} → 写出 {stat['written']}"
                     f"（删除等价改名残留 {stat['dropped_stale_variants']} 条；"
                     f"同一曲目多 URL 的组 {stat['url_conflicts']} 个）")
    (reports / "migration-report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    argparse.ArgumentParser(description=__doc__).parse_args(argv)
    (repo.DATA / "characters").mkdir(parents=True, exist_ok=True)
    (repo.DATA / "sources").mkdir(parents=True, exist_ok=True)

    index = RoleIndex.load()
    overrides = load_overrides()
    aliases = load_aliases()
    additions = load_track_additions()
    report = Migration()
    referenced: set[tuple[str, str]] = set()
    upstream = _load_upstream()
    for cfg in upstream.values():
        for path in (cfg["music"] if isinstance(cfg["music"], list) else [cfg["music"]]):
            album, title = repo.split_track_path(path)
            referenced.add((unicodedata.normalize("NFC", album), unicodedata.normalize("NFC", title)))

    # 人工补配的曲目也算"被引用"，否则它们会同时出现在未归属清单里
    for rows in additions.values():
        for album, title, *_rest in rows:
            referenced.add((unicodedata.normalize("NFC", album), unicodedata.normalize("NFC", title)))

    migrate_albums()
    migrate_characters(index, report, overrides, aliases, additions)
    migrate_sources(referenced, report)
    write_unowned(index, referenced, report)
    write_reports(report)
    print(f"角色 {report.characters} / 条目 {report.entries} / 待判定 {len(report.pending)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
