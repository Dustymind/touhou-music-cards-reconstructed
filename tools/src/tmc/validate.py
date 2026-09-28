"""数据不变量校验（M1 验收的一部分）。

用法::

    uv run python -m tmc.validate          # 校验，失败返回 1
    uv run python -m tmc.validate --report # 额外写出 docs/reports/validation-report.md
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import sys
import re
import tomllib

from . import build as build_mod
from . import packs as packs_mod
from . import repo
from . import roster as roster_mod

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
    with open(repo.DATA / "originals.toml", "rb") as fh:
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
    with open(repo.DATA / "originals.toml", "rb") as fh:
        key_to_name = {e["key"]: e["name"] for e in tomllib.load(fh)["album"]}
    chars = []
    keys, names, orders = set(), set(), set()
    for path in sorted((repo.DATA / "characters").glob("*.toml")):
        with open(path, "rb") as fh:
            char = tomllib.load(fh)
        char["_path"] = path
        char["card"] = list(char.get("card_name", []))
        char["searchNames"] = list(char.get("search_names", []))
        char["music"] = [{"id": t["id"], "album": key_to_name[t["album_key"]], "title": t["title"],
                          "extra": t["extra"]} for t in char.get("track", [])]
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


def _triples(music: list[dict]) -> list[tuple[str, str, str]]:
    """S2 起 music 条目是 dict（id/album/title/extra）；旧检查按三元组写，这里只做投影。"""
    return [(e["album"], e["title"], e["extra"]) for e in music]


def check_characters(chars: list[dict], albums: dict[str, dict], p: Problems):
    seen_pairs: dict[tuple[str, str], set[str]] = collections.defaultdict(set)
    referenced: set[tuple[str, str]] = set()
    entry_count = 0
    hifuu_entries = 0
    for char in chars:
        local: set[tuple[str, str]] = set()
        for album, title, extra, *_rest in _triples(char["music"]):
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
    # S2：TrackIndex 按曲id 去重 ⇒ 同一个 id 被多个角色引用时，extra 必须一致
    by_id: dict[str, tuple[str, str, str]] = {}
    for char in chars:
        for entry in char["music"]:
            prev = by_id.setdefault(entry["id"], (entry["album"], entry["title"], entry["extra"]))
            if prev[2] != entry["extra"]:
                p.error(f"曲id {entry['id']} 被多处引用但附加信息不一致："
                        f"{prev[0]} / {prev[1]}（{prev[2]}）vs {char['key']}（{entry['extra']}）")
    return {"entries": entry_count, "distinct_tracks": len(seen_pairs), "shared": shared,
            "referenced": referenced, "hifuu_entries": hifuu_entries}


def check_card_sets(p: Problems) -> int:
    """`data/card-sets.toml`：id 唯一、目录非空、origins 都是 https、`mode` 合法。

    三类图集的"素材从哪来"互不相同，检查也要分开（D153）：
    * 普通远程图集：必须有 origins；
    * `local_only`：素材由用户自己放进 `public/<dir>/`，**不能**有 origins；
    * `source_only`：素材 = **源**给的绝对 URL（音MAD 封面）⇒ **没有目录、没有 origin**，
      并且必须显式写 `mode`（不写就会在原曲模式里也列出来，而那边根本没有封面）。
    """
    import tomllib as _tomllib

    with open(repo.DATA / "card-sets.toml", "rb") as fh:
        data = _tomllib.load(fh)
    ids = set()
    for entry in data.get("card_set", []):
        if entry["id"] in ids:
            p.error(f"图集 id 重复：{entry['id']}")
        ids.add(entry["id"])
        origins = entry.get("origins", [])
        for origin in origins:
            if not origin.startswith("https://"):
                p.error(f"图集 {entry['id']} 的 origin 不是 https：{origin}")
        if entry.get("source_only"):
            # 源封面：文件本身就是绝对 URL ⇒ 没有目录、没有 origin；必须限定模式
            if entry.get("dir"):
                p.error(f"图集 {entry['id']} 标了 source_only 却又写了 dir（{entry['dir']!r}）")
            if origins:
                p.error(f"图集 {entry['id']} 标了 source_only 却还写了 origins")
            if entry.get("local_only"):
                p.error(f"图集 {entry['id']} 同时标了 source_only 与 local_only")
            if entry.get("mode") not in build_mod.MODES:
                p.error(f"图集 {entry['id']} 是 source_only，必须写 mode"
                        f"（{' / '.join(build_mod.MODES)}）")
        elif not entry.get("dir"):
            p.error(f"图集 {entry['id']} 缺 dir")
        if entry.get("local_only"):
            # 本地图集：素材由用户自己放进 public/<dir>/（不随仓库分发），所以没有远程 origin
            if origins:
                p.error(f"图集 {entry['id']} 标了 local_only 却还写了 origins")
        elif not entry.get("source_only") and not origins:
            p.error(f"图集 {entry['id']} 没有 origin（本地图集请显式写 local_only = true）")
        if entry.get("mode") is not None and entry["mode"] not in build_mod.MODES:
            p.error(f"图集 {entry['id']} 的 mode 非法：{entry['mode']!r}")
    default = data.get("default")
    if default not in ids:
        p.error(f"图集默认值非法：{default}")
    return len(ids)


def check_source_table_urls(p: Problems) -> int:
    """**生成物**里的 ``tableUrl`` 形态检查（D131）：返回检查过的源数。

    守的是前端真正读到的那份 JSON（不是注册表），于是两处注册表都被覆盖 ——
    音MAD 那份在数据仓库里，只看主仓库的 TOML 会漏掉它。
    """
    checked = 0
    for mode in build_mod.MODES:
        path = build_mod.dataset_dir(mode) / "sources.json"
        if not path.exists():
            if mode == "otomads":
                p.note("音MAD 生成物不存在（submodule 未初始化）：跳过 otomads 源表地址检查")
            else:
                p.error(f"缺少生成物：{repo.shown(path)}（跑 `pnpm data:build`）")
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        for source in payload.get("sources", []):
            checked += 1
            problem = build_mod.source_table_url_problem(source.get("kind"), source.get("tableUrl"))
            if problem is not None:
                p.error(f"[{mode}] 音源 {source.get('id')} 的 tableUrl 不合法"
                        f"（{source.get('tableUrl')}）：{problem}")
    p.note(f"生成物源表地址形态：检查 {checked} 条（相对路径或 http(s) 绝对 URL，D131）")
    return checked


def check_source_registry(p: Problems) -> dict:
    """两个模式的音源注册表：id/order 唯一、远程源的表文件存在，外加契约 §5 的五条不变量。

    1. 每个模式**至少有一个** `enabled = true` 的源（否则那个模式一个地址都解析不出来）；
    2. `otomads` 必须含**恰好一个** `kind = "local"` 的源，且默认启用（音MAD 的地址只能来自本地 manifest）；
    3. `originals` **不得**含 `kind = "local"`（本地曲库只服务音MAD）；
    4. `custom`（模式 3）必须含**恰好一个** `kind = "custom"` 的源，且默认启用；别的模式不许有它；
    5. 三份注册表的 `id` 不得冲突；
    6. `table_url` 只能是相对路径或 http(s) 绝对 URL（D131）——
       根绝对路径（前导 `/`）在子目录部署下必 404，那个模式就一首歌都放不出来；
       `kind = "custom"` 的空串是**合法**的（地址由使用者填，见 `build.source_table_url_problem`）。
    """
    by_mode: dict[str, list[dict]] = {}
    for mode in build_mod.MODES:
        if mode == "originals":
            # S1c 起原曲没有单独注册表：注册信息在各源文件头部
            by_mode[mode] = build_mod.load_registry("originals")
            continue
        path = repo.find_source_registry(mode)
        if path is None:
            # 音MAD 的注册表在数据 submodule 里：没初始化就整个模式跳过（可选，见 D128）
            if mode == "otomads":
                p.note("音MAD 数据 submodule 未初始化：跳过 otomads 音源注册表检查")
            else:
                p.error(f"缺少音源注册表：data/sources/{mode}.toml")
                by_mode[mode] = []
            continue
        by_mode[mode] = build_mod.load_registry(mode)

    for mode, entries in by_mode.items():
        ids, orders = set(), set()
        for entry in entries:
            if entry["id"] in ids:
                p.error(f"[{mode}] 音源 id 重复：{entry['id']}")
            ids.add(entry["id"])
            if entry["order"] in orders:
                p.error(f"[{mode}] 音源 order 重复：{entry['order']}")
            orders.add(entry["order"])
            # 地址形态（D131）：根绝对路径在子目录部署下必 404。模式 3 的空串是合法形态
            problem = build_mod.source_table_url_problem(entry["kind"], entry["table_url"])
            if problem is not None:
                p.error(f"[{mode}] 音源 {entry['id']} 的 table_url 不合法"
                        f"（{entry['table_url']}）：{problem}")
            if entry["kind"] == "remote":
                if not (repo.DATA / "sources" / f"{entry['id']}.toml").exists():
                    p.error(f"[{mode}] 音源 {entry['id']} 的表文件不存在：data/sources/{entry['id']}.toml")
            elif entry["kind"] not in ("local", "custom"):
                p.error(f"[{mode}] 音源 {entry['id']} 的 kind 非法：{entry['kind']}")
        if not any(entry["enabled"] for entry in entries):
            p.error(f"[{mode}] 一个默认启用的音源都没有（该模式解析不出任何地址）")
        locals_ = [entry for entry in entries if entry["kind"] == "local"]
        if mode == "otomads":
            if len(locals_) != 1:
                p.error(f"[otomads] 必须恰好一个 kind=local 的源，实际 {len(locals_)} 个")
            elif not locals_[0]["enabled"]:
                p.error(f"[otomads] 本地曲库源必须默认启用（{locals_[0]['id']}）")
        elif locals_:
            p.error(f"[{mode}] 不该有 kind=local 的源：{[e['id'] for e in locals_]}")
        custom_ = [entry for entry in entries if entry["kind"] == "custom"]
        if mode == "custom":
            if len(custom_) != 1:
                p.error(f"[custom] 必须恰好一个 kind=custom 的源，实际 {len(custom_)} 个")
            elif not custom_[0]["enabled"]:
                p.error(f"[custom] 自定义源必须默认启用（{custom_[0]['id']}）")
        elif custom_:
            p.error(f"[{mode}] 不该有 kind=custom 的源：{[e['id'] for e in custom_]}")

    overlap = {entry["id"] for entry in by_mode.get("originals", [])} & \
        {entry["id"] for entry in by_mode.get("otomads", [])}
    for source_id in sorted(overlap):
        p.error(f"两个模式的音源 id 冲突：{source_id}")

    return {
        "total": sum(len(entries) for entries in by_mode.values()),
        "by_mode": {mode: len(entries) for mode, entries in by_mode.items()},
    }


def _read_mirror(source_id: str) -> list[list[str]] | None:
    """读一张镜像源表（``data/sources/<id>.toml`` 的 ``[[track]]``）；**文件不存在**返回 None。

    缺表这件事由 `check_source_registry()` 报（它比这里更懂注册表）。这里不再抛：
    镜像 id 是派生出来的（`build.mirror_source_ids`），注册表里写错一个 `table_url`
    不该让整套校验以 traceback 收场。
    """
    path = repo.DATA / "sources" / f"{source_id}.toml"
    if not path.exists():
        return None
    with open(path, "rb") as fh:
        data = tomllib.load(fh)
    return [[t["album"], t["title"], t["url"]] for t in data.get("track", [])]


def check_sources(referenced: set[tuple[str, str]], p: Problems):
    stats = {}
    for source_id in build_mod.mirror_source_ids():
        entries = _read_mirror(source_id)
        if entries is None:
            continue
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
        for album, title, extra, *_rest in _triples(char["music"]):
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
        for album, title, extra, *_rest in _triples(char["music"]):
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


def check_alias_tables(chars: list[dict], p: Problems) -> dict[str, int]:
    """`character-aliases.tsv` 的别名必须真的写进了角色文件；合并条目表的成员名必须能在别名里找到。"""
    meta = repo.DATA / "meta"
    by_key = {c["key"]: c for c in chars}
    added = 0
    alias_file = meta / "character-aliases.tsv"
    if alias_file.exists():
        for line in alias_file.read_text(encoding="utf-8").splitlines()[1:]:
            if not line.strip():
                continue
            key, alias, *_src = (line.split("\t") + ["", ""])
            char = by_key.get(key)
            if char is None:
                p.error(f"别名表指向未知角色：{key}")
                continue
            if alias not in char["searchNames"]:
                p.error(f"别名未落进角色文件：{key} / {alias}")
            else:
                added += 1

    composites = 0
    comp_file = meta / "composite-characters.tsv"
    if comp_file.exists():
        for line in comp_file.read_text(encoding="utf-8").splitlines()[1:]:
            if not line.strip():
                continue
            cells = line.split("\t")
            key, members = cells[0], cells[2]
            char = by_key.get(key)
            if char is None:
                p.error(f"合并条目表指向未知角色：{key}")
                continue
            composites += 1
            if len(char["card"]) < 2:
                p.error(f"{key}: 合并条目应有多个卡面，实际 {char['card']}")
            for member in members.split(" / "):
                member = member.strip()
                if member and not any(member in n or n in member for n in char["searchNames"]):
                    p.error(f"{key}: 成员「{member}」不在 searchNames 里")
    return {"aliases": added, "composites": composites}


def check_track_additions(chars: list[dict], p: Problems) -> int:
    """`data/meta/character-tracks.tsv`：每条都要真的在角色文件里，且 (专辑,曲目) 三表齐备。"""
    path = repo.DATA / "meta" / "character-tracks.tsv"
    if not path.exists():
        return 0
    tables = {}
    for source_id in build_mod.mirror_source_ids():
        entries = _read_mirror(source_id)
        if entries is None:
            continue
        tables[source_id] = {(a, t) for a, t, _u in entries}
    by_key = {c["key"]: c for c in chars}
    count = 0
    for line in path.read_text(encoding="utf-8").splitlines()[1:]:
        if not line.strip():
            continue
        key, album, title, extra, reason, source = (line.split("\t") + [""] * 6)[:6]
        count += 1
        char = by_key.get(key)
        if char is None:
            p.error(f"补配表指向未知角色：{key}")
            continue
        hit = [e for e in char["music"] if e["album"] == album and e["title"] == title]
        if not hit:
            p.error(f"补配曲目没落进角色文件：{key} / {album} / {title}")
        elif hit[0]["extra"] != extra:
            p.error(f"补配曲目的附加信息不符：{key} / {title}（文件 {hit[0]["extra"]}，表 {extra}）")
        if not reason or not source:
            p.error(f"补配表缺依据/来源：{key} / {title}")
        for source_id, table in tables.items():
            if (album, title) not in table:
                p.error(f"补配曲目在 {source_id} 里不存在：{album} / {title}")
    return count


def check_title_uniqueness(chars: list[dict], p: Problems) -> dict[str, object]:
    """同名 ≠ 同曲：确认"曲目身份必须带专辑"这条前提在数据里成立。

    - **不**把"同一 (专辑,曲目) 被多个角色引用"当错误：那是同一首曲子被多个角色共用（合法）。
    - 跨专辑的同名曲名只做统计（它们是**不同的曲子**，任何地方都不允许按曲名合并）。
    - 额外报告"去掉曲目序号就会在同一专辑内撞名"的专辑 —— 这正是 `曲目` 保留 `NN. ` 的理由。
    """
    import re as _re

    pairs: dict[tuple[str, str], set[str]] = {}
    by_album: dict[str, set[str]] = {}
    for char in chars:
        for album, title, _extra, *_rest in _triples(char["music"]):
            pairs.setdefault((album, title), set()).add(char["key"])
            by_album.setdefault(album, set()).add(title)

    shared = {pair: keys for pair, keys in pairs.items() if len(keys) > 1}
    per_title: dict[str, set[str]] = {}
    for album, title in pairs:
        per_title.setdefault(title, set()).add(album)
    cross_album = {t: albums for t, albums in per_title.items() if len(albums) > 1}

    # 依据来自**源表全集**（不只是被引用的那部分）：同名同专辑的两首曲子只有靠序号区分
    all_titles: dict[str, set[str]] = {}
    for source_id in build_mod.mirror_source_ids():
        for album, title, _url in _read_mirror(source_id) or []:
            all_titles.setdefault(album, set()).add(title)

    numbered: dict[str, list[str]] = {}
    for album, titles in all_titles.items():
        stripped: dict[str, list[str]] = {}
        for title in titles:
            stripped.setdefault(_re.sub(r"^\s*\d+\.\s*", "", title), []).append(title)
        collisions = {k: sorted(v) for k, v in stripped.items() if len(v) > 1}
        if collisions:
            numbered[album] = [f"{k} ← {' / '.join(v)}" for k, v in sorted(collisions.items())]

    return {
        "pairs": len(pairs),
        "shared_pairs": len(shared),
        "same_title_across_albums": len(cross_album),
        "same_title_examples": sorted(cross_album)[:3],
        "number_prefix_required": numbered,
    }


def check_pending(chars: list[dict], p: Problems):
    path = repo.REPORTS / "extra-pending.tsv"
    if not path.exists():
        p.error("缺少 docs/reports/extra-pending.tsv")
        return 0
    rows = [line.split("\t") for line in path.read_text(encoding="utf-8").splitlines()[1:] if line]
    by_key = {c["key"]: c for c in chars}
    for key, album, title, value, reason in rows:
        char = by_key.get(key)
        if char is None:
            p.error(f"extra-pending 指向未知角色：{key}")
            continue
        hit = [e for e in char["music"] if e["album"] == album and e["title"] == title]
        if not hit:
            p.error(f"extra-pending 条目不在角色文件里：{key} / {album} / {title}")
        elif hit[0]["extra"] != value:
            p.error(f"extra-pending 占位值不符：{key} / {title}（文件 {hit[0]["extra"]}，报告 {value}）")
        if not reason:
            p.error(f"extra-pending 缺少原因：{key} / {title}")
    return len(rows)

def check_track_covers(covers: dict, problems: "Problems") -> None:
    """源封面（`covers`，D153/D167）：每条曲目的 `cover` 必须是一条 https 直链。

    逐档表那种写法（D164）已经取消：一个链接画所有画幅，裁切由前端做。
    """
    for key, values in sorted(covers.items()):
        for index, cover in enumerate(values, start=1):
            if not isinstance(cover, str) or not cover.startswith("https://"):
                problems.error(f"音MAD 封面不是一条 https 直链：{key} 第 {index} 首（{cover!r}）")


def check_datasets(chars: list[dict], pack_tracks: list[dict], pack_albums: list[dict],
                   pack_cards: dict[str, list[str]],
                   pack_covers: dict[str, list[str | dict[str, str]]],
                   albums: dict[str, dict], p: "Problems") -> dict:
    """每模式数据集（契约 `docs/otomads-separation-v1.md` §2/§3）。

    查三件事：① 每份数据集**只含本模式的曲目**；② 各自的 `(角色, 专辑, 曲目)` 不重复、专辑已注册、
    附加信息合法；③ **跨模式身份一致** —— 同一个角色 key 的 `name`/`order`/`searchNames` 必须一样
    （否则界面上会出现"同一个角色两个名字"，契约 §5 S1）。

    **卡面是这条规则的例外**：音MAD 侧可以在曲包角色文件里用 `card = [...]` 覆盖自己的卡面
    （写法同 `data/characters/*.toml`）；只有**没覆盖**的角色才要求与共享身份一致。
    **源封面（`cover`，D153）同样只在音MAD 那份里有**，所以它不参与"身份一致"，
    但要检查"真源的 cover 真的进了生成物"（同 `card` 的那条）。
    """
    pack_names = {entry["name"] for entry in pack_albums}
    datasets = {mode: build_mod.build_characters(mode, chars, pack_tracks, pack_cards,
                                                 pack_covers)["characters"]
                for mode in build_mod.MODES}
    stats: dict = {}
    for mode, entries in datasets.items():
        seen: set[tuple[str, str, str]] = set()
        count = 0
        for char in entries:
            for album, title, extra, *_rest in _triples(char["music"]):
                count += 1
                where = f"{char['key']} / {album} / {title}"
                if extra not in EXTRAS:
                    p.error(f"[{mode}] 附加信息非法「{extra}」（{where}）")
                if album not in albums:
                    p.error(f"[{mode}] 专辑未注册「{album}」（{where}）")
                if (album in pack_names) != (mode == "otomads"):
                    p.error(f"[{mode}] 曲目不属于本模式（{where}）")
                key = (char["key"], album, title)
                if key in seen:
                    p.error(f"[{mode}] 曲目重复：{where}")
                seen.add(key)
        stats[mode] = {
            "characters": len(entries), "entries": count,
            "distinctTracks": len({e["id"] for c in entries for e in c["music"]}),
        }
    # 跨模式身份/卡面的比较**只在原曲与音MAD 之间**做：模式 3 的自带数据集恒为空（0 角色，
    # 卡名/卡面都是使用者自己的），它没有"共享身份"这回事 —— 不是漏了它。
    by_mode = {mode: {c["key"]: c for c in entries} for mode, entries in datasets.items()}
    for key in sorted(set(by_mode["originals"]) & set(by_mode["otomads"])):
        left, right = by_mode["originals"][key], by_mode["otomads"][key]
        for field in ("name", "order", "searchNames"):
            if left[field] != right[field]:
                p.error(f"跨模式身份不一致：{key} 的 {field}（{left[field]!r} vs {right[field]!r}）")
        # 卡面：覆盖过的角色本来就该不同，只有**没覆盖**的才要求一致
        if key in pack_cards:
            if right["card"] != list(pack_cards[key]):
                p.error(f"音MAD 卡面覆盖没生效：{key}（{right['card']!r} vs {pack_cards[key]!r}）")
        elif left["card"] != right["card"]:
            p.error(f"跨模式卡面不一致（未在曲包里覆盖）：{key}")
        # 源封面（D153/D167）：只在 otomads 那份里有，检查"真源的 cover 真的进了生成物"
        # （两边都是一条链接的字符串数组，直接比即可）
        if key in pack_covers:
            if right.get("covers") != list(pack_covers[key]):
                p.error(f"音MAD 封面没生效：{key}（{right.get('covers')!r} vs {pack_covers[key]!r}）")
        elif "covers" in right:
            p.error(f"音MAD 生成物里多出了源码里没有的 covers：{key}")
    for key in sorted(pack_covers):
        if key not in by_mode["originals"]:
            p.error(f"曲包里的封面指向未知角色：{key}")
        if key not in by_mode["otomads"]:
            p.error(f"曲包里的封面指向没有音MAD 曲目的角色：{key}")
        cover = pack_covers[key]
        if not cover or not all(isinstance(item, str) and item.startswith("https://") for item in cover):
            p.error(f"曲包里的封面非法（{key}，必须是 https 直链的列表，一条一个封面）：{cover!r}")
        entry = by_mode["otomads"].get(key)
        if entry is not None and len(cover) != len(entry["music"]):
            p.error(f"曲包里的封面数与曲目数不等（{key}：{len(cover)} vs {len(entry['music'])}）"
                    f"—— 一首一封面，顺序一一对应")
    for key in sorted(pack_cards):
        if key not in by_mode["originals"]:
            p.error(f"曲包里的卡面覆盖指向未知角色：{key}")
        face = pack_cards[key]
        if not face or not all(isinstance(item, str) and item for item in face):
            p.error(f"曲包里的卡面覆盖非法（{key}）：{face!r}")
    # 并集（两份数据集按构造互斥：曲包专辑只进 otomads）；模式 3 恒为空 ⇒ 并集与它无关
    stats["union"] = {
        "entries": stats["originals"]["entries"] + stats["otomads"]["entries"],
        "distinctTracks": stats["originals"]["distinctTracks"] + stats["otomads"]["distinctTracks"],
    }
    return stats


def check_packs(packs: list[dict], albums: list[dict], tracks: list[dict],
                chars: list[dict], p: "Problems") -> dict:
    """曲包自身的完整性：id/专辑/角色/重复/附加信息。"""
    ids = [pack["id"] for pack in packs]
    for pack_id in sorted({i for i in ids if ids.count(i) > 1}):
        p.error(f"曲包 id 重复：{pack_id}")
    album_names = {album["name"] for album in albums}
    for pack in packs:
        if pack["kind"] not in packs_mod.PACK_KINDS:
            p.error(f"曲包 kind 非法：{pack['id']} → {pack['kind']}")
    char_keys = {char["key"] for char in chars}
    seen: set[tuple[str, str]] = set()
    sources: dict[str, str] = {}
    for track in tracks:
        pack_id = track["pack"]
        if pack_id not in ids:
            p.error(f"曲包曲目引用了未注册的曲包：{track['character']} / {track['title']}")
        if track["album"] not in album_names:
            p.error(f"曲包专辑未注册：{track['album']}（{track['character']} / {track['title']}）")
        elif track["album"] not in {a["name"] for a in albums if a["pack"] == pack_id}:
            p.error(f"曲包专辑的 pack 字段与曲包不符：{track['album']} → {pack_id}")
        if track["character"] not in char_keys:
            p.error(f"曲包曲目的角色不存在：{track['character']}")
        if track["extra"] not in EXTRAS:
            p.error(f"曲包曲目附加信息非法：{track['extra']}")
        where = f"{track['character']} / {track['title']}"
        # 音频键（source / start_time / stop_time）：契约见 docs/packs-audio-v1.md
        try:
            packs_mod.trim_seconds(track)
        except ValueError as error:
            p.error(f"曲包曲目裁剪区间非法（{where}）：{error}")
        source = track.get("source")
        if source:
            if not source.lower().startswith(("http://", "https://")):
                p.error(f"曲包曲目 source 必须是 http(s) 链接（{where}）：{source!r}")
            elif source in sources:
                p.note(f"两条曲目共用同一个 source（{where} 与 {sources[source]}）—— "
                       f"抓取时原件只下一份、成品用硬链接")
            else:
                sources[source] = where
        key = (track["character"], track["album"], track["title"])
        if key in seen:
            p.error(f"曲包曲目重复：{track['character']} / {track['album']} / {track['title']}")
        seen.add(key)
    # `albums` 就是**曲包自带的**那些专辑（run() 传的是 pack_albums）：
    # 它们的 `pack` 字段默认就是自己的曲包 id，写错成别的才是问题
    for album in albums:
        if album["pack"] not in ids and album["pack"] != "originals":
            p.error(f"专辑引用了未注册的曲包：{album['name']} → {album['pack']}")
    return {"packs": len(packs), "albums": len(albums), "tracks": len(tracks),
            "with_source": sum(1 for track in tracks if track.get("source")),
            "trimmed": sum(1 for track in tracks if track.get("start_time") or track.get("stop_time"))}


def check_roster(p: "Problems") -> int:
    """数据仓库的角色清单（`data/otomads/characters.toml`）必须与主仓库真源一致（D130）。

    submodule 未初始化时给 note 跳过（音MAD 数据在开发时可选，见 D128）。
    """
    if not roster_mod.ROSTER.exists():
        p.note("音MAD 数据 submodule 未初始化：跳过角色清单检查")
        return 0
    for problem in roster_mod.diff():
        p.error(f"[roster] {problem}")
    return len(roster_mod.read_roster())


def run() -> tuple["Problems", dict]:
    """跑全部不变量校验，返回 (问题集合, 统计)。供 CLI 与测试复用。"""
    p = Problems()
    pack_list, pack_albums, pack_tracks, pack_cards, pack_covers = packs_mod.load_packs()
    if not packs_mod.available():
        p.note("曲包真源 submodule 未初始化（data/otomads）：跳过曲包相关校验，音MAD 数据集按空处理")
    roster_count = check_roster(p)
    albums = load_albums(p)
    for entry in pack_albums:
        if entry["name"] in albums:
            p.error(f"曲包专辑与 originals.toml 重名：{entry['name']}")
        albums[entry["name"]] = entry
    chars = load_characters(p)
    pack_album_names = {entry["name"] for entry in pack_albums}
    pack_stats = check_packs(pack_list, pack_albums, pack_tracks, chars, p)
    # 每模式数据集（含跨模式身份一致）；下面整套检查都跑在**原曲数据集**上 ——
    # 它们是关于 THBWiki 派生数据（角色/别名/裁定表/面次）的，曲包曲目不参与
    mode_stats = check_datasets(chars, pack_tracks, pack_albums, pack_cards, pack_covers, albums, p)
    char_stats = check_characters(chars, albums, p)
    # 曲包曲目不在镜像表里（只存在于本机），覆盖检查只看非曲包曲目
    mirror_referenced = {(a, t) for a, t in char_stats["referenced"]
                         if a not in pack_album_names}
    source_stats = check_sources(mirror_referenced, p)
    source_registry = check_source_registry(p)
    # 生成物里的源表地址形态（D131）：前端读的是 JSON，注册表对了这里也不能漏
    source_registry["table_urls"] = check_source_table_urls(p)
    card_sets = check_card_sets(p)
    pending = check_pending(chars, p)
    overrides = check_overrides(chars, p)
    alias_stats = check_alias_tables(chars, p)
    additions = check_track_additions(chars, p)
    title_stats = check_title_uniqueness(chars, p)
    for album, notes in title_stats["number_prefix_required"].items():
        p.note(f"{album}：去掉曲目序号会撞名，故 `曲目` 保留 `NN. ` —— {'；'.join(notes)}")
    stage_rows = check_stage_attribution(chars)
    digest = hashlib.sha256(
        json.dumps(sorted(char_stats["referenced"]), ensure_ascii=False).encode()).hexdigest()[:12]
    return p, {
        "albums": len(albums), "characters": len(chars), "pending": pending,
        "digest": digest, "sources": source_stats, "stage_rows": stage_rows,
        "overrides": overrides, "source_registry": source_registry,
        "card_sets": card_sets, "track_additions": additions, "packs": pack_stats,
        "roster": roster_count,
        "modes": mode_stats, "pack_cards": len(pack_cards), "pack_covers": len(pack_covers),
        "titles": title_stats, **alias_stats,
        **{k: v for k, v in char_stats.items() if k != "referenced"},
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--report", action="store_true", help="写出 docs/reports/validation-report.md")
    args = ap.parse_args(argv)

    p, stats = run()
    char_stats, source_stats, pending = stats, stats["sources"], stats["pending"]

    stage_rows = stats["stage_rows"]
    out = repo.REPORTS / "stage-check.tsv"
    out.write_text("角色key\t专辑\t曲目\t类别\t面次\t该面登场角色\t结论\n" +
                   "\n".join(f"{k}\t{v[0]}" for k, v in sorted(stage_rows.items())) + "\n",
                   encoding="utf-8")
    counts = collections.Counter(v[0].rsplit("\t", 1)[-1] for v in stage_rows.values())
    for verdict in ("REVIEW", "alias-gap", "no-label"):
        if counts.get(verdict):
            p.note(f"道中曲面次核对：{counts[verdict]} 条 {verdict}（见 docs/reports/stage-check.tsv）")
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
             f"- 曲目条目：{stats['modes']['union']['entries']}"
             f"（原曲 {stats['modes']['originals']['entries']} + 音MAD {stats['modes']['otomads']['entries']}）",
             f"- 去重曲目：{stats['modes']['union']['distinctTracks']}"
             f"（原曲 {stats['modes']['originals']['distinctTracks']} + 音MAD {stats['modes']['otomads']['distinctTracks']}）",
             f"- 每模式数据集：原曲 {stats['modes']['originals']['characters']} 角色 / "
             f"音MAD {stats['modes']['otomads']['characters']} 角色（互斥，音MAD 只含有曲目的角色）/ "
             f"自定义 {stats['modes']['custom']['characters']} 角色（**恒为空**，数据由使用者自己的源提供）",
             f"- 秘封曲条目：{char_stats['hifuu_entries']}",
             f"- 跨角色共用曲目：{len(char_stats['shared'])}",
             f"- 待判定（占位）：{pending}", f"- 人工裁定条目：{stats['overrides']}",
             f"- 人工补配曲目：{stats['track_additions']}，合并条目：{stats['composites']}，"
             f"补充别名：{stats['aliases']}",
             f"- 曲目身份 `(专辑,曲目)`：{stats['titles']['pairs']} 条，其中被多个角色共用 "
             f"{stats['titles']['shared_pairs']} 条",
             f"- **同名但不同专辑**的曲名（不同曲子，禁止按曲名合并）："
             f"{stats['titles']['same_title_across_albums']} 个",
             f"- 卡面图集：{stats['card_sets']}，注册音源：{stats['source_registry']['total']}"
             f"（原曲 {stats['source_registry']['by_mode'].get('originals', 0)} / "
             f"音MAD {stats['source_registry']['by_mode'].get('otomads', 0)} / "
             f"自定义 {stats['source_registry']['by_mode'].get('custom', 0)}）",
             f"- 曲包：{stats['packs']['packs']} 个 / {stats['packs']['tracks']} 条，"
             f"带 source（可自动抓取）{stats['packs']['with_source']} 条，"
             f"带裁剪区间 {stats['packs']['trimmed']} 条", "",
             "## 禁止合并同名曲目的依据", ""]
    lines.append("同专辑内若去掉曲目序号会撞名，因此 `曲目` 保留 `NN. `：")
    for album, notes in stats["titles"]["number_prefix_required"].items():
        lines.append(f"- {album}：{'；'.join(notes)}")
    lines += ["", "## 源表", ""]
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
        repo.REPORTS.mkdir(exist_ok=True)
        (repo.REPORTS / "validation-report.md").write_text(text, encoding="utf-8")
    print(text if p.errors else text.split("## 源表")[0].strip())

    if p.errors:
        print(f"\n❌ 校验失败：{len(p.errors)} 个错误", file=sys.stderr)
        return 1
    print(f"✅ 校验通过（引用集合指纹 {stats['digest']}）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
