"""为「真源里有、曲包里还没有」的角色预置骨架文件（`packs/otomads/<key>.toml`）。

用法::

    uv run python -m tmc.scaffold            # 补齐缺失的角色文件（**已存在的一律不动**）
    uv run python -m tmc.scaffold --dry-run  # 只列出会新建哪些

为什么要有它（D137）：曲包角色文件要人一首一首填，而两件事让"人自己新建文件"很容易踩空 ——

* `key` 拼错（或文件名与 `key` 不一致）会被 `tmc.packs` 直接拦下，写成别的键名会被 `_reject_unknown`
  拒绝（刻意的：拼错的键曾被静默忽略，表现为"数据里写了却不生效"）；
* `name` / `order` **不允许**写进角色文件顶层（`tmc.packs.CHARACTER_KEYS` 只有 `key` 与可选的 `card`），
  它们属于主仓库真源（契约 `docs/otomads-separation-v1.md` §5 的 S1）；而数据仓库的
  `characters.toml` 是**派生**清单（= 曲包引用到的角色），提前把还没曲目的角色塞进去会被
  `tmc.validate` 判为"不再被曲包引用"，`pnpm data:roster` 也会删掉。

所以把"还剩哪些角色没有文件"做成**可重复生成**的骨架：文件名与 `key` 由生成器保证一致，
真源的 `name` / `order` 以注释形式带在文件头（下一步 `data:roster` 会在你真正填了曲目之后
把这个角色写进 `characters.toml`），人只负责往里填 `[[track]]`。

**骨架是惰性的**：没有任何 `[[track]]` ⇒ 不进曲目集 ⇒ `contentHash` / `tmc.build` /
`tmc.validate` 一个都不受影响（有测试盯着这条）。**幂等**：已有文件一个字节都不动。
"""
from __future__ import annotations

import argparse
import pathlib

from . import repo, roster, validate

#: 目标曲包：骨架写进 `<数据仓库 submodule>/packs/<PACK_ID>/`
PACK_ID = "otomads"

#: 示例里出现的 `[[track]]` 键。**必须都是 `tmc.packs.TRACK_KEYS` 的成员**（有测试盯着）：
#: 取消注释后写错键名是**直接报错**，所以示例不能带私货。
EXAMPLE_KEYS = ("album", "author", "title", "extra", "source", "start_time", "stop_time")


def target_dir() -> pathlib.Path:
    """骨架要写进的目录（submodule 未初始化时不存在）。"""
    return repo.DATA / repo.OTOMADS_DATA / "packs" / PACK_ID


def toml_str(value: str) -> str:
    """TOML 基本字符串（与数据仓库 `otomads.ingest_pack.toml_str` 同一套转义）。"""
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def existing() -> set[str]:
    """已经有角色文件的 key 集合（目录不存在时为空）。"""
    directory = target_dir()
    if not directory.is_dir():
        return set()
    return {path.stem for path in directory.glob("*.toml")}


def missing() -> list[tuple[str, str, int]]:
    """真源里有、曲包里还没有的角色 → `[(key, name, order)]`，按 `order` 排。"""
    characters = roster.load_characters()
    have = existing()
    return [(key, entry["name"], int(entry["order"]))
            for key, entry in sorted(characters.items(), key=lambda item: item[1]["order"])
            if key not in have]


def render(key: str, name: str, order: int) -> str:
    """一个骨架文件的内容。

    头两行与数据仓库 `otomads.ingest_pack.FILE_HEADER` 写新文件时一致（同一副面孔）；
    其余是给人看的：真源元数据、口径提醒、以及一份**注释掉的** `[[track]]` 示例。
    """
    extras = " / ".join(validate.EXTRAS)
    lines = [
        f"# 音MAD 曲包（{PACK_ID}）：`{key}` 的曲目。",
        f"# 清单与口径见 `packs/{PACK_ID}.toml` 与 `README.ai.MD`。",
        f"# 角色：{name}（主仓库真源 order = {order}）。`name` / `order` 属于主仓库真源（S1），",
        f"#   而本文件顶层**只允许** `key` 与可选的 `card`（写别的键会直接报错），所以这两项只留注释；",
        f"#   填了曲目后在主仓库跑 `pnpm data:roster`，这个角色就会自动进 `characters.toml`。",
        f"# 骨架由主仓库 `pnpm data:scaffold` 生成（D137）；它**不覆盖已有文件**，填过就不用再理它。",
        "",
        f"key = {toml_str(key)}",
        "",
        "# 下面是一份**占位**示例：填上真值再取消注释（`album` 固定；`extra` 见 " + extras + "）。",
        "# 没有 source 的曲目只能手工把音频放进曲库（不写 source 时抓取会报「缺 source」）。",
        "# [[track]]",
        f'# album = "{PACK_ID}"',
        '# author = "作者名"                                  # 或 authors = ["甲", "乙"]（只能写一个）',
        '# title = "曲名"',
        '# extra = "角色曲"',
        '# source = "https://www.bilibili.com/video/BV……"     # 可选：抓取/裁剪用',
        '# start_time = "00:00:00.000"                        # 可选：裁剪区间（只给一侧也合法）',
        '# stop_time = "00:00:30.000"',
    ]
    return "\n".join(lines) + "\n"


def write(dry_run: bool = False) -> list[str]:
    """补齐缺失的骨架文件，返回新建（或 `--dry-run` 下将会新建）的 key 列表。"""
    directory = target_dir()
    if not directory.is_dir():
        raise SystemExit(f"{repo.shown(directory)} 不存在："
                         f"先跑 `git submodule update --init data/otomads`")
    created: list[str] = []
    for key, name, order in missing():
        created.append(key)
        if dry_run:
            continue
        path = directory / f"{key}.toml"
        if path.exists():            # 与 `missing()` 之间没有竞态可言，但**绝不覆盖**是硬规矩
            created.pop()
            continue
        path.write_text(render(key, name, order), encoding="utf-8")
    return created


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="为缺失的角色预置曲包骨架文件（packs/otomads/<角色 key>.toml，不影响生成物）")
    parser.add_argument("--dry-run", action="store_true", help="只列出会新建哪些，不写文件")
    args = parser.parse_args(argv)

    created = write(dry_run=args.dry_run)
    if not created:
        print("✅ 没有缺失的角色文件（真源里的角色都有了骨架）")
        return 0
    verb = "会新建" if args.dry_run else "已新建"
    for key in created:
        print(f"{verb} packs/{PACK_ID}/{key}.toml")
    print(f"{verb} {len(created)} 个骨架文件（已有的一律不动）"
          f"—— 填完曲目在主仓库跑 `pnpm data:roster`")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
