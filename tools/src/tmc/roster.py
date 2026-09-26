"""把主仓库的角色真源写成数据仓库的角色清单（submodule 的 `characters.toml`）。

用法::

    uv run python -m tmc.roster           # 写清单（在数据仓库里提交后生效）
    uv run python -m tmc.roster --check   # 只检查是否一致（`tmc.validate` 也会跑这条）

规则：清单 = **曲包引用到的角色**（`key` / `name` / `order` 取自 `data/characters/*.toml`）
+ 手工追加的"原曲没有的角色"（保留，供将来 S2 的"音MAD 自有身份"用）。
数据仓库的 `otomads.ingest_pack` 只认这份清单，所以它必须与真源同步。
"""
from __future__ import annotations

import argparse
import pathlib
import tomllib

from . import packs, repo

#: 数据仓库里的清单路径（submodule；未初始化时不存在）
ROSTER = repo.DATA / repo.OTOMADS_DATA / "characters.toml"


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
    if not ROSTER.exists():
        return {}
    data = tomllib.loads(ROSTER.read_text(encoding="utf-8"))
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
    if not ROSTER.exists():
        return [f"缺少角色清单：{repo.shown(ROSTER)}（跑 `pnpm data:roster` 生成）"]
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
    if not ROSTER.parent.is_dir():
        raise SystemExit(f"{repo.shown(ROSTER.parent)} 不存在："
                         f"先跑 `git submodule update --init data/otomads`")
    roster = build_roster() if roster is None else roster
    ROSTER.write_text(render(roster), encoding="utf-8")
    return ROSTER


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="生成数据仓库的角色清单（characters.toml）")
    parser.add_argument("--check", action="store_true", help="只检查是否与真源一致")
    args = parser.parse_args(argv)

    if args.check:
        problems = diff()
        for problem in problems:
            print(f"✗ {problem}")
        print("✅ 清单与真源一致" if not problems else f"❌ {len(problems)} 处不一致")
        return 1 if problems else 0

    path = write()
    print(f"写出 {len(read_roster())} 个角色 → {repo.shown(path)}（在数据仓库里提交后生效）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
