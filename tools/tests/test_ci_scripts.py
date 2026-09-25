"""`.github/scripts/` 下 CI 脚本的守卫（D146）。

CI 脚本没人 import、平时也不跑 —— 最容易悄悄漂移。这里钉两条：

1. **曲名归一化的口径必须与前端一致**：`check_otomads_archive.py` 用它比对"曲目表（标题）"与
   "地址表（磁盘名 `作者 - 标题`）"，而前端 `src/music/sources.ts::normalizeTitle` 用的是同一条规则。
   两份实现（Python / TS）零 import 依赖，只能按文本对字面量 —— 与
   `test_build.py::test_author_join_matches_the_data_repo_helper` 同一个套路。
2. **归档自检的硬判据**：清单缺 `albums` / `characters`（D145 的"包数据"）必须报出来 ——
   缺了这次部署等于没生效，而它正是"线上没变化"最可能的成因。
"""
from __future__ import annotations

import importlib.util
import re
from types import ModuleType

from tmc import repo

SCRIPT = repo.ROOT / ".github" / "scripts" / "check_otomads_archive.py"


def load_script() -> ModuleType:
    """按路径载入 CI 脚本（它不是包的一部分，纯标准库、无副作用）。"""
    spec = importlib.util.spec_from_file_location("check_otomads_archive", SCRIPT)
    assert spec and spec.loader, f"载入不了 {SCRIPT}"
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_normalize_title_matches_the_frontend_rule():
    script = load_script()
    frontend = (repo.ROOT / "src" / "music" / "sources.ts").read_text(encoding="utf-8")
    # 前缀剥离：两边必须是同一条正则（`^[^-]{1,60}?\s+-\s+`）
    assert re.search(r"\^\[\^-\]\{1,60\}\?\\s\+-\\s\+", frontend), "前端那条正则变了？同步 CI 脚本"
    assert script.normalize_title("thwy - 岁月") == "岁月"
    assert script.normalize_title("  A   B  ") == "a b"
    # 没有 `作者 - ` 前缀的（磁盘名就是标题）原样保留
    assert script.normalize_title("【东方电气棍】鞍山的唢呐师") == "【东方电气棍】鞍山的唢呐师"
    # **作者名里带 `-`**：前缀剥不掉（两边都一样），靠 `review()` 里的"以 ` - 曲名` 结尾"兜底
    assert script.normalize_title("Rendering-Liu - 岁月") == "rendering-liu - 岁月"


def test_review_matches_disk_names_by_the_suffix_rule():
    """磁盘名是 `作者 - 标题`、曲目表里作者是独立字段 ⇒ 匹配必须靠**归一化 + 后缀**（前端同一口径）。

    作者名里带 `-` 时前缀剥不掉（`Rendering-Liu - 岁月`），此时只有后缀那条规则能救 ——
    这正是前端 `resolveTrack` 的兜底，也是这条 CI 检查**不能**用"精确相等"的原因。
    """
    script = load_script()
    manifest = {
        "schema": 1, "pack": "otomads",
        "tracks": [["otomads", "Rendering-Liu - 岁月", "media/otomads/Rendering-Liu%20-%20%E5%B2%81%E6%9C%88.mp3"]],
        "albums": [{"key": "otomads", "name": "otomads", "kind": "other", "pack": "otomads", "order": 1}],
        "characters": [{"key": "cirno", "music": [["otomads", "岁月", "角色曲", "Rendering-Liu"]]}],
    }
    problems, warnings = script.review(manifest, {"media/otomads/Rendering-Liu - 岁月.mp3"})
    assert problems == []
    assert warnings == []


def test_review_insists_on_the_pack_data():
    script = load_script()
    problems, _warnings = script.review({"schema": 1, "pack": "otomads", "tracks": []}, None)
    assert any("albums" in problem for problem in problems)
    assert any("characters" in problem for problem in problems)


def test_review_warns_but_does_not_fail_on_unfetched_tracks():
    """曲目表里有、地址表里没有 = "还没抓"的合法中间态 ⇒ 只警告（否则补全期间根本铺不上去）。"""
    script = load_script()
    manifest = {
        "schema": 1, "pack": "otomads",
        "tracks": [["otomads", "甲 - 已抓的", "media/otomads/%E7%94%B2%20-%20%E5%B7%B2%E6%8A%93%E7%9A%84.mp3"]],
        "albums": [{"key": "otomads", "name": "otomads", "kind": "other", "pack": "otomads", "order": 1}],
        "characters": [{"key": "cirno", "music": [["otomads", "已抓的", "角色曲"],
                                                  ["otomads", "还没抓的", "角色曲"]]}],
    }
    problems, warnings = script.review(manifest, {"media/otomads/甲 - 已抓的.mp3"})
    assert problems == []
    assert any("还没抓的" in warning for warning in warnings)
