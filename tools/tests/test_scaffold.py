"""`tmc.scaffold`：为缺失的角色预置骨架文件（D137）。

盯住四件事：只补缺的、**绝不覆盖**、骨架对管线惰性（能被 `tmc.packs` 读回且不产生曲目）、
注释里的示例键**都是合法键**（取消注释后写错键名是直接报错）。
"""
import pathlib

import pytest

from tmc import packs as pack_mod
from tmc import repo, scaffold

MANIFEST = ('[pack]\nid = "otomads"\nlabel_en = "Otomads"\nlabel_zh = "音MAD"\n'
            'kind = "local"\norder = 100\n\n[[album]]\nkey = "otomads"\nname = "otomads"\n'
            'kind = "other"\npack = "otomads"\norder = 100\n')


def make_tree(tmp_path: pathlib.Path, characters: dict[str, tuple[str, int]],
              existing: dict[str, str] | None = None) -> pathlib.Path:
    """造一棵最小真源树：`data/characters/*.toml` + `data/otomads/packs/{otomads.toml,otomads/}`。"""
    chars = tmp_path / "characters"
    chars.mkdir(parents=True)
    for key, (name, order) in characters.items():
        (chars / f"{key}.toml").write_text(
            f'key = "{key}"\nname = "{name}"\norder = {order}\ncard = ["{key}.png"]\nmusic = []\n',
            encoding="utf-8")
    root = tmp_path / "otomads" / "packs"
    (root / "otomads").mkdir(parents=True)
    (root / "otomads.toml").write_text(MANIFEST, encoding="utf-8")
    for key, body in (existing or {}).items():
        (root / "otomads" / f"{key}.toml").write_text(body, encoding="utf-8")
    return root / "otomads"


@pytest.fixture
def tree(tmp_path, monkeypatch) -> pathlib.Path:
    """把 `repo.DATA` 指到临时树（`tmc.packs` / `tmc.roster` 读的是同一个常量）。"""
    monkeypatch.setattr(repo, "DATA", tmp_path)
    return make_tree(tmp_path, {"cirno": ("チルノ", 6), "rumia": ("ルーミア", 4)})


def test_creates_only_the_missing_ones(tree):
    """已有 `cirno.toml` ⇒ 只补 `rumia.toml`。"""
    (tree / "cirno.toml").write_text('key = "cirno"\n', encoding="utf-8")
    assert scaffold.write() == ["rumia"]
    assert (tree / "rumia.toml").is_file()


def test_never_overwrites_hand_written_files(tree):
    """填过曲目的文件**一个字节都不动**（否则会吃掉用户手写的内容）。"""
    body = ('key = "rumia"\n\n[[track]]\nalbum = "otomads"\nauthor = "某人"\n'
            'title = "宵闇の唄"\nextra = "角色曲"\n')
    (tree / "rumia.toml").write_text(body, encoding="utf-8")
    (tree / "cirno.toml").write_text('key = "cirno"\n', encoding="utf-8")
    assert scaffold.write() == []
    assert (tree / "rumia.toml").read_text(encoding="utf-8") == body


def test_dry_run_writes_nothing(tree):
    (tree / "cirno.toml").write_text('key = "cirno"\n', encoding="utf-8")
    assert scaffold.write(dry_run=True) == ["rumia"]
    assert not (tree / "rumia.toml").exists()
    assert sorted(path.name for path in tree.glob("*.toml")) == ["cirno.toml"]


def test_header_carries_the_true_source_metadata(tree):
    """文件名 = `key`；真源的 `name` / `order` 以注释带在文件头（顶层只能有 key / card）。"""
    scaffold.write()
    text = (tree / "rumia.toml").read_text(encoding="utf-8")
    assert 'key = "rumia"' in text
    assert "ルーミア" in text and "order = 4" in text
    assert "data:roster" in text                      # 下一步该做什么写在文件里


def test_skeleton_is_inert_for_the_pipeline(tree):
    """骨架必须能被 `tmc.packs` 读回，且**不产生任何曲目 / 卡面覆盖**（⇒ 哈希与生成物不变）。"""
    assert len(scaffold.write()) == 2
    _packs, _albums, tracks, cards, covers = pack_mod.load_packs()
    assert tracks == []
    assert cards == {}
    assert covers == {}


def test_missing_follows_the_true_source_order(tmp_path, monkeypatch):
    monkeypatch.setattr(repo, "DATA", tmp_path)
    make_tree(tmp_path, {"later": ("後", 9), "earlier": ("先", 2)})
    assert [key for key, _name, _order in scaffold.missing()] == ["earlier", "later"]


def test_example_keys_are_all_legal():
    """注释里示例用的键必须都是 `TRACK_KEYS` 的成员：取消注释后写错键名是**直接报错**。"""
    assert set(scaffold.EXAMPLE_KEYS) <= pack_mod.TRACK_KEYS


def test_errors_when_the_submodule_is_not_initialised(tmp_path, monkeypatch):
    """submodule 没初始化时给出可执行的提示，而不是写到一个不存在的地方。"""
    monkeypatch.setattr(repo, "DATA", tmp_path)
    (tmp_path / "characters").mkdir()
    with pytest.raises(SystemExit, match="submodule"):
        scaffold.write()
