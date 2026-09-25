#!/usr/bin/env python3
"""素材归档 / 线上清单的自检（`deploy-otomads-cdn.yml` 用；本地也能直接跑）。

    python3 .github/scripts/check_otomads_archive.py otomads-media.tar.gz
    python3 .github/scripts/check_otomads_archive.py --summarize manifest.json

为什么要有它：归档是**部署物** —— 坏一个字节就是线上坏，而目标站
（`otomads-cdn.tsukinomiyako-mangesui.top`）**没有别的守卫**（CI 不构建它，它只是被铺上去）。
判据与数据仓库 `otomads.stage_media.verify` 同一套，只是那边管"打"、这边管"铺"。

**硬失败**（一定是坏的部署）：

* 清单缺 `schema` / `pack` / `tracks` / `albums` / `characters` —— 后两个是 D145 的"包数据"，
  缺了应用只会走兜底，**这次部署等于没生效**；
* 行形状不对，或**地址表里的每一行都要有对应文件**（缺 = 播到那首 404）；
* `characters` 里一条曲目都没有（同上：部署等于没生效）。

**只警告**（合法的中间态，不该拦住部署）：

* **曲目表里有、地址表里没有**：那个角色的音MAD 还没抓/还没打包（用户正在手工补全 86 个骨架时很常见）；
* **地址表里有、曲目表里没有**：曲库里多放了一个没写进曲包的 mp3 —— 按 D145 的口径，
  **曲目表以曲包为准**，这一首本来就该选不到（「源状态」那一行的数字仍按行数）。

曲名匹配抄 `src/music/sources.ts::normalizeTitle` 的口径（去 `作者 - ` 前缀、压空白、小写，
再允许"磁盘名以 ` - 曲名` 结尾"）—— **改了那边要同步这里**。
"""
from __future__ import annotations

import json
import pathlib
import re
import sys
import tarfile
from urllib.parse import unquote

#: 清单必须有的顶层键（`albums` / `characters` 见 D145）
REQUIRED_KEYS = ("schema", "pack", "tracks", "albums", "characters")


def normalize_title(value: str) -> str:
    """与 `src/music/sources.ts::normalizeTitle` 同一口径（曲目表给的是"标题"，磁盘名是"作者 - 标题"）。"""
    stripped = re.sub(r"^[^-]{1,60}?\s+-\s+", "", value)
    return re.sub(r"\s+", " ", stripped).strip().lower()


def summarize(manifest: dict) -> str:
    """一行摘要（归档自检与线上复核共用同一句话，方便肉眼对比）。"""
    entries = [entry for character in manifest.get("characters", []) for entry in character["music"]]
    return (f"{len(manifest.get('tracks', []))} 行地址 / "
            f"{len(manifest.get('characters', []))} 个角色 / {len(entries)} 条曲目条目 / "
            f"顶层 revision {manifest.get('revision')}")


def review(manifest: dict, members: set[str] | None) -> tuple[list[str], list[str]]:
    """→ `(硬失败, 警告)`；给了 `members`（归档成员名）就顺带查"地址 ↔ 文件"。"""
    problems: list[str] = []
    for key in REQUIRED_KEYS:
        if key not in manifest:
            problems.append(f"manifest 缺 {key}")
    if problems:
        return problems, []

    rows = manifest["tracks"]
    for row in rows:
        if not isinstance(row, list) or len(row) < 3 or not all(isinstance(x, str) for x in row[:3]):
            problems.append(f"行形状不对：{row!r}")
    good_rows = [row for row in rows if isinstance(row, list) and len(row) >= 3]
    entries = [entry for character in manifest["characters"] for entry in character["music"]]
    if not entries:
        problems.append("characters 里一条曲目都没有（应用只会走兜底 ⇒ 这次部署等于没生效）")

    if members is not None:
        pack = manifest["pack"]
        for row in good_rows:
            # 地址可能是相对的（`media/…`）或绝对的（`https://host/media/…`）：只看末尾那段。
            # 地址里的文件名是 **百分号编码**的（助手与 `stage_media` 共用 `quote`），而归档里的成员名是
            # 原始 UTF-8 ⇒ 比之前先 `unquote`（D96/D141 的口径：两者必须是同一个名字）
            tail = str(row[2]).split("?", 1)[0].rstrip("/")
            encoded = pathlib.PurePosixPath(tail).name
            if f"media/{pack}/{unquote(encoded)}" not in members:
                problems.append(f"地址表里有、文件没有：{row[2]}")

    # 两个方向都按应用那套归一化比：不一致只警告（见模块 docstring）
    stored = {normalize_title(row[1]) for row in good_rows}
    warnings: list[str] = []
    missing_rows = [entry[1] for entry in entries
                    if not any(name == normalize_title(entry[1])
                               or name.endswith(f" - {normalize_title(entry[1])}") for name in stored)]
    if missing_rows:
        warnings.append(f"曲目表里有 {len(missing_rows)} 条在地址表里找不到"
                        f"（还没抓/还没打包？）：{'、'.join(missing_rows[:3])}"
                        + ("…" if len(missing_rows) > 3 else ""))
    wanted = {normalize_title(entry[1]) for entry in entries}
    extra_rows = [row[1] for row in good_rows
                  if not any(name == title or name.endswith(f" - {title}") for title in wanted
                             for name in [normalize_title(row[1])])]
    if extra_rows:
        warnings.append(f"地址表里有 {len(extra_rows)} 条不在曲目表里"
                        f"（曲包里没写 ⇒ 应用里选不到，合法）：{'、'.join(extra_rows[:3])}"
                        + ("…" if len(extra_rows) > 3 else ""))
    return problems, warnings


def report(problems: list[str], warnings: list[str], headline: str) -> int:
    for warning in warnings:
        print(f"⚠️  {warning}")
    if problems:
        print("❌ 自检没过：")
        for problem in problems[:10]:
            print(f"  - {problem}")
        if len(problems) > 10:
            print(f"  …还有 {len(problems) - 10} 条")
        return 1
    print(f"✅ {headline}")
    return 0


def check_archive(path: pathlib.Path) -> int:
    if not path.is_file():
        print(f"❌ 找不到归档：{path}")
        return 2
    with tarfile.open(path, "r:gz") as archive:
        names = archive.getnames()
        members = {name for name in names if name.startswith("media/")}
        try:
            manifest = json.load(archive.extractfile("manifest.json"))
        except KeyError:
            print("❌ 归档里没有 manifest.json")
            return 1
    problems, warnings = review(manifest, members)
    return report(problems, warnings, f"归档自检通过（{len(names)} 个成员）：{summarize(manifest)}")


def main(argv: list[str]) -> int:
    if len(argv) == 3 and argv[1] == "--summarize":
        manifest = json.loads(pathlib.Path(argv[2]).read_text(encoding="utf-8"))
        problems, warnings = review(manifest, None)
        return report(problems, warnings, f"线上清单：{summarize(manifest)}")
    if len(argv) == 2:
        return check_archive(pathlib.Path(argv[1]))
    print(__doc__)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
