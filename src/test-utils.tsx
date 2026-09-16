/** 极简 renderHook：不引入 testing-library，保持依赖面最小。 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { act } from "react";

import type { DataBundle } from "./data/types";
import { loadDataBundle } from "./data/load";
import { buildEntries, type TableMap } from "./music/sources";
import { createRoot, type Root } from "react-dom/client";

export interface HookResult<T> {
  result: { current: T };
  rerender: () => Promise<void>;
  unmount: () => Promise<void>;
}

export async function renderHook<T>(hook: () => T): Promise<HookResult<T>> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const result = { current: undefined as unknown as T };

  function Probe() {
    result.current = hook();
    return null;
  }

  await act(async () => {
    root.render(<Probe />);
  });
  await act(async () => {
    await Promise.resolve();
  });

  return {
    result,
    async rerender() {
      await act(async () => {
        root.render(<Probe />);
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

/** 可控的假 <audio>：只用 EventTarget 与几个字段，够播放层逻辑跑起来。 */
export class FakeAudio extends EventTarget {
  src = "";
  currentTime = 0;
  duration = 120;
  volume = 1;
  preload = "";
  paused = true;
  onended: (() => void) | null = null;
  play = async (): Promise<void> => {
    this.paused = false;
    this.dispatchEvent(new Event("playing"));
  };
  pause = (): void => {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  };
  load = (): void => {
    this.dispatchEvent(new Event("loadedmetadata"));
  };
}

/** 把 `public/data/*.json` 当作 fetch 的响应源（测试不打网络）。 */
export function installDataFetchStub(dataDir?: string): void {
  const dir = dataDir ?? path.resolve(process.cwd(), "public/data");
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost/");
    const json = (value: unknown) =>
      new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
    if (!url.pathname.startsWith("/data/")) {
      // 远程音源表：给一份覆盖 order #1 角色全部曲目的假表
      const characters = JSON.parse(await readFile(path.join(dir, "characters.json"), "utf8")) as {
        characters: { music: [string, string, string][] }[];
      };
      return json(characters.characters[0]!.music.map(([album, title]) => [album, title, "data:audio/mpeg;base64,"]));
    }
    const file = path.join(dir, url.pathname.replace(/^\/data\//, ""));
    return json(JSON.parse(await readFile(file, "utf8")));
  }) as typeof fetch;
}

/** 用真实生成物载入一份 bundle。 */
export async function loadRealBundle(dataDir?: string): Promise<DataBundle> {
  installDataFetchStub(dataDir);
  return loadDataBundle("/data");
}

/** 造一份 `TableMap`：`tracks` 是 `[专辑, 曲目]` 列表，URL 用假地址。 */
export function fakeTables(tracks: [string, string][][]): TableMap {
  const rows = tracks.flat().map(([album, title]) => [album, title, `https://fake/${encodeURIComponent(title)}.mp3`]);
  return { fake: { id: "fake", status: "ready", entries: buildEntries(rows) } };
}

export function installFakeAudio(): FakeAudio[] {
  const created: FakeAudio[] = [];
  class Tracked extends FakeAudio {
    constructor() {
      super();
      created.push(this);
    }
  }
  (globalThis as unknown as { Audio: unknown }).Audio = Tracked as unknown as typeof Audio;
  return created;
}
