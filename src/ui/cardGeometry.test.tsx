/** 卡面尺寸的**双比例适配**（D163）：原比例（内置图集 703:1000 竖版）与模式 3 的 16:9 横版。
 *
 * 为什么单独一个文件：卡面比例原来是主题里的一个常量，六处画卡/量卡的代码各写一遍 —— 现在
 * 改成"跟着图集走"，**每一处都要能算对**，漏一处就会出现同一页上两种形状的卡（最容易犯的错）。
 * 所以这里按"面"逐个实测：卡牌本体、卡条、牌桌卡槽、未使用卡牌网格、底部面板档位。
 *
 * 尺寸一律**实测**（真浏览器 + 真布局，`getBoundingClientRect`）：`aspect-ratio` 与
 * `height: width / ratio` 是两种写法，只有量出来才能证明它们落在同一个结果上。
 */
import { act, type ReactNode } from "react";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { CardSetRecord, DataBundle, ModeDataset } from "../data/types";
import { resolveCardSet } from "../data/cardFaces";
import type { CardInfo } from "../game/types";
import { cardAspectRatio, CardAspectRatio, CARD_RATIO_VALUES } from "../theme/cardRatio";
import { buildTheme } from "../theme/theme";
import { loadRealBundle } from "../test-utils";
import { CardStrip, type StripCard } from "./components/CardStrip";
import { CharacterCard } from "./components/CharacterCard";
import { DeckGrid } from "./game/DeckGrid";
import { UnusedCards } from "./game/UnusedCards";
import { trayDetents } from "./game/UnusedCardsTray";

/** 三种形状各自的期望值：不写死 1.778 / 1.333 / 0.703，一律从常量来。 */
const PORTRAIT = CardAspectRatio;                  // 703 / 1000（内置图集 / 常规档）
const WIDE = CARD_RATIO_VALUES["16x9"];            // 16 / 9（模式 3 默认档）
const TALL = CARD_RATIO_VALUES["4x3"];             // 4 / 3（模式 3 另一档）

/** 一次挂载里量到的形状：`getBoundingClientRect` 的宽高比。 */
function measuredRatio(element: Element): number {
  const box = element.getBoundingClientRect();
  expect(box.height, "量到的元素高度是 0（没布局出来）").toBeGreaterThan(0);
  return box.width / box.height;
}

let bundle: DataBundle;
const roots: Root[] = [];

/** 内置图集（不写档位 ⇒ 原比例）—— 原曲/音MAD 用的就是它。 */
function builtInSet(): CardSetRecord {
  return bundle.shared.cardSets[0]!;
}

/** 模式 3 的生效图集：走真正的入口（`resolveCardSet` + 用户档位），不手搓常量。 */
function customSet(ratio: "original" | "16x9" | "4x3"): CardSetRecord {
  const dataset = bundle.datasets.custom as ModeDataset;
  return resolveCardSet(bundle.shared.cardSets, "dairi-sd", dataset, ratio);
}

async function mount(node: ReactNode): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(<ThemeProvider theme={buildTheme()}><CssBaseline />{node}</ThemeProvider>);
  });
  return container;
}

/** 一张卡（模式 3 那种：整条绝对 URL 的卡面）。 */
const FILE = "https://example.test/cover/a.png";

function stripCards(count: number): StripCard[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `k-${index}`, characterKey: `k${index}`, cardIndex: 0, file: FILE, state: "normal",
  }));
}

function unusedCards(cards: readonly CardInfo[], cardSet: CardSetRecord): ReactNode {
  return (
    <UnusedCards
      cards={cards}
      cardSet={cardSet}
      cardFiles={Object.fromEntries(cards.map((card) => [card.characterKey, [FILE]]))}
      width={120}
      visibleWidth={720}
      interactive
      layout="grid"
      columns={4}
      onPick={() => undefined}
    />
  );
}

/** 卡面框：挂载容器 → `Paper`（占位态带一圈虚线边框）→ 里面那个 `aspect-ratio` 框。 */
function faceBox(container: Element): Element {
  return container.firstElementChild!.firstElementChild!;
}

describe("卡面尺寸的双比例适配", () => {
  beforeEach(async () => {
    bundle = await loadRealBundle();
  });
  afterEach(async () => {
    await act(async () => { roots.splice(0).forEach((root) => root.unmount()); });
    document.body.innerHTML = "";
  });

  it("卡牌本体：内置图集的常规竖版 / 模式 3 的常规、16:9、4:3 三档", async () => {
    // 同一个宽度下比：竖版最高、4:3 次之、16:9 最扁（宽度是 `width` 属性给的，几张一致才好比）
    const original = await mount(<CharacterCard cardSet={builtInSet()} file={FILE} width="200px" />);
    const wide = await mount(<CharacterCard cardSet={customSet("16x9")} file={FILE} width="200px" />);
    const tall = await mount(<CharacterCard cardSet={customSet("4x3")} file={FILE} width="200px" />);
    // 模式 3 选**常规**档 = 与内置图集同一个形状（竖版），但走的是自定义卡面那套图集
    const customOriginal = await mount(
      <CharacterCard cardSet={customSet("original")} file={FILE} width="200px" />);
    expect(measuredRatio(faceBox(customOriginal))).toBeCloseTo(PORTRAIT, 2);
    expect(measuredRatio(faceBox(original))).toBeCloseTo(PORTRAIT, 2);
    expect(measuredRatio(faceBox(wide))).toBeCloseTo(WIDE, 2);
    expect(measuredRatio(faceBox(tall))).toBeCloseTo(TALL, 2);
    const height = (container: HTMLElement) => container.firstElementChild!.getBoundingClientRect().height;
    expect(height(wide)).toBeLessThan(height(tall));
    expect(height(tall)).toBeLessThan(height(original));
  });

  it("占位卡（没有图）也是同一个形状：空数据时不会变回竖版", async () => {
    const placeholder = await mount(
      <CharacterCard cardSet={customSet("16x9")} file="" state="placeholder" width="320px" />);
    expect(measuredRatio(faceBox(placeholder))).toBeCloseTo(WIDE, 2);
  });

  it("卡条（选卡滑块）：可视窗口的高度 = 卡宽 ÷ 图集比例，卡面同形", async () => {
    const props = (cardSet: CardSetRecord) => ({
      cards: stripCards(6), cardSet, width: 120, visibleWidth: 720, interactive: true,
      sliderLabel: "slider", testId: "strip", stripTestId: "strip-window",
      cardTestIdPrefix: "strip-card",
    });
    const portrait = await mount(<CardStrip {...props(builtInSet())} />);
    const wide = await mount(<CardStrip {...props(customSet("16x9"))} />);

    // 卡条高度只按**一张卡**的高度来（可视窗口宽度与它无关）
    expect(portrait.querySelector('[data-testid="strip-window"]')!.getBoundingClientRect().height)
      .toBeCloseTo(120 / PORTRAIT, 1);
    expect(wide.querySelector('[data-testid="strip-window"]')!.getBoundingClientRect().height)
      .toBeCloseTo(120 / WIDE, 1);
    // 条里的卡面也是同一个形状
    expect(measuredRatio(portrait.querySelector('[data-testid^="strip-card-"]')!))
      .toBeCloseTo(PORTRAIT, 2);
    expect(measuredRatio(wide.querySelector('[data-testid^="strip-card-"]')!)).toBeCloseTo(WIDE, 2);
  });

  it("牌桌卡槽：格子高度 = 卡宽 ÷ 图集比例（空槽与卡牌同尺寸，整块牌桌跟着变矮）", async () => {
    const render = (cardSet: CardSetRecord) => (
      <DeckGrid
        deck={[null, null, null, null]}
        rows={1}
        columns={4}
        width={120}
        cardSet={cardSet}
        cardFiles={{}}
        interactive
        testId="deck"
      />
    );
    const portrait = await mount(render(builtInSet()));
    const wide = await mount(render(customSet("16x9")));
    expect(measuredRatio(portrait.querySelector('[data-testid="deck-empty-0"]')!))
      .toBeCloseTo(PORTRAIT, 2);
    expect(measuredRatio(wide.querySelector('[data-testid="deck-empty-0"]')!)).toBeCloseTo(WIDE, 2);
    expect(wide.querySelector('[data-testid="deck"]')!.getBoundingClientRect().height)
      .toBeLessThan(portrait.querySelector('[data-testid="deck"]')!.getBoundingClientRect().height);
  });

  it("未使用卡牌区（多行网格）：卡面也是图集那个比例", async () => {
    const cards: CardInfo[] = [
      { characterKey: "a", cardIndex: 0 },
      { characterKey: "b", cardIndex: 0 },
    ];
    const portrait = await mount(unusedCards(cards, builtInSet()));
    const wide = await mount(unusedCards(cards, customSet("16x9")));
    expect(measuredRatio(portrait.querySelector('[data-testid="unused-card-a-0"]')!))
      .toBeCloseTo(PORTRAIT, 2);
    expect(measuredRatio(wide.querySelector('[data-testid="unused-card-a-0"]')!)).toBeCloseTo(WIDE, 2);
  });

  it("底部面板的三个档位跟着卡面高度走（16:9 的卡更矮 ⇒ 档位更矮，且仍在视口的 22%–85% 之间）", () => {
    const viewport = 800;
    const width = 80;
    const portraitCard = Math.round(width / cardAspectRatio(builtInSet()));
    const wideCard = Math.round(width / cardAspectRatio(customSet("16x9")));
    expect(wideCard).toBeLessThan(portraitCard);

    const portrait = trayDetents(viewport, portraitCard);
    const wide = trayDetents(viewport, wideCard);
    expect(portrait).toHaveLength(3);
    expect(wide).toHaveLength(3);
    for (let index = 0; index < portrait.length; index += 1) {
      expect(wide[index]!).toBeLessThan(portrait[index]!);
      expect(wide[index]!).toBeGreaterThanOrEqual(Math.round(viewport * 0.22));
      expect(wide[index]!).toBeLessThanOrEqual(Math.round(viewport * 0.85));
    }
  });
});
