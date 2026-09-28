"""解析与 slug 的黄金样例（来自上游数据实测）。"""
from tmc import repo


def test_split_artist_style_path():
    album, title = repo.split_track_path(
        "東方永夜抄 ～ Imperishable Night/上海アリス幻樂団 - 恋色マスタースパーク.mp3")
    assert (album, title) == ("東方永夜抄 ～ Imperishable Night", "恋色マスタースパーク")


def test_split_keeps_track_number():
    album, title = repo.split_track_path("核熱造神ヒソウテンソク ～ 東方非想天則/11. 恋色マジック.mp3")
    assert (album, title) == ("核熱造神ヒソウテンソク ～ 東方非想天則", "11. 恋色マジック")


def test_split_renames_disc_directories():
    album, title = repo.split_track_path(
        "幻想曲抜萃 ～ 東方萃夢想/DayDisc/04. 恋色マジック.mp3")
    assert (album, title) == ("幻想曲抜萃 ～ 東方萃夢想 Day Disc", "04. 恋色マジック")
    album, _ = repo.split_track_path(
        "全人類ノ天楽録 ～ 東方緋想天/ArrangeDisc/03. 星の器 ～ Casket of Star.mp3")
    assert album == "全人類ノ天楽録 ～ 東方緋想天 Arrange Disc"
    album, _ = repo.split_track_path("東方神霊廟 ～ Ten Desires/Trance/01. 欲望の第二楽章.mp3")
    assert album == "東方神霊廟 ～ Ten Desires Trance Disc"


def test_split_without_extension_does_not_eat_directory():
    album, title = repo.split_track_path("七夕坂夢幻能 ~ Taboo Japan Disentanglement/上海アリス幻樂団 - 憑坐は夢と現の間に")
    assert title == "憑坐は夢と現の間に"
    assert album == "七夕坂夢幻能 ~ Taboo Japan Disentanglement"


def test_lookup_key_folds_punctuation_and_spacing():
    a = repo.lookup_key("幽雅に咲かせ、墨染の桜 ～ Border of Life")
    b = repo.lookup_key("幽雅に咲かせ 墨染の桜 ～ Border of Life.")
    c = repo.lookup_key("16. 幽雅に咲かせ、墨染の桜 ～ Border of Life")
    assert a == b == c
    assert repo.lookup_key("風神少女　 (Short Version)") == repo.lookup_key("風神少女(Short Version)")
    assert repo.lookup_key("上海紅茶館 ～ Chinese Tea") == repo.lookup_key("上海紅茶館 ~ Chinese Tea") \
        or repo.lookup_key("上海紅茶館 ～ Chinese Tea").replace("～", "") == \
        repo.lookup_key("上海紅茶館 ~ Chinese Tea").replace("～", "")


def test_lookup_key_prefix_tolerance_is_only_for_lookup():
    # 数据里少了 "～ Missing Power"，查表时靠前缀匹配；存档值保持原样
    assert repo.lookup_key("御伽の国の鬼が島") != repo.lookup_key("御伽の国の鬼が島 ～ Missing Power")


def test_choose_slug_prefers_english_name():
    taken: set[str] = set()
    assert repo.choose_slug("アリス・マーガトロイド",
                       ["アリス・マーガトロイド", "Arisu Magatoroido", "Alice Margatroid",
                        "ailisi mageteluoyide"], taken) == "alice-margatroid"
    assert repo.choose_slug("チルノ", ["チルノ", "Cirno", "qilunuo"], taken) == "cirno"
    assert repo.choose_slug("霧雨魔理沙", ["霧雨魔理沙", "Kirisame Marisa", "wuyu molisha"], taken) == "kirisame-marisa"


def test_choose_slug_deduplicates():
    taken: set[str] = set()
    assert repo.choose_slug("Ａ", ["A"], taken) == "a"
    assert repo.choose_slug("Ａ", ["A"], taken) == "a-2"
