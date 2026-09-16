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


def build_albums() -> dict:
    with open(repo.DATA / "albums.toml", "rb") as fh:
        data = tomllib.load(fh)
    albums = []
    for entry in data["album"]:
        albums.append({k: entry[k] for k in ("key", "name", "kind", "pack", "order") if k in entry}
                      | ({"work": entry["work"]} if "work" in entry else {}))
    albums.sort(key=lambda a: a["order"])
    return {"schema": SCHEMA_VERSION, "albums": albums}


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


def content_hash(characters: dict, albums: dict) -> str:
    blob = json.dumps([characters, albums], ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="只检查漂移，不写文件")
    args = ap.parse_args(argv)

    characters, chars = build_characters()
    albums = build_albums()
    sources = build_sources()
    digest = content_hash(characters, albums)
    index = {
        "schema": SCHEMA_VERSION,
        "contentHash": digest,
        "counts": {
            "characters": len(chars),
            "albums": len(albums["albums"]),
            "trackEntries": sum(len(c["music"]) for c in chars),
            "distinctTracks": len({(a, t) for c in chars for a, t, _e in c["music"]}),
            "sources": len(sources["sources"]),
        },
    }
    outputs = {
        repo.PUBLIC_DATA / "characters.json": _dumps(characters),
        repo.PUBLIC_DATA / "albums.json": _dumps(albums),
        repo.PUBLIC_DATA / "index.json": _dumps(index),
        repo.PUBLIC_DATA / "sources.json": _dumps(sources),
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
