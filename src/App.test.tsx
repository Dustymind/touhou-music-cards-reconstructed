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
    const file = path.join(dataDir, url.pathname.replace(/^\/data\//, ""));
    const text = await readFile(file, "utf8");
    return new Response(text, { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

async function renderApp(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<App />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  return { container, root };
}

describe("App 冒烟（真实数据）", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("载入数据后渲染页签、角色与数据指纹", async () => {
    stubDataFetch();
    const { container } = await renderApp();
    const text = container.textContent ?? "";
    expect(text).toContain("Player");
    expect(text).toContain("List");
    expect(text).toContain("Config");
    expect(text).toContain(aliceLabel(false));
    // 播放页默认显示 order #1 的角色（霧雨魔理沙），曲目显示名已去掉序号
    expect(text).toContain("霧雨魔理沙");
    expect(text).toContain("恋色マスタースパーク");
  });

  it("数据缺失时给出可读错误而不是白屏", async () => {
    globalThis.fetch = (async () => new Response("not found", { status: 404 })) as typeof fetch;
    const { container } = await renderApp();
    const text = container.textContent ?? "";
    expect(text).toContain("Failed to load data");
    expect(text).toContain("404");
  });
});
