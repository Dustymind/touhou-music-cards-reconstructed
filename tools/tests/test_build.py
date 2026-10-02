"""生成物契约：`tmc.build` 写出哪些文件、数据集怎么接上原曲身份、镜像清单从哪来。

对应用户审阅时列的仓库外条目（`REVIEW-enhanced-otomad-mode.md`）：R1（并入口只有一处）、
R6（停生成没人读的 `packs.json`）、R7④（镜像 id 从注册表派生，不再三处硬编码）。
D131 追加：**源表地址形态**（相对路径 / http(s) 绝对 URL，禁根绝对路径）——
子目录部署（GitHub Pages 项目页）下根绝对路径必 404。
"""
from __future__ import annotations

import json
import pathlib
import re

import pytest

from tmc import build
from tmc import packs as pack_mod
from tmc import repo

#: 音MAD 数据仓库（曲包真源 + 数据集）在开发时**可选**；不在场时跳过依赖它的用例
needs_otomads = pytest.mark.skipif(not pack_mod.available(), reason="音MAD 数据仓库不在场")


@needs_otomads
def test_generated_outputs_are_exactly_the_contract():
    """生成物清单本身就是契约：多一份**没有消费者**的（R6 的 `packs.json` 就是这么留下的 ✗）
    或少一份都由这条守住 ✓。
    """
    _indices, outputs = build.build_outputs()
    # `as_posix()` 不是风格偏好：契约字符串一律正斜杠，而 `str(PurePath)` 在 Windows 上出反斜杠
    # ⇒ 直接 str() 会让这条在 Windows 上必红（与数据无关，纯路径写法）。
    paths = {path.relative_to(repo.PUBLIC_DATA).as_posix() for path in outputs}
    expected = {
        "cardsets.json",                                   # 共享：卡面图集
        "index.json", "characters.json", "albums.json", "sources.json", "tracks.json",  # 原曲
        "otomads/index.json", "otomads/characters.json",
        "otomads/albums.json", "otomads/sources.json", "otomads/tracks.json",  # 音MAD
        "otomads/loudness/otomads.json",                   # 音MAD 的响度表（源自己生成，D130）
        "custom/index.json", "custom/characters.json",
        "custom/albums.json", "custom/sources.json", "custom/tracks.json",  # 自定义：恒为空的兜底数据集
        *(f"sources/{source_id}.json" for source_id in build.mirror_source_ids()),  # 镜像表
    }
    assert paths == expected


# ---------------------------------------- 数据集合并：无身份数据集 + 原曲身份（§7.2/§13.4）

def make_dataset(*, characters: list[dict], tracks: dict, albums: list[dict] | None = None,
                 sources: list[dict] | None = None, pack_audio: list | None = None,
                 source: dict | None = None) -> dict:
    """一份**最小数据集**：形状照 ``data/otomads/dataset/*.json``（§13.4 的六件）。

    ``characters.json`` **没有身份**（只有 key + 曲id[] + 可选 card/covers），身份由
    :func:`tmc.build.merge_characters` 从原曲真源接上。``index.json`` 带**来源版本** ``source``
    （§7.2：各数据仓库自己的 dataset.py 写它，主仓库只搬运）。
    """
    return {
        "index.json": {"schema": build.SCHEMA_VERSION, "mode": "otomads",
                       "source": source or {"repo": "demo-data", "commit": "0" * 40, "dirty": False},
                       "counts": {}},
        "characters.json": {"schema": build.SCHEMA_VERSION, "characters": characters},
        "tracks.json": {"schema": build.SCHEMA_VERSION, "tracks": tracks},
        "albums.json": {"schema": build.SCHEMA_VERSION, "albums": albums or []},
        "sources.json": {"schema": build.SCHEMA_VERSION, "sources": sources or []},
        "pack-audio.json": {"schema": build.SCHEMA_VERSION, "entries": pack_audio or []},
    }


def write_dataset(root: pathlib.Path, dataset: dict) -> pathlib.Path:
    """把数据集写进某个 ``dataset/`` 目录（:func:`tmc.build.load_dataset` 读的那五件）。"""
    root.mkdir(parents=True, exist_ok=True)
    for name, payload in dataset.items():
        (root / name).write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n",
                                 encoding="utf-8")
    return root


def original_character(key: str, name: str, order: int, card: str,
                       search_names: list[str]) -> dict:
    """原曲真源内存形状的一条角色（与 ``build.load_characters()`` 的产物同形）。"""
    return {"key": key, "name": name, "order": order, "card": [card],
            "searchNames": list(search_names),
            "music": [{"id": f"{key}_orig_001", "album": "原曲盘", "title": "原曲",
                       "extra": "角色曲"}]}


def test_load_dataset_requires_every_file_including_index(tmp_path, monkeypatch):
    """数据集"不齐 ⇒ None"（§7.2 ③的降级前提）：少 index.json 也算不齐 —— 来源版本不是可选装饰。

    ``index.json`` 由数据仓库的 dataset.py 写（``source = {repo, commit, dirty?}``），
    没有它就追不到"这套数据是哪次提交生成的"，宁可当数据集不在场、走空兜底。
    """
    monkeypatch.setattr(repo, "data_dir", lambda mode: tmp_path / mode)
    root = write_dataset(tmp_path / "otomads" / "dataset", make_dataset(characters=[], tracks={}))
    assert build.load_dataset("otomads") is not None
    (root / "index.json").unlink()
    assert build.load_dataset("otomads") is None


def test_built_index_carries_the_dataset_source(tmp_path, monkeypatch):
    """产物 index.json 的 source（§7.2）：外部模式原样搬数据仓库那份；原曲**不记**（自指）。

    数据集不在场的模式同样不记 —— 记不出"那次提交"时不许硬编（降级兜底那条路）。
    """
    monkeypatch.setattr(repo, "data_dir", lambda mode: tmp_path / mode)
    source = {"repo": "touhou-music-cards-otomads-data", "commit": "a" * 40, "dirty": False}
    write_dataset(tmp_path / "otomads" / "dataset",
                  make_dataset(characters=[], tracks={}, source=source))
    _indices, outputs = build.build_outputs()
    read = lambda *parts: json.loads(outputs[repo.PUBLIC_DATA.joinpath(*parts)])
    assert read("otomads", "index.json")["source"] == source
    assert "source" not in read("index.json")                  # 原曲：自指，不记
    assert "source" not in read("custom", "index.json")         # 数据集不在场：记不出就不记


def test_dataset_is_merged_onto_the_originals_identity():
    """外部数据集**没有身份**：name / order / card / searchNames 一律取自原曲真源（§9 的继承），
    曲目按 ``tracks.json`` 的 id 解析，顺序沿用原曲的 ``order``。

    **反证**：把 ``merge_characters`` 的 ``dict(shared, music=music)`` 换成直接用数据集里的
    entry ⇒ 身份与排序两条断言立刻红。
    """
    chars = build.load_characters()
    identity = {char["key"]: char for char in chars}
    dataset = make_dataset(
        # 故意把 cirno 写在 rumia 前面：合并必须按原曲身份重排，而不是照数据集的顺序
        characters=[{"key": "cirno", "music": ["cirno_otomad_001", "cirno_otomad_002"]},
                    {"key": "rumia", "music": ["rumia_otomad_001"]}],
        tracks={
            "cirno_otomad_001": {"album": "otomads", "title": "一", "extra": "角色曲",
                                 "author": "甲"},
            "cirno_otomad_002": {"album": "otomads", "title": "二", "extra": "秘封曲",
                                 "author": "甲 & 乙", "authors": ["甲", "乙"]},
            "rumia_otomad_001": {"album": "otomads", "title": "三", "extra": "道中曲"},
        })
    out = build.build_characters("otomads", chars, dataset)["characters"]

    assert [char["key"] for char in out] == sorted(
        ("cirno", "rumia"), key=lambda key: identity[key]["order"])
    for char in out:
        shared = identity[char["key"]]
        for field in ("name", "order", "card", "searchNames"):
            assert char[field] == shared[field], field
    by_key = {char["key"]: char for char in out}
    assert by_key["rumia"]["music"] == [
        {"id": "rumia_otomad_001", "album": "otomads", "title": "三", "extra": "道中曲"}]
    assert by_key["cirno"]["music"] == [
        {"id": "cirno_otomad_001", "album": "otomads", "title": "一", "extra": "角色曲",
         "author": "甲"},
        {"id": "cirno_otomad_002", "album": "otomads", "title": "二", "extra": "秘封曲",
         "author": "甲 & 乙", "authors": ["甲", "乙"]},
    ]


def test_dataset_card_and_covers_override_the_identity():
    """卡面是"跨模式身份一致"的**唯一例外**：数据集里的 ``card`` 覆盖原曲那份；
    源封面 ``covers`` 只有这份有，按曲目顺序原样带过去（D167：一条链接画所有画幅）。"""
    chars = [original_character("a", "甲", 1, "orig.png", ["甲", "A"])]
    merged = build.build_characters("otomads", chars, make_dataset(
        characters=[{"key": "a", "music": ["a_001"], "card": ["mad.png", "mad2.png"],
                     "covers": ["https://x/1.jpg", "https://x/2.jpg"]}],
        tracks={"a_001": {"album": "demo", "title": "一", "extra": "角色曲"}}))["characters"][0]
    assert merged["card"] == ["mad.png", "mad2.png"]
    assert merged["covers"] == ["https://x/1.jpg", "https://x/2.jpg"]
    assert "coversByRatio" not in merged      # 逐档表（D164）已取消：一个链接画所有画幅


def test_dataset_without_card_or_covers_keeps_the_identity():
    """数据集没覆盖卡面 ⇒ 沿用原曲卡面；没有源封面 ⇒ **连键都没有**（原曲那份一个字段不多）。"""
    chars = [original_character("a", "甲", 1, "orig.png", ["甲", "A"])]
    merged = build.build_characters("otomads", chars, make_dataset(
        characters=[{"key": "a", "music": ["a_001"]}],
        tracks={"a_001": {"album": "demo", "title": "一", "extra": "角色曲"}}))["characters"][0]
    assert merged["card"] == ["orig.png"]
    assert "covers" not in merged


def test_dataset_character_missing_from_the_originals_is_a_readable_error():
    """数据集里的 key 在原曲真源里没有 ⇒ 接不上身份（§9）：SystemExit 并点名是哪个 key。"""
    chars = [original_character("a", "甲", 1, "a.png", ["甲"])]
    dataset = make_dataset(characters=[{"key": "nope", "music": ["nope_001"]}], tracks={})
    with pytest.raises(SystemExit) as failure:
        build.build_characters("otomads", chars, dataset)
    message = str(failure.value)
    assert "nope" in message
    assert "身份" in message


def test_dataset_track_missing_from_tracks_json_is_a_system_exit():
    """``characters.json`` 引用了 ``tracks.json`` 里没有的 id ⇒ SystemExit（点名曲目与角色）。"""
    chars = [original_character("a", "甲", 1, "a.png", ["甲"])]
    dataset = make_dataset(characters=[{"key": "a", "music": ["a_missing"]}], tracks={})
    with pytest.raises(SystemExit) as failure:
        build.build_characters("otomads", chars, dataset)
    message = str(failure.value)
    assert "a_missing" in message and "（a）" in message


def test_mirror_tables_are_manifests_not_id_keyed_tables():
    """§2.1：镜像表也是**同一个 manifest 形状**（mode / pack / tracks[]），不再是 id 键控的 entries 表。

    行形状与音MAD 清单一致（[专辑, 曲名, 地址]，第 4 位版本号这里没有 —— 镜像地址不改，D144）；
    形状统一后前端只有一条解析路径，键由 (专辑,曲名) 现推（曲目身份见 D173）。
    """
    _indices, outputs = build.build_outputs()
    for source_id in build.mirror_source_ids():
        payload = json.loads(outputs[repo.PUBLIC_DATA / "sources" / f"{source_id}.json"])
        assert payload["schema"] == build.SCHEMA_VERSION
        assert payload["mode"] == "originals" and payload["pack"] == source_id
        assert "entries" not in payload
        rows = payload["tracks"]
        toml_rows = build.load_mirror_entries(source_id)
        assert len(rows) == len(toml_rows) and rows[0] == [toml_rows[0]["album"],
                                                          toml_rows[0]["title"], toml_rows[0]["url"]]
        assert all(len(row) == 3 and row[2].startswith("http") for row in rows)


# ---------------------------------------- 响度表：只从数据集里取（§11.3）

#: 最小注册表：一条 local 源，声明了一张响度表（相对**数据仓库自己的根**）。
REGISTRY_WITH_LOUDNESS = """[[source]]
id = "local"
label_en = "Local library"
label_zh = "本地曲库"
table_url = "manifest.json"
kind = "local"
order = 1
enabled = true
proxyable = false
description_en = ""
description_zh = ""
loudness = "loudness/otomads.json"
"""


def test_loudness_tables_are_read_from_the_dataset_only(tmp_path, monkeypatch):
    """§11.3：响度表只从 <data_dir>/dataset/ 取，不再用 path.parent.parent 反推数据仓库的目录布局。

    反证：clone 里也放一份同名的表 —— 取到的仍然是 dataset 里那份（路径不同，一眼能分辨）。
    """
    monkeypatch.setattr(repo, "data_dir", lambda mode: tmp_path / mode)
    root = tmp_path / "otomads"
    (root / "sources").mkdir(parents=True)
    (root / "sources" / "otomads.toml").write_text(REGISTRY_WITH_LOUDNESS, encoding="utf-8")
    (root / "loudness").mkdir()
    (root / "loudness" / "otomads.json").write_text('{"clone": true}\n', encoding="utf-8")

    pairs = build.loudness_tables("otomads")
    assert len(pairs) == 1
    origin, target = pairs[0]
    assert origin == root / "dataset" / "loudness" / "otomads.json"
    assert target == build.dataset_dir("otomads") / "loudness" / "otomads.json"


def test_missing_loudness_in_the_dataset_is_a_readable_error(tmp_path, monkeypatch):
    """数据集在场、注册表声明了 loudness，但数据集里没有那份拷贝 ⇒ 点名报错（不去 clone 里偷看）。

    补上拷贝之后同一条链子照常把它铺进产物 —— 这是 D130 的正常路径。
    """
    monkeypatch.setattr(repo, "data_dir", lambda mode: tmp_path / mode)
    root = tmp_path / "otomads"
    write_dataset(root / "dataset", make_dataset(characters=[], tracks={}))
    (root / "sources").mkdir(parents=True)
    (root / "sources" / "otomads.toml").write_text(REGISTRY_WITH_LOUDNESS, encoding="utf-8")
    (root / "loudness").mkdir()
    (root / "loudness" / "otomads.json").write_text('{"clone": true}\n', encoding="utf-8")
    with pytest.raises(SystemExit, match="响度表不在数据集里"):
        build.build_outputs()

    copy = root / "dataset" / "loudness" / "otomads.json"
    copy.parent.mkdir(parents=True)
    copy.write_text('{"dataset": true}\n', encoding="utf-8")
    _indices, outputs = build.build_outputs()
    shipped = outputs[repo.PUBLIC_DATA / "otomads" / "loudness" / "otomads.json"]
    assert json.loads(shipped) == {"dataset": True}


def test_build_albums_projects_the_dataset_registry():
    """专辑注册表取自数据集的 ``albums.json``：只留契约字段（key/name/kind/pack/order
    [/showAlbumName]）并按 ``order`` 排序，数据集里的其它键不许漏进生成物。"""
    dataset = make_dataset(
        characters=[], tracks={},
        albums=[
            {"key": "late", "name": "Late", "kind": "other", "pack": "demo", "order": 100,
             "showAlbumName": False, "内部字段": "不许漏出去"},
            {"key": "early", "name": "Early", "kind": "other", "pack": "demo", "order": 50},
        ])
    assert build.build_albums("otomads", dataset) == {
        "schema": build.SCHEMA_VERSION,
        "albums": [
            {"key": "early", "name": "Early", "kind": "other", "pack": "demo", "order": 50},
            {"key": "late", "name": "Late", "kind": "other", "pack": "demo", "order": 100,
             "showAlbumName": False},
        ],
    }


def test_mirror_ids_come_from_the_registry(tmp_path, monkeypatch):
    """镜像清单从「一源一文件」头部的 `kind = "remote"` 派生（S1c，继承 review R7④）。

    真数据：派生出来的每个 id 都得有自包含源文件（构建从它重排 `data/public/data/sources/`）；
    合成数据：加一个 `kind = "remote"` 的单源文件，派生结果**跟着变** —— 写死的清单不会 ✓。
    """
    ids = build.mirror_source_ids()
    assert ids
    for source_id in ids:
        assert (repo.DATA / "sources" / f"{source_id}.toml").exists(), source_id
        assert source_id in {entry["id"] for entry in build.load_registry("originals")}

    (tmp_path / "sources").mkdir()
    (tmp_path / "sources" / "m1.toml").write_text(
        'id = "m1"\nkind = "remote"\norder = 1\n', encoding="utf-8")
    (tmp_path / "sources" / "local.toml").write_text(
        'id = "local"\nkind = "local"\norder = 2\n', encoding="utf-8")
    (tmp_path / "sources" / "m2.toml").write_text(
        'id = "m2"\nkind = "remote"\norder = 3\n', encoding="utf-8")
    monkeypatch.setattr(repo, "DATA", tmp_path)
    assert build.mirror_source_ids() == ("m1", "m2")


# ---- D131：源表地址形态（根绝对路径在子目录部署下必 404） ----

@pytest.mark.parametrize("value", ["data/sources/x.json", "manifest.json", "loudness/otomads.json",
                                   "https://example.com/t.json", "http://127.0.0.1:8011/manifest.json"])
def test_table_url_accepts_relative_and_absolute(value):
    assert build.table_url_problem(value) is None


@pytest.mark.parametrize("value", ["/data/sources/x.json", "/manifest.json", "//example.com/t.json",
                                   "file:///tmp/t.json", "", "   ", None])
def test_table_url_rejects_root_absolute_and_other_schemes(value):
    """防线就是这里：站点部署在子目录（GitHub Pages 项目页 `user.github.io/<repo>/`）时，
    前导 `/` 会把请求打到**域名根**上去 → 404 → 那个模式所有曲目都解析不出地址。"""
    assert build.table_url_problem(value) is not None


def test_build_sources_refuses_a_root_absolute_table_url(tmp_path, monkeypatch):
    """注册表里写错一个 `/`，`data:build` 当场炸 —— 而不是等用户在子目录部署上发现放不出声。"""
    (tmp_path / "sources").mkdir()
    (tmp_path / "sources" / "m1.toml").write_text(
        'id = "m1"\nlabel_en = "m"\nlabel_zh = "m"\n'
        'table_url = "/data/sources/m1.json"\nkind = "remote"\norder = 1\nenabled = true\n',
        encoding="utf-8")
    monkeypatch.setattr(repo, "DATA", tmp_path)
    with pytest.raises(SystemExit, match="table_url 不合法"):
        build.build_sources("originals")


def test_shipped_table_urls_are_deployment_shaped():
    """**构建出来的**生成物（前端真正 fetch 的那两个 JSON）不许出现根绝对路径。

    这条盯的是产物而不是注册表：音MAD 的注册表在**数据仓库**里，
    只读主仓库的 TOML 会漏掉它（`data/otomads/sources/otomads.toml`，默认落点）。
    """
    for mode in build.MODES:
        path = build.dataset_dir(mode) / "sources.json"
        if not path.exists():
            assert mode == "otomads", f"缺少生成物：{path}（跑 `pnpm data:build`）"
            continue
        payload = json.loads(path.read_text(encoding="utf-8"))
        assert payload["sources"], mode
        for source in payload["sources"]:
            # 按 kind 判：模式 3 的空串合法（地址由使用者自己填），其余源一字不改（D131）
            assert build.source_table_url_problem(source["kind"], source["tableUrl"]) is None, \
                f"[{mode}] {source['id']} → {source['tableUrl']}"


# ------------------------------------------------------------------ 跨仓库耦合：作者连接符（D135）

def test_author_join_matches_the_data_repo_helper():
    """两仓库各有一份 `AUTHOR_JOIN`（成品文件名 `作者 - 标题.mp3` 的口径）—— 它们必须一致。

    为什么要有这条：主仓库 `tmc.packs` 生成 `characters.json`，数据仓库的曲库助手
    （`otomads.packformat`）用同一个规则找磁盘文件与响度表键。两份实现 **零 import 依赖**
    （两个仓库互相看不见对方的代码），所以只能这样按文本对一下字面量：

    - 数据仓库那份改了而主仓库没改（或反过来）⇒ 多作者曲目的音频**一声不响地找不到**；
    - 数据仓库不在场时跳过（与其它依赖曲包的用例同口径）。
    """
    helper = repo.ROOT / "data" / "otomads" / "tools" / "src" / "otomads" / "packformat.py"
    if not helper.is_file():
        pytest.skip(SKIP_NO_DATA_REPO)

    def literal(path, name):
        match = re.search(rf'^{name}\s*=\s*"([^"]*)"', path.read_text(encoding="utf-8"), re.MULTILINE)
        assert match, f"{path} 里找不到 {name}"
        return match.group(1)

    assert literal(helper, "AUTHOR_JOIN") == pack_mod.AUTHOR_JOIN
    # `authors` 这个键两边都要认（只认一边 ⇒ 曲包一写就被另一边当成"不认识的键"拒掉）
    for path in (helper, pathlib.Path(pack_mod.__file__)):
        assert '"authors"' in path.read_text(encoding="utf-8"), path


# ------------------------------------------------------------------ 跨仓库耦合：曲名归一化（D147）

def test_normalize_title_matches_the_data_repo_helper():
    """曲名归一化的口径两边必须一致：`packformat.normalize_title`（数据仓库）↔
    `src/music/sources.ts::normalizeTitle`（前端）。

    为什么要有这条：清单行里的曲名是**磁盘名的 stem**（`作者 - 标题`），而曲目表 / 曲包 TOML 里作者是
    独立字段 —— 两边要比就得先按同一条规则归一化。第三份实现还出现在**铺 CDN 之前的自检**里
    （数据仓库 `stage_media.review` 用 `packformat` 那两个函数），所以它错一点，CI 立刻开始误报。
    两个仓库零 import 依赖，只能按文本对字面量（与 `AUTHOR_JOIN` 那条同一个套路）；
    数据仓库不在场时跳过（与其它依赖曲包的用例同口径）。
    """
    helper = repo.ROOT / "data" / "otomads" / "tools" / "src" / "otomads" / "packformat.py"
    if not helper.is_file():
        pytest.skip(SKIP_NO_DATA_REPO)

    frontend = (repo.ROOT / "src" / "music" / "sources.ts").read_text(encoding="utf-8")
    # 前缀剥离那条正则：`^[^-]{1,60}?\s+-\s+`（JS 与 Python 写法一致，字面量对得上）
    assert re.search(r"\^\[\^-\]\{1,60\}\?\\s\+-\\s\+", frontend), "前端那条正则变了？同步数据仓库"
    assert r'^[^-]{1,60}?\s+-\s+' in helper.read_text(encoding="utf-8"), "数据仓库那条正则变了？"
    # 后缀那条（作者名里带 `-` 时唯一的救法）两边都要在
    for path in (helper, repo.ROOT / "src" / "music" / "sources.ts"):
        text = path.read_text(encoding="utf-8")
        assert " - ${wanted}" in text or 'f" - {wanted_norm}"' in text, path


# ---------------------- 跨仓库共享向量：时间解析 / 裁剪区间 / 键集合（D150 追加）

#: **共享测试向量**：与 数据仓库 `tools/tests/test_pack_audio.py` 里那份**同一份字面量**（两个仓库零 import 依赖，
#: 只能靠"同一批字面量 + 各自测自己的实现"来对口径）。三组分别盯着：
#:   ① 时间解析（`parse_time` 接受/拒绝哪些写法）
#:   ② 裁剪区间（`trim_seconds` 的单侧语义与非法区间）
#:   ③ 四组键集合 —— **一边加键，另一边就把整包判成"不认识的键"而拒收**（`_reject_unknown` 是硬失败）
PACK_TIME_VECTOR = [
    ("00:00:00.000", 0.0),
    ("00:00:01.500", 1.5),
    ("01:02:03.250", 3723.25),
    ("12:34:56.789", 45296.789),
    ("0:00:00.000", 0.0),          # 小时允许 1 位
]

PACK_TIME_BAD = [
    "00:00:00",        # 缺毫秒
    "00:00:00.00",     # 毫秒必须 3 位
    "1:02:03",         # 缺毫秒
    "00:60:00.000",    # 分钟越界
    "00:00:60.000",    # 秒越界
    "1:2:3.000",       # 分秒必须 2 位
    "abc",
]

PACK_TRIM_VECTOR = [
    ({}, None),                                                    # 两个键都没写 ⇒ 不裁剪
    ({"start_time": "00:00:02.000"}, (2.0, None)),                  # 只给起点 ⇒ 裁到文件尾
    ({"stop_time": "00:00:03.000"}, (0.0, 3.0)),                    # 只给终点 ⇒ 从文件头
    ({"start_time": "00:00:01.000", "stop_time": "00:00:04.500"}, (1.0, 3.5)),
    ({"start_time": "00:00:04.000", "stop_time": "00:00:04.000"}, "raises"),   # 零长度非法
    ({"start_time": "00:00:05.000", "stop_time": "00:00:04.000"}, "raises"),   # 起点晚于终点
]

PACK_KEYS_VECTOR = {
    "pack": {"id", "label_en", "label_zh", "kind", "order"},
    "album": {"key", "name", "kind", "pack", "order", "show_album_name"},
    # `cover` = 这一首曲目的封面直链（D153 修订：写在 `[[track]]` 里，不再是角色文件顶层的数组）
    # `bitrate` = 可选成品 CBR 码率（kbps）：长曲压到 CDN 单文件上限以下时才写
    "track": {"album", "author", "authors", "title", "extra", "source", "start_time", "stop_time",
              "bitrate", "cover"},
    "character": {"key", "card"},
}


def test_parse_time_matches_the_shared_vector():
    for text, expected in PACK_TIME_VECTOR:
        assert pack_mod.parse_time(text) == pytest.approx(expected)
    for text in PACK_TIME_BAD:
        with pytest.raises(ValueError):
            pack_mod.parse_time(text)


def test_trim_seconds_matches_the_shared_vector():
    for track, expected in PACK_TRIM_VECTOR:
        if expected == "raises":
            with pytest.raises(ValueError):
                pack_mod.trim_seconds(track)
        else:
            assert pack_mod.trim_seconds(track) == expected


def test_key_sets_match_the_shared_vector():
    assert pack_mod.PACK_KEYS == PACK_KEYS_VECTOR["pack"]
    assert pack_mod.ALBUM_KEYS == PACK_KEYS_VECTOR["album"]
    assert pack_mod.TRACK_KEYS == PACK_KEYS_VECTOR["track"]
    assert pack_mod.CHARACTER_KEYS == PACK_KEYS_VECTOR["character"]


#: 与前端 `src/music/mode.ts` 共享的向量（Q1 口径：两侧各存一份字面量）。
MODE_VECTOR = ("originals", "otomads", "custom")


def test_mode_list_matches_the_frontend():
    """三个模式的名字两边必须一致：`tmc.build.MODES` ↔ 前端 `MusicMode` / `MUSIC_MODES`。

    加第四个模式时最省事的错法是只改一边：数据侧生成了数据集、前端不认识（或反过来）。
    这是一条**跨语言**向量，按文本读前端那份（与 `normalize_title`、键集合那几条同一套路）。
    """
    assert build.MODES == MODE_VECTOR
    frontend = (repo.ROOT / "src" / "music" / "mode.ts").read_text(encoding="utf-8")
    union = re.search(r"export type MusicMode = ([^;]+);", frontend)
    assert union, "mode.ts 的 MusicMode 不见了？同步这条向量"
    assert tuple(re.findall(r'"([^"]+)"', union.group(1))) == MODE_VECTOR
    listed = re.search(r"export const MUSIC_MODES: MusicMode\[\] = \[([^\]]+)\]", frontend)
    assert listed, "mode.ts 的 MUSIC_MODES 不见了？同步这条向量"
    assert tuple(re.findall(r'"([^"]+)"', listed.group(1))) == MODE_VECTOR


#: 跨仓库口径检查的跳过原因（数据仓库是 env 落点，不再是 submodule）。
SKIP_NO_DATA_REPO = "数据仓库不在场（OTOMADS_DATA_DIR 没指到 clone）：跳过跨仓库口径检查"


def _data_repo_module(mode: str, filename: str):
    """数据仓库的 `<data_dir>/tools/src/<mode>/<filename>`（仓库不在场时跳过）。

    位置走 `repo.data_dir`（env 可覆盖）⇒ `OTOMADS_DATA_DIR` 指到别处也找得到。
    """
    path = repo.data_dir(mode) / "tools" / "src" / mode / filename
    if not path.is_file():
        pytest.skip(SKIP_NO_DATA_REPO)
    return path


def _data_repo_file(mode: str = "otomads"):
    """数据仓库的 `packformat.py`（= `_data_repo_module` 的固定文件名版）。"""
    return _data_repo_module(mode, "packformat.py")


def test_mirrored_fetch_audio_helpers_stay_identical():
    """两份 `fetch_audio.py` 的三个 helper 是**有意保留的镜像实现**（HANDOVER §18 裁定不动）。

    它们不是纯函数、没法用字面量向量钉，所以按 AST 把源码对一遍：单边改动会让这条红 ——
    镜像漂移最典型的后果是"一边能硬链接、一边报错"这种只在对面仓库出现的行为差异。
    """
    import ast

    names = {"installed_ytdlp", "uv_env", "link_or_copy"}

    def helpers(mode: str) -> dict[str, str]:
        tree = ast.parse(_data_repo_module(mode, "fetch_audio.py").read_text(encoding="utf-8"))
        return {node.name: ast.unparse(node) for node in tree.body
                if isinstance(node, ast.FunctionDef) and node.name in names}

    otomads, custom = helpers("otomads"), helpers("custom")
    assert set(otomads) == names and set(custom) == names
    assert otomads == custom


#: 与数据仓库 `packformat.BITRATE_RANGE` 共享的向量（Q1 口径：两侧各存一份字面量）。
BITRATE_RANGE_VECTOR = (32, 320)


def test_bitrate_range_matches_the_data_repo_vector():
    """`[[track]].bitrate` 的取值范围两边必须一致 —— 这是唯一一处只靠注释对齐的数值常量。

    一边放宽而另一边没跟上，表现是"本地 `pnpm gate` 过、CI / 对面仓库拒收"（或反过来）。
    """
    assert pack_mod.BITRATE_RANGE == BITRATE_RANGE_VECTOR
    helper = _data_repo_file()
    match = re.search(r"^BITRATE_RANGE\s*=\s*\((\d+),\s*(\d+)\)",
                      helper.read_text(encoding="utf-8"), re.MULTILINE)
    assert match, "数据仓库的 BITRATE_RANGE 不见了？同步这条向量"
    assert (int(match.group(1)), int(match.group(2))) == BITRATE_RANGE_VECTOR


def test_key_sets_match_the_data_repo_literals():
    """四组键集合与数据仓库那份**逐字相同**（上面的共享向量只钉了"我们这边"的值）。

    再按文本对一次的理由：一边加键，另一边的 `_reject_unknown` 会把**整包**判成"不认识的键"拒收 ——
    这类故障只在对面的数据上炸，本仓库的单测看不见。
    """
    import ast

    helper = _data_repo_file()
    wanted = {"PACK_KEYS", "ALBUM_KEYS", "TRACK_KEYS", "CHARACTER_KEYS"}
    found = {}
    for node in ast.parse(helper.read_text(encoding="utf-8")).body:
        if (isinstance(node, ast.Assign) and len(node.targets) == 1
                and isinstance(node.targets[0], ast.Name) and node.targets[0].id in wanted):
            found[node.targets[0].id] = set(ast.literal_eval(node.value))
    assert found, f"{helper} 里找不到那四组键集合"
    assert found == {"PACK_KEYS": pack_mod.PACK_KEYS, "ALBUM_KEYS": pack_mod.ALBUM_KEYS,
                     "TRACK_KEYS": pack_mod.TRACK_KEYS, "CHARACTER_KEYS": pack_mod.CHARACTER_KEYS}


def test_audio_filename_shape_matches_the_data_repo_helper():
    """成品文件名的形状（`作者 - 标题.mp3` / 无作者时 `标题.mp3`）与数据仓库一致（D95/D96）。

    这个名字同时是 manifest 的匹配键与响度表的键：形状一变 ⇒ 音频"看得见却点不响"、或整表键对不上。
    """
    text = _data_repo_file().read_text(encoding="utf-8")
    assert "f\"{author} - {track['title']}.mp3\"" in text, "数据仓库的成品名形状变了？"
    assert "f\"{track['title']}.mp3\"" in text, "数据仓库的无作者成品名形状变了？"


# ------------------------------------------------- 源封面：一条链接（D167）

def test_a_cover_table_is_now_a_hard_error():
    """旧的逐档表写法（D164）现在**当场报错**，并把人指回"一条链接"这条口径。"""
    entry = {"album": "otomads", "title": "一", "extra": "角色曲",
             "cover": {"original": "https://x/a.jpg", "16x9": "https://x/a.16x9.jpg"}}
    with pytest.raises(SystemExit) as failure:
        pack_mod._read_track_cover(entry, "测试")
    assert "一条链接" in str(failure.value)


# ------------------------------------------------- 模式 3「自定义」：空数据集（D156 起，契约 custom-mode-v1）

def test_custom_dataset_is_empty_in_all_three_pieces():
    """模式 3 的自带数据集**恒为空**：0 角色 / 0 专辑 / 一条地址为空的源。

    两条入口都要守住（契约 C1）：拿不到数据集（``dataset=None``，§7.2 ③ 的降级兜底）与
    真拿到一份**空数据集**，都必须给空表 —— 任何一条路串到别的模式的数据上，这里立刻红。
    """
    chars = build.load_characters()
    empty = make_dataset(characters=[], tracks={}, albums=[], sources=[])
    for dataset in (None, empty):
        characters = build.build_characters("custom", chars, dataset)
        albums = build.build_albums("custom", dataset)
        assert characters == {"schema": build.SCHEMA_VERSION, "characters": []}
        assert albums == {"schema": build.SCHEMA_VERSION, "albums": []}

    sources = build.build_sources("custom")
    assert [entry["kind"] for entry in sources["sources"]] == ["custom"]
    assert sources["sources"][0]["tableUrl"] == ""       # 空 = 还没填，是这个模式的正常状态
    assert sources["sources"][0]["enabled"] is True      # 本模式只有它一个源

    index = build.build_index("custom", characters, albums, "deadbeefdeadbeef")
    assert index["counts"] == {"characters": 0, "albums": 0, "trackEntries": 0, "distinctTracks": 0}


def test_custom_does_not_borrow_the_otomads_dataset(tmp_path, monkeypatch):
    """两份挂载的数据集互不串味：音MAD 那份非空、自定义那份空 —— 两者**不能**相等。

    数据集位置由 ``repo.data_dir`` 决定（env 可覆盖）：这里指到 tmp 里的一份最小数据集，
    所以**不依赖** ``data/otomads`` 在不在场，同时顺带守住 ``load_dataset`` 的"不齐 ⇒ None"。
    """
    monkeypatch.setattr(repo, "data_dir", lambda mode: tmp_path / mode)
    write_dataset(tmp_path / "otomads" / "dataset", make_dataset(
        characters=[{"key": "a", "music": ["a_001"]}],
        tracks={"a_001": {"album": "demo", "title": "一", "extra": "角色曲"}}))
    chars = [original_character("a", "甲", 1, "a.png", ["甲"])]

    otomads_dataset = build.load_dataset("otomads")
    assert otomads_dataset is not None
    assert build.load_dataset("custom") is None          # 自定义那份压根没有数据集
    otomads = build.build_characters("otomads", chars, otomads_dataset)
    custom = build.build_characters("custom", chars, build.load_dataset("custom"))
    assert otomads["characters"], "音MAD 那份应该是非空的"
    assert custom["characters"] == []


@needs_otomads
def test_originals_and_custom_outputs_do_not_depend_on_the_otomads_dataset(monkeypatch):
    """Q2：音MAD 数据集在不在场，**除 otomads 之外**的生成物必须逐字相同（§7.2 ③ 的降级兜底）。

    做法是把 ``build.load_dataset`` 对 otomads 这一个模式关掉再跑一遍比文本 —— 这比"临时挪走
    数据集"轻，守的却是同一条：主仓库构建**不依赖**数据仓库那份数据集（它只是可选输入）。
    """
    indices, with_dataset = build.build_outputs()
    assert indices["otomads"]["counts"]["characters"] > 0      # 真数据集在场，开关真的翻过来了

    real_load_dataset = build.load_dataset
    monkeypatch.setattr(build, "load_dataset",
                        lambda mode: None if mode == "otomads" else real_load_dataset(mode))
    indices_without, without_dataset = build.build_outputs()
    assert indices_without["otomads"]["counts"]["characters"] == 0

    def without_otomads(outputs):
        # 用 `as_posix()`：Windows 上 `str(relpath)` 是 `otomads\tracks.json`，
        # 拿它比 `"otomads/"` 前缀会导致**过滤整个失效**、音MAD 文件漏进比对。
        def key(path):
            return path.relative_to(repo.PUBLIC_DATA).as_posix()

        return {key(path): text for path, text in outputs.items()
                if not key(path).startswith("otomads/")}

    assert without_otomads(with_dataset) == without_otomads(without_dataset)
    assert "custom/index.json" in without_otomads(with_dataset)


def test_source_table_url_problem_is_kind_aware():
    """按 kind 判地址：只有 `kind = "custom"` 多认一种"空串"，其余一字不改（D131 不松动）。"""
    assert build.source_table_url_problem("custom", "") is None
    assert build.source_table_url_problem("custom", "   ") is None
    assert build.source_table_url_problem("custom", "manifest.json") is None
    assert build.source_table_url_problem("custom", "/manifest.json") is not None
    assert build.source_table_url_problem("custom", "file:///tmp/x.json") is not None
    assert build.source_table_url_problem("custom", None) is not None
    for kind in ("remote", "local", None):
        assert build.source_table_url_problem(kind, "") is not None
        assert build.source_table_url_problem(kind, "data/sources/x.json") is None


# ---------------------------------- §7.2 快照那条路（CI / Vercel：没有 packs/、没有注册表 TOML）

def test_loudness_table_comes_from_the_snapshot_without_a_registry(tmp_path, monkeypatch):
    """只有数据集快照时，响度表照样要进产物：表名取自数据集自己的 sources.json（loudnessUrl）。

    只认 TOML 注册表的话，快照那条路会少一份文件（19 → 18）—— 第一次跑 gate.yml 就是 18 个，
    因为 CI 里既没有 clone 也没有注册表，只有快照。
    """
    (tmp_path / "loudness").mkdir()
    (tmp_path / "loudness" / "otomads.json").write_text("{}", encoding="utf-8")
    (tmp_path / "sources.json").write_text(json.dumps(
        {"schema": 2, "sources": [{"id": "local", "loudnessUrl": "loudness/otomads.json"}]}),
        encoding="utf-8")
    monkeypatch.setattr(build.repo, "dataset_dir", lambda mode: tmp_path)
    monkeypatch.setattr(build, "load_registry", lambda mode: None)
    assert build.loudness_tables("otomads") == [
        (tmp_path / "loudness" / "otomads.json",
         build.dataset_dir("otomads") / "loudness" / "otomads.json")]
    # 没有快照时仍然是"没有表"（不是报错、也不是空列表里的假条目）
    (tmp_path / "sources.json").unlink()
    assert build.loudness_tables("otomads") == []
