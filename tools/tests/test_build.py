"""生成物契约：`tmc.build` 写出哪些文件、曲包曲目进哪一份、镜像清单从哪来。

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

#: 音MAD 曲包真源在 submodule 里，开发时**可选**；没初始化时跳过依赖它的用例
needs_otomads = pytest.mark.skipif(not pack_mod.available(), reason="音MAD 曲包 submodule 未初始化")


@needs_otomads
def test_generated_outputs_are_exactly_the_contract():
    """生成物清单本身就是契约：多一份**没有消费者**的（R6 的 `packs.json` 就是这么留下的 ✗）
    或少一份都由这条守住 ✓。
    """
    _indices, outputs = build.build_outputs()
    paths = {str(path.relative_to(repo.PUBLIC_DATA)) for path in outputs}
    expected = {
        "cardsets.json",                                   # 共享：卡面图集
        "index.json", "characters.json", "albums.json", "sources.json",            # 原曲
        "otomads/index.json", "otomads/characters.json",
        "otomads/albums.json", "otomads/sources.json",     # 音MAD
        "otomads/loudness/otomads.json",                   # 音MAD 的响度表（源自己生成，D130）
        "custom/index.json", "custom/characters.json",
        "custom/albums.json", "custom/sources.json",       # 自定义：恒为空的兜底数据集
        *(f"sources/{source_id}.json" for source_id in build.mirror_source_ids()),  # 镜像表
    }
    assert paths == expected


@needs_otomads
def test_pack_tracks_land_only_in_the_otomads_set():
    """曲包曲目**只**进 otomads 数据集（D112）：原曲那份必须与真源逐条一致。

    (R1：仓库里还留着旧的 `apply_tracks()`（生成物早已改走 `_pack_music`）——
    "并入曲包曲目的地方只有一处"这件事由这条守。)
    """
    chars = build.load_characters()
    _packs, _albums, pack_tracks, _cards, _covers = pack_mod.load_packs()

    originals = build.build_characters("originals", chars, pack_tracks)["characters"]
    assert [(char["key"], char["music"]) for char in originals] == \
        [(char["key"], char["music"]) for char in chars]

    otomads = build.build_characters("otomads", chars, pack_tracks, {})["characters"]
    keys = {char["key"] for char in chars}
    assert all(char["key"] in keys for char in otomads)
    assert sum(len(char["music"]) for char in otomads) == len(pack_tracks)


def test_mirror_ids_come_from_the_registry(tmp_path, monkeypatch):
    """镜像清单从 `data/sources/originals.toml` 的 `kind = "remote"` 派生（R7④）。

    真注册表：派生出来的每个 id 都得有表文件（构建要把它拷进 `public/data/sources/`）；
    合成注册表：加一个 `kind = "remote"`，派生结果**跟着变** —— 写死的清单不会 ✓。
    """
    ids = build.mirror_source_ids()
    assert ids
    for source_id in ids:
        assert (repo.DATA / "sources" / f"{source_id}.json").exists(), source_id
        assert source_id in {entry["id"] for entry in build.load_registry("originals")}

    (tmp_path / "sources").mkdir()
    (tmp_path / "sources" / "originals.toml").write_text(
        '[[source]]\nid = "m1"\nkind = "remote"\n\n'
        '[[source]]\nid = "local"\nkind = "local"\n\n'
        '[[source]]\nid = "m2"\nkind = "remote"\n',
        encoding="utf-8")
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
    (tmp_path / "sources" / "originals.toml").write_text(
        '[[source]]\nid = "m1"\nlabel_en = "m"\nlabel_zh = "m"\n'
        'table_url = "/data/sources/m1.json"\nkind = "remote"\norder = 1\nenabled = true\n',
        encoding="utf-8")
    monkeypatch.setattr(repo, "DATA", tmp_path)
    with pytest.raises(SystemExit, match="table_url 不合法"):
        build.build_sources("originals")


def test_shipped_table_urls_are_deployment_shaped():
    """**已提交的**生成物（前端真正 fetch 的那两个 JSON）不许出现根绝对路径。

    这条盯的是产物而不是注册表：音MAD 的注册表在数据 submodule 里，
    只读主仓库的 TOML 会漏掉它（`data/otomads/sources/otomads.toml`）。
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
    - 没初始化 submodule 时跳过（与其它依赖曲包的用例同口径）。
    """
    helper = repo.ROOT / "data" / "otomads" / "tools" / "src" / "otomads" / "packformat.py"
    if not helper.is_file():
        pytest.skip("数据 submodule 未初始化：跳过跨仓库口径检查")

    def literal(path, name):
        match = re.search(rf'^{name}\s*=\s*"([^"]*)"', path.read_text(encoding="utf-8"), re.MULTILINE)
        assert match, f"{path} 里找不到 {name}"
        return match.group(1)

    assert literal(helper, "AUTHOR_JOIN") == pack_mod.AUTHOR_JOIN
    # `authors` 这个键两边都要认（只认一边 ⇒ 曲包一写就被另一边当成"不认识的键"拒掉）
    for path in (helper, pathlib.Path(pack_mod.__file__)):
        assert '"authors"' in path.read_text(encoding="utf-8"), path


# ------------------------------------------------------------------ 跨仓库耦合：曲目条目形状（D145）

#: **共享测试向量**：与数据仓库 `tools/tests/test_pack_audio.py::PACK_MUSIC_VECTOR` **同一份字面量**。
#: 数据仓库那边盯着 `packformat.music_entry`（源在自己的清单里发的曲目表），这里盯着 `_pack_music`
#: （构建期写进自带数据的曲目表）—— 两边必须**逐字同形**，否则应用按 (专辑, 曲名) 配不上地址，
#: 表现成"看得见、点不响"（D145 的 C 路线就是靠这条同形才敢让源提供曲目表）。
PACK_MUSIC_VECTOR = [
    ({"album": "demo", "title": "只有附加信息", "extra": "角色曲"},
     ["demo", "只有附加信息", "角色曲"]),
    ({"album": "demo", "title": "单作者", "extra": "道中曲", "author": "甲"},
     ["demo", "单作者", "道中曲", "甲"]),
    ({"album": "demo", "title": "多作者", "extra": "秘封曲", "author": "甲 & 乙", "authors": ["甲", "乙"]},
     ["demo", "多作者", "秘封曲", "甲 & 乙", ["甲", "乙"]]),
]


def test_pack_music_shape_matches_the_data_repo_vector():
    """`music` 条目的形状（3 / 4 / 5 位）与数据仓库那份**共享向量**一致（D145）。"""
    tracks = [dict(case, character="cirno", pack="demo") for case, _ in PACK_MUSIC_VECTOR]
    assert build._pack_music(tracks)["cirno"] == [expected for _, expected in PACK_MUSIC_VECTOR]


# ------------------------------------------------------------------ 跨仓库耦合：曲名归一化（D147）

def test_normalize_title_matches_the_data_repo_helper():
    """曲名归一化的口径两边必须一致：`packformat.normalize_title`（数据仓库）↔
    `src/music/sources.ts::normalizeTitle`（前端）。

    为什么要有这条：清单行里的曲名是**磁盘名的 stem**（`作者 - 标题`），而曲目表 / 曲包 TOML 里作者是
    独立字段 —— 两边要比就得先按同一条规则归一化。第三份实现还出现在**铺 CDN 之前的自检**里
    （数据仓库 `stage_media.review` 用 `packformat` 那两个函数），所以它错一点，CI 立刻开始误报。
    两个仓库零 import 依赖，只能按文本对字面量（与 `AUTHOR_JOIN` 那条同一个套路）；
    没初始化 submodule 时跳过（与其它依赖曲包的用例同口径）。
    """
    helper = repo.ROOT / "data" / "otomads" / "tools" / "src" / "otomads" / "packformat.py"
    if not helper.is_file():
        pytest.skip("数据 submodule 未初始化：跳过跨仓库口径检查")

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


def _data_repo_file():
    """数据仓库的 `packformat.py`（submodule 未初始化时跳过）。"""
    helper = repo.ROOT / "data" / "otomads" / "tools" / "src" / "otomads" / "packformat.py"
    if not helper.is_file():
        pytest.skip("数据 submodule 未初始化：跳过跨仓库口径检查")
    return helper


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


# ------------------------------------------------- 模式 3「自定义」：空数据集（D156 起，契约 custom-mode-v1）

def test_custom_dataset_is_empty_in_all_three_pieces():
    """模式 3 的自带数据集**恒为空**：0 角色 / 0 专辑 / 一条地址为空的源。

    这条是"应用不带这个模式的任何数据"的守卫（契约 C1）。**反证**：把
    `build_characters` 里那条 `elif mode == "custom"` 摘掉 ⇒ 它会落到曲包那套 ⇒ 下面两条立刻红。
    """
    chars = build.load_characters()
    _packs, pack_albums, pack_tracks, pack_cards, pack_covers = pack_mod.load_packs()

    characters = build.build_characters("custom", chars, pack_tracks, pack_cards, pack_covers)
    albums = build.build_albums("custom", pack_albums)
    sources = build.build_sources("custom")
    assert characters == {"schema": build.SCHEMA_VERSION, "characters": []}
    assert albums == {"schema": build.SCHEMA_VERSION, "albums": []}

    assert [entry["kind"] for entry in sources["sources"]] == ["custom"]
    assert sources["sources"][0]["tableUrl"] == ""       # 空 = 还没填，是这个模式的正常状态
    assert sources["sources"][0]["enabled"] is True      # 本模式只有它一个源

    index = build.build_index("custom", characters, albums, "deadbeefdeadbeef")
    assert index["counts"] == {"characters": 0, "albums": 0, "trackEntries": 0, "distinctTracks": 0}


@needs_otomads
def test_custom_does_not_borrow_the_pack_dataset():
    """三份生成物互不串味：音MAD 那份非空、自定义那份空 —— 两者**不能**相等。"""
    chars = build.load_characters()
    _packs, _albums, pack_tracks, pack_cards, pack_covers = pack_mod.load_packs()
    otomads = build.build_characters("otomads", chars, pack_tracks, pack_cards, pack_covers)
    custom = build.build_characters("custom", chars, pack_tracks, pack_cards, pack_covers)
    assert otomads["characters"], "音MAD 那份应该是非空的（submodule 已初始化）"
    assert custom["characters"] == []


def test_custom_outputs_do_not_depend_on_the_pack_submodule(monkeypatch):
    """Q2：曲包 submodule 初始化与否，**除 otomads 之外**的生成物必须逐字相同。

    做法是把"曲包真源在不在"这一个开关翻过来跑两遍再比文本 —— 这比"临时挪走目录"轻，
    守的却是同一条：构建**不依赖** `data/otomads`（那个 submodule 只是开发时的可选真源）。
    """
    _indices, with_packs = build.build_outputs()

    monkeypatch.setattr(pack_mod, "available", lambda: False)
    _indices2, without_packs = build.build_outputs()

    def without_otomads(outputs):
        return {str(path.relative_to(repo.PUBLIC_DATA)): text for path, text in outputs.items()
                if not str(path.relative_to(repo.PUBLIC_DATA)).startswith("otomads/")}

    assert without_otomads(with_packs) == without_otomads(without_packs)
    assert "custom/index.json" in without_otomads(with_packs)


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
