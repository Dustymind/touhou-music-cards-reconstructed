"""音乐源实链抽查：对每张源表抽样发 Range 请求，确认能取到音频。

为什么不能只发 HEAD：HEAD 返回 200 也可能在实际 GET 时失败，而且验证不了内容是不是音频。
所以这里发 ``Range: bytes=0-4095`` 并检查：

* 状态码 200/206；
* ``Content-Type`` 含 audio 或响应体以 ``ID3`` / ``0xFF 0xFB`` 开头；
* 206 时 ``Content-Range`` 存在（拖进度条依赖它）。

用法::

    uv run python -m tmc.check_urls                 # 每张表抽 5 条
    uv run python -m tmc.check_urls --per-source 20
    uv run python -m tmc.check_urls --all           # 全量（651×3，较慢）
    uv run python -m tmc.check_urls --source thbwiki
"""
from __future__ import annotations

import argparse
import collections
import json
import random
import urllib.error
import urllib.parse
import urllib.request

from . import build
from . import repo

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/126.0.0.0 Safari/537.36")
#: 镜像清单从注册表派生（review R7④）：加一个镜像只改 data/sources/originals.toml
SOURCES = build.mirror_source_ids()
CHUNK = 4096


def looks_like_audio(head: bytes) -> bool:
    return head[:3] == b"ID3" or head[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2")


def encode_url(url: str) -> str:
    """上游源表里的 URL 含原始空格与非 ASCII（浏览器能接受，严格客户端不能）。

    抽查时按 URL 规范编码路径，语义不变；**不改写源表里的存储值**。
    """
    parts = urllib.parse.urlsplit(url)
    return urllib.parse.urlunsplit(
        (parts.scheme, parts.netloc, urllib.parse.quote(parts.path), parts.query, parts.fragment))


def probe(url: str, timeout: float = 20.0) -> tuple[bool, str]:
    req = urllib.request.Request(encode_url(url),
                                 headers={"User-Agent": UA, "Referer": "https://music.163.com/",
                                          "Range": f"bytes=0-{CHUNK - 1}"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
            head = resp.read(16)
            status = resp.status
            ctype = resp.headers.get("Content-Type", "")
            if status not in (200, 206):
                return False, f"HTTP {status}"
            if "audio" not in ctype and not looks_like_audio(head):
                return False, f"不像音频（{ctype or 'no content-type'}）"
            if status == 206 and not resp.headers.get("Content-Range"):
                return False, "206 但没有 Content-Range"
            return True, f"{status} {ctype}"
    except urllib.error.HTTPError as exc:
        return False, f"HTTP {exc.code}"
    except Exception as exc:  # noqa: BLE001 - 抽查工具，如实记录
        return False, type(exc).__name__


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", action="append", choices=SOURCES, help="只查这些源（可重复）")
    ap.add_argument("--per-source", type=int, default=5, help="每张表抽多少条（默认 5）")
    ap.add_argument("--all", action="store_true", help="全量抽查")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args(argv)

    rng = random.Random(args.seed)
    failures: list[tuple[str, str, str, str]] = []
    summary: dict[str, collections.Counter] = {}
    for source_id in (args.source or list(SOURCES)):
        entries = json.loads((repo.DATA / "sources" / f"{source_id}.json").read_text(encoding="utf-8"))
        sample = entries if args.all else rng.sample(entries, min(args.per_source, len(entries)))
        counter: collections.Counter = collections.Counter()
        for album, title, url in sample:
            ok, detail = probe(url)
            counter["ok" if ok else "bad"] += 1
            if not ok:
                failures.append((source_id, f"{album} / {title}", url, detail))
        summary[source_id] = counter
        print(f"{source_id}: 抽 {len(sample)} 条 → 通过 {counter['ok']} / 失败 {counter['bad']}")

    if failures:
        print("\n失败明细：")
        for source_id, track, url, detail in failures:
            print(f"  [{source_id}] {track}\n      {url}\n      {detail}")
        return 1
    print("\n✅ 抽查全部通过（Range 请求可播放、206 带 Content-Range）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
