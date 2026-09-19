"""把 ``data/``（TOML 真相源）生成为运行时直接 fetch 的 JSON，写到 ``public/data/``。

生成物随源码提交；``--check`` 用于 CI 漂移守卫：重新生成后必须与已提交内容一致。

用法::

    uv run python -m tmc.build          # 生成
    uv run python -m tmc.build --check  # 只检查是否有漂移（有漂移返回 1）
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import tomllib

from . import packs as pack_mod
from . import repo

SCHEMA_VERSION = 1


def _dumps(payload) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=1, sort_keys=False) + "\n"


def build_characters() -> tuple[dict, list[dict]]:
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
    return {"schema": SCHEMA_VERSION, "characters": chars}, chars


def build_albums(pack_albums: list[dict] | None = None) -> dict:
    """专辑注册表 + 曲包自带的专辑（后者 pack 字段指向曲包 id）。"""
    with open(repo.DATA / "albums.toml", "rb") as fh:
        data = tomllib.load(fh)
    albums = []
    for entry in data["album"]:
        albums.append({k: entry[k] for k in ("key", "name", "kind", "pack", "order") if k in entry}
                      | ({"work": entry["work"]} if "work" in entry else {}))
    for entry in pack_albums or []:
        albums.append({k: entry[k] for k in ("key", "name", "kind", "pack", "order") if k in entry}
                      | ({"showAlbumName": entry["showAlbumName"]} if "showAlbumName" in entry else {}))
    albums.sort(key=lambda a: a["order"])
    return {"schema": SCHEMA_VERSION, "albums": albums}


def build_packs(packs: list[dict]) -> dict:
    """曲包注册表 → 运行时 JSON（前端据此把"哪些专辑属于哪个包"显示出来）。"""
    return {"schema": SCHEMA_VERSION, "packs": packs}


def build_sources() -> dict:
    """音乐源注册表 → 运行时 JSON（前端只读这一份，不在代码里硬编码音源）。"""
    with open(repo.DATA / "sources" / "sources.toml", "rb") as fh:
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
    """数据指纹（联机握手比它）。

    **含曲包音频的来源与裁剪区间**：`source` / `start_time` / `stop_time` 虽然不进运行时数据，
    但它们决定"两端听到的是不是同一段音频"，所以两端不一致必须**在握手期**就被拒
    （契约见 `docs/packs-audio-v1.md` §6）。
    """
    blob = json.dumps([characters, albums, pack_audio], ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="只检查漂移，不写文件")
    args = ap.parse_args(argv)

    packs, pack_albums, pack_tracks = pack_mod.load_packs()
    characters, chars = build_characters()
    # 曲包曲目并进角色表（album 的 pack 字段决定它属于哪个模式）
    characters = {"schema": characters["schema"],
                  "characters": pack_mod.apply_tracks(characters["characters"], pack_tracks)}
    chars = characters["characters"]
    albums = build_albums(pack_albums)
    sources = build_sources()
    card_sets = build_card_sets()
    packs_json = build_packs(packs)
    digest = content_hash(characters, albums, pack_mod.audio_descriptors(pack_tracks))
    index = {
        "schema": SCHEMA_VERSION,
        "contentHash": digest,
        "counts": {
            "characters": len(chars),
            "albums": len(albums["albums"]),
            "trackEntries": sum(len(c["music"]) for c in chars),
            # 条目是 [专辑, 曲名, extra] 外加**可选**的作者（第 4 位）→ 用 *rest 接住
            "distinctTracks": len({(a, t) for c in chars for a, t, *_rest in c["music"]}),
            "sources": len(sources["sources"]),
            "cardSets": len(card_sets["cardSets"]),
            "packs": len(packs_json["packs"]),
            "packTracks": len(pack_tracks),
        },
    }
    outputs = {
        repo.PUBLIC_DATA / "characters.json": _dumps(characters),
        repo.PUBLIC_DATA / "albums.json": _dumps(albums),
        repo.PUBLIC_DATA / "index.json": _dumps(index),
        repo.PUBLIC_DATA / "sources.json": _dumps(sources),
        repo.PUBLIC_DATA / "cardsets.json": _dumps(card_sets),
        repo.PUBLIC_DATA / "packs.json": _dumps(packs_json),
    }
    for source_id in ("netease163", "cloudflare_r2", "thbwiki"):
        outputs[repo.PUBLIC_DATA / "sources" / f"{source_id}.json"] = (
            repo.DATA / "sources" / f"{source_id}.json").read_text(encoding="utf-8")

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
    print(f"写出 {len(outputs)} 个文件 → public/data/（contentHash {digest[:12]}，"
          f"{index['counts']['characters']} 角色 / {index['counts']['distinctTracks']} 曲）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
