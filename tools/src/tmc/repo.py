"""常量、路径与轻量文本处理（无第三方依赖）。"""
from __future__ import annotations

import pathlib
import re
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parents[3]
UPSTREAM_PUBLIC = ROOT / ".ref" / "upstream-v3" / "public"
THBWIKI_DIR = ROOT / ".ref" / "thbwiki"
DATA = ROOT / "data"
PUBLIC_DATA = ROOT / "public" / "data"
#: 阶段产物与历史快照。**定义只此一处** —— 2026-09-28 从根目录 `reports/` 移进 `docs/`，
#: 别再各处写 `ROOT / "reports"`（`tmc.validate` / `tmc.migrate` 都从这里取）。
DOCS = ROOT / "docs"
REPORTS = DOCS / "reports"


def shown(path: pathlib.Path) -> str:
    """路径尽量相对仓库根显示（测试会把 ``DATA`` 指到临时目录，那时只能给绝对路径）。"""
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)

#: 音MAD 曲包真源 submodule 的目录名（挂在 `data/` 下）。**开发时可选**：没初始化时
#: 下面的查找函数找不到东西，`tmc.packs` 会跳过、`tmc.build` 不重新生成音MAD 数据集
#: （用主仓库里已提交的 `public/data/otomads/*.json`）。
OTOMADS_DATA = "otomads"


def pack_roots() -> tuple[pathlib.Path, ...]:
    """曲包真源的根目录：主仓库 `data/packs/` + submodule `data/otomads/packs/`。

    用函数而不是常量：测试会 monkeypatch `repo.DATA`（见 `tools/tests/`）。
    """
    return (DATA / "packs", DATA / OTOMADS_DATA / "packs")


def source_roots() -> tuple[pathlib.Path, ...]:
    """音源注册表的根目录：主仓库 `data/sources/` + submodule `data/otomads/sources/`。"""
    return (DATA / "sources", DATA / OTOMADS_DATA / "sources")


def find_source_registry(mode: str) -> pathlib.Path | None:
    """按 :func:`source_roots` 找音源注册表 `<mode>.toml`；找不到返回 `None`。"""
    for root in source_roots():
        path = root / f"{mode}.toml"
        if path.exists():
            return path
    return None

# ---------------------------------------------------------------- 路径 → (专辑, 曲目)

#: 曲目键里被当作"作者段"的前缀（上游 getMusicInfo 的同一份白名单）
AUTHORS = (
    "黄昏フロンティア・上海アリス幻樂団",
    "上海アリス幻樂団",
    "ZUN",
    "あきやまうに",
    "黄昏フロンティア",
)

#: 子目录碟 → 独立专辑名后缀（尊重原名：驼峰拆词）
DISC_RENAME = {
    "DayDisc": "Day Disc",
    "NightDisc": "Night Disc",
    "ArrangeDisc": "Arrange Disc",
    "OriginalDisc": "Original Disc",
    "Trance": "Trance Disc",
}

#: 秘封倶楽部 CD（R0：这些专辑上的每一条都是「秘封曲」）
HIFUU_ALBUMS = (
    "蓬莱人形 ～ Dolls in Pseudo Paradise",
    "蓮台野夜行 ～ Ghostly Field Club",
    "夢違科学世紀 ～ Changeability of Strange Dream",
    "卯酉東海道 ～ Retrospective 53 Minutes",
    "大空魔術 ～ Magical Astronomy",
    "未知の花 魅知の旅",
    "鳥船遺跡 ～ Trojan Green Asteroid",
    "伊弉諾物質 ～ Neo-traditionalism of Japan",
    "燕石博物誌 ～ Dr.Latency's Freak Report",
    "旧約酒場 ～ Dateless Bar Old Adam",
    "七夕坂夢幻能 ~ Taboo Japan Disentanglement",
    "虹色のセプテントリオン",
)

#: 查 THBWiki 标签用的"曲名等价"替换（只影响查表，不改写存档值）
LOOKUP_ALIASES = {
    "Kingdam": "Kingdom",   # 上游拼写残留（曲名的一部分）
    "ニッ岩": "二ッ岩",       # 上游把「二ッ岩」写成片假名「ニ」
    "無礙光": "無碍光",
}


def split_track_path(path: str) -> tuple[str, str]:
    """`"<专辑>/<[碟/]><[作者 - ]曲目>.mp3"` → `(专辑, 曲目)`。

    曲目保留 `NN. ` 序号（见 docs/DECISIONS.md D6：去掉序号会产生同名冲突）。
    """
    slash = path.find("/")
    album_raw = path[:slash] if slash >= 0 else path
    last_slash = path.rfind("/")
    last_dot = path.rfind(".")
    if last_dot <= last_slash:
        last_dot = len(path)
    title = path[last_slash + 1:last_dot]
    for author in AUTHORS:
        prefix = author + " - "
        if title.startswith(prefix):
            title = title[len(prefix):]
            break
    disc = path[len(album_raw) + 1:last_slash] if slash >= 0 else ""
    if disc in DISC_RENAME:
        album = f"{album_raw} {DISC_RENAME[disc]}"
    elif disc:
        album = f"{album_raw} {disc}"
    else:
        album = album_raw
    return album, title


def lookup_key(text: str) -> str:
    """把曲名折叠成"用于查 THBWiki 标签"的等价键。

    只用于查表：去掉全部空白、全角/半角统一、去掉 `NN. ` 序号与结尾句号、
    折叠顿号与波浪线。**不**用于写回数据（存档保留原始措辞）。
    """
    s = unicodedata.normalize("NFKC", text or "")
    for src, dst in LOOKUP_ALIASES.items():
        s = s.replace(src, dst)
    s = s.replace("　", " ").replace("〜", "～").replace("~", "～")
    s = re.sub(r"^\s*\d+\.\s*", "", s)
    s = s.replace("、", "").replace("，", "")
    s = re.sub(r"[。.．]+$", "", s)
    s = re.sub(r"\s+", "", s)
    return s.strip().lower()


# ---------------------------------------------------------------- 专辑注册表种子

#: (key, name, kind, work, order)；order 只决定界面展示顺序
ALBUM_SEED: tuple[tuple[str, str, str, str, int], ...] = (
    # ---- 秘封倶楽部 CD（按发行先后）→ 界面第一组
    ("hr01", "蓬莱人形 ～ Dolls in Pseudo Paradise", "hifuu", "", 1),
    ("hr02", "蓮台野夜行 ～ Ghostly Field Club", "hifuu", "", 2),
    ("hr03", "夢違科学世紀 ～ Changeability of Strange Dream", "hifuu", "", 3),
    ("hr04", "卯酉東海道 ～ Retrospective 53 Minutes", "hifuu", "", 4),
    ("hr05", "大空魔術 ～ Magical Astronomy", "hifuu", "", 5),
    ("hr06", "未知の花 魅知の旅", "hifuu", "", 6),
    ("hr07", "鳥船遺跡 ～ Trojan Green Asteroid", "hifuu", "", 7),
    ("hr08", "伊弉諾物質 ～ Neo-traditionalism of Japan", "hifuu", "", 8),
    ("hr09", "燕石博物誌 ～ Dr.Latency's Freak Report", "hifuu", "", 9),
    ("hr10", "旧約酒場 ～ Dateless Bar Old Adam", "hifuu", "", 10),
    ("hr11", "七夕坂夢幻能 ~ Taboo Japan Disentanglement", "hifuu", "", 11),
    ("hr12", "虹色のセプテントリオン", "hifuu", "", 12),
    # ---- CD（格斗作 / arrange 碟）→ 界面第二组，顺序沿用上游预设
    ("th07.5-day", "幻想曲抜萃 ～ 東方萃夢想 Day Disc", "fighting", "东方萃梦想", 13),
    ("th07.5-night", "幻想曲抜萃 ～ 東方萃夢想 Night Disc", "fighting", "东方萃梦想", 14),
    ("th10.5-arrange", "全人類ノ天楽録 ～ 東方緋想天 Arrange Disc", "fighting", "东方绯想天", 15),
    ("th10.5-original", "全人類ノ天楽録 ～ 東方緋想天 Original Disc", "fighting", "东方绯想天", 16),
    ("th12.3", "核熱造神ヒソウテンソク ～ 東方非想天則", "fighting", "东方非想天则", 17),
    ("th13.5", "暗黒能楽集・心綺楼", "fighting", "东方心绮楼", 18),
    ("th14.5", "深秘的楽曲集", "fighting", "东方深秘录", 19),
    ("th14.5-bonus", "深秘的楽曲集·補 東方深秘録初回特典CD", "fighting", "东方深秘录", 20),
    ("th15.5", "完全憑依ディスコグラフィ", "fighting", "东方凭依华", 21),
    ("th17.5", "強欲な獣のムジカ", "fighting", "东方刚欲异闻", 22),
    # ---- 官作 OST（TH06 → TH20）→ 界面第三组
    ("th06", "東方紅魔郷 ～ the Embodiment of Scarlet Devil", "game", "东方红魔乡", 23),
    ("th07", "東方妖々夢 ～ Perfect Cherry Blossom", "game", "东方妖妖梦", 24),
    ("th08", "東方永夜抄 ～ Imperishable Night", "game", "东方永夜抄", 25),
    ("th09", "東方花映塚 ～ Phantasmagoria of Flower View", "game", "东方花映塚", 26),
    ("th10", "東方風神録 ～ Mountain of Faith", "game", "东方风神录", 27),
    ("th11", "東方地霊殿 ～ Subterranean Animism", "game", "东方地灵殿", 28),
    ("th12", "東方星蓮船 ～ Undefined Fantastic Object", "game", "东方星莲船", 29),
    ("th13", "東方神霊廟 ～ Ten Desires", "game", "东方神灵庙", 30),
    ("th13-trance", "東方神霊廟 ～ Ten Desires Trance Disc", "game", "东方神灵庙", 31),
    ("th14", "東方輝針城 ～ Double Dealing Character", "game", "东方辉针城", 32),
    ("th15", "東方紺珠伝 ～ Legacy of Lunatic Kingdom", "game", "东方绀珠传", 33),
    ("th16", "東方天空璋 ～ Hidden Star in Four Seasons", "game", "东方天空璋", 34),
    ("th17", "東方鬼形獣 ～ Wily Beast and Weakest Creature", "game", "东方鬼形兽", 35),
    ("th18", "東方虹龍洞 ～ Unconnected Marketeers", "game", "东方虹龙洞", 36),
    ("th19", "東方獣王園 ～ Unfinished Dream of All Living Ghost", "game", "东方兽王园", 37),
    ("th20", "東方錦上京 ～ Fossilized Wonders", "game", "东方锦上京", 38),
    # ---- 其它官方 CD（漫画付録 CD）
    ("sangetsusei", "東方三月精 ～ Eastern and Little Nature Deity", "other", "", 39),
)

#: 上游 `tags` 里的作品名 → THBWiki 作品页（用来推角色首发作品）
TAG_WORK = {
    "紅魔郷": "东方红魔乡", "妖々夢": "东方妖妖梦", "永夜抄": "东方永夜抄", "花映塚": "东方花映塚",
    "風神録": "东方风神录", "地霊殿": "东方地灵殿", "星蓮船": "东方星莲船", "神霊廟": "东方神灵庙",
    "輝針城": "东方辉针城", "紺珠伝": "东方绀珠传", "天空璋": "东方天空璋", "鬼形獣": "东方鬼形兽",
    "虹龍洞": "东方虹龙洞", "獣王園": "东方兽王园", "錦上京": "东方锦上京",
    "萃夢想": "东方萃梦想", "緋想天": "东方绯想天", "心綺楼": "东方心绮楼",
    "深秘録": "东方深秘录", "憑依華": "东方凭依华",
}

#: PC-98（TH01–TH05）首发角色：按已裁定"PC-98 计入首发作品"覆写 tags 推出的首发
PC98_DEBUT = {
    "博麗霊夢": "th01", "霧雨魔理沙": "th01", "アリス・マーガトロイド": "th05", "八雲紫": "th03",
}

WORK_ORDER = {work: i for i, work in enumerate(
    ["东方红魔乡", "东方妖妖梦", "东方永夜抄", "东方花映塚", "东方风神录", "东方地灵殿", "东方星莲船",
     "东方神灵庙", "东方辉针城", "东方绀珠传", "东方天空璋", "东方鬼形兽", "东方虹龙洞", "东方兽王园",
     "东方锦上京", "东方萃梦想", "东方绯想天", "东方非想天则", "东方心绮楼", "东方深秘录", "东方凭依华",
     "东方刚欲异闻"])}
