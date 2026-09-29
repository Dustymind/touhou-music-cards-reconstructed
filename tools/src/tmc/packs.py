"""附加曲包（``data/packs/*.toml`` 等根目录）的加载与校验。

曲包是"镜像表以外的曲目"：比如音MAD（otomads）那批只存在于本机（由数据仓库的
``otomads.local_source`` 起的本地曲库助手提供）的曲目。它们不进
``data/sources/*.toml``（每源一个自包含文件），因此：

* ``originals.toml`` 里不必也不该为它们写条目 —— 曲包自己带 ``[[album]]``；
* 校验里"每条被引用的曲目都必须在三个镜像表里"这条要**跳过**曲包曲目，
  但不能跳过别的检查（专辑注册、角色存在、重复、附加信息合法性）。

布局：**一个曲包 = 一份清单 + 一角色一份曲目文件**（曲目文件与 ``data/characters/*.toml`` 同一风格，
一角色一份、顶层 ``key``）::

    <根>/otomads.toml                    # 清单：只放 [pack] 与 [[album]]
    <根>/otomads/kirisame-marisa.toml    # 角色文件：该角色的若干 [[track]]

**根目录**（:func:`tmc.repo.pack_roots`）：主仓库 `data/packs/` + 音MAD 数据仓库的 `packs/`
（`OTOMADS_DATA_DIR`，默认 `data/otomads`）。数据仓库在开发时**可选** —— 不在场时跳过它
（契约 `docs/otomads-separation-v1.md`）。

**只读**：写入侧（录入 / 抓取 / 响度）自 D130 起在数据仓库的 `tools/`（`otomads.*`），
本模块只负责读与校验。

清单（`<根>/<曲包 id>.toml`）::

    [pack]
    id = "otomads"
    label_en = "Otomads"
    label_zh = "音MAD"
    kind = "local"          # local = 曲目地址来自本地曲库助手的 manifest
    order = 100

    [[album]]
    key = "otomads"
    name = "otomads"
    kind = "other"
    pack = "otomads"
    order = 100

角色文件（``<根>/<曲包 id>/<角色 key>.toml``）::

    key = "kirisame-marisa"   # 必须与文件名一致；文件的曲目都算这个角色
    card = ["魔理沙-mad.png"]  # 可选：本模式的卡面（缺省沿用共享身份的卡面）

    [[track]]
    album = "otomads"
    author = "川先僧"
    title = "普通肥猫魔法使"
    extra = "角色曲"
    source = "https://www.bilibili.com/video/BV1kw411q7S8"   # 可选：抓取用（见 docs/packs-audio-v1.md）
    start_time = "00:00:40.000"                              # 可选：裁剪开始
    stop_time = "00:01:10.000"                               # 可选：裁剪结束

``[[track]]`` 里**不再写 ``character``**（角色由文件的 ``key`` 决定），清单里也**不许**写
``[[track]]``（曲目一律进角色文件），两条都**直接报错**而不是猜。

三个音频键（``source`` / ``start_time`` / ``stop_time``）**只在抓取与裁剪期被读**，
运行时不进 ``characters.json``、前端也看不到它们（契约见 ``docs/packs-audio-v1.md``）。
"""
from __future__ import annotations

import pathlib
import re
import sys
import tomllib

from . import repo

#: 曲包的 kind：local 表示曲目地址来自本地曲库助手的 manifest
PACK_KINDS = ("local",)

#: 各段允许的键。**写错键名必须报错**：早先解析只读自己认识的键，
#: 拼错的 `starttime` 会被静默丢掉，表现为"数据里写了却不生效"（见 docs/packs-audio-v1.md §1）。
PACK_KEYS = {"id", "label_en", "label_zh", "kind", "order"}
ALBUM_KEYS = {"key", "name", "kind", "pack", "order", "show_album_name"}
#: 角色文件里 `[[track]]` 的键 —— **没有** `character`：角色由文件的 `key` 决定。
#: `cover` 是**可选**的该曲目封面：**单链接**（D153 修订：写在 `[[track]]` 里，不再是顶层数组）
#: 或**逐档表**（D164：`original` / `16x9` / `4x3`，与应用的 `parseCoverField` 同口径）
TRACK_KEYS = {"album", "author", "authors", "title", "extra", "source", "start_time", "stop_time",
              "bitrate", "cover"}
#: 角色文件的顶层键（`track` 之外）：`card` 是**可选**的卡面覆盖，值是**卡面文件名**
#: （等价于原曲角色文件的 `card_name` —— 那边的 `card` 是"卡面组 id 列表"，与这里**不同义**，D177 起已删）
CHARACTER_KEYS = {"key", "card"}

#: `bitrate`（可选的成品 CBR 码率，kbps）允许的范围 —— 与数据仓库的 `packformat.BITRATE_RANGE` 同口径
BITRATE_RANGE = (32, 320)


#: 裁剪时间的格式：`HH:MM:SS.mmm`（时:分:秒.毫秒）
TIME_RE = re.compile(r"^(\d{1,2}):([0-5]\d):([0-5]\d)\.(\d{3})$")


def _reject_unknown(where: str, entry: dict, allowed: set[str]) -> None:
    unknown = sorted(set(entry) - allowed)
    if unknown:
        raise SystemExit(
            f"{where}: 不认识的键 {unknown}（允许 {sorted(allowed)}）—— 写错名字会被静默忽略，所以直接报错")


def parse_time(text: str) -> float:
    """`HH:MM:SS.mmm` → 秒。格式不对抛 `ValueError`（调用方补上下文）。"""
    matched = TIME_RE.match(text.strip())
    if not matched:
        raise ValueError(f"时间格式必须是 HH:MM:SS.mmm，收到 {text!r}")
    hours, minutes, seconds, millis = (int(group) for group in matched.groups())
    return hours * 3600 + minutes * 60 + seconds + millis / 1000


def trim_seconds(track: dict) -> tuple[float, float | None] | None:
    """裁剪区间 → `(起点秒, 时长秒 | None)`；两个键都没写 ⇒ `None`（不裁剪）。

    单侧语义（docs/packs-audio-v1.md §1）：只给 `stop_time` ⇒ 从文件开头；
    只给 `start_time` ⇒ 裁到文件结尾（时长返回 `None`，交给 ffmpeg 自己读到尾）。
    """
    start_text = track.get("start_time")
    stop_text = track.get("stop_time")
    if not start_text and not stop_text:
        return None
    start = parse_time(start_text) if start_text else 0.0
    if not stop_text:
        return (start, None)
    stop = parse_time(stop_text)
    if stop <= start:
        raise ValueError(f"stop_time（{stop_text}）必须晚于 start_time（{start_text or '00:00:00.000'}）")
    return (start, stop - start)


def available() -> bool:
    """曲包真源是否可用（音MAD 数据仓库在场）。

    ``False`` 时 :func:`load_packs` 返回空、``tmc.build`` 不重新生成音MAD 数据集 ——
    数据仓库在开发时**可选**：不在场时走生成物 / Release 快照那条路（见 ``data/README.md``）。
    """
    return any(root.is_dir() and any(root.glob("*.toml")) for root in repo.pack_roots())


def load_packs() -> tuple[list[dict], list[dict], list[dict], dict[str, list[str]], dict[str, list[str]]]:
    """读全部曲包根目录 → ``(packs, albums, tracks, cards, covers)``。

    ``cards`` 是"音MAD 侧自己的卡面覆盖"：``{角色 key: [卡面文件名, …]}``（只有写了 `card` 的角色才在里面）。
    ``covers`` 是"每首曲目一张的封面直链"：``{角色 key: [绝对 https URL, …]}``（只有写了 `cover`
    的角色才在里面，顺序与曲目一一对应，D153）。
    根目录见 :func:`tmc.repo.pack_roots`；不存在的根（数据仓库不在场）**跳过并提示**。
    """
    packs: list[dict] = []
    albums: list[dict] = []
    tracks: list[dict] = []
    cards: dict[str, list[str]] = {}
    covers: dict[str, list[str]] = {}
    for directory in repo.pack_roots():
        if not directory.is_dir():
            print(f"[packs] 跳过不存在的曲包根目录 {repo.shown(directory)}"
                  f"（音MAD 数据仓库不在场？clone 到 data/otomads 或设 OTOMADS_DATA_DIR）",
                  file=sys.stderr)
            continue
        _load_root(directory, packs, albums, tracks, cards, covers)
    packs.sort(key=lambda item: item["order"])
    return packs, albums, tracks, cards, covers


def _load_root(directory: pathlib.Path, packs: list[dict], albums: list[dict],
               tracks: list[dict], cards: dict[str, list[str]],
               covers: dict[str, list[str]]) -> None:
    """读一个曲包根目录：``<id>.toml`` 清单 + ``<id>/`` 角色文件。"""
    for path in sorted(directory.glob("*.toml")):
        with open(path, "rb") as fh:
            data = tomllib.load(fh)
        meta = data.get("pack")
        if not meta:
            raise SystemExit(f"{path.name}: 缺少 [pack] 段")
        _reject_unknown(f"{path.name} 的 [pack]", meta, PACK_KEYS)
        pack_id = meta["id"]
        packs.append({
            "id": pack_id,
            "label": {"en": meta.get("label_en", pack_id), "zh": meta.get("label_zh", pack_id)},
            "kind": meta.get("kind", "local"),
            "order": meta.get("order", 0),
        })
        for entry in data.get("album", []):
            _reject_unknown(f"{path.name} 的 [[album]]", entry, ALBUM_KEYS)
            album = {
                "key": entry["key"],
                "name": entry["name"],
                "kind": entry.get("kind", "other"),
                "pack": entry.get("pack", pack_id),
                "order": entry.get("order", 0),
            }
            # 可选：专辑名要不要显示（不填 = true）。曲包专辑常设 false，曲目没作者时那一行就不显示
            if "show_album_name" in entry:
                album["showAlbumName"] = bool(entry["show_album_name"])
            albums.append(album)
        if data.get("track"):
            rel = repo.shown(directory)
            raise SystemExit(f"{path.name}: 曲目要写进 {rel}/{pack_id}/<角色 key>.toml（一角色一份），"
                             f"清单只放 [pack] 与 [[album]]")
        tracks.extend(_character_tracks(directory / pack_id, path.name, cards, covers))


def _character_tracks(pack_dir: pathlib.Path, manifest: str,
                      cards: dict[str, list[str]], covers: dict[str, list[str]]) -> list[dict]:
    """读 ``<根>/<曲包 id>/*.toml`` → 曲目列表（文件按名排序，文件内保持原顺序）。

    角色由文件的 ``key`` 决定，**文件名必须与它一致**：曲包里的 key 写错曾一次性丢掉 3 条曲目
    （2026-09 那次 `reisen-udongein` 少写 `-inaba`），所以这里错了直接报；报错文案带包内相对路径，
    否则 35 个 `cirno.toml` 分不清是哪个包。

    ``cards`` / ``covers`` 是出参：文件里写了 ``card`` 就记一笔卡面覆盖；每条 ``[[track]]`` 里写了
    ``cover`` 就按曲目顺序攒成该角色的封面列表（D153 修订：**写在 `[[track]]` 内**，不再是顶层数组）。
    """
    if not pack_dir.is_dir():
        return []
    out: list[dict] = []
    for path in sorted(pack_dir.glob("*.toml")):
        where = f"{pack_dir.name}/{path.name}"
        with open(path, "rb") as fh:
            data = tomllib.load(fh)
        if "pack" in data or "album" in data:
            raise SystemExit(f"{where}: [pack] / [[album]] 只能写在清单 {manifest} 里")
        if "cover" in data:
            raise SystemExit(
                f"{where}: 顶层的 cover 数组已废弃（D153 修订）—— 现在写在每条 [[track]] 里。"
                f"跑数据仓库的 `uv run --project tools python -m otomads.fetch_covers` 会按顺序自动迁移"
                f"（不联网、不动已有内容）")
        _reject_unknown(where, {k: v for k, v in data.items() if k != "track"}, CHARACTER_KEYS)
        key = data.get("key")
        if not isinstance(key, str) or not key:
            raise SystemExit(f"{where}: 缺少 key（= 角色 key）")
        if path.stem != key:
            raise SystemExit(f"{where}: 文件名与 key 不一致（{path.stem} vs {key}）")
        if "card" in data:
            face = data["card"]
            if not isinstance(face, list) or not face or not all(isinstance(f, str) and f for f in face):
                raise SystemExit(f"{where}: card 必须是至少一项的字符串数组（写成 data/characters/*.toml 那样）")
            cards[key] = list(face)
        per_track: list[str | dict[str, str] | None] = []
        for entry in data.get("track", []):
            _reject_unknown(f"{where} 的 [[track]]", entry, TRACK_KEYS)
            track = {
                "character": key,
                "album": entry["album"],
                "title": entry["title"],
                "extra": entry.get("extra", "角色曲"),
                "pack": pack_dir.name,
            }
            _read_authors(entry, track, f"{where} / {entry.get('title')}")
            _read_audio_keys(entry, track, f"{where} / {track['title']}")
            out.append(track)
            per_track.append(_read_track_cover(entry, f"{where} / {track['title']}"))
        merged = _merge_track_covers(key, per_track, where)
        if merged is not None:
            covers[key] = merged
    return out


def _read_track_cover(entry: dict, where: str) -> str | None:
    """``[[track]]`` 里的 ``cover``（可选）：这一首曲目的封面 —— **一条绝对 https 直链**（D167）。

    一个链接画所有画幅：源给**原版无修改**的那张图（不加任何分辨率/裁切参数），
    形状与裁切由前端按用户选的档位运行时做（``object-fit: cover``）。
    """
    value = entry.get("cover")
    if value is None:
        return None
    if not isinstance(value, str):
        raise SystemExit(f"{where}: cover 只能是**一条链接**（字符串）；收到 {type(value).__name__} "
                         f"—— 逐档表那种写法已经取消了（D167：画幅由前端裁同一张图）")
    return _cover_url(value, where)


def _cover_url(value: object, where: str) -> str:
    """封面里的**那条链接**：非空、且 ``https://`` 开头。"""
    if not isinstance(value, str) or not value:
        raise SystemExit(f"{where}: cover 必须是非空字符串（一条绝对 https URL）")
    if not value.startswith("https://"):
        raise SystemExit(
            f"{where}: cover 必须是 https:// 开头的绝对 URL，收到 {value!r}"
            f"（B 站给的 http:// 要换成 https://，否则页面是混合内容、图会被浏览器拦掉）")
    return value


def _merge_track_covers(key: str, covers: list[str | None],
                        where: str) -> list[str] | None:
    """逐条曲目的 ``cover`` → **整个角色**的封面列表（运行时的 ``covers`` 仍是按下标对齐的数组）。

    两条口径（与数据仓库的 ``packformat`` 保持一致）：

    * **全有** ⇒ 交给源，顺序 = 曲目顺序；
    * **全无** ⇒ 不发（这个角色在封面图集下回落到原版卡面，不是错误）；
    * **半有半无** ⇒ **报错**并点名：运行时的数组是按下标对齐的，空洞会让某几首静默错位到别人的封面上。
    """
    if not covers or all(item is None for item in covers):
        return None
    missing = [str(index + 1) for index, item in enumerate(covers) if item is None]
    if missing:
        raise SystemExit(
            f"{where}: 角色 {key} 的第 {'、'.join(missing)} 首曲目没有 cover —— "
            f"一个角色要么**每首都有**、要么**一首都没有**（运行时的 covers 是按曲目下标对齐的数组）。"
            f"跑数据仓库的 `uv run --project tools python -m otomads.fetch_covers` 会把缺的补上")
    return [item for item in covers if item is not None]


#: 多作者在**文件名 / 响度表键**里的连接符。磁盘上的成品是 `作者 - 标题.mp3`，
#: 而那个名字是 manifest 匹配键、响度表键与单曲存档的一部分（数据仓库 `packformat.audio_filename`，D95/D96），
#: 所以 `authors = ["A", "B"]` 必须能还原成 `A & B` —— 也就是**原来那串合写就是 " & " 连接的**。
AUTHOR_JOIN = " & "


def _read_authors(entry: dict, track: dict, where: str) -> None:
    """`author`（单个字符串）或 `authors`（字符串数组）：两种写法都认，但**不能同时写**。

    - `author = "A & B"`：老写法，**原样保留**（不猜哪个 `&` 是分隔符），显示时也是一整串；
    - `authors = ["A", "B"]`：多作者（D135）。规范化后同时给出：
      `track["authors"]`（数组，给前端排序/分别署名用）与 `track["author"] = " & ".join(...)`
      （**成品文件名那一位**，与 `author` 写法在磁盘上完全等价 ⇒ 换写法不用重抓音频）。
    """
    single = entry.get("author")
    many = entry.get("authors")
    if single is not None and many is not None:
        raise SystemExit(f"{where}：author 与 authors 只能写一个（author 是整串、authors 是数组）")
    if many is not None:
        if not isinstance(many, list) or not many:
            raise SystemExit(f"{where}：authors 必须是非空字符串数组，例如 authors = [\"甲\", \"乙\"]")
        cleaned = [str(name).strip() for name in many]
        if not all(cleaned):
            raise SystemExit(f"{where}：authors 里不能有空字符串")
        track["authors"] = cleaned
        track["author"] = AUTHOR_JOIN.join(cleaned)
    elif single:
        track["author"] = single


def _read_audio_keys(entry: dict, track: dict, where: str) -> None:
    """`source` / `start_time` / `stop_time` / `bitrate`：解析 + 就地校验（构建期就能发现写错）。"""
    source = (entry.get("source") or "").strip()
    if source:
        if not source.lower().startswith(("http://", "https://")):
            raise SystemExit(f"{where}：source 必须是 http(s) 链接，收到 {source!r}")
        track["source"] = source
    for field in ("start_time", "stop_time"):
        value = entry.get(field)
        if value in (None, ""):
            continue
        if not isinstance(value, str):
            raise SystemExit(f"{where}：{field} 必须是字符串（HH:MM:SS.mmm），收到 {value!r}")
        try:
            parse_time(value)
        except ValueError as error:
            raise SystemExit(f"{where}：{field} {error}") from None
        track[field] = value
    bitrate = entry.get("bitrate")
    if bitrate is not None:
        # 成品 CBR 码率（kbps）：数据仓库那侧用它把长曲压到 CDN 的单文件上限（25 MiB）以下。
        # 这里只校验，不进生成物（与 source / 两个时间键同类）。
        if isinstance(bitrate, bool) or not isinstance(bitrate, int):
            raise SystemExit(f"{where}：bitrate 必须是整数 kbps，收到 {bitrate!r}")
        if not BITRATE_RANGE[0] <= bitrate <= BITRATE_RANGE[1]:
            raise SystemExit(f"{where}：bitrate 必须在 {BITRATE_RANGE[0]}–{BITRATE_RANGE[1]} kbps 之间，"
                             f"收到 {bitrate}")
        track["bitrate"] = bitrate
    try:
        trim_seconds(track)          # 只给一侧也合法；两侧都给时校验先后
    except ValueError as error:
        raise SystemExit(f"{where}：{error}") from None


def audio_descriptors(tracks: list[dict]) -> list[list[str]]:
    """曲包音频的**指纹**：`[专辑, 曲名, start_time, stop_time, source]`（按值排序，稳定）。

    `tmc.build` 把它并进 `contentHash` —— 于是"两端的音频来源/裁剪不同"会在联机**握手期**被拒，
    而不是等抢答时才发现起点不一样（docs/packs-audio-v1.md §6）。
    """
    rows = [[track["album"], track["title"], track.get("start_time", ""), track.get("stop_time", ""),
             track.get("source", "")] for track in tracks]
    return sorted(rows)
