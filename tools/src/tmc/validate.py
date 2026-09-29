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
import random
import sys
import tomllib
import urllib.error
import urllib.parse
import urllib.request

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
    * `local_only`：素材由用户自己放进仓库根 gitignored 目录，**不能**有 origins；
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
            # 本地图集：素材由用户自己放进仓库根 gitignored 目录（不随仓库分发），所以没有远程 origin
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
                p.note("音MAD 生成物不存在（数据仓库不在场）：跳过 otomads 源表地址检查")
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
            # 音MAD 的注册表在它自己的数据仓库里：不在场就整个模式跳过（可选，见 D174）
            if mode == "otomads":
                p.note("音MAD 数据仓库不在场：跳过 otomads 音源注册表检查")
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


def check_declared_sources(p: "Problems") -> int:
    """逐曲 ``[[track]].sources``（REFACTOR-PLAN v2 §4/§6）必须真的能在那些源里解析到。

    这张表是 S1 写进每条 ``[[track]]`` 的**声明**；在运行时按它排序之前，先让"写错源 id /
    源表里没有这条曲目"当场报错 —— 否则它只是个没人看的字段。当前数据里 378 条声明的是同一对源，
    与"按注册表 order 全局兜底"等价；运行时的解析顺序仍以注册表 order 为准（见 D174）。
    """
    registry = {entry["id"] for entry in build_mod.load_registry("originals") or []}
    tables: dict[str, set[str]] = {}
    declared_count = 0
    for path in sorted((repo.DATA / "characters").glob("*.toml")):
        with open(path, "rb") as fh:
            data = tomllib.load(fh)
        for track in data.get("track", []):
            for source_id in track.get("sources") or []:
                declared_count += 1
                if source_id not in registry:
                    p.error(f"{data['key']} / {track['id']}：声明的音源不在注册表里 → {source_id}")
                    continue
                if source_id not in tables:
                    tables[source_id] = {entry["id"] for entry in build_mod.load_mirror_entries(source_id)}
                if track["id"] not in tables[source_id]:
                    p.error(f"{data['key']} / {track['id']}：{source_id} 的镜像表里没有这条曲目")
    return declared_count


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


def check_track_covers(covers: dict, problems: "Problems") -> None:
    """源封面（`covers`，D153/D167）：每条曲目的 `cover` 必须是一条 https 直链。

    逐档表那种写法（D164）已经取消：一个链接画所有画幅，裁切由前端做。
    """
    for key, values in sorted(covers.items()):
        for index, cover in enumerate(values, start=1):
            if not isinstance(cover, str) or not cover.startswith("https://"):
                problems.error(f"音MAD 封面不是一条 https 直链：{key} 第 {index} 首（{cover!r}）")


def _load_generated(mode: str) -> dict | None:
    """读生成物（data/public/data/<mode>/）；缺 index.json 就当这个模式没有数据集。"""
    base = build_mod.dataset_dir(mode)
    if not (base / 'index.json').is_file():
        return None
    read = lambda name: json.loads((base / name).read_text(encoding='utf-8'))
    return {'index': read('index.json'), 'characters': read('characters.json')['characters'],
            'tracks': read('tracks.json')['tracks']}


def check_datasets(albums: dict[str, dict], pack_cards: dict[str, list[str]],
                   pack_covers: dict[str, list[str | dict[str, str]]], p: 'Problems') -> dict:
    """每模式数据集（契约 docs/otomads-separation-v1.md §2/§3）—— 这次检查的是**生成物本身**。

    三件事：① 每份数据集**只含本模式的曲目**；② 角色/专辑/曲目不重复、专辑已注册、附加信息合法、
    计数与 index.json 一致；③ **跨模式身份一致** —— 同一个角色 key 的 name/order/searchNames 必须一样
    （否则界面上会出现同一个角色两个名字，契约 §5 S1）。

    音MAD / 自定义的数据集来自各自的数据仓库（REFACTOR-PLAN v2 §7.2）；不在场时跳过该模式并记 note，
    不是错误。卡面是身份一致的例外：音MAD 侧可以在曲包角色文件里用 card 覆盖自己的卡面。
    """
    generated = {mode: _load_generated(mode) for mode in build_mod.MODES}
    for mode, data in generated.items():
        if data is None:
            p.note(f'{mode} 数据集不在场（既没有 <data_dir>/dataset/，也没有快照）⇒ 跳过它的检查')
    pack_names = {entry['name'] for entry in packs_mod.load_packs()[1]}
    stats: dict = {}
    for mode in build_mod.MODES:
        data = generated[mode]
        if data is None:
            continue
        entries, tracks, index = data['characters'], data['tracks'], data['index']
        if index.get('schema') != 2 or index.get('mode') != mode:
            p.error(f'[{mode}] index.json 的形状不对：schema={index.get("schema")!r} mode={index.get("mode")!r}')
        seen: set[tuple[str, str, str]] = set()
        ids: set[str] = set()
        count = 0
        for char in entries:
            for track_id in char.get('music', []):
                record = tracks.get(track_id)
                if record is None:
                    p.error(f'[{mode}] 曲目 {track_id} 不在 tracks.json 里（{char.get("key")}）')
                    continue
                album, title, extra = record.get('album'), record.get('title'), record.get('extra')
                count += 1; ids.add(track_id)
                where = f'{char.get("key")} / {album} / {title}'
                if extra not in EXTRAS:
                    p.error(f'[{mode}] 附加信息非法「{extra}」（{where}）')
                if album not in albums:
                    p.error(f'[{mode}] 专辑未注册「{album}」（{where}）')
                if (album in pack_names) != (mode == 'otomads'):
                    p.error(f'[{mode}] 曲目不属于本模式（{where}）')
                key = (char.get('key'), album, title)
                if key in seen:
                    p.error(f'[{mode}] 曲目重复：{where}')
                seen.add(key)
        counts = index.get('counts') or {}
        expect = {'characters': len(entries), 'trackEntries': count, 'distinctTracks': len(ids)}
        for field, value in expect.items():
            if counts.get(field) != value:
                p.error(f'[{mode}] index.counts.{field} 与生成物不符：{counts.get(field)!r} vs {value}')
        stats[mode] = {'characters': len(entries), 'entries': count, 'distinctTracks': len(ids)}
    by_mode = {mode: {c['key']: c for c in data['characters']}
               for mode, data in generated.items() if data is not None}
    if 'originals' in by_mode and 'otomads' in by_mode:
        for key in sorted(set(by_mode['originals']) & set(by_mode['otomads'])):
            left, right = by_mode['originals'][key], by_mode['otomads'][key]
            for field in ('name', 'order', 'searchNames'):
                if left.get(field) != right.get(field):
                    p.error(f'跨模式身份不一致：{key} 的 {field}（{left.get(field)!r} vs {right.get(field)!r}）')
            if key in pack_cards:
                if right.get('card') != list(pack_cards[key]):
                    p.error(f'音MAD 卡面覆盖没生效：{key}（{right.get("card")!r} vs {pack_cards[key]!r}）')
            elif left.get('card') != right.get('card'):
                p.error(f'跨模式卡面不一致（未在曲包里覆盖）：{key}')
            if key in pack_covers:
                if right.get('covers') != list(pack_covers[key]):
                    p.error(f'音MAD 封面没生效：{key}（{right.get("covers")!r} vs {pack_covers[key]!r}）')
            elif 'covers' in right:
                p.error(f'音MAD 生成物里多出了源码里没有的 covers：{key}')
    otomads_chars = by_mode.get('otomads', {})
    for key in sorted(pack_covers):
        if key not in by_mode.get('originals', {}):
            p.error(f'曲包里的封面指向未知角色：{key}')
        if otomads_chars and key not in otomads_chars:
            p.error(f'曲包里的封面指向没有音MAD 曲目的角色：{key}')
        cover = pack_covers[key]
        if not cover or not all(isinstance(item, str) and item.startswith('https://') for item in cover):
            p.error(f'曲包里的封面非法（{key}，必须是 https 直链的列表，一条一个封面）：{cover!r}')
        entry = otomads_chars.get(key)
        if entry is not None and len(cover) != len(entry.get('music', [])):
            p.error(f'曲包里的封面数与曲目数不等（{key}：{len(cover)} vs {len(entry.get("music", []))}）'
                    f'—— 一首一封面，顺序一一对应')
    for key in sorted(pack_cards):
        if key not in by_mode.get('originals', {}):
            p.error(f'曲包里的卡面覆盖指向未知角色：{key}')
        face = pack_cards[key]
        if not face or not all(isinstance(item, str) and item for item in face):
            p.error(f'曲包里的卡面覆盖非法（{key}）：{face!r}')
    modes = [mode for mode in build_mod.MODES if mode in stats]
    stats['union'] = {
        'entries': sum(stats[mode]['entries'] for mode in modes),
        'distinctTracks': sum(stats[mode]['distinctTracks'] for mode in modes),
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
    """数据仓库的角色清单（`<data_dir>/characters.toml`）必须与主仓库真源一致（D130）。

    数据仓库不在场时给 note 跳过（音MAD 数据在开发时可选，见 §7.2）。
    """
    if not roster_mod.roster_path().exists():
        p.note("音MAD 数据仓库不在场：跳过角色清单检查")
        return 0
    for problem in roster_mod.diff():
        p.error(f"[roster] {problem}")
    return len(roster_mod.read_roster())


# ---- 音源实链抽查（S5 起并入 validate，原 tmc.check_urls） ----
URL_UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
          "Chrome/126.0.0.0 Safari/537.36")
URL_CHUNK = 4096


def _looks_like_audio(head: bytes) -> bool:
    return head[:3] == b"ID3" or head[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2")


def _encode_url(url: str) -> str:
    parts = urllib.parse.urlsplit(url)
    return urllib.parse.urlunsplit(
        (parts.scheme, parts.netloc, urllib.parse.quote(parts.path), parts.query, parts.fragment))


def _probe_url(url: str, timeout: float = 20.0) -> tuple[bool, str]:
    req = urllib.request.Request(_encode_url(url),
                                 headers={"User-Agent": URL_UA, "Referer": "https://music.163.com/",
                                          "Range": f"bytes=0-{URL_CHUNK - 1}"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
            head = resp.read(16)
            status = resp.status
            ctype = resp.headers.get("Content-Type", "")
            if status not in (200, 206):
                return False, f"HTTP {status}"
            if "audio" not in ctype and not _looks_like_audio(head):
                return False, f"不像音频（{ctype or 'no content-type'}）"
            if status == 206 and not resp.headers.get("Content-Range"):
                return False, "206 但没有 Content-Range"
            return True, f"{status} {ctype}"
    except urllib.error.HTTPError as exc:
        return False, f"HTTP {exc.code}"
    except Exception as exc:  # noqa: BLE001 - 抽查工具，如实记录
        return False, type(exc).__name__


def check_source_urls(per_source: int = 5, all_: bool = False, seed: int = 0) -> int:
    """对每张镜像源表抽样发 Range 请求，确认能取到音频（原 tmc.check_urls，S5 并入）。"""
    rng = random.Random(seed)
    failures: list[tuple[str, str, str, str]] = []
    for source_id in build_mod.mirror_source_ids():
        entries = build_mod.load_mirror_tracks(source_id)
        sample = entries if all_ else rng.sample(entries, min(per_source, len(entries)))
        for album, title, url in sample:
            ok, detail = _probe_url(url)
            print(f"[{source_id}] {'ok' if ok else 'bad'}  {album} / {title}")
            if not ok:
                failures.append((source_id, f"{album} / {title}", url, detail))
    if failures:
        print("\n失败明细：")
        for source_id, track, url, detail in failures:
            print(f"  [{source_id}] {track}\n      {url}\n      {detail}")
        return 1
    print("[OK] 抽查全部通过（Range 请求可播放、206 带 Content-Range）")
    return 0


def run() -> tuple["Problems", dict]:
    """跑全部不变量校验，返回 (问题集合, 统计)。供 CLI 与测试复用。"""
    p = Problems()
    pack_list, pack_albums, pack_tracks, pack_cards, pack_covers = packs_mod.load_packs()
    if not packs_mod.available():
        p.note("曲包真源不在场（OTOMADS_DATA_DIR 没指到 clone）：跳过曲包相关校验")
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
    mode_stats = check_datasets(albums, pack_cards, pack_covers, p)
    char_stats = check_characters(chars, albums, p)
    # 曲包曲目不在镜像表里（只存在于本机），覆盖检查只看非曲包曲目
    mirror_referenced = {(a, t) for a, t in char_stats["referenced"]
                         if a not in pack_album_names}
    source_stats = check_sources(mirror_referenced, p)
    declared_sources = check_declared_sources(p)
    source_registry = check_source_registry(p)
    # 生成物里的源表地址形态（D131）：前端读的是 JSON，注册表对了这里也不能漏
    source_registry["table_urls"] = check_source_table_urls(p)
    card_sets = check_card_sets(p)
    title_stats = check_title_uniqueness(chars, p)
    for album, notes in title_stats["number_prefix_required"].items():
        p.note(f"{album}：去掉曲目序号会撞名，故 `曲目` 保留 `NN. ` —— {'；'.join(notes)}")
    digest = hashlib.sha256(
        json.dumps(sorted(char_stats["referenced"]), ensure_ascii=False).encode()).hexdigest()[:12]
    return p, {
        "albums": len(albums), "characters": len(chars),
        "digest": digest, "sources": source_stats, "source_registry": source_registry,
        "card_sets": card_sets, "packs": pack_stats, "declared_sources": declared_sources,
        "roster": roster_count,
        "modes": mode_stats, "pack_cards": len(pack_cards), "pack_covers": len(pack_covers),
        "titles": title_stats,
        **{k: v for k, v in char_stats.items() if k != "referenced"},
    }


def _pick(modes: dict, mode: str, field: str) -> int:
    """某个模式的某个计数；该模式的数据集不在场时算 0（报告照常出）。"""
    return modes.get(mode, {}).get(field, 0)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--report", action="store_true", help="写出 docs/reports/validation-report.md")
    ap.add_argument("--urls", action="store_true", help="附带音源实链抽查（每源抽样 Range 请求，原 tmc.check_urls）")
    ap.add_argument("--urls-all", action="store_true", help="抽查全量（651×2 条，较慢）")
    ap.add_argument("--urls-per", type=int, default=5, help="每张表抽多少条（默认 5）")
    ap.add_argument("--urls-seed", type=int, default=0)
    args = ap.parse_args(argv)

    p, stats = run()
    modes = stats["modes"]
    char_stats, source_stats = stats, stats["sources"]

    lines = ["# 校验报告", "",
             f"- 角色：{stats['characters']}", f"- 专辑：{stats['albums']}",
             f"- 曲目条目：{stats['modes']['union']['entries']}"
             f"（原曲 {_pick(modes, 'originals', 'entries')} + 音MAD {_pick(modes, 'otomads', 'entries')}）",
             f"- 去重曲目：{stats['modes']['union']['distinctTracks']}"
             f"（原曲 {_pick(modes, 'originals', 'distinctTracks')}"
             f" + 音MAD {_pick(modes, 'otomads', 'distinctTracks')}）",
             f"- 每模式数据集：原曲 {_pick(modes, 'originals', 'characters')} 角色 / "
             f"音MAD {_pick(modes, 'otomads', 'characters')} 角色（互斥，音MAD 只含有曲目的角色）/ "
             f"自定义 {_pick(modes, 'custom', 'characters')} 角色（恒为空，数据由使用者自己的源提供）",
             f"- 秘封曲条目：{char_stats['hifuu_entries']}",
             f"- 跨角色共用曲目：{len(char_stats['shared'])}",
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
        print(f"\n[FAIL] 校验失败：{len(p.errors)} 个错误", file=sys.stderr)
        return 1
    print(f"[OK] 校验通过（引用集合指纹 {stats['digest']}）")
    if args.urls:
        return check_source_urls(per_source=args.urls_per, all_=args.urls_all, seed=args.urls_seed)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
