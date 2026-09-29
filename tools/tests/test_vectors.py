"""跨仓库共享测试向量（REFACTOR-PLAN v2 §18 Q1）。

Q1 的落地口径是**共享向量为主**：每一个跨仓库的产物形状，两侧各存一份**字面量**（零 import
依赖），漂移时两侧测试同时报红。这里存的是主仓库（读取侧）那份；写入侧的两份分别在两个数据
仓库的测试里 —— 它们各存一份**同样的**字面量。改形状必须同时改三处，这正是向量要的效果。

形状目录（§13.4 / docs/otomads-separation-v1.md §2）：

    数据仓库写 → 主仓库读   dataset/{index,characters,albums,tracks,sources,pack-audio}.json
    主仓库写   → 前端读     data/public/data/**（运行时那份）与两张镜像 manifest

向量只写**键集合**（必填 / 可选）与**行的元数**，不写值域：值域由 validate 与各自的单测守。
"""
import json

import pytest

from tmc import build, repo

# ---------------------------------------------------------------- 数据集（数据仓库写）

DATASET_INDEX = {"required": ["schema", "mode", "source", "counts"],
                 "types": {"schema": int, "mode": str, "source": dict, "counts": dict}}
DATASET_SOURCE = {"required": ["repo", "commit"], "optional": ["dirty"]}
DATASET_COUNTS = {"required": ["characters", "albums", "trackEntries", "distinctTracks"],
                   "types": {"characters": int, "albums": int, "trackEntries": int,
                             "distinctTracks": int}}
DATASET_CHARACTERS = {"required": ["schema", "characters"],
                       "types": {"schema": int, "characters": list}}
DATASET_CHARACTER = {"required": ["key", "music"], "optional": ["card", "covers"],
                      "types": {"key": str, "music": list, "card": list, "covers": list}}
DATASET_ALBUMS = {"required": ["schema", "albums"], "types": {"schema": int, "albums": list}}
DATASET_ALBUM = {"required": ["key", "name", "kind", "pack", "order"],
                 "optional": ["showAlbumName", "work"],
                 "types": {"key": str, "name": str, "kind": str, "pack": str, "order": int,
                           "showAlbumName": bool, "work": str}}
DATASET_TRACKS = {"required": ["schema", "tracks"], "types": {"schema": int, "tracks": dict}}
DATASET_TRACK = {"required": ["album", "title", "extra"], "optional": ["author", "authors"],
                 "types": {"album": str, "title": str, "extra": str, "author": str,
                           "authors": list}}
DATASET_SOURCES = {"required": ["schema", "sources"], "types": {"schema": int, "sources": list}}
DATASET_SOURCE_RECORD = {"required": ["id", "label", "tableUrl", "kind", "order", "enabled",
                                       "proxyable", "description"], "optional": ["loudnessUrl"],
                          "types": {"id": str, "label": dict, "tableUrl": str, "kind": str,
                                    "order": int, "enabled": bool, "proxyable": bool,
                                    "description": dict, "loudnessUrl": str}}
DATASET_LABEL = {"required": ["en", "zh"]}
DATASET_PACK_AUDIO = {"required": ["schema", "entries"],
                       "types": {"schema": int, "entries": list}}
DATASET_PACK_AUDIO_ROW = 5        # [专辑, 曲名, start_time, stop_time, source]（packs-audio-v1 §6）

#: 数据集的六件（缺任何一件 ⇒ load_dataset 当这个模式没有数据集，§7.2 ③）。
#: pack-audio.json 可选：自定义模式没有音频口径，那份数据集不写它。
DATASET_FILES = {
    "index.json": DATASET_INDEX,
    "characters.json": DATASET_CHARACTERS,
    "albums.json": DATASET_ALBUMS,
    "tracks.json": DATASET_TRACKS,
    "sources.json": DATASET_SOURCES,
    "pack-audio.json": DATASET_PACK_AUDIO,
}

# ---------------------------------------------------------------- 运行时产物（主仓库写）

RUNTIME_INDEX = {"required": ["schema", "mode", "contentHash", "counts"],
                "optional": ["source", "fallback"],
                "types": {"schema": int, "mode": str, "contentHash": str, "counts": dict,
                          "source": dict, "fallback": bool}}
#: 原曲那份 index.json **不记** source（自指，§7.2）⇒ 只要求四键，source 在可选里。
#: `fallback: true` = 这份是**空兜底**（数据仓库与 Release 快照都不可得，§7.2 ③）：没有来源版本
#: 可写，于是显式打标（custom 在主仓库 CI 里永远走这条）。两个键互斥。
RUNTIME_CHARACTERS = {"required": ["schema", "characters"],
                      "types": {"schema": int, "characters": list}}
RUNTIME_CHARACTER = {"required": ["key", "name", "order", "card", "searchNames", "music"],
                     "optional": ["covers"]}
RUNTIME_ALBUMS = DATASET_ALBUMS
RUNTIME_ALBUM = DATASET_ALBUM
RUNTIME_TRACK = DATASET_TRACK
RUNTIME_SOURCES = DATASET_SOURCES
RUNTIME_SOURCE_RECORD = DATASET_SOURCE_RECORD
RUNTIME_CARDSETS = {"required": ["schema", "default", "cardSets"],
                    "types": {"schema": int, "default": str, "cardSets": list}}
RUNTIME_CARDSET = {"required": ["id", "dir", "label", "localPrefix", "origins"],
                    "optional": ["localOnly", "sourceOnly", "mode"],
                    "types": {"id": str, "dir": str, "label": dict, "localPrefix": str,
                              "origins": list, "localOnly": bool, "sourceOnly": bool, "mode": str}}

# ---------------------------------------------------------------- 源清单 manifest（§2.1/§6）

#: 镜像 manifest 与音MAD / 本机助手清单**同一个形状**（§2.1）。
MIRROR_MANIFEST = {"required": ["schema", "mode", "pack", "tracks"]}
MIRROR_ROW = 3                    # [专辑, 曲名, 地址]；镜像地址不改，没有第 4 位版本号（D144）


def spec_problem(where: str, payload, spec: dict) -> list[str]:
    """payload 对不上向量 ⇒ 说清缺了谁、多出谁、谁的类型不对。

    多出来的键也必须登记 —— 悄悄加字段同样是形状漂移，两侧测试要一起红。
    """
    got = set(payload)
    problems = []
    missing = [key for key in spec["required"] if key not in got]
    if missing:
        problems.append(f"{where} 缺键 {missing}")
    extra = sorted(got - set(spec["required"]) - set(spec.get("optional", [])))
    if extra:
        problems.append(f"{where} 多出没登记的键 {extra}（形状变了就把向量一起改）")
    for key, want in (spec.get("types") or {}).items():
        if key in payload and not isinstance(payload[key], want):
            problems.append(f"{where}.{key} 的类型不是 {want.__name__}：{type(payload[key]).__name__}")
    return problems


def rows_problem(where: str, rows, width: int) -> list[str]:
    problems = []
    for index, row in enumerate(rows):
        if not isinstance(row, list) or len(row) != width:
            problems.append(f"{where} 第 {index + 1} 行的元数不是 {width}：{row!r}")
        elif not all(isinstance(cell, str) for cell in row):
            problems.append(f"{where} 第 {index + 1} 行有非字符串：{row!r}")
    return problems


def check_dataset(where: str, read) -> list[str]:
    """一份数据集（六件）逐键对向量；read 是 文件名 → 载荷 的读法。"""
    problems: list[str] = []
    for name, spec in DATASET_FILES.items():
        try:
            payload = read(name)
        except FileNotFoundError:
            if name == "pack-audio.json":
                continue                      # 可选件：自定义模式没有
            problems.append(f"{where}/{name} 不存在")
            continue
        problems += spec_problem(f"{where}/{name}", payload, spec)
    index = read("index.json")
    problems += spec_problem(f"{where}/index.json source", index.get("source") or {}, DATASET_SOURCE)
    problems += spec_problem(f"{where}/index.json counts", index.get("counts") or {}, DATASET_COUNTS)
    for entry in read("characters.json").get("characters", []):
        problems += spec_problem(f"{where}/characters.json 角色", entry, DATASET_CHARACTER)
    for entry in read("albums.json").get("albums", []):
        problems += spec_problem(f"{where}/albums.json 专辑", entry, DATASET_ALBUM)
    for track_id, entry in read("tracks.json").get("tracks", {}).items():
        problems += spec_problem(f"{where}/tracks.json {track_id}", entry, DATASET_TRACK)
    for entry in read("sources.json").get("sources", []):
        problems += spec_problem(f"{where}/sources.json 源", entry, DATASET_SOURCE_RECORD)
        problems += spec_problem(f"{where}/sources.json 源 label", entry.get("label") or {},
                                 DATASET_LABEL)
    try:
        problems += rows_problem(f"{where}/pack-audio.json", read("pack-audio.json").get("entries", []),
                                 DATASET_PACK_AUDIO_ROW)
    except FileNotFoundError:
        pass
    return problems


def literal_dataset() -> dict:
    """按向量字面量造一份最小数据集（**不 import 任何一个数据仓库**，零依赖）。"""
    return {
        "index.json": {"schema": 2, "mode": "otomads",
                       "source": {"repo": "demo-data", "commit": "0" * 40, "dirty": False},
                       "counts": {"characters": 1, "albums": 1, "trackEntries": 1,
                                  "distinctTracks": 1}},
        "characters.json": {"schema": 2, "characters": [
            {"key": "cirno", "music": ["cirno_otomad_001"], "card": ["c.png"]}]},
        "albums.json": {"schema": 2, "albums": [
            {"key": "otomads", "name": "otomads", "kind": "other", "pack": "otomads",
             "order": 100, "showAlbumName": False}]},
        "tracks.json": {"schema": 2, "tracks": {
            "cirno_otomad_001": {"album": "otomads", "title": "一", "extra": "角色曲", "author": "甲"}}},
        "sources.json": {"schema": 2, "sources": [
            {"id": "local", "label": {"en": "l", "zh": "l"}, "tableUrl": "manifest.json",
             "kind": "local", "order": 1, "enabled": True, "proxyable": False,
             "description": {"en": "", "zh": ""}}]},
        "pack-audio.json": {"schema": 2, "entries": [["otomads", "一", "", "", "https://example.com/a"]]},
    }


def test_the_literal_dataset_follows_its_own_vectors(tmp_path):
    """字面量必须自身合规：向量写错时先在这里红，而不是到数据仓库那边。"""
    for name, payload in literal_dataset().items():
        (tmp_path / name).write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n",
                                     encoding="utf-8")
    read = lambda name: json.loads((tmp_path / name).read_text(encoding="utf-8"))
    assert check_dataset("字面量", read) == []


def test_built_artifacts_follow_the_runtime_vectors(tmp_path, monkeypatch):
    """主仓库的产物逐键对运行时向量：数据集（字面量）→ build_outputs → 每一个文件。"""
    dataset_dir = tmp_path / "otomads" / "dataset"
    dataset_dir.mkdir(parents=True)
    for name, payload in literal_dataset().items():
        (dataset_dir / name).write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n",
                                        encoding="utf-8")
    monkeypatch.setattr(repo, "data_dir", lambda mode: tmp_path / mode)
    _indices, outputs = build.build_outputs()
    read = lambda *parts: json.loads(outputs[repo.PUBLIC_DATA.joinpath(*parts)])

    problems: list[str] = []
    for mode in ("originals", "otomads", "custom"):
        base = ("index.json",) if mode == "originals" else (mode, "index.json")
        index = read(*base)
        problems += spec_problem(f"{mode}/index.json", index, RUNTIME_INDEX)
        problems += spec_problem(f"{mode}/index.json counts", index["counts"], DATASET_COUNTS)
        if mode != "originals" and "source" in index:
            problems += spec_problem(f"{mode}/index.json source", index["source"], DATASET_SOURCE)
        for name, spec, inner in (("characters.json", RUNTIME_CHARACTERS, ("characters", RUNTIME_CHARACTER)),
                                  ("albums.json", RUNTIME_ALBUMS, ("albums", RUNTIME_ALBUM)),
                                  ("sources.json", RUNTIME_SOURCES, ("sources", RUNTIME_SOURCE_RECORD))):
            parts = (name,) if mode == "originals" else (mode, name)
            payload = read(*parts)
            problems += spec_problem(f"{mode}/{name}", payload, spec)
            key, entry_spec = inner
            for entry in payload[key]:
                problems += spec_problem(f"{mode}/{name} 条目", entry, entry_spec)
        tracks = read(*((("tracks.json",) if mode == "originals" else (mode, "tracks.json"))))["tracks"]
        for track_id, entry in tracks.items():
            problems += spec_problem(f"{mode}/tracks.json {track_id}", entry, RUNTIME_TRACK)
    cardsets = read("cardsets.json")
    problems += spec_problem("cardsets.json", cardsets, RUNTIME_CARDSETS)
    for entry in cardsets["cardSets"]:
        problems += spec_problem("cardsets.json cardSet", entry, RUNTIME_CARDSET)
    for source_id in build.mirror_source_ids():
        payload = read("sources", source_id + ".json")
        problems += spec_problem(f"sources/{source_id}.json", payload, MIRROR_MANIFEST)
        problems += rows_problem(f"sources/{source_id}.json", payload["tracks"], MIRROR_ROW)
    assert problems == [], problems


def test_real_datasets_follow_the_vectors():
    """真数据集（两个数据仓库在场时）逐键对同一批向量 —— 漂移在这里当场红。"""
    checked = []
    for mode in ("otomads", "custom"):
        root = repo.dataset_dir(mode)
        if not (root / "characters.json").is_file():
            continue
        checked.append(mode)
        read = lambda name: json.loads((root / name).read_text(encoding="utf-8"))
        assert check_dataset(mode, read) == []
    if not checked:
        pytest.skip("两个数据集都不在场（§7.2 ③ 的降级路径）：向量留给数据仓库那边的同一份字面量守")
