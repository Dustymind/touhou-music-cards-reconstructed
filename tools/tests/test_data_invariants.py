"""数据不变量与曲包/数据集校验（S5 起不含分类规则黄金样例：规则链已随 .ref 快照删除）。"""
import pathlib

import pytest

from tmc import build
from tmc import packs as pack_mod
from tmc import validate


@pytest.mark.skipif(not pack_mod.available(), reason="音MAD 数据仓库（OTOMADS_DATA_DIR）不在场")
def test_data_invariants_hold():
    # 下面几个数字是**当前数据的快照**（曲包增长时要一起更新；含义见 docs/DECISIONS.md D52/D97/D112）
    problems, stats = validate.run()
    assert problems.errors == [], problems.errors
    assert stats["characters"] == 121
    # 39 个原曲专辑 + 1 张曲包专辑（音MAD / otomads，见 D52）
    assert stats["albums"] == 40
    # C：数据按模式分成两份，`entries` 是**原曲数据集**（曲包曲目不再并进来）
    modes = stats["modes"]
    assert modes["originals"] == {"characters": 121, "entries": 378, "distinctTracks": 368}
    assert modes["otomads"] == {"characters": 80, "entries": 191, "distinctTracks": 191}
    # 模式 3「自定义」的自带数据集**恒为空**（数据全部来自使用者自己的源，契约 custom-mode-v1）
    assert modes["custom"] == {"characters": 0, "entries": 0, "distinctTracks": 0}
    # 并集与分离前逐字节同义：378 + 191 = 569 条 / 368 + 191 = 559 首去重
    assert modes["union"] == {"entries": 569, "distinctTracks": 559}
    assert stats["entries"] == 378
    assert stats["distinct_tracks"] == 368
    assert stats["packs"]["packs"] == 1
    assert stats["packs"]["tracks"] == 191
    assert len(stats["shared"]) == 10
    for source_id, stat in stats["sources"].items():
        assert stat["missing"] == 0, source_id


def test_title_is_not_identity():
    """同名 ≠ 同曲：曲目身份必须带专辑，且同专辑内曲名唯一。"""
    problems, stats = validate.run()
    titles = stats["titles"]
    assert problems.errors == []
    assert titles["pairs"] == stats["distinct_tracks"]
    # 条目数 − 去重曲目数 = 被多个角色共用的曲目数（同一首曲子被引用多次）
    assert stats["entries"] - titles["pairs"] == titles["shared_pairs"]
    # 跨专辑同名（不同曲子）确实存在，说明"按曲名合并"会出错
    assert titles["same_title_across_albums"] > 0
    # 同专辑内若要靠曲名区分会撞名 → 曲目必须保留序号
    assert "核熱造神ヒソウテンソク ～ 東方非想天則" in titles["number_prefix_required"]


def test_every_extra_is_one_of_four():
    import tomllib

    from tmc import repo

    seen = set()
    for path in sorted((repo.DATA / "characters").glob("*.toml")):
        with open(path, "rb") as fh:
            char = tomllib.load(fh)
        for entry in char["track"]:
            extra = entry["extra"]
            seen.add(extra)
    assert seen <= {"角色曲", "道中曲", "更多道中曲", "秘封曲"}
    assert "秘封曲" in seen


def test_pack_album_must_name_a_registered_pack():
    """曲包自带专辑的 `pack` 必须指向一个**已注册**的曲包 id。

    （R7③：这里原来还挂着一句 `album["pack"] in album_packs` —— 可 `albums` 参数就是曲包自己的
    专辑列表，那句**恒真** ✓；去掉之后剩下的这条才是真正会红的那条 ✓。）
    """
    packs = [{"id": "otomads", "kind": "local"}]
    registered = [{"name": "otomads", "pack": "otomads", "kind": "other"}]
    typo = [{"name": "otomads", "pack": "otomaads", "kind": "other"}]

    problems = validate.Problems()
    validate.check_packs(packs, registered, [], [], problems)
    assert problems.errors == [], problems.errors

    problems = validate.Problems()
    validate.check_packs(packs, typo, [], [], problems)
    assert any("未注册的曲包" in error for error in problems.errors), problems.errors


# ------------------------------------------------------------------ 曲包校验（写入侧已搬到数据仓库，D130）

PACKS = [{"id": "demo", "label": {"en": "Demo", "zh": "演示"}, "kind": "local", "order": 100}]
ALBUMS = [{"key": "demo", "name": "demo", "kind": "other", "pack": "demo", "order": 100}]
CHARS = [{"key": "cirno", "music": []}]


def make_pack_track(**overrides) -> dict:
    track = {"character": "cirno", "album": "demo", "title": "曲目", "extra": "角色曲", "pack": "demo"}
    track.update(overrides)
    return track


def test_check_packs_flags_bad_source_and_trim():
    problems = validate.Problems()
    tracks = [
        make_pack_track(title="一", source="ftp://example.com/a"),
        make_pack_track(title="二", start_time="00:00:20.000", stop_time="00:00:10.000"),
    ]
    stats = validate.check_packs(PACKS, ALBUMS, tracks, CHARS, problems)
    assert stats == {"packs": 1, "albums": 1, "tracks": 2, "with_source": 1, "trimmed": 1}
    assert any("http(s)" in error for error in problems.errors)
    assert any("必须晚于" in error for error in problems.errors)


def test_check_packs_notes_shared_source():
    problems = validate.Problems()
    shared = "https://example.com/same"
    validate.check_packs(PACKS, ALBUMS, [make_pack_track(title="一", source=shared),
                                         make_pack_track(title="二", source=shared)], CHARS, problems)
    assert not problems.errors
    assert any("共用同一个 source" in note for note in problems.notes)


# ------------------------------------------------------------------ 多作者（D135）

def write_pack(tmp_path, track_body: str) -> pathlib.Path:
    """造一个最小曲包根目录（清单 + 一角色一份），返回根目录。"""
    root = tmp_path / "packs"
    root.mkdir()
    (root / "demo.toml").write_text(
        '[pack]\nid = "demo"\nlabel_en = "Demo"\nlabel_zh = "演示"\nkind = "local"\norder = 100\n'
        '\n[[album]]\nkey = "demo"\nname = "demo"\nkind = "other"\npack = "demo"\norder = 100\n',
        encoding="utf-8")
    (root / "demo").mkdir()
    (root / "demo" / "cirno.toml").write_text(
        'key = "cirno"\n\n[[track]]\nalbum = "demo"\ntitle = "曲目"\nextra = "角色曲"\n' + track_body,
        encoding="utf-8")
    return root


def parse_only_pack(tmp_path, monkeypatch, track_body: str) -> dict:
    """只让 `load_packs` 看到这一个曲包根目录，返回解析出来的那一条 track。"""
    root = write_pack(tmp_path, track_body)
    monkeypatch.setattr(pack_mod.repo, "pack_roots", lambda: [root])
    _packs, _albums, tracks, _cards, _covers = pack_mod.load_packs()
    assert len(tracks) == 1, tracks
    return tracks[0]


def test_author_is_kept_as_one_string(tmp_path, monkeypatch):
    """老写法 `author = "乙 & 甲"`：**原样保留**，不猜哪个 `&` 是分隔符，也不产生 authors。"""
    track = parse_only_pack(tmp_path, monkeypatch, 'author = "乙 & 甲"\n')
    assert track["author"] == "乙 & 甲"
    assert "authors" not in track


def test_authors_list_is_normalized_to_the_same_stem_string(tmp_path, monkeypatch):
    """`authors = ["甲", "乙"]` → 数组 + **与老写法完全等价的整串**（磁盘文件名/响度表键不变）。"""
    track = parse_only_pack(tmp_path, monkeypatch, 'authors = ["甲", "乙"]\n')
    assert track["authors"] == ["甲", "乙"]
    assert track["author"] == "甲 & 乙"          # 与 `author = "甲 & 乙"` 逐字节相同 ⇒ 换写法不用重抓音频


def test_authors_and_author_cannot_coexist(tmp_path, monkeypatch):
    with pytest.raises(SystemExit, match="只能写一个"):
        parse_only_pack(tmp_path, monkeypatch, 'author = "甲"\nauthors = ["甲", "乙"]\n')


@pytest.mark.parametrize("body", [
    'authors = "甲"\n',                    # 不是数组
    'authors = []\n',                      # 空数组
    'authors = ["甲", "  "]\n',            # 有空项
])
def test_bad_authors_are_rejected(tmp_path, monkeypatch, body):
    with pytest.raises(SystemExit, match="authors"):
        parse_only_pack(tmp_path, monkeypatch, body)


# ------------------------------------------------------------------ 源封面（D153 修订：写在 [[track]] 里）

COVER_A = "https://i0.hdslb.com/a.jpg@703w_1000h_1c.webp"
COVER_B = "https://i1.hdslb.com/b.png@703w_1000h_1c.webp"


def write_cover_pack(tmp_path, first: str, second: str | None = None) -> "pathlib.Path":
    """两份曲目的最小曲包根：`first` / `second` 直接拼进 `[[track]]`（`second=None` 就只写一首）。"""
    import pathlib

    root = tmp_path / "packs"
    root.mkdir(parents=True, exist_ok=True)
    (root / "demo.toml").write_text(
        '[pack]\nid = "demo"\nlabel_en = "Demo"\nlabel_zh = "演示"\nkind = "local"\norder = 100\n\n'
        '[[album]]\nkey = "demo"\nname = "demo"\nkind = "other"\npack = "demo"\norder = 100\n',
        encoding="utf-8")
    (root / "demo").mkdir(exist_ok=True)     # 同一个 tmp_path 里可能被调用多次（例如两个反例连测）
    body = f'key = "cirno"\n\n[[track]]\nalbum = "demo"\ntitle = "一"\nextra = "角色曲"\n{first}\n'
    if second is not None:
        body += f'\n[[track]]\nalbum = "demo"\ntitle = "二"\nextra = "角色曲"\n{second}\n'
    (root / "demo" / "cirno.toml").write_text(body, encoding="utf-8")
    return root


def read_cover_pack(tmp_path, monkeypatch, first: str, second: str | None = None):
    """→ `(tracks, covers)`；`covers` 就是运行时那个按曲目顺序对齐的数组。"""
    root = write_cover_pack(tmp_path, first, second)
    monkeypatch.setattr(pack_mod.repo, "pack_roots", lambda: [root])
    _packs, _albums, tracks, _cards, covers = pack_mod.load_packs()
    return tracks, covers


def test_track_covers_become_the_aligned_runtime_array(tmp_path, monkeypatch):
    """`[[track]].cover` → `covers[key]`（**顺序 = 曲目顺序**）—— 这是唯一进运行时的那一份。"""
    _tracks, covers = read_cover_pack(tmp_path, monkeypatch, f'cover = "{COVER_A}"',
                                      f'cover = "{COVER_B}"')
    assert covers == {"cirno": [COVER_A, COVER_B]}


def test_a_character_without_any_cover_simply_has_none(tmp_path, monkeypatch):
    """一个角色一条都没有 ⇒ 合法（封面图集下回落到原版卡面），**不是错误**，也不是空数组。"""
    _tracks, covers = read_cover_pack(tmp_path, monkeypatch, 'author = "甲"', 'author = "乙"')
    assert covers == {}


def test_half_covered_character_is_rejected_by_track_number(tmp_path, monkeypatch):
    """**半有半无 ⇒ 报错并点名第几首**：运行时数组按下标对齐，留空洞会静默错位到别人的封面上。"""
    with pytest.raises(SystemExit, match="第 2 首"):
        read_cover_pack(tmp_path, monkeypatch, f'cover = "{COVER_A}"', 'author = "乙"')


def test_track_cover_must_be_an_absolute_https_url(tmp_path, monkeypatch):
    """写成本地文件名 / http 一律拒绝（浏览器里不是混合内容就是 404）。"""
    with pytest.raises(SystemExit, match="https://"):
        read_cover_pack(tmp_path, monkeypatch, 'cover = "チルノ.png"')
    with pytest.raises(SystemExit, match="https://"):
        read_cover_pack(tmp_path, monkeypatch, 'cover = "http://i0.hdslb.com/a.jpg"')


def test_old_top_level_cover_array_is_rejected_with_a_migration_hint(tmp_path, monkeypatch):
    """旧形状（顶层数组）不静默：报一句指路的话，而不是"不认识的键 ['cover']"。"""
    root = write_cover_pack(tmp_path, 'author = "甲"')
    (root / "demo" / "cirno.toml").write_text(
        'key = "cirno"\n\ncover = [\n  "https://i0.hdslb.com/a.jpg",\n]\n\n'
        '[[track]]\nalbum = "demo"\ntitle = "一"\nextra = "角色曲"\n',
        encoding="utf-8")
    monkeypatch.setattr(pack_mod.repo, "pack_roots", lambda: [root])
    with pytest.raises(SystemExit, match="fetch_covers"):
        pack_mod.load_packs()


# ---------------------------------- §10 专辑码对照：现推 + 断言，不落盘

def test_album_prefix_maps_to_exactly_one_album_key():
    """§10：前缀 ↔ albumKey **不落盘**，构建期从镜像表现推；实测 44 前缀 / 39 albumKey。

    一个 albumKey 对多个前缀是合法的（子碟），反过来不是 —— 这条断言守的是后者。
    """
    albums = validate.load_albums(validate.Problems())
    problems = validate.Problems()
    stats = validate.check_album_prefixes(albums, problems)
    assert problems.errors == [], problems.errors
    assert (stats["prefixes"], stats["album_keys"]) == (44, 39)
    assert len(stats["multi_prefix_keys"]) == 4, stats["multi_prefix_keys"]


def test_a_prefix_spanning_two_albums_is_rejected(monkeypatch):
    """反证：同一个前缀挂到两张专辑 ⇒ 必须报错（否则"曲id 前缀 = 专辑"这条推导会静默错位）。"""
    real = validate.build_mod.load_mirror_entries("thbwiki")
    albums = validate.load_albums(validate.Problems())
    other = next(entry["album"] for entry in real if entry["album"] != real[0]["album"])
    broken = real + [{"id": real[0]["id"], "album": other, "title": "99. 撞前缀",
                      "url": "https://example.com/x.mp3"}]
    monkeypatch.setattr(validate.build_mod, "load_mirror_entries", lambda source_id: broken)
    problems = validate.Problems()
    validate.check_album_prefixes(albums, problems)
    assert any("属于多个 albumKey" in e for e in problems.errors), problems.errors


# ---------------------------------- §7.2 来源版本：外部模式的 index.json 必须带 source

def test_external_index_must_carry_the_dataset_source(monkeypatch):
    """外部模式（数据集在场）的产物 index.json 必须带 source；缺了就是追不到"哪次提交生成"。

    反证：把 otomads 那份的 source 摘掉，同一次校验必须报错。
    """
    problems = validate.Problems()
    validate.check_datasets({}, {}, {}, problems)
    assert not any("source" in e for e in problems.errors), problems.errors

    real = validate._load_generated

    def without_source(mode):
        data = real(mode)
        if mode == "otomads" and data is not None:
            data = {**data, "index": {k: v for k, v in data["index"].items()
                                      if k not in ("source", "fallback")}}
        return data

    monkeypatch.setattr(validate, "_load_generated", without_source)
    problems = validate.Problems()
    validate.check_datasets({}, {}, {}, problems)
    assert any("source.repo/commit" in e for e in problems.errors), problems.errors


# ---------------------------------- §7.2 ③ 空兜底：数据仓库与快照都不可得时

def test_fallback_index_is_marked_instead_of_faking_a_source():
    """空兜底那份 index.json 带 `fallback: true`，不假装有来源版本；有来源时不打这个标。

    CI 里 custom 永远走这条（仓库是私有的，主仓库 CI 拿不到它的数据集）。
    """
    chars, albums = {"schema": 2, "characters": []}, {"schema": 2, "albums": []}
    marked = build.build_index("custom", chars, albums, "x", None, fallback=True)
    assert marked["fallback"] is True and "source" not in marked
    with_source = build.build_index("custom", chars, albums, "x",
                                    {"repo": "r", "commit": "c"}, fallback=True)
    assert with_source["source"] == {"repo": "r", "commit": "c"} and "fallback" not in with_source
    assert "fallback" not in build.build_index("originals", chars, albums, "x")


def test_fallback_dataset_only_gets_a_note_not_an_error(monkeypatch):
    """空兜底 ⇒ validate 记 note、不报「缺 source.repo/commit」（那就是 CI 红的原因）。"""
    index = {"schema": 2, "mode": "custom", "fallback": True, "contentHash": "x",
             "counts": {"characters": 0, "albums": 0, "trackEntries": 0, "distinctTracks": 0}}
    data = {"index": index, "characters": [], "tracks": {}}
    monkeypatch.setattr(validate, "_load_generated", lambda mode: data if mode == "custom" else None)
    problems = validate.Problems()
    validate.check_datasets({}, {}, {}, problems)
    assert not any("source.repo/commit" in e for e in problems.errors), problems.errors
    assert any("空兜底" in note for note in problems.notes), problems.notes


def test_custom_source_registry_falls_back_to_the_builtin_record(monkeypatch):
    """custom 数据仓库不在场 ⇒ 按 `build.FALLBACK_SOURCES` 检查，而不是「缺少音源注册表」。"""
    monkeypatch.setattr(validate.repo, "find_source_registry", lambda mode: None)
    problems = validate.Problems()
    validate.check_declared_sources(problems)
    assert not any("缺少音源注册表" in e for e in problems.errors), problems.errors
    assert not any("[custom]" in e for e in problems.errors), problems.errors


