"""生成物契约：`tmc.build` 写出哪些文件、曲包曲目进哪一份、镜像清单从哪来。

对应用户审阅时列的仓库外条目（`REVIEW-enhanced-otomad-mode.md`）：R1（并入口只有一处）、
R6（停生成没人读的 `packs.json`）、R7④（镜像 id 从注册表派生，不再三处硬编码）。
D131 追加：**源表地址形态**（相对路径 / http(s) 绝对 URL，禁根绝对路径）——
子目录部署（GitHub Pages 项目页）下根绝对路径必 404。
"""
from __future__ import annotations

import json

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
    _packs, _albums, pack_tracks, _cards = pack_mod.load_packs()

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
            assert build.table_url_problem(source["tableUrl"]) is None, \
                f"[{mode}] {source['id']} → {source['tableUrl']}"
