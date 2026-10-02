"""常量、路径与轻量文本处理（无第三方依赖）。"""
from __future__ import annotations

import os
import pathlib
import re
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parents[3]
DATA = ROOT / "data"
PUBLIC_DATA = ROOT / "data" / "public" / "data"
#: 阶段产物与历史快照。**定义只此一处** —— 2026-09-28 从根目录 `reports/` 移进 `docs/`，
#: 别再各处写 `ROOT / "reports"`（`tmc.validate` 从这里取）。
DOCS = ROOT / "docs"
REPORTS = DOCS / "reports"


def shown(path: pathlib.Path) -> str:
    """路径尽量相对仓库根显示（测试会把 ``DATA`` 指到临时目录，那时只能给绝对路径）。"""
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)

#: 两个外部数据仓库的**位置来源**（REFACTOR-PLAN v2 §7.2/§11.4：不再是 submodule）。
#: env 优先，默认 `<主仓库>/data/<mode>`：
#:   * 本地开发：clone 到那儿，或把 env 指到工作区根的独立克隆；
#:   * CI / 部署链：把 Release 的**数据集快照**解到那儿（`.github/workflows/gate.yml`）。
DATA_DIR_ENV = {"otomads": "OTOMADS_DATA_DIR", "custom": "CUSTOM_DATA_DIR"}


def data_dir(mode: str) -> pathlib.Path:
    """某个外部数据仓库的根目录（env 覆盖 ⇒ 默认 `data/<mode>`）。"""
    value = os.environ.get(DATA_DIR_ENV[mode], "").strip()
    return pathlib.Path(value).expanduser() if value else DATA / mode


def dataset_dir(mode: str) -> pathlib.Path:
    """该仓库**已生成的数据集**目录：它自己的 `dataset.py` 写这里，或 CI 快照解开在这里。"""
    return data_dir(mode) / "dataset"


def pack_roots() -> tuple[pathlib.Path, ...]:
    """曲包真源的根目录：主仓库 `data/packs/` + 音MAD 数据仓库的 `packs/`。

    用函数而不是常量：测试会 monkeypatch `repo.DATA`（见 `tools/tests/`），env 也可以随时改。
    """
    return (DATA / "packs", data_dir("otomads") / "packs")


def source_roots() -> tuple[pathlib.Path, ...]:
    """音源注册表的根：主仓库 `data/sources/` + 两个数据仓库各自的 `sources/`。

    每个模式的源跟着它自己的数据走（§11.3）：原曲只剩镜像，音MAD/自定义各在自己仓库。
    """
    return (DATA / "sources", data_dir("otomads") / "sources", data_dir("custom") / "sources")


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


def choose_slug(name: str, search_names: list[str], taken: set[str]) -> str:
    """从 searchNames 里挑一个 ASCII 罗马字做稳定 key。

    规则：候选 = 全 ASCII 的别名；优先"含空格且非全小写"的最后一个（英文名优于训令式罗马字，
    例如 ``Alice Margatroid`` 优于 ``Arisu Magatoroido``），否则取第一个候选。
    """
    ascii_names = [s for s in search_names if s and s.isascii()]
    spaced = [s for s in ascii_names if " " in s and s != s.lower()]
    raw = (spaced[-1] if spaced else (ascii_names[0] if ascii_names else name))
    slug = unicodedata.normalize("NFKC", raw).lower()
    slug = "".join(ch if ch.isalnum() else "-" for ch in slug).strip("-")
    slug = "-".join(part for part in slug.split("-") if part) or "character"
    candidate, n = slug, 2
    while candidate in taken:
        candidate, n = f"{slug}-{n}", n + 1
    taken.add(candidate)
    return candidate


