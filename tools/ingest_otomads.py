"""把一批 bilibili 音MAD 下到 .music/otomads/（最高音质），文件名 = `作者 - 标题.mp3`。
用法: python3 tools/ingest_otomads.py            # 下载全部未下载的
      python3 tools/ingest_otomads.py --dry-run  # 只打印将要做什么
"""
from __future__ import annotations
import argparse, subprocess, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEST = ROOT / ".music" / "otomads"

# (BV 号, 标题, 作者, 角色 key)  —— 作者留空表示"尚未确认"，会跳过
ROWS: list[tuple[str, str, str, str]] = [
    ("BV1kw411q7S8", "无何有之棍 ~ Deep Silver", "鞍山侯国玉电乐团", "cirno"),
    ("BV1m8411Z7Tm", "Crystallize Masuo", "循環", "letty-whiterock"),
    ("BV1Ks4y1N74Y", "Crystallize Otto / 结晶化的白银", "鞍山侯国玉电乐团", "letty-whiterock"),
    ("BV1JM411q7HY", "【2023新春宴音MAD单品】远野马娘前线", "丹花伊吹 & 艾了个拉 & 四季映姬78 & thwy & Binkales", "chen"),
    ("BV1Rh4y1p7Zb", "【东方电气棍】掉业棕（Withered Estick）", "鞍山侯国玉电乐团", "chen"),
    ("BV1Rs4y1779Z", "【东方电气棍】鞍山的唢呐师", "鞍山侯国玉电乐团", "alice-margatroid"),
    ("BV1XpW6eXEQT", "【东方馅挂炒饭】暮里的兄贵之都（天空的花之都）", "龙青瑶RyuuSeiyou", "lily-white"),
    ("BV14H4y1p7wF", "【音Mad】疾走全明星あんさんぶる！", "芙兰厨陈YuYue", "prismriver"),
    ("BV1Wp4y1Y7uy", "【东方Project】猫灵乐团~幻影合奏", "川先僧", "prismriver"),
    ("BV1FUFYeJE8e", "【2025连缘羽梦祭单品】连缘妖妖梦~Ancient Temple", "钬__", "konpaku-youmu"),
    ("BV1By4y1C7ga", "【东方Project】广有射怪猫管我鸟事", "川先僧", "konpaku-youmu"),
    ("BV1FX4y1B7E9", "【东方电气棍】幽雅地退役吧，墨染的电棍 ~ Border of Otto", "鞍山侯国玉电乐团", "saigyouji-yuyuko"),
    ("BV19c411A7PA", "【东方电气棍】击败跋扈", "鞍山侯国玉电乐团", "chen"),
    ("BV1Fs4y1v7H3", "【东方电气棍】电棍幻葬 ~ Netto-Fantasy", "鞍山侯国玉电乐团", "yakumo-ran"),
    ("BV1ok4y1777E", "【东方电气棍】吉吉跋扈 ~ Who Kai Da!", "鞍山侯国玉电乐团", "yakumo-ran"),
    ("BV1bP41147U9", "Otto-Fantasia", "鞍山侯国玉电乐团", "yakumo-yukari"),
]

def target(row: tuple[str, str, str, str]) -> pathlib.Path | None:
    bv, title, author, _char = row
    if not author:
        return None
    safe = lambda s: s.replace("/", "／").replace("\\", "＼").strip()
    return DEST / f"{safe(author)} - {safe(title)}.mp3"

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    DEST.mkdir(parents=True, exist_ok=True)
    todo = [(row, target(row)) for row in ROWS]
    for row, path in todo:
        if path is None:
            print(f"跳过（作者待确认）: {row[0]} {row[1]}")
    pending = [(row, path) for row, path in todo if path is not None and not path.exists()]
    print(f"共 {len(ROWS)} 条 → 待下载 {len(pending)} 条")
    for index, (row, path) in enumerate(pending, 1):
        bv, title, _author, _char = row
        print(f"[{index}/{len(pending)}] {bv} → {path.name}")
        if args.dry_run:
            continue
        result = subprocess.run([
            "yt-dlp", "--no-playlist", "-f", "bestaudio/best", "-x",
            "--audio-format", "mp3", "--audio-quality", "0",
            "--no-part", "--quiet", "--no-warnings",
            "-o", str(DEST / f".tmp-{bv}.%(ext)s"),
            f"https://www.bilibili.com/video/{bv}",
        ])
        made = list(DEST.glob(f".tmp-{bv}.*"))
        if result.returncode != 0 or not made:
            print(f"   ✗ 失败（{result.returncode}）")
            for leftover in made:
                leftover.unlink(missing_ok=True)
            continue
        made[0].replace(path)
        print(f"   ✓ {path.stat().st_size // 1024} KB")
    return 0

if __name__ == "__main__":
    sys.exit(main())
