/** 冒烟：真实数据（public/data/*.json）经载入器渲染出外壳与列表。 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { aliceLabel } from "./ui/shell/AppShell";

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/data");

function stubDataFetch(): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost/");
    const json = (value: unknown) =>
      new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
    if (!url.pathname.startsWith("/data/")) {
      // 远程音源表：给一份覆盖 order #1 角色全部曲目的假表（测试不打网络）
      const characters = JSON.parse(await readFile(path.join(dataDir, "characters.json"), "utf8")) as {
        characters: { key: string; music: [string, string, string][] }[];
      };
      const first = characters.characters[0]!;
      return json(first.music.map(([album, title]) => [album, title, "data:audio/mpeg;base64,"]));
    }
    const file = path.join(dataDir, url.pathname.replace(/^\/data\//, ""));
    return json(JSON.parse(await readFile(file, "utf8")));
  }) as typeof fetch;
}

async function renderApp(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<App />);
  });
  return { container, root };
}

/** 轮询等待界面就绪（异步断言不固定 sleep —— v2 工作区的教训）。 */
async function waitFor(container: HTMLElement, predicate: (text: string) => boolean,
                       timeoutMs = 2000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let text = "";
  while (Date.now() < deadline) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    text = container.textContent ?? "";
    if (predicate(text)) return text;
  }
  return text;
}

describe("App 冒烟（真实数据）", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("载入数据后渲染页签、角色与数据指纹", async () => {
    stubDataFetch();
    const { container } = await renderApp();
    // 等到音源表载入完成（解析成功后才会出现音源标签）
    const text = await waitFor(container, (value) => value.includes("netease163"));
    expect(text).toContain("Player");
    expect(text).toContain("List");
    expect(text).toContain("Config");
    expect(text).toContain(aliceLabel(false));
    // 播放页默认显示 order #1 的角色（霧雨魔理沙），曲目显示名已去掉序号
    expect(text).toContain("霧雨魔理沙");
    expect(text).toContain("netease163");
    expect(text).not.toContain("所有已启用的音源都取不到");
    expect(text).toContain("121 in rotation");
  });

  it("数据缺失时给出可读错误而不是白屏", async () => {
    globalThis.fetch = (async () => new Response("not found", { status: 404 })) as typeof fetch;
    const { container } = await renderApp();
    const text = await waitFor(container, (value) => value.includes("Failed to load data"));
    expect(text).toContain("Failed to load data");
    expect(text).toContain("404");
  });
});
