"""量本地曲库每首的响度，算"逐曲音量均衡"用的衰减系数 → `public/data/loudness.json`。

核心在 `tmc.loudness`（抓取/裁剪流程 `tmc.fetch_audio` 也会调用它，见 docs/packs-audio-v1.md）；
这个脚本只是命令行入口，参数与输出保持原样（D102）。

用法：python3 tools/measure_loudness.py [目录，默认 .music/otomads] [--jobs 8]
"""
from __future__ import annotations

import argparse
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

try:
    from tmc import loudness
except ModuleNotFoundError:      # 没装包（例如直接用系统 python3 跑）→ 手动挂上 src/
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent / "src"))
    from tmc import loudness


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", nargs="?", default=".music/otomads")
    parser.add_argument("--jobs", type=int, default=8)
    args = parser.parse_args()

    summary = loudness.measure_library(ROOT / args.directory,
                                       output=ROOT / "public/data/loudness.json", jobs=args.jobs)
    for line in loudness.describe(summary):
        print(line)
    return 0 if summary["measured"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
