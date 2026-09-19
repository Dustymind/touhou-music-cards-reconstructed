"""附加曲包（``data/packs/*.toml``）的加载与校验。

曲包是"镜像表以外的曲目"：比如音MAD（otomads）那批只存在于本机（由
``tools/src/tmc/local_source.py`` 起的本地曲库助手提供）的曲目。它们不进
``data/sources/*.json``，因此：

* ``albums.toml`` 里不必也不该为它们写条目 —— 曲包自己带 ``[[album]]``；
* 校验里"每条被引用的曲目都必须在三个镜像表里"这条要**跳过**曲包曲目，
  但不能跳过别的检查（专辑注册、角色存在、重复、附加信息合法性）。

TOML 形状::

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

    [[track]]
    character = "kirisame-marisa"
    album = "otomads"
    author = "川先僧"
    title = "普通肥猫魔法使"
    extra = "角色曲"
    source = "https://www.bilibili.com/video/BV1kw411q7S8"   # 可选：抓取用（见 docs/packs-audio-v1.md）
    start_time = "00:00:40.000"                              # 可选：裁剪开始
    stop_time = "00:01:10.000"                               # 可选：裁剪结束

三个音频键（``source`` / ``start_time`` / ``stop_time``）**只在抓取与裁剪期被读**，
运行时不进 ``characters.json``、前端也看不到它们（契约见 ``docs/packs-audio-v1.md``）。
"""
from __future__ import annotations

import hashlib
import re
import tomllib

from . import repo

#: 曲包的 kind：local 表示曲目地址来自本地曲库助手的 manifest
PACK_KINDS = ("local",)

#: 三个段各自允许的键。**写错键名必须报错**：早先解析只读自己认识的键，
#: 拼错的 `starttime` 会被静默丢掉，表现为"数据里写了却不生效"（见 docs/packs-audio-v1.md §1）。
PACK_KEYS = {"id", "label_en", "label_zh", "kind", "order"}
ALBUM_KEYS = {"key", "name", "kind", "pack", "order", "show_album_name"}
TRACK_KEYS = {"character", "album", "author", "title", "extra", "source", "start_time", "stop_time"}

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


def audio_filename(track: dict) -> str:
    """成品文件名 —— **必须**与磁盘/助手 manifest 的口径一致：`作者 - 标题.mp3`（无作者则 `标题.mp3`）。

    这个名字同时是 manifest 的匹配键、`loudness.json` 的键与单曲模式存档的一部分，所以不能改（D95/D96）。
    """
    author = (track.get("author") or "").strip()
    return f"{author} - {track['title']}.mp3" if author else f"{track['title']}.mp3"


def source_key(source: str) -> str:
    """`source` → 原始件的文件名（同一来源只下一份，重复引用时复用）。"""
    return hashlib.sha1(source.strip().encode("utf-8")).hexdigest()[:16]


def load_packs() -> tuple[list[dict], list[dict], list[dict]]:
    """读 ``data/packs/*.toml`` → ``(packs, albums, tracks)``（都按文件名排序，结果稳定）。"""
    packs: list[dict] = []
    albums: list[dict] = []
    tracks: list[dict] = []
    directory = repo.DATA / "packs"
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
        for entry in data.get("track", []):
            _reject_unknown(f"{path.name} 的 [[track]]", entry, TRACK_KEYS)
            track = {
                "character": entry["character"],
                "album": entry["album"],
                "title": entry["title"],
                "extra": entry.get("extra", "角色曲"),
                "pack": pack_id,
            }
            if entry.get("author"):
                track["author"] = entry["author"]
            _read_audio_keys(entry, track, f"{path.name} / {track['title']}")
            tracks.append(track)
    packs.sort(key=lambda item: item["order"])
    return packs, albums, tracks


def _read_audio_keys(entry: dict, track: dict, where: str) -> None:
    """`source` / `start_time` / `stop_time`：解析 + 就地校验（构建期就能发现写错）。"""
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
    try:
        trim_seconds(track)          # 只给一侧也合法；两侧都给时校验先后
    except ValueError as error:
        raise SystemExit(f"{where}：{error}") from None


def apply_tracks(chars: list[dict], tracks: list[dict]) -> list[dict]:
    """把曲包曲目并进角色表（返回新的角色列表；曲目追加在原有条目之后）。

    角色 key 不存在时**直接报错**（曲包文件里写错一个 key，条目会被静默丢掉 ✗ ——
    2026-09 那批音MAD 就因为 `reisen-udongein` 少写了 `-inaba` 一次性丢了 3 条 ✓）。
    """
    merged = [dict(char, music=[list(entry) for entry in char["music"]]) for char in chars]
    by_key = {char["key"]: char for char in merged}
    unknown: list[str] = []
    for track in tracks:
        char = by_key.get(track["character"])
        if char is None:
            unknown.append(f'{track["character"]}（{track["title"][:24]}）')
            continue
        entry = [track["album"], track["title"], track["extra"]]
        if track.get("author"):
            entry.append(track["author"])   # 可选第 4 位：作者（有就显示作者，没有则看专辑的 showAlbumName）
        char["music"].append(entry)
    if unknown:
        raise SystemExit("曲包里出现了角色表里没有的 key：\n  " + "\n  ".join(unknown))
    return merged


def audio_descriptors(tracks: list[dict]) -> list[list[str]]:
    """曲包音频的**指纹**：`[专辑, 曲名, start_time, stop_time, source]`（按值排序，稳定）。

    `tmc.build` 把它并进 `contentHash` —— 于是"两端的音频来源/裁剪不同"会在联机**握手期**被拒，
    而不是等抢答时才发现起点不一样（docs/packs-audio-v1.md §6）。
    """
    rows = [[track["album"], track["title"], track.get("start_time", ""), track.get("stop_time", ""),
             track.get("source", "")] for track in tracks]
    return sorted(rows)
