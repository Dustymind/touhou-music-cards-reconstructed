"""把 ``data/``（TOML 真相源）生成为运行时直接 fetch 的 JSON，写到 ``data/public/data/``。

布局（音MAD 与原曲分离契约 v1，见 ``docs/otomads-separation-v1.md``）：

* **共享项**（与模式无关）写一份：``cardsets.json`` / ``sources/*.json``；
* **每模式一份数据集**：``index.json`` / ``characters.json`` / ``albums.json`` /
  ``tracks.json``，音MAD 那套在 ``data/public/data/otomads/`` —— 各自只含本模式的曲目、
  各自一个 ``contentHash``。

S3 起生成物**不进仓库**（``data/public/`` 是 gitignored 生成目录，Vite 的 publicDir 指过去）；
可复现性由 ``pnpm gate`` 的两次构建比对承担。

用法::

    uv run python -m tmc.build          # 生成
"""
from __future__ import annotations

import hashlib
import pathlib
import json
import re
import sys
import tomllib

from . import packs as pack_mod
from . import repo

SCHEMA_VERSION = 2

#: 三个音乐模式（与前端 `src/music/mode.ts` 的 `MusicMode` 一致）。
#: 第三个 `custom`（自定义）**自带数据集恒为空**：卡名/卡面/曲目全部来自使用者自己填的源清单，
#: 运行时由应用重建（契约 `docs/custom-mode-v1.md`）；这里只生成那份空兜底 + 它的空源注册表。
MODES = ("originals", "otomads", "custom")


def _dumps(payload) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=1, sort_keys=False) + "\n"


def load_characters() -> list[dict]:
    """真相源：``data/characters/*.toml``（一角色一份，含**该角色的全部**曲目）。

    S1b 起 TOML 是规整化形状（``search_names`` / ``card``=卡面组 id / ``card_name``
    / ``[[track]]`` 带 ``id``·``album_key``·``sources``）；这里**还原旧内存形状**
    （``searchNames`` / ``card``=文件名 / ``music``=三元组），contentHash 与输出不变。
    """
    key_to_name = {a["key"]: a["name"] for a in load_albums()}
    chars = []
    for path in sorted((repo.DATA / "characters").glob("*.toml")):
        with open(path, "rb") as fh:
            c = tomllib.load(fh)
        music = [{"id": t["id"], "album": key_to_name[t["album_key"]], "title": t["title"],
                  "extra": t["extra"]} for t in c.get("track", [])]
        chars.append({
            "key": c["key"], "name": c["name"], "order": c["order"],
            "card": list(c["card_name"]), "searchNames": list(c["search_names"]),
            "music": music,
        })
    chars.sort(key=lambda c: c["order"])
    return chars


def load_albums() -> list[dict]:
    """真相源：``data/originals.toml``（原曲侧专辑注册表）。"""
    with open(repo.DATA / "originals.toml", "rb") as fh:
        data = tomllib.load(fh)
    albums = []
    for entry in data["album"]:
        albums.append({k: entry[k] for k in ("key", "name", "kind", "pack", "order") if k in entry}
                      | ({"work": entry["work"]} if "work" in entry else {}))
    albums.sort(key=lambda a: a["order"])
    return albums


def build_characters(mode: str, chars: list[dict], pack_tracks: list[dict],
                     pack_cards: dict[str, list[str]] | None = None,
                     pack_covers: dict[str, list[str]] | None = None) -> dict:
    """某模式的角色表：**只带本模式的曲目**。

    * ``originals``：全部 121 个角色，各自原本的曲目（曲包曲目**不再**并进来）；
    * ``otomads``：只有"有音MAD 曲目"的角色，曲目就是那些曲包曲目（顺序沿用曲包文件顺序）；
    * ``custom``：**恒为空表**（一条都不生成）—— 这个模式一条自带数据都没有，
      卡名/卡面/曲目全部来自使用者自己的源清单，运行时由应用重建（契约 `docs/custom-mode-v1.md`）。
      ⚠️ 这条分支不能省：`mode != "originals"` 原来会把**其它任何模式**都当成曲包那份处理 ⇒
      漏了它，`custom` 会安静地拿到音MAD 那份的**全部角色与曲目**（最危险的一处）。

    身份字段（``name``/``order``/``searchNames``）来自**同一份真源**（契约 §5 S1），两份生成物里各存一份，
    跨模式一致性由 ``tmc.validate`` 守；**卡面是例外**：音MAD 侧可以在曲包的角色文件里用
    ``card = [...]`` 覆盖（写法同 ``data/characters/*.toml``），缺省才沿用共享身份。

    ``pack_covers`` 是**源封面**：``{角色 key: [链接, …]}``，每首曲目一条（D153/D167：
    **一条链接**、原版无修改的图，画幅与裁切由前端按用户选的档位运行时做）。
    它只在 ``otomads`` 那份里写进 ``covers``，原曲那份**一个字段都不多**（两份的指纹口径因此不变）。
    """
    by_key = {char["key"]: char for char in chars}
    if mode == "originals":
        chosen = [dict(char, music=[dict(entry) for entry in char["music"]]) for char in chars]
    elif mode == "custom":
        chosen = []
    else:
        chosen = []
        cards = pack_cards or {}
        covers = pack_covers or {}
        for key, entries in _pack_music(pack_tracks).items():
            char = by_key[key]
            face = cards.get(key)
            cover = covers.get(key)
            # 曲id（§11.1）：<角色id>_otomad_<序号>，三位、从 01 起、按曲包文件顺序（与数据仓库 manifest 同序）
            music = []
            for index, entry in enumerate(entries, start=1):
                item = {"id": f"{key}_otomad_{index:03d}", "album": entry[0],
                        "title": entry[1], "extra": entry[2]}
                if len(entry) > 3:
                    item["author"] = entry[3]
                if len(entry) > 4:
                    item["authors"] = entry[4]
                music.append(item)
            # 源封面（D153/D167）：每条曲目**一条链接**，生成物里就是 `covers` 字符串数组
            chosen.append(dict(char, music=music,
                               **({"card": list(face)} if face else {}),
                               **({"covers": list(cover)} if cover else {})))
        order = {char["key"]: char["order"] for char in chars}
        chosen.sort(key=lambda c: order[c["key"]])
    return {"schema": SCHEMA_VERSION, "characters": chosen}


def _pack_music(pack_tracks: list[dict]) -> dict[str, list[list]]:
    """曲包曲目 → ``{角色 key: [music 条目, …]}``（**只有** otomads 数据集会用它，D112）。"""
    music: dict[str, list[list]] = {}
    for track in pack_tracks:
        entry = [track["album"], track["title"], track["extra"]]
        if track.get("author"):
            entry.append(track["author"])      # 可选第 4 位：作者（D94）
        if track.get("authors"):
            entry.append(track["authors"])     # 可选第 5 位：**多作者数组**（D135，与第 4 位同源）
        music.setdefault(track["character"], []).append(entry)
    return music


def build_albums(mode: str, pack_albums: list[dict]) -> dict:
    """某模式的专辑注册表：``originals`` = ``originals.toml``；``otomads`` = 曲包自带的专辑；
    ``custom`` = 空表（专辑跟着使用者的源清单走，运行时才有）。"""
    albums: list[dict] = []
    for entry in pack_albums if mode == "otomads" else []:
        albums.append({k: entry[k] for k in ("key", "name", "kind", "pack", "order") if k in entry}
                      | ({"showAlbumName": entry["showAlbumName"]} if "showAlbumName" in entry else {}))
    if mode == "originals":
        albums = load_albums()
    albums.sort(key=lambda a: a["order"])
    return {"schema": SCHEMA_VERSION, "albums": albums}


def _single_source_files() -> list[pathlib.Path]:
    """自包含的「一源一文件」（S1c）：顶层有 ``id``（注册表文件是 ``[[source]]`` 数组，没有顶层 ``id``）。"""
    root = repo.DATA / "sources"
    if not root.is_dir():
        return []
    out = []
    for path in sorted(root.glob("*.toml")):
        with open(path, "rb") as fh:
            data = tomllib.load(fh)
        if "id" in data:
            out.append(path)
    return out


def load_mirror_tracks(source_id: str) -> list[list[str]]:
    """读一张镜像源表（``data/sources/<id>.toml`` 的 ``[[track]]``）→ ``[[album, title, url], …]``。"""
    with open(repo.DATA / "sources" / f"{source_id}.toml", "rb") as fh:
        data = tomllib.load(fh)
    return [[t["album"], t["title"], t["url"]] for t in data.get("track", [])]


def load_mirror_entries(source_id: str) -> list[dict]:
    """读一张镜像源表的 ``[[track]]`` → ``[{id, album, title, url}, …]``（S2：id 键控的生成物由此重排）。"""
    with open(repo.DATA / "sources" / f"{source_id}.toml", "rb") as fh:
        data = tomllib.load(fh)
    return [dict(t) for t in data.get("track", [])]


def load_registry(mode: str) -> list[dict]:
    """读某个模式的音源注册表。

    ``originals``（S1c 起）= 每源一个自包含 TOML 的**头部集合**（没有单独注册表文件）；
    其余模式 = ``data/sources/<mode>.toml`` 或 submodule 里的同名注册表文件。
    """
    if mode == "originals":
        entries = []
        for path in _single_source_files():
            with open(path, "rb") as fh:
                data = tomllib.load(fh)
            entries.append({k: data[k] for k in (
                "id", "label_en", "label_zh", "table_url", "kind", "order",
                "enabled", "proxyable", "description_en", "description_zh") if k in data})
        if not entries:
            raise SystemExit("找不到原曲音源文件（data/sources/*.toml 单源形状）")
        return sorted(entries, key=lambda e: e["order"])
    path = repo.find_source_registry(mode)
    if path is None:
        searched = "、".join(repo.shown(root) for root in repo.source_roots())
        raise SystemExit(f"找不到音源注册表 {mode}.toml（找过：{searched}）")
    with open(path, "rb") as fh:
        return tomllib.load(fh)["source"]


def mirror_source_ids() -> tuple[str, ...]:
    """**镜像表**的音源 id = 原曲注册表里 ``kind = "remote"`` 的那些。

    镜像清单只有注册表一处真源（review R7④）：构建（把表写进 ``data/public/data/sources/``）、
    `tmc.validate` 的三处检查与其 `--urls` 抽查都从这里取 —— 加一个镜像只改 TOML。
    远程镜像全在原曲注册表里（音MAD 侧只有一个本地源，契约 `docs/sources-separation-v1.md`）。
    """
    return tuple(entry["id"] for entry in load_registry("originals") if entry["kind"] == "remote")


def table_url_problem(value: object) -> str | None:
    """源表的地址是否可用？可用返回 ``None``，否则返回一句人话（D131）。

    只有两种合法形态：

    * **绝对 URL**（``https://…/table.json``）—— 第三方源可以挂在别的域名上；
    * **相对路径**（``data/sources/x.json`` / ``manifest.json``）—— 相对**应用所在的那一层**解析。

    ✗ **根绝对路径**（前导 ``/``，如 ``/data/sources/x.json``）在四种部署形态里有一种必坏：
    站点挂在子目录（GitHub Pages 项目页 ``user.github.io/<repo>/``、任意子路径反代）时它会打到
    **域名根**上去 → 404 → 那个模式下所有曲目都解析不出地址。前端 ``base`` 用 ``./`` 只治得了
    相对引用，管不到 ``fetch()`` 收到的那条字符串 ✓。

    ``//host/x``（协议相对）也没法在“同源相对路径”和“跨源绝对地址”之间归类，一并拒掉。
    """
    if not isinstance(value, str) or value.strip() == "":
        return "不能为空"
    if value.startswith("/"):
        return (f"不能是根绝对路径（前导 `/`）：站点部署在子目录时会打到域名根上 → 404。"
                f"请写成相对路径（如 `data/sources/x.json`）或完整 URL（`https://…`）")
    if re.match(r"^[a-zA-Z][a-zA-Z0-9+.\-]*:", value):
        if not re.match(r"^https?://", value, re.IGNORECASE):
            return "只支持 http(s) 绝对 URL，或相对路径（其它 scheme 前端取不到）"
    return None


def source_table_url_problem(kind: object, value: object) -> str | None:
    """按**源的类型**判地址形态：可用返回 ``None``，否则返回一句人话。

    ``kind = "custom"``（模式 3）多认一种合法形态：**空串** —— 那个源的表地址由使用者自己在应用里填
    （默认空、重置 = 清空），"还没填"是它的**正常状态**，不是坏数据（属性见 `docs/custom-mode-v1.md` C7）。
    非空时**仍按** :func:`table_url_problem` 一字不改地判，其余 kind 也一字不改 ——
    于是"根绝对路径在子目录部署下必 404"那条守卫（D131）在这条路上同样成立。
    """
    if kind == "custom" and isinstance(value, str) and value.strip() == "":
        return None
    return table_url_problem(value)


def build_sources(mode: str) -> dict:
    """**某个模式**的音乐源注册表 → 运行时 JSON（契约 `docs/sources-separation-v1.md` §2）。

    一个模式一份：原曲 = 远程镜像；音MAD = 本地曲库助手；自定义 = 一条**地址为空的**用户源
    （地址由使用者填在应用里，见 `source_table_url_problem`）。前端只读这一份，不在代码里硬编码音源。
    地址形态在这里就把关（:func:`source_table_url_problem`）：坏形态在 `data:build` 当场炸，
    而不是等用户在某个子目录部署上发现"一首歌都放不出来"（D131）。
    """
    sources = []
    for entry in load_registry(mode):
        problem = source_table_url_problem(entry["kind"], entry["table_url"])
        if problem is not None:
            raise SystemExit(
                f"❌ [{mode}] 音源 {entry['id']} 的 table_url 不合法：{entry['table_url']}\n   {problem}")
        record = {
            "id": entry["id"],
            "label": {"en": entry["label_en"], "zh": entry["label_zh"]},
            "tableUrl": entry["table_url"],
            "kind": entry["kind"],
            "order": entry["order"],
            "enabled": entry["enabled"],
            "proxyable": entry.get("proxyable", False),
            "description": {"en": entry.get("description_en", ""),
                            "zh": entry.get("description_zh", "")},
        }
        # 每个源自己的响度表（D130）：路径相对数据集目录，前端按解析到的 sourceId 取表
        if entry.get("loudness"):
            record["loudnessUrl"] = entry["loudness"]
        sources.append(record)
    sources.sort(key=lambda s: s["order"])
    return {"schema": SCHEMA_VERSION, "sources": sources}


def build_card_sets() -> dict:
    """卡面图集注册表 → 运行时 JSON（素材不入库，前端按 origins 顺序远程取）。"""
    with open(repo.DATA / "card-sets.toml", "rb") as fh:
        data = tomllib.load(fh)
    sets = []
    for entry in data.get("card_set", []):
        record = {
            "id": entry["id"],
            "dir": entry["dir"],
            "label": {"en": entry["label_en"], "zh": entry["label_zh"]},
            "localPrefix": entry.get("local_prefix", "./"),
            "origins": list(entry.get("origins", [])),
        }
        # 本地图集（素材由用户自己放进仓库根 gitignored 目录，如 cards-otomads/）：没有远程 origin，前端只用 localPrefix
        if entry.get("local_only"):
            record["localOnly"] = True
        # 源封面图集（D153）：素材 = 源快照里的 `covers` 绝对 URL ⇒ 没目录、没 origin；
        # `mode` 限定它只在某个音乐模式出现（前端 `availableCardSets` 据此过滤）
        if entry.get("source_only"):
            record["sourceOnly"] = True
        if entry.get("mode"):
            record["mode"] = entry["mode"]
        sets.append(record)
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
            "distinctTracks": len({e["id"] for c in chars for e in c["music"]}),
        },
    }


def dataset_dir(mode: str):
    """某模式数据集的目录：原曲在 ``data/public/data/``，音MAD 在 ``data/public/data/otomads/``。"""
    return repo.PUBLIC_DATA if mode == "originals" else repo.PUBLIC_DATA / mode


def loudness_tables(mode: str) -> list[tuple[pathlib.Path, pathlib.Path]]:
    """某模式各源声明的响度表 → ``[(源文件, 目标文件)]``（D130）。

    ``loudness`` 路径写在各源的注册表里、相对**注册表所在仓库的根**；表由源的所有者生成
    （音MAD 的表在数据仓库），主仓库只负责把它拷进 ``data/public/data/<mode>/``。
    """
    path = repo.find_source_registry(mode)
    if path is None:
        return []
    base = path.parent.parent                  # data/otomads/sources/otomads.toml → data/otomads
    return [(base / entry["loudness"], dataset_dir(mode) / entry["loudness"])
            for entry in load_registry(mode) if entry.get("loudness")]


def build_outputs() -> tuple[dict, dict[str, dict[str, str]]]:
    """生成全部文件 → ``(摘要, {模式: {相对路径: 文本}})``。

    音MAD 数据集依赖曲包真源（submodule）：**没初始化就跳过它**，不拿空数据覆盖已提交的生成物
    （submodule 在开发时可选，见 ``data/README.md``）。
    **自定义那个模式不依赖任何真源**（它恒为空）⇒ 跳过的只有 otomads：submodule 初始化与否，
    `data/public/data/custom/*` 与 `data/public/data/<原曲那几份>` 都**逐字相同**（Q2 的"构建不依赖 submodule"）。
    """
    _packs, pack_albums, pack_tracks, pack_cards, pack_covers = pack_mod.load_packs()
    chars = load_characters()
    pack_audio = pack_mod.audio_descriptors(pack_tracks)

    modes = MODES if pack_mod.available() else ("originals", "custom")
    outputs: dict[str, str] = {}
    indices: dict[str, dict] = {}
    for mode in modes:
        characters = build_characters(mode, chars, pack_tracks, pack_cards, pack_covers)
        albums = build_albums(mode, pack_albums)
        digest = content_hash(characters, albums, pack_audio if mode == "otomads" else [])
        index = build_index(mode, characters, albums, digest)
        indices[mode] = index
        base = dataset_dir(mode)
        # 契约 §6：characters.json 的 music 只留曲id[]，曲目信息在 tracks.json（TrackIndex）
        tracks = {e["id"]: {k: e[k] for k in ("album", "title", "extra") if k in e}
                  | ({k: e[k] for k in ("author", "authors") if k in e})
                  for c in characters["characters"] for e in c["music"]}
        outputs[base / "tracks.json"] = _dumps({"schema": SCHEMA_VERSION, "tracks": tracks})
        outputs[base / "characters.json"] = _dumps({
            "schema": characters["schema"],
            "characters": [{**c, "music": [e["id"] for e in c["music"]]}
                           for c in characters["characters"]],
        })
        outputs[base / "albums.json"] = _dumps(albums)
        outputs[base / "index.json"] = _dumps(index)
        # 源表随数据集走（音源层也按模式分，见 sources-separation-v1.md）
        outputs[base / "sources.json"] = _dumps(build_sources(mode))

    # 各源的响度表（D130）：表在源的所有者那边，这里只按注册表声明的路径拷过来
    for mode in modes:
        for origin, target in loudness_tables(mode):
            if not origin.exists():
                raise SystemExit(
                    f"响度表不存在：{repo.shown(origin)}"
                    f"（在数据仓库跑 `uv run --project tools python -m otomads.loudness`）")
            outputs[target] = origin.read_text(encoding="utf-8")

    # 共享项：与模式无关，只写一份
    outputs[repo.PUBLIC_DATA / "cardsets.json"] = _dumps(build_card_sets())
    for source_id in mirror_source_ids():
        entries = {t["id"]: {"url": t["url"]} for t in load_mirror_entries(source_id)}
        # 契约 §6：SourceTable（曲id → SourceEntry{url, revision?}）
        outputs[repo.PUBLIC_DATA / "sources" / f"{source_id}.json"] = \
            json.dumps({"schema": SCHEMA_VERSION, "entries": entries}, ensure_ascii=False, indent=1) + "\n"
    return indices, outputs


def main(argv: list[str] | None = None) -> int:
    # S3 起没有 --check：生成物不进仓库，漂移守卫由 pnpm gate 的可复现性比对承担（REFACTOR-PLAN v2 §7.5）
    del argv
    indices, outputs = build_outputs()
    if "otomads" not in indices:
        print("[!] 跳过音MAD 数据集（曲包真源 submodule 未初始化）："
              "不写 data/public/otomads/*.json", file=sys.stderr)

    for path, text in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
    summary = " / ".join(
        f"{mode} {indices[mode]['counts']['characters']} 角色 "
        f"{indices[mode]['counts']['distinctTracks']} 曲（{indices[mode]['contentHash'][:12]}）"
        for mode in MODES if mode in indices)
    print(f"写出 {len(outputs)} 个文件 → data/public/data/：{summary}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
