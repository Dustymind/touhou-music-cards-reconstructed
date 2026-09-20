/** B：列表页接音乐模式 —— 只列当前模式下有曲可播的角色，行内曲目与计数也只算该模式。
 *
 * 之前列表页**根本不看模式**：121 个角色全列，行首取 `character.music[0]`（曲包曲目是追加在
 * 末尾的 ⇒ 音MAD 模式下列表行显示的是原曲曲目），Chip 上的数字是两模式合计。
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, beforeEach } from "vitest";

import type { DataBundle } from "../../data/types";
import { setLocale } from "../../i18n/localization";
import { useSession } from "../../store/session";
import { queueStoreFor } from "../../store/queue";
import { ListPanel } from "./ListPanel";

const bundle = {
  albums: [
    { key: "th06", name: "原曲盘", kind: "game", pack: "originals", order: 1 },
    { key: "otomads", name: "otomads", kind: "other", pack: "otomads", order: 100 },
  ],
  characters: [
    {
      key: "cirno", name: "チルノ", order: 1, card: ["c.png"], searchNames: ["Cirno"],
      music: [["原曲盘", "おてんば恋娘", "角色曲"], ["otomads", "音MAD 一首", "角色曲", "作者"]],
    },
    {
      key: "reimu", name: "霊夢", order: 2, card: ["r.png"], searchNames: ["Reimu"],
      music: [["原曲盘", "少女綺想曲", "角色曲"]],
    },
  ],
} as unknown as DataBundle;

let root: Root | null = null;

async function render(mode: "originals" | "otomads"): Promise<HTMLElement> {
  await act(async () => { useSession.setState({ musicMode: mode }); });
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<ListPanel bundle={bundle} musicMode={mode} />);
  });
  return container;
}

/** 展开某一行（点行本身即可展开，见 ListPanel 的 ListItemButton）。 */
async function expand(container: HTMLElement, key: string): Promise<void> {
  const row = container.querySelector(`[data-testid="list-row-${key}"]`);
  if (!row) throw new Error(`缺少行 ${key}`);
  await act(async () => {
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const trackIds = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('[data-testid^="list-track-"]')]
    .map((element) => element.getAttribute("data-testid") ?? "");

beforeEach(() => {
  setLocale("en");
  for (const mode of ["originals", "otomads"] as const) {
    queueStoreFor(mode).setState({ order: [], temporaryDisabled: {}, currentKey: null });
  }
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  root = null;
  document.body.innerHTML = "";
  useSession.setState({ musicMode: "originals" });
});

describe("ListPanel 的音乐模式过滤（B）", () => {
  it("原曲模式：两个角色都在，计数分母也是两个", async () => {
    const container = await render("originals");
    expect(container.querySelector('[data-testid="list-row-cirno"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="list-row-reimu"]')).not.toBeNull();
    expect(container.textContent).toContain("2 / 2");
    // 行首曲目取的是**过滤后**的第一首：琪露诺在这一模式下是原曲那首
    expect(container.textContent).toContain("おてんば恋娘");
    expect(container.textContent).not.toContain("音MAD 一首");
  });

  it("音MAD 模式：只列有音MAD 曲目的角色，行内不出现原曲曲名", async () => {
    const container = await render("otomads");
    expect(container.querySelector('[data-testid="list-row-cirno"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="list-row-reimu"]')).toBeNull();   // 只有原曲曲目 → 不列
    expect(container.textContent).toContain("1 / 1");                              // 分母跟着模式变
    expect(container.textContent).not.toContain("おてんば恋娘");
    // Chip 是**该模式**的曲目数（不是两模式合计的 2）
    expect(container.querySelector('[data-testid="list-row-cirno"]')?.textContent).toContain("1");

    await expand(container, "cirno");
    expect(trackIds(container)).toEqual(["list-track-cirno-otomads-音MAD 一首"]);
  });

  it("原曲模式下展开只列原曲曲目", async () => {
    const container = await render("originals");
    await expand(container, "cirno");
    expect(trackIds(container)).toEqual(["list-track-cirno-原曲盘-おてんば恋娘"]);
  });
});
