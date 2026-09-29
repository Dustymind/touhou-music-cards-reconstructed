"""把主仓库的角色真源写成数据仓库的角色清单（数据仓库根那份 characters.toml）。

用法::

    uv run python -m tmc.roster           # 写清单（在数据仓库里提交后生效）
    uv run python -m tmc.roster --check   # 只检查是否一致（`tmc.validate` 也会跑这条）

规则：清单 = **曲包引用到的角色**（`key` / `name` / `order` 取自 `data/characters/*.toml`）
+ 手工追加的"原曲没有的角色"（保留，供将来 S2 的"音MAD 自有身份"用）。
数据仓库的写入侧（`otomads.packformat.character_keys`）只认这份清单，所以它必须与真源同步。
"""
from __future__ import annotations

import argparse
import pathlib
import tomllib

from . import packs, repo

def roster_path() -> pathlib.Path:
    """数据仓库里的角色清单路径（env OTOMADS_DATA_DIR 可覆盖位置；仓库不在场时它不存在）。"""
    return repo.data_dir("otomads") / "characters.toml"


def load_characters() -> dict[str, dict]:
    """主仓库的角色真源：`{key: {"name": ..., "order": ...}}`。"""
    out: dict[str, dict] = {}
    for path in sorted((repo.DATA / "characters").glob("*.toml")):
        with open(path, "rb") as fh:
            char = tomllib.load(fh)
        out[char["key"]] = {"name": char["name"], "order": int(char["order"])}
    return out


def read_roster() -> dict[str, dict]:
    """读现有清单（不存在返回空）。"""
    if not roster_path().exists():
        return {}
    data = tomllib.loads(roster_path().read_text(encoding="utf-8"))
    return {entry["key"]: entry for entry in data.get("character", [])}


def build_roster(characters: dict[str, dict] | None = None,
                 referenced: set[str] | None = None,
                 existing: dict[str, dict] | None = None) -> dict[str, dict]:
    """算新清单：引用到的角色（按真源的 name/order）+ 手工追加的角色（原样保留）。"""
    characters = load_characters() if characters is None else characters
    if referenced is None:
        _packs, _albums, tracks, _cards, _covers = packs.load_packs()
        referenced = {track["character"] for track in tracks}
    missing = sorted(key for key in referenced if key not in characters)
    if missing:
        raise SystemExit(f"曲包引用了主仓库没有的角色：{missing}（先在 data/characters/ 加角色）")
    existing = read_roster() if existing is None else existing
    out: dict[str, dict] = {}
    for key in sorted(referenced, key=lambda item: characters[item]["order"]):
        out[key] = {"key": key, "name": characters[key]["name"], "order": characters[key]["order"]}
    for key, entry in existing.items():          # 手工追加的（原曲没有）→ 保留
        if key not in characters:
            out[key] = {"key": key, "name": entry["name"], "order": int(entry["order"])}
    return out


def render(roster: dict[str, dict]) -> str:
    lines = [
        "# 本仓库允许使用的角色清单（key / name / order）。",
        "# 由主仓库 `pnpm data:roster` 生成；原曲没有的角色（音MAD 自有身份）手动追加后会保留。",
        "",
    ]
    for entry in sorted(roster.values(), key=lambda item: item["order"]):
        lines += ["[[character]]",
                  f'key = "{entry["key"]}"',
                  f'name = "{entry["name"]}"',
                  f"order = {entry['order']}",
                  ""]
    return "\n".join(lines).rstrip() + "\n"


def diff() -> list[str]:
    """清单与真源的差异（给 `--check` 与 `tmc.validate` 用）。"""
    if not roster_path().exists():
        return [f"缺少角色清单：{repo.shown(roster_path())}（跑 `pnpm data:roster` 生成）"]
    current = read_roster()
    expected = build_roster(existing=current)
    problems: list[str] = []
    for key, entry in sorted(expected.items(), key=lambda item: item[1]["order"]):
        got = current.get(key)
        if got is None:
            problems.append(f"清单缺少角色：{key}")
        elif str(got.get("name")) != entry["name"] or int(got.get("order", -1)) != entry["order"]:
            problems.append(f"清单与真源不一致：{key}（{got.get('name')!r}/{got.get('order')} "
                            f"vs {entry['name']!r}/{entry['order']}）")
    for key in sorted(set(current) - set(expected)):
        problems.append(f"清单里有不再被曲包引用的角色：{key}（跑 `pnpm data:roster` 会移除）")
    return problems


def write(roster: dict[str, dict] | None = None) -> pathlib.Path:
    if not roster_path().parent.is_dir():
        raise SystemExit(f"{repo.shown(roster_path().parent)} 不存在："
                         f"clone 到 data/otomads 或设 OTOMADS_DATA_DIR")
    roster = build_roster() if roster is None else roster
    roster_path().write_text(render(roster), encoding="utf-8", newline="\n")
    return roster_path()


# ---- 曲包骨架（S5 起并入 roster，原 tmc.scaffold，D137） ----
#: 目标曲包：骨架写进 `<数据仓库>/packs/<PACK_ID>/`（env OTOMADS_DATA_DIR 可覆盖位置）
PACK_ID = "otomads"


def scaffold_target_dir() -> pathlib.Path:
    """骨架要写进的目录（数据仓库不在场时不存在）。"""
    return repo.pack_roots()[1] / PACK_ID


def scaffold_toml_str(value: str) -> str:
    """TOML 基本字符串（与数据仓库 `otomads.packformat.toml_str` 同一套转义）。"""
    escaped = value.replace("\\", "\\\\").replace(chr(34), "\\" + chr(34))
    return chr(34) + escaped + chr(34)


def scaffold_existing() -> set[str]:
    """已经有角色文件的 key 集合（目录不存在时为空）。"""
    directory = scaffold_target_dir()
    if not directory.is_dir():
        return set()
    return {path.stem for path in directory.glob("*.toml")}


def scaffold_missing() -> list[tuple[str, str, int]]:
    """真源里有、曲包里还没有的角色 → `[(key, name, order)]`，按 `order` 排。"""
    characters = load_characters()
    have = scaffold_existing()
    return [(key, entry["name"], int(entry["order"]))
            for key, entry in sorted(characters.items(), key=lambda item: item[1]["order"])
            if key not in have]


def scaffold_render(key: str, name: str, order: int) -> str:
    """一个骨架文件的内容（注释掉的 [[track]] 示例；**不覆盖已有文件**）。"""
    from .validate import EXTRAS as VALIDATE_EXTRAS  # 懒导入：validate 也 import roster，避免环

    extras = " / ".join(VALIDATE_EXTRAS)
    lines = [
        f"# 音MAD 曲包（{PACK_ID}）：`{key}` 的曲目。",
        f"# 清单与口径见 `packs/{PACK_ID}.toml` 与 `README.ai.MD`。",
        f"# 角色：{name}（主仓库真源 order = {order}）。`name` / `order` 属于主仓库真源（S1），",
        f"#   而本文件顶层**只允许** `key` 与可选的 `card`（写别的键会直接报错），所以这两项只留注释；",
        f"#   填了曲目后在主仓库跑 `pnpm data:roster`，这个角色就会自动进 `characters.toml`。",
        f"# 骨架由主仓库 `pnpm data:scaffold` 生成（D137）；它**不覆盖已有文件**，填过就不用再理它。",
        "",
        f"key = {scaffold_toml_str(key)}",
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


def scaffold_write(dry_run: bool = False) -> list[str]:
    """补齐缺失的骨架文件，返回新建（或 --dry-run 下将会新建）的 key 列表。"""
    directory = scaffold_target_dir()
    if not directory.is_dir():
        raise SystemExit(f"{repo.shown(directory)} 不存在："
                         f"clone 到 data/otomads 或设 OTOMADS_DATA_DIR")
    created: list[str] = []
    for key, name, order in scaffold_missing():
        created.append(key)
        if dry_run:
            continue
        path = directory / f"{key}.toml"
        if path.exists():            # 绝不覆盖是硬规矩
            created.pop()
            continue
        path.write_text(scaffold_render(key, name, order), encoding="utf-8")
    return created


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="生成数据仓库的角色清单（characters.toml）与曲包骨架")
    parser.add_argument("--check", action="store_true", help="只检查是否与真源一致")
    parser.add_argument("--scaffold", action="store_true",
                        help="为缺失的角色预置曲包骨架文件（原 tmc.scaffold，不影响生成物）")
    parser.add_argument("--dry-run", action="store_true", help="（--scaffold 用）只列出会新建哪些")
    args = parser.parse_args(argv)

    if args.scaffold:
        created = scaffold_write(dry_run=args.dry_run)
        if not created:
            print("[OK] 没有缺失的角色文件（真源里的角色都有了骨架）")
            return 0
        verb = "会新建" if args.dry_run else "已新建"
        for key in created:
            print(f"{verb} packs/{PACK_ID}/{key}.toml")
        print(f"{verb} {len(created)} 个骨架文件（已有的一律不动）"
              f"—— 填完曲目在主仓库跑 `pnpm data:roster`")
        return 0

    if args.check:
        problems = diff()
        for problem in problems:
            print(f"[x] {problem}")
        print("[OK] 清单与真源一致" if not problems else f"[FAIL] {len(problems)} 处不一致")
        return 1 if problems else 0

    path = write()
    print(f"写出 {len(read_roster())} 个角色 → {repo.shown(path)}（在数据仓库里提交后生效）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
