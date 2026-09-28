"""`附加信息` 判定的黄金样例（docs/rules-classification-v1.md §4）与数据不变量。"""
import pathlib

import pytest

from tmc import build
from tmc import packs as pack_mod
from tmc import validate
from tmc.roles import RoleIndex, classify

DEBUT = {"レティ・ホワイトロック": "东方妖妖梦", "ルーミア": "东方红魔乡", "チルノ": "东方红魔乡",
         "紅美鈴": "东方红魔乡", "秦こころ": "东方心绮楼"}


@pytest.fixture(scope="module")
def index() -> RoleIndex:
    return RoleIndex.load()


@pytest.mark.parametrize(
    ("char", "album", "title", "extra"),
    [
        # 用户质疑并更正的那条：クリスタライズシルバー 是角色曲，不是道中曲
        ("レティ・ホワイトロック", "東方妖々夢 ～ Perfect Cherry Blossom", "クリスタライズシルバー", "角色曲"),
        # 首发作品的道中曲（TH06 ST1）
        ("ルーミア", "東方紅魔郷 ～ the Embodiment of Scarlet Devil", "ほおずきみたいに紅い魂", "道中曲"),
        ("ルーミア", "東方紅魔郷 ～ the Embodiment of Scarlet Devil", "妖魔夜行", "角色曲"),
        ("チルノ", "東方紅魔郷 ～ the Embodiment of Scarlet Devil", "おてんば恋娘", "角色曲"),
        # 后续作品的道中曲（TH07 / TH14，E1 中 BOSS）
        ("チルノ", "東方妖々夢 ～ Perfect Cherry Blossom", "無何有の郷　～ Deep Mountain", "更多道中曲"),
        ("チルノ", "東方輝針城 ～ Double Dealing Character", "ミストレイク", "更多道中曲"),
        # 格斗作场景曲按本人曲处理
        ("チルノ", "核熱造神ヒソウテンソク ～ 東方非想天則", "04. おてんば恋娘", "角色曲"),
        ("紅美鈴", "核熱造神ヒソウテンソク ～ 東方非想天則", "05. 上海紅茶館 ～ Chinese Tea", "角色曲"),
    ],
)
def test_rule_vectors(index, char, album, title, extra):
    verdict = classify(index, album, title, DEBUT.get(char))
    assert verdict.extra == extra, verdict


def test_hifuu_wins_over_everything(index):
    verdict = classify(index, "蓬莱人形 ～ Dolls in Pseudo Paradise", "04. 明治十七年の上海アリス", "东方红魔乡")
    assert verdict.extra == "秘封曲"
    assert verdict.rule == "R0"


def test_th20_resolves_via_live_wiki_labels(index):
    # TH20 的 Music Room 在线上 wiki，抓取后即可机械判定
    assert classify(index, "東方錦上京 ～ Fossilized Wonders", "愛おしき塵の住処", "东方锦上京").extra == "道中曲"
    assert classify(index, "東方錦上京 ～ Fossilized Wonders", "例え世界から忘れられても",
                    "东方锦上京").extra == "角色曲"


def test_unregistered_album_is_reported_not_guessed(index):
    verdict = classify(index, "不存在的专辑", "不存在的曲目", None)
    assert verdict.extra is None and verdict.rule == "R4"


def test_manual_overrides_win_and_are_traceable():
    from tmc.roles import load_overrides

    overrides = load_overrides()
    assert len(overrides) == 5
    verdict = classify(RoleIndex.load(), "東方三月精 ～ Eastern and Little Nature Deity",
                       "妖精燦々として", None, overrides=overrides)
    assert verdict.extra == "角色曲" and verdict.rule == "R-OVR"


@pytest.mark.skipif(not pack_mod.available(), reason="音MAD 曲包 submodule 未初始化")
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
    assert stats["pending"] == 0
    assert stats["overrides"] == 5
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
        for entry in char["music"]:
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


def test_card_override_is_allowed_for_otomads_only():
    """卡面是"跨模式身份一致"的**唯一例外**：音MAD 可以在曲包角色文件里覆盖自己的卡面。

    其余身份字段（name / order / searchNames）仍必须一致；没覆盖的角色连 card 也要一致。
    """
    chars = [{"key": "a", "name": "A", "order": 1, "card": ["a.png"], "searchNames": ["a"],
              "music": [{"id": "x_1", "album": "原曲盘", "title": "t", "extra": "角色曲"}]}]
    pack_albums = [{"key": "otomads", "name": "otomads", "kind": "other", "pack": "otomads", "order": 1}]
    pack_tracks = [{"character": "a", "album": "otomads", "title": "t2", "extra": "角色曲", "pack": "otomads"}]
    albums = {"原曲盘": {}, "otomads": {}}

    # ① 覆盖卡面：合法
    problems = validate.Problems()
    validate.check_datasets(chars, pack_tracks, pack_albums, {"a": ["a-mad.png"]}, {}, albums, problems)
    assert problems.errors == [], problems.errors

    # ② 没覆盖：两份数据集的 card 必须一致（这里本来就一致）
    problems = validate.Problems()
    validate.check_datasets(chars, pack_tracks, pack_albums, {}, {}, albums, problems)
    assert problems.errors == [], problems.errors

    # ③ 覆盖指向未知角色 → 报错
    problems = validate.Problems()
    validate.check_datasets(chars, pack_tracks, pack_albums, {"nope": ["x.png"]}, {}, albums, problems)
    assert any("未知角色" in error for error in problems.errors)

    # （校验里还有一条"覆盖了却没生效"的守卫：数据集是 build 出来的，正常路径下不会触发，
    #   它防的是将来有人改 build_characters 绕过覆盖 —— 所以这里没有可构造的反例。）


def test_source_covers_are_otomads_only_and_must_match_the_track_count():
    """源封面（D153）：只在音MAD 那份里有；**一首一封面**（长度必须等于曲目数）。

    `covers` 与 `card` 一样是"跨模式身份一致"的例外 —— 它压根不出现在原曲那份里，
    所以要比的是"真源的 cover 真的进了 otomads 生成物"，以及"条数与曲目数相等"。
    """
    chars = [{"key": "a", "name": "A", "order": 1, "card": ["a.png"], "searchNames": ["a"],
              "music": [{"id": "x_1", "album": "原曲盘", "title": "t", "extra": "角色曲"}]}]
    pack_albums = [{"key": "otomads", "name": "otomads", "kind": "other", "pack": "otomads", "order": 1}]
    pack_tracks = [{"character": "a", "album": "otomads", "title": "t2", "extra": "角色曲", "pack": "otomads"},
                   {"character": "a", "album": "otomads", "title": "t3", "extra": "角色曲", "pack": "otomads"}]
    albums = {"原曲盘": {}, "otomads": {}}
    covers = {"a": ["https://i0.hdslb.com/a.jpg@703w_1000h_1c.webp",
                    "https://i1.hdslb.com/b.jpg@703w_1000h_1c.webp"]}

    # ① 两条曲目两条封面：合法，且**只**进 otomads 那份
    problems = validate.Problems()
    stats = validate.check_datasets(chars, pack_tracks, pack_albums, {}, covers, albums, problems)
    assert problems.errors == [], problems.errors
    assert stats["otomads"] == {"characters": 1, "entries": 2, "distinctTracks": 2}

    # ② 长度对不上（两首曲目只有一条封面）→ 报错，且话说清楚"一首一封面"
    problems = validate.Problems()
    validate.check_datasets(chars, pack_tracks, pack_albums, {}, {"a": covers["a"][:1]}, albums, problems)
    assert any("封面数与曲目数不等" in error for error in problems.errors), problems.errors

    # ③ 不是 https 绝对 URL → 报错
    problems = validate.Problems()
    validate.check_datasets(chars, pack_tracks, pack_albums, {}, {"a": ["a-mad.png", "b.png"]},
                            albums, problems)
    assert any("封面非法" in error for error in problems.errors), problems.errors

    # ④ 封面指向没有音MAD 曲目的角色 → 报错（曲目表里没有它，图也就没有落点）
    problems = validate.Problems()
    validate.check_datasets(chars, pack_tracks, pack_albums, {}, {"nope": ["https://x/y.jpg"]},
                            albums, problems)
    assert any("没有音MAD 曲目的角色" in error for error in problems.errors), problems.errors


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


def test_build_emits_authors_as_the_fifth_slot():
    """`build._pack_music`：第 4 位仍是整串（stem），第 5 位才是多作者数组。"""
    music = build._pack_music([
        {"character": "cirno", "album": "demo", "title": "一", "extra": "角色曲",
         "author": "甲 & 乙", "authors": ["甲", "乙"]},
        {"character": "cirno", "album": "demo", "title": "二", "extra": "角色曲", "author": "丙"},
        {"character": "cirno", "album": "demo", "title": "三", "extra": "角色曲"},
    ])
    assert music["cirno"] == [
        ["demo", "一", "角色曲", "甲 & 乙", ["甲", "乙"]],
        ["demo", "二", "角色曲", "丙"],
        ["demo", "三", "角色曲"],
    ]
