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
    title = "川先僧 - 普通肥猫魔法使"
    extra = "角色曲"
"""
from __future__ import annotations

import tomllib

from . import repo

#: 曲包的 kind：local 表示曲目地址来自本地曲库助手的 manifest
PACK_KINDS = ("local",)


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
        pack_id = meta["id"]
        packs.append({
            "id": pack_id,
            "label": {"en": meta.get("label_en", pack_id), "zh": meta.get("label_zh", pack_id)},
            "kind": meta.get("kind", "local"),
            "order": meta.get("order", 0),
        })
        for entry in data.get("album", []):
            albums.append({
                "key": entry["key"],
                "name": entry["name"],
                "kind": entry.get("kind", "other"),
                "pack": entry.get("pack", pack_id),
                "order": entry.get("order", 0),
            })
        for entry in data.get("track", []):
            tracks.append({
                "character": entry["character"],
                "album": entry["album"],
                "title": entry["title"],
                "extra": entry.get("extra", "角色曲"),
                "pack": pack_id,
            })
    packs.sort(key=lambda item: item["order"])
    return packs, albums, tracks


def apply_tracks(chars: list[dict], tracks: list[dict]) -> list[dict]:
    """把曲包曲目并进角色表（返回新的角色列表；曲目追加在原有条目之后）。"""
    by_key = {char["key"]: char for char in chars}
    merged = [dict(char, music=[list(entry) for entry in char["music"]]) for char in chars]
    by_key = {char["key"]: char for char in merged}
    for track in tracks:
        char = by_key.get(track["character"])
        if char is None:
            continue      # 校验阶段已经报错，这里只是不炸
        char["music"].append([track["album"], track["title"], track["extra"]])
    return merged
