/** `AppShell` 的模式分派：模式 3 的三把状态（源链接 / 三元 / 逐卡禁用）在切模式来回之后**原样保留**。
 *
 * 这里守的是一条真踩过的坑（e2e 抓到的）：另两个模式的 store 是**按模式分键**的，清理死条目时
 * `singleStoreFor(musicMode).prune(...)` 用的是**当前模式**那把；而模式 3 的逐卡禁用表是**全局单例**
 * （形状不同 ⇒ 不走 `makeModeStores`），拿别的模式的 key 去 prune 会把整批禁用记录删掉 ——
 * 表现成"切到音MAD 再切回来，禁用的卡又回到轮播里了"。
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";

import type { DataBundle } from "../../data/types";
import { loadRealBundle } from "../../test-utils";
import { parseCustomManifest, withCustomManifest } from "../../data/customManifest";
import { useCustomPreset } from "../../store/customPreset";
import { useCustomSingle } from "../../store/customSingle";
import { useSession } from "../../store/session";
import { AppShell } from "./AppShell";

const CARDS = [
  { id: "alice", name: "爱丽丝", face: "faces/a.png", audio: "media/a.mp3", album: "旧作", title: "曲 a", author: "甲" },
  { id: "marisa", name: "魔理沙", face: "faces/b.png", audio: "media/b.mp3", album: "新作", title: "曲 b" },
];

function customBundle(bundle: DataBundle): DataBundle {
  return withCustomManifest(bundle, parseCustomManifest(
    { schema: 1, mode: "custom", cards: CARDS }, "https://cards.example.com/manifest.json")!);
}

/** 挂载外壳（面板都在里面，所以数据要真的能 fetch 到 —— `loadRealBundle` 已经装好桩）。 */
async function renderShell(bundle: DataBundle): Promise<Root> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(<AppShell bundle={bundle} />); });
  return root;
}

describe("AppShell：模式 3 的状态跟着模式走", () => {
  beforeEach(() => {
    localStorage.clear();
    useSession.setState({ musicMode: "custom", customSourceUrl: "", customSourceOverride: null });
    useCustomSingle.setState({ disabled: {} });
    useCustomPreset.setState({ albums: {}, authors: {} });
  });

  it("切到别的模式再切回来：逐卡禁用与三元都还在（别的模式的 prune 不会动它们）", async () => {
    const bundle = customBundle(await loadRealBundle());
    useCustomSingle.setState({ disabled: { alice: true } });
    useCustomPreset.setState({ albums: { 旧作: "off" }, authors: {} });

    const root = await renderShell(bundle);
    // 切走（音MAD 那份数据集里没有 `alice` 这个 key）再切回来
    await act(async () => { useSession.setState({ musicMode: "otomads" }); });
    await act(async () => { useSession.setState({ musicMode: "custom" }); });

    expect(useCustomSingle.getState().disabled).toEqual({ alice: true });
    expect(useCustomPreset.getState().albums).toEqual({ 旧作: "off" });
    await act(async () => { root.unmount(); });
  });

  it("模式 3 的逐卡禁用**真的**少一张卡（可用集合与卡池同一来源）", async () => {
    const bundle = customBundle(await loadRealBundle());
    useCustomSingle.setState({ disabled: { alice: true } });

    const root = await renderShell(bundle);
    // 游戏页的牌堆 = 可用卡数：两张卡里禁掉一张 ⇒ 1
    await act(async () => { useSession.setState({ tab: "game" }); });
    expect(document.body.textContent).toContain("pool 1");
    await act(async () => { root.unmount(); });
  });
});
