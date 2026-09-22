/** R7②：音源表的依赖是覆盖表的**内容签名** —— 内容变了才重新载入，换一个同内容的新对象不空转。 */
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SourceRecord } from "../data/types";
import { renderHook } from "../test-utils";
import { useSources } from "./useSources";

const source = (id: string, order: number): SourceRecord => ({
  id, label: { en: id, zh: id }, tableUrl: `/tables/${id}.json`, kind: "remote",
  order, enabled: true, proxyable: false, description: { en: "", zh: "" },
});

type Overrides = Record<string, { enabled: boolean; order: number }>;

/** 等 effect 里的异步载入落地（轮询，不固定 sleep —— 两个引擎的微任务时序不一样）。 */
async function settleUntil(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    if (predicate()) return;
  }
}

describe("useSources", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("覆盖表内容变了才重新载入", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", (async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response("[]", { status: 200 });
    }) as typeof fetch);

    const sources = [source("a", 1), source("b", 2)];
    let overrides: Overrides = {};
    const hook = await renderHook(() => useSources(sources, overrides, ""));
    await settleUntil(() => hook.result.current.status === "ready");
    expect(calls).toEqual(["/tables/a.json", "/tables/b.json"]);
    expect(hook.result.current.order).toEqual(["a", "b"]);

    // ① 同内容、**新对象** → 签名没变 → 不重新载入（换身份空转是这条防的）
    overrides = {};
    await hook.rerender();
    await settleUntil(() => calls.length > 2);
    expect(calls).toHaveLength(2);

    // ② 内容变了（关掉 b）→ 重新载入，这次只取还开着的 a
    overrides = { b: { enabled: false, order: 2 } };
    await hook.rerender();
    await settleUntil(() => hook.result.current.order.length === 1);
    expect(calls).toEqual(["/tables/a.json", "/tables/b.json", "/tables/a.json"]);
    expect(hook.result.current.order).toEqual(["a"]);

    await hook.unmount();
  });
});
