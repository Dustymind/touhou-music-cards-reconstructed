"""`附加信息` 判定的黄金样例（docs/rules-classification-v1.md §4）与数据不变量。"""
import pytest

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


def test_data_invariants_hold():
    problems, stats = validate.run()
    assert problems.errors == [], problems.errors
    assert stats["characters"] == 121
    assert stats["albums"] == 39
    assert stats["entries"] == 378       # 357 条上游条目 + 21 条人工补配
    assert stats["distinct_tracks"] == 368
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
        for _album, _title, extra in char["music"]:
            seen.add(extra)
    assert seen <= {"角色曲", "道中曲", "更多道中曲", "秘封曲"}
    assert "秘封曲" in seen
