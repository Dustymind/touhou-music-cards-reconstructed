"""量本地曲库每首的响度，算"逐曲音量均衡"用的衰减系数 → `public/data/loudness.json`。

为什么只衰减不放大：`HTMLMediaElement.volume` 上限是 1 ✗，放大要么削波要么得挂 Web Audio 节点；
以"最轻的一首"为目标、其余按比例**往下压**，就能在不改音色的前提下让每首听感一样响 ✓。

用法：python3 tools/measure_loudness.py [目录，默认 .music/otomads] [--jobs 8]
"""
from __future__ import annotations
import argparse, concurrent.futures, json, pathlib, re, statistics, subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
# 只衰减不放大 ✓；下限 0.6（约 −4.4 dB）—— 用"最轻的一首"当目标会把绝大多数曲目压到地板 ✗，
# 所以目标取**中位数**，并且最多压这么点，避免整批都变小声 ✗
MIN_GAIN, MAX_GAIN = 0.6, 1.0


def mean_volume_db(path: pathlib.Path) -> float | None:
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    matched = re.search(r"mean_volume: ([-\d.]+) dB", out)
    return float(matched.group(1)) if matched else None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", nargs="?", default=".music/otomads")
    parser.add_argument("--jobs", type=int, default=8)
    args = parser.parse_args()
    files = sorted((ROOT / args.directory).glob("*.mp3"))
    if not files:
        print("没找到 mp3"); return 1
    out = ROOT / "public/data/loudness.json"
    # 复用上次量到的 dB（按文件名），只量新文件 —— 86 首要跑一两分钟，没必要每次重量 ✓
    cache: dict[str, float] = {}
    if out.exists():
        cache = json.loads(out.read_text(encoding="utf-8")).get("measuredDb", {})
    todo = [p for p in files if p.stem not in cache]
    if todo:
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
            for path, db in pool.map(lambda p: (p, mean_volume_db(p)), todo):
                if db is not None:
                    cache[path.stem] = db
    measured = [(p, cache[p.stem]) for p in files if p.stem in cache]
    target = statistics.median(db for _p, db in measured)   # 目标 = 中位数（抗离群 ✓）
    gains = {}
    for path, db in measured:
        gains[path.stem] = round(min(MAX_GAIN, max(MIN_GAIN, 10 ** ((target - db) / 20))), 4)
    payload = {"schema": 1, "targetDb": round(target, 2), "measuredDb": dict(sorted(cache.items())),
               "gains": dict(sorted(gains.items()))}
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    values = sorted(gains.values())
    print(f"量了 {len(measured)} 首 | 目标（最轻）= {target:.1f} dB | 系数 {values[0]:.3f}–{values[-1]:.3f}（中位 {statistics.median(values):.3f}）")
    print("压缩最多的 3 首:")
    for name in sorted(gains, key=lambda k: gains[k])[:3]:
        print(f"  {gains[name]:.3f}  {name[:52]}")
    print(f"→ {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
