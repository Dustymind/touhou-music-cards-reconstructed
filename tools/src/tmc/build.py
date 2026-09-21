"""把 ``data/``（TOML 真相源）生成为运行时直接 fetch 的 JSON，写到 ``public/data/``。

布局（音MAD 与原曲分离契约 v1，见 ``docs/otomads-separation-v1.md``）：

* **共享项**（与模式无关）写一份：``sources.json`` / ``cardsets.json`` / ``packs.json`` / ``sources/*.json``；
* **每模式一份数据集**：``index.json`` / ``characters.json`` / ``albums.json``，
  音MAD 那套在 ``public/data/otomads/`` —— 各自只含本模式的曲目、各自一个 ``contentHash``。

生成物随源码提交；``--check`` 用于 CI 漂移守卫：重新生成后必须与已提交内容一致。

用法::

    uv run python -m tmc.build          # 生成
    uv run python -m tmc.build --check  # 只检查是否有漂移（有漂移返回 1）
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tomllib

from . import packs as pack_mod
from . import repo

SCHEMA_VERSION = 1

#: 两个音乐模式（与前端 `src/music/mode.ts` 的 `MusicMode` 一致）
MODES = ("originals", "otomads")


def _dumps(payload) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=1, sort_keys=False) + "\n"


def load_characters() -> list[dict]:
    """真相源：``data/characters/*.toml``（一角色一份，含**该角色的全部**曲目）。"""
    chars = []
    for path in sorted((repo.DATA / "characters").glob("*.toml")):
        with open(path, "rb") as fh:
            c = tomllib.load(fh)
        chars.append({
            "key": c["key"], "name": c["name"], "order": c["order"],
            "card": list(c["card"]), "searchNames": list(c["searchNames"]),
            "music": [list(entry) for entry in c["music"]],
        })
    chars.sort(key=lambda c: c["order"])
    return chars


def load_albums() -> list[dict]:
    """真相源：``data/albums.toml``（原曲侧专辑注册表）。"""
    with open(repo.DATA / "albums.toml", "rb") as fh:
        data = tomllib.load(fh)
    albums = []
    for entry in data["album"]:
        albums.append({k: entry[k] for k in ("key", "name", "kind", "pack", "order") if k in entry}
                      | ({"work": entry["work"]} if "work" in entry else {}))
    albums.sort(key=lambda a: a["order"])
    return albums


def build_characters(mode: str, chars: list[dict], pack_tracks: list[dict]) -> dict:
    """某模式的角色表：**只带本模式的曲目**。

    * ``originals``：全部 121 个角色，各自原本的曲目（曲包曲目**不再**并进来）；
    * ``otomads``：只有"有音MAD 曲目"的角色，曲目就是那些曲包曲目（顺序沿用曲包文件顺序）。

    身份字段（``name``/``order``/``card``/``searchNames``）来自**同一份真源**（契约 §5 S1），
    两份生成物里各存一份，跨模式一致性由 ``tmc.validate`` 守。
    """
    by_key = {char["key"]: char for char in chars}
    if mode == "originals":
        chosen = [dict(char, music=[list(entry) for entry in char["music"]]) for char in chars]
    else:
        chosen = []
        for key, entries in _pack_music(pack_tracks).items():
            char = by_key[key]
            chosen.append(dict(char, music=[list(entry) for entry in entries]))
        order = {char["key"]: char["order"] for char in chars}
        chosen.sort(key=lambda c: order[c["key"]])
    return {"schema": SCHEMA_VERSION, "characters": chosen}


def _pack_music(pack_tracks: list[dict]) -> dict[str, list[list]]:
    """曲包曲目 → ``{角色 key: [music 条目, …]}``（``apply_tracks`` 的替代：只并进 otomads 数据集）。"""
    music: dict[str, list[list]] = {}
    for track in pack_tracks:
        entry = [track["album"], track["title"], track["extra"]]
        if track.get("author"):
            entry.append(track["author"])      # 可选第 4 位：作者（D94）
        music.setdefault(track["character"], []).append(entry)
    return music


def build_albums(mode: str, pack_albums: list[dict]) -> dict:
    """某模式的专辑注册表：``originals`` = ``albums.toml``；``otomads`` = 曲包自带的专辑。"""
    albums: list[dict] = []
    for entry in pack_albums if mode != "originals" else []:
        albums.append({k: entry[k] for k in ("key", "name", "kind", "pack", "order") if k in entry}
                      | ({"showAlbumName": entry["showAlbumName"]} if "showAlbumName" in entry else {}))
    if mode == "originals":
        albums = load_albums()
    albums.sort(key=lambda a: a["order"])
    return {"schema": SCHEMA_VERSION, "albums": albums}


def build_packs(packs: list[dict]) -> dict:
    """曲包注册表 → 运行时 JSON（共享：它只描述"有哪些包"，与当前模式无关）。"""
    return {"schema": SCHEMA_VERSION, "packs": packs}


def build_sources(mode: str) -> dict:
    """**某个模式**的音乐源注册表 → 运行时 JSON（契约 `docs/sources-separation-v1.md` §2）。

    一个模式一份：原曲 = 三个远程镜像；音MAD = 本地曲库助手。前端只读这一份，不在代码里硬编码音源。
    """
    with open(repo.DATA / "sources" / f"{mode}.toml", "rb") as fh:
        data = tomllib.load(fh)
    sources = []
    for entry in data["source"]:
        sources.append({
            "id": entry["id"],
            "label": {"en": entry["label_en"], "zh": entry["label_zh"]},
            "tableUrl": entry["table_url"],
            "kind": entry["kind"],
            "order": entry["order"],
            "enabled": entry["enabled"],
            "proxyable": entry.get("proxyable", False),
            "description": {"en": entry.get("description_en", ""),
                            "zh": entry.get("description_zh", "")},
        })
    sources.sort(key=lambda s: s["order"])
    return {"schema": SCHEMA_VERSION, "sources": sources}


def build_card_sets() -> dict:
    """卡面图集注册表 → 运行时 JSON（素材不入库，前端按 origins 顺序远程取）。"""
    with open(repo.DATA / "card-sets.toml", "rb") as fh:
        data = tomllib.load(fh)
    sets = []
    for entry in data.get("card_set", []):
        sets.append({
            "id": entry["id"],
            "dir": entry["dir"],
            "label": {"en": entry["label_en"], "zh": entry["label_zh"]},
            "localPrefix": entry.get("local_prefix", "./"),
            "origins": list(entry["origins"]),
        })
    if not sets:
        raise SystemExit("data/card-sets.toml 里没有任何 [[card_set]]")
    return {"schema": SCHEMA_VERSION, "default": data.get("default", sets[0]["id"]), "cardSets": sets}


def content_hash(characters: dict, albums: dict, pack_audio: list[list[str]]) -> str:
    """**某个模式的**数据指纹（联机握手比它，一个模式一个）。

    ``otomads`` 那份**含曲包音频的来源与裁剪区间**：`source` / `start_time` / `stop_time` 虽然不进
    运行时数据，但它们决定"两端听到的是不是同一段音频"，所以两端不一致必须在**握手期**就被拒
    （契约见 `docs/packs-audio-v1.md` §6）。原曲那份没有曲包曲目，传空列表。
    """
    blob = json.dumps([characters, albums, pack_audio], ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def build_index(mode: str, characters: dict, albums: dict, digest: str) -> dict:
    chars = characters["characters"]
    return {
        "schema": SCHEMA_VERSION,
        "mode": mode,
        "contentHash": digest,
        "counts": {
            "characters": len(chars),
            "albums": len(albums["albums"]),
            "trackEntries": sum(len(c["music"]) for c in chars),
            # 条目是 [专辑, 曲名, extra] 外加**可选**的作者（第 4 位）→ 用 *rest 接住
            "distinctTracks": len({(a, t) for c in chars for a, t, *_rest in c["music"]}),
        },
    }


def dataset_dir(mode: str):
    """某模式数据集的目录：原曲在 ``public/data/``，音MAD 在 ``public/data/otomads/``。"""
    return repo.PUBLIC_DATA if mode == "originals" else repo.PUBLIC_DATA / mode


def build_outputs() -> tuple[dict, dict[str, dict[str, str]]]:
    """生成全部文件 → ``(摘要, {模式: {相对路径: 文本}})``。"""
    packs, pack_albums, pack_tracks = pack_mod.load_packs()
    chars = load_characters()
    pack_audio = pack_mod.audio_descriptors(pack_tracks)

    outputs: dict[str, str] = {}
    indices: dict[str, dict] = {}
    for mode in MODES:
        characters = build_characters(mode, chars, pack_tracks)
        albums = build_albums(mode, pack_albums)
        digest = content_hash(characters, albums, pack_audio if mode == "otomads" else [])
        index = build_index(mode, characters, albums, digest)
        indices[mode] = index
        base = dataset_dir(mode)
        outputs[base / "characters.json"] = _dumps(characters)
        outputs[base / "albums.json"] = _dumps(albums)
        outputs[base / "index.json"] = _dumps(index)
        # 源表随数据集走（音源层也按模式分，见 sources-separation-v1.md）
        outputs[base / "sources.json"] = _dumps(build_sources(mode))

    # 共享项：与模式无关，只写一份
    outputs[repo.PUBLIC_DATA / "cardsets.json"] = _dumps(build_card_sets())
    outputs[repo.PUBLIC_DATA / "packs.json"] = _dumps(build_packs(packs))
    for source_id in ("netease163", "cloudflare_r2", "thbwiki"):
        outputs[repo.PUBLIC_DATA / "sources" / f"{source_id}.json"] = (
            repo.DATA / "sources" / f"{source_id}.json").read_text(encoding="utf-8")
    return indices, outputs


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="只检查漂移，不写文件")
    args = ap.parse_args(argv)

    indices, outputs = build_outputs()

    if args.check:
        drift = [str(p.relative_to(repo.ROOT)) for p, text in outputs.items()
                 if not p.exists() or p.read_text(encoding="utf-8") != text]
        if drift:
            print("❌ 生成物与 data/ 不一致：\n  " + "\n  ".join(drift), file=sys.stderr)
            return 1
        print("✅ 生成物无漂移")
        return 0

    for path, text in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    summary = " / ".join(
        f"{mode} {indices[mode]['counts']['characters']} 角色 "
        f"{indices[mode]['counts']['distinctTracks']} 曲（{indices[mode]['contentHash'][:12]}）"
        for mode in MODES)
    print(f"写出 {len(outputs)} 个文件 → public/data/：{summary}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
