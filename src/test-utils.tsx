/** 极简 renderHook：不引入 testing-library，保持依赖面最小。
 *
 * 测试跑在**真实浏览器**里（vitest 浏览器模式 + Playwright，chromium / firefox）：
 * `publicDir` 是 `data/public/`（S3），所以站点里的 `/data/*.json` 直接用真 `fetch` 取，不需要 Node 读盘。
 */
import { act } from "react";

import type { DataBundle } from "./data/types";
import { loadDataBundle } from "./data/load";
import { buildEntries, type TableMap } from "./music/sources";
import { createRoot, type Root } from "react-dom/client";

import { GamePanel } from "./ui/panels/GamePanel";

/** 把「对战页」挂进 body 里的新容器：`useNet.test.tsx` 与 `GamePanel.test.tsx` 共用同一套脚手架
 * （挂载顺序、`act` 包裹、返回容器都给好；调用方自己决定 `afterEach` 怎么清理）。
 */
export async function renderGamePanel(bundle: DataBundle): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<GamePanel bundle={bundle} />);
  });
  return { container, root };
}

/** 按 `data-testid` 点一下（真实浏览器里派发冒泡的 `MouseEvent`）。 */
export async function clickTestId(container: HTMLElement, testId: string): Promise<void> {
  const element = container.querySelector(`[data-testid="${testId}"]`);
  if (!element) throw new Error(`缺少元素 ${testId}`);
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

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

/** 把远程音源表换成假响应（测试不打网络）。
 *
 * `/data/*` 的请求原样交给真 `fetch`（Vite 服务 `public/`），只有镜像表的远程地址被截下来，
 * 给一份覆盖 order #1 角色全部曲目的假表 —— 于是播放层能解析出"地址"，但不会真的去下载。
 */
export function installDataFetchStub(): void {
  const realFetch = globalThis.fetch.bind(globalThis);
  const json = (value: unknown): Response =>
    new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), globalThis.location?.origin ?? "http://localhost/");
    if (url.pathname.startsWith("/data/")) return realFetch(input as RequestInfo, init);
    // S2：生成物里 `music` 是**曲id 列表**（曲目信息在 tracks.json）⇒ 假表按 id 键控。
    // 还按元组解构的话，这串 id 会被拆成一个个字符，播放层一首也解析不出来。
    const characters = (await (await realFetch("/data/characters.json")).json()) as {
      characters: { music: string[] }[];
    };
    const entries: Record<string, { url: string }> = {};
    for (const id of characters.characters[0]!.music) entries[id] = { url: "data:audio/mpeg;base64," };
    return json({ entries });
  }) as typeof fetch;
}

/** 用真实生成物载入一份 bundle。 */
export async function loadRealBundle(): Promise<DataBundle> {
  installDataFetchStub();
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
