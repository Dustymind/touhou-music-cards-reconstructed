/** 双引擎冒烟：数据加载、页签切换、预设交互、对战回合。 */
import { captureAudio, waitForPlaying } from "./audio";
import { dragCard } from "./dnd";
import { expect, test, type Page } from "@playwright/test";

test("加载数据并渲染页签与播放页", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("tab", { name: "Player", exact: true })).toBeVisible();
  await expect(page.getByTestId("current-card")).toBeVisible();
  // 数据指纹（来自 index.json 的 contentHash）
  await expect(page.getByText(/Data hash [0-9a-f]{12}/)).toBeVisible();
  // 播放页默认 order #1
  await expect(page.getByText("霧雨魔理沙")).toBeVisible();
});

test("列表页列出全部角色并能搜索", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "List", exact: true }).click();
  await expect(page.getByText("121 / 121")).toBeVisible();
  await page.getByPlaceholder("Search Character").fill("cirno");
  await expect(page.getByText("1 / 121")).toBeVisible();
});

test("设置页：秘封父项是批量控制，三态开关改变统计", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  await expandSection(page, "preset");
  const stats = page.getByTestId("preset-stats");
  // 首次进入必须是"全选 + 全库可用"，而不是 0 / 378
  await expect(stats).toContainText("378 / 378");

  const parent = page.getByLabel("hifuu-parent");
  await expect(parent).toBeChecked();
  await parent.uncheck();
  await expect(page.getByLabel("hifuu-hr01")).not.toBeChecked();
  // 只勾回一张 → 父项半选
  await page.getByLabel("hifuu-hr01").check();
  // MUI v7 用 aria-checked="mixed" + data-indeterminate 表达半选（DOM 属性不暴露）
  await expect(parent).toHaveAttribute("aria-checked", "mixed");
  await parent.check();

  // 三态：角色曲 → 已禁用（236 条落选）
  await page.getByTestId("tri-角色曲-off").click();
  await expect(stats).toContainText("142 / 378");
  await expect(stats).toContainText("86 characters have tracks");
});

test("仅单曲模式下拉只列预设启用的曲目", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  await expandSection(page, "preset");
  await expandSection(page, "single");
  await page.getByTestId("tri-角色曲-off").click();
  await page.getByLabel("single-mode").check();

  // 选曲栏的文本必须垂直居中：上下内边距相等、文字中心与控件中心重合（用户反馈）。
  // 行是懒挂载的（进入视口才渲染）：滚动到该行的**占位**上，它才会挂载出真实内容
  await page.getByTestId("single-row-chirizuka-ubame").scrollIntoViewIfNeeded();
  const singleSelect = page.getByTestId("single-select-chirizuka-ubame");
  await expect(singleSelect).toBeVisible();
  const centering = await singleSelect.evaluate((form) => {
    const select = form.querySelector(".MuiSelect-select") as HTMLElement;
    const style = getComputedStyle(select);
    const rect = select.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(select);
    const text = range.getBoundingClientRect();
    return {
      paddingTop: style.paddingTop,
      paddingBottom: style.paddingBottom,
      offset: Math.round((text.top + text.height / 2) - (rect.top + rect.height / 2)),
      height: Math.round(rect.height),
    };
  });
  expect(centering.paddingTop).toBe(centering.paddingBottom);
  expect(centering.offset).toBe(0);
  expect(centering.height).toBe(40);

  const select = page.getByTestId("single-select-chirizuka-ubame").getByRole("combobox");
  await select.click();
  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible();
  const texts = await options.allTextContents();
  expect(texts.some((text) => text.includes("角色曲"))).toBe(false);
  expect(texts.some((text) => text.includes("愛おしき塵の住処"))).toBe(true);
});

test("对战页：随机补满 → 开局 → 倒计时后进入回合 → 下一回合推进", async ({ page }) => {
  await captureAudio(page);
  await page.goto("/");
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  await page.getByTestId("random-fill").click();
  await page.getByTestId("start-game").click();
  await expect(page.getByTestId("game-timer")).toBeVisible();
  await expect(page.getByText(/turn #0 · countdown/)).toBeVisible();
  // 3 秒倒计时期间正曲必须停着（这 3 秒只有铃）
  const duringCountdown = await page.evaluate(() => (window as unknown as { __audios: HTMLAudioElement[] })
    .__audios.map((audio) => audio.paused));
  expect(duringCountdown.every((paused) => paused)).toBe(true);

  // 3 秒倒计时后进入回合
  await expect(page.getByText(/turn #1 · turnStart/)).toBeVisible({ timeout: 15_000 });
  // **实际出声**：回合开始后当前角色的曲子真的在播（回归：实际游戏无声）
  const playing = await waitForPlaying(page);
  expect(playing.time).toBeGreaterThan(0);

  await page.getByTestId("deck-you-card-0").click();
  await page.getByTestId("next-turn").click();
  await expect(page.getByText(/turn #2 ·/)).toBeVisible({ timeout: 15_000 });
});

test("中文界面：游戏页（含联机大厅）全部是中文，不留英文标签", async ({ page }) => {
  await page.goto("/?locale=zh");
  await page.getByRole("tab", { name: "游戏", exact: true }).click();
  await page.getByTestId("game-setup").waitFor();

  // 电脑模式：含电脑卡组那组按键与对方棋盘
  await page.getByTestId("mode-cpu").click();
  for (const label of ["单人", "电脑", "多人", "经典", "休闲", "卡组 3×8", "行", "列",
    "随机补满", "补满电脑", "清空卡组", "打乱卡组", "打乱电脑卡组", "清空电脑卡组", "开始游戏", "中止游戏",
    "正在播放：—", "第 0 回合 · 选牌中 · 罚牌 0", "缩小", "放大",
    "对手 · 已得 0", "你 · 已得 0", "下一回合", "随机交出", "牌堆", "轮播"]) {
    await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
  }

  // 设置页：分区标题始终可见（内容折叠）
  await page.getByRole("tab", { name: "设置", exact: true }).click();
  for (const label of ["数据", "卡面图集", "音乐源", "音乐选择预设", "仅单曲模式"]) {
    await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
  }
  await page.getByRole("tab", { name: "游戏", exact: true }).click();

  // 多人模式：联机栏才出现
  await page.getByTestId("mode-multi").click();
  const lobby = page.getByTestId("lobby");
  await expect(lobby).toBeVisible();
  for (const label of ["联机", "名称", "建立房间", "房间号", "加入", "状态摘要", "跨机器（PeerJS）"]) {
    await expect(lobby.getByText(label, { exact: false }).first()).toBeVisible();
  }
  await page.getByTestId("mode-solo").click();

  // 英文标签不该再出现
  for (const leftover of ["Random Fill", "Clear Deck", "Shuffle Deck", "Next Turn", "Now playing",
    "deck 3×8", "Opponent · collected", "cross-machine"]) {
    await expect(page.getByText(leftover, { exact: false })).toHaveCount(0);
  }

  // 开局后的状态名也走中文
  await page.getByTestId("random-fill").click();
  await page.getByTestId("start-game").click();
  await expect(page.getByText(/第 1 回合 · 抢拍中/)).toBeVisible({ timeout: 15_000 });
});

test("自定义卡组：未使用卡可以点进牌库，也能点回来；电脑卡组能打乱/清空", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  await page.getByTestId("mode-cpu").click();          // 对方棋盘/电脑卡组按键只在电脑模式
  const unused = page.locator('[data-testid^="unused-card-"]');

  // 点第一张未使用的卡 → 进自己牌库
  const before = await unused.count();
  await unused.first().click();
  await expect(page.getByTestId("deck-you-card-0")).toBeVisible();
  await expect(unused).toHaveCount(before - 1);

  // 再点牌库里那张 → 回到未使用区
  await page.getByTestId("deck-you-card-0").click();
  await expect(unused).toHaveCount(before);
  await expect(page.getByTestId("deck-you-empty-0")).toBeVisible();

  // 电脑卡组：补满 → 打乱 → 清空
  await page.getByTestId("fill-cpu-deck").click();
  await expect(page.getByTestId("deck-opponent-card-0")).toBeVisible();
  await page.getByTestId("shuffle-cpu-deck").click();
  await page.getByTestId("clear-cpu-deck").click();
  await expect(page.getByTestId("deck-opponent-empty-0")).toBeVisible();
});

test("拖动放置卡牌：拖进指定槽位、拖回未使用区、牌位互换（对齐原版）", async ({ page }) => {
  // 牌桌 + 未使用卡牌区一起要看得见，否则合成鼠标拖到屏幕外就没有 drop 事件
  await page.setViewportSize({ width: 1440, height: 1500 });
  await page.goto("/");
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  await page.getByTestId("mode-cpu").click();          // 对方棋盘只在电脑/多人模式出现
  const unused = page.locator('[data-testid^="unused-card-"]');

  // 默认卡片大小 = 容器宽度 × 0.08（上游默认值，之前固定 56px 偏小）
  const sizes = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="deck-you"] [data-testid^="deck-you-"]');
    const board = document.querySelector('[data-testid="deck-you"]')?.parentElement;
    const tray = document.querySelector('[data-testid="unused-cards"] [data-testid^="unused-card-"]');
    return {
      ratio: (card?.getBoundingClientRect().width ?? 0) / (board?.getBoundingClientRect().width ?? 1),
      slot: card?.getBoundingClientRect().width ?? 0,
      tray: tray?.getBoundingClientRect().width ?? 0,
    };
  });
  expect(sizes.ratio).toBeGreaterThan(0.075);
  expect(sizes.ratio).toBeLessThan(0.09);
  // 未使用卡牌区与卡槽同尺寸（用户报过它没跟着变大）
  expect(Math.abs(sizes.tray - sizes.slot)).toBeLessThanOrEqual(1);

  // 拖一张未使用的卡到第 5 个空位（点击只能落到第一个空位，拖动才能指定位置）
  const dragged = await unused.first().getAttribute("data-testid");
  await dragCard(page, unused.first(), page.getByTestId("deck-you-empty-5"));
  await expect(page.getByTestId("deck-you-card-5")).toBeVisible();
  await expect(page.locator(`[data-testid="${dragged}"]`)).toHaveCount(0);

  // 拖回未使用区 = 拿出来
  await dragCard(page, page.getByTestId("deck-you-card-5"), page.getByTestId("unused-cards"));
  await expect(page.getByTestId("deck-you-empty-5")).toBeVisible();
  await expect(page.locator(`[data-testid="${dragged}"]`)).toHaveCount(1);

  // 牌库内互换：拖第 0 张到第 1 张
  await dragCard(page, unused.first(), page.getByTestId("deck-you-empty-0"));
  await dragCard(page, unused.first(), page.getByTestId("deck-you-empty-1"));
  const img = (slot: number) => page.getByTestId(`deck-you-card-${slot}`).locator("img").getAttribute("src");
  const before = [await img(0), await img(1)];

  // 交换时两张卡都要"滑过去"（曾经有一张会瞬移：渲染顺序随格子变化会让 React 重排 DOM、
  // 被移动的节点丢掉 CSS 过渡）。这里逐帧记录两张卡的位置。
  const startX = await page.evaluate(() => window.__TMC_GAME__.getState().game.players[0].deck
    .slice(0, 2).map((card) => {
      const element = card && document.querySelector(`[data-card-key="${card.characterKey}-${card.cardIndex}"]`);
      return element ? element.getBoundingClientRect().left : -1;
    }));
  await page.evaluate(() => {
    const state = window as unknown as { __swapSamples: number[][] };
    state.__swapSamples = [];
    const started = performance.now();
    const tick = (): void => {
      const deck = window.__TMC_GAME__.getState().game.players[0].deck;
      state.__swapSamples.push(deck.slice(0, 2).map((card) => {
        const element = card && document.querySelector(`[data-card-key="${card.characterKey}-${card.cardIndex}"]`);
        return element ? Math.round(element.getBoundingClientRect().left) : -1;
      }));
      if (performance.now() - started < 400) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await dragCard(page, page.getByTestId("deck-you-card-0"), page.getByTestId("deck-you-card-1"));
  expect(await img(0)).toBe(before[1]);
  expect(await img(1)).toBe(before[0]);

  // 两张卡都从原位出发（各自都出现过"接近起点"的一帧），即都在做位移动画而不是瞬移
  const samples = (await page.evaluate(() =>
    (window as unknown as { __swapSamples: number[][] }).__swapSamples)) as number[][];
  expect(samples.length).toBeGreaterThan(4);
  const nearStart = samples.map((frame) => frame.map((x, index) =>
    Math.abs(x - startX[index]!) <= 20));
  expect(nearStart.some((frame) => frame[0] && frame[1])).toBe(true);

  // 主机可以把未使用的卡拖到电脑卡组的指定空位
  await dragCard(page, unused.first(), page.getByTestId("deck-opponent-empty-3"));
  await expect(page.getByTestId("deck-opponent-card-3")).toBeVisible();
});

test("动效：牌桌卡牌滑位；播放页牌堆用滑块平移、hover 只变色、点击跳过", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1500 });
  await page.goto("/");
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  await page.getByTestId("random-fill").click();

  // 卡牌层是绝对定位 + left/top 过渡：换格子时会滑过去（对齐上游 `transition: left/top`）
  const layer = await page.getByTestId("deck-you-card-0").evaluate((element) => {
    const style = getComputedStyle(element);
    return { position: style.position, transition: style.transition };
  });
  expect(layer.position).toBe("absolute");
  expect(layer.transition).toContain("left 0.4s");
  expect(layer.transition).toContain("top 0.4s");

  // 游戏盘的卡槽**不做**悬浮动效（用户要求）：hover 之后依然没有位移
  await page.getByTestId("deck-you-card-0").hover();
  await page.waitForTimeout(400);
  const boardLift = await page.getByTestId("deck-you-card-0").evaluate((element) => {
    const inner = element.firstElementChild;
    return inner ? getComputedStyle(inner).transform : "";
  });
  expect(boardLift).toBe("none");
  // 卡牌只保留**一层**白底、不要外层纸框与投影（用户要求）
  const boardCard = await page.getByTestId("deck-you-card-0").evaluate((element) => {
    const inner = element.firstElementChild as HTMLElement;
    const style = getComputedStyle(inner);
    return { bg: style.backgroundColor, shadow: style.boxShadow };
  });
  expect(boardCard.bg).toBe("rgb(255, 255, 255)");
  expect(boardCard.shadow).toBe("none");
  // 槽位本身不铺底、不描边（有卡的位置）
  const cellShadow = await page.getByTestId("deck-you-card-0").evaluate((element) =>
    getComputedStyle(element.parentElement!.parentElement!.parentElement!).backgroundColor);
  expect(cellShadow).toBe("rgba(0, 0, 0, 0)");

  // 播放页：牌堆也是"卡条 + 下方滑块"，卡片等距不重叠、hover 只变底色
  await page.getByRole("tab", { name: "Player", exact: true }).click();
  const fanStrip = page.getByTestId("upcoming-fan-strip");
  const fanSlider = page.getByTestId("upcoming-fan-slider");
  await expect(fanStrip).toBeVisible();
  await expect(fanSlider).toBeVisible();
  const fanBox = (await fanStrip.boundingBox())!;
  const fanSliderBox = (await fanSlider.boundingBox())!;
  expect(fanSliderBox.y).toBeGreaterThanOrEqual(fanBox.y + fanBox.height);   // 滑块不遮卡片

  // 播放页的选卡区域同样有外框并居中
  const fanFrame = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="upcoming-fan"]')!;
    const frame = document.querySelector('[data-testid="upcoming-fan-frame"]')!;
    const rootBox = root.getBoundingClientRect();
    const frameBox = frame.getBoundingClientRect();
    return {
      border: getComputedStyle(frame).borderStyle,
      leftGap: Math.round(frameBox.left - rootBox.left),
      rightGap: Math.round(rootBox.right - frameBox.right),
    };
  });
  expect(fanFrame.border).toBe("solid");
  expect(Math.abs(fanFrame.leftGap - fanFrame.rightGap)).toBeLessThanOrEqual(2);
  const fanRadii = await page.evaluate(() => {
    const stripRadius = getComputedStyle(document.querySelector('[data-testid="upcoming-fan-strip"]')!).borderRadius;
    const paper = document.querySelector('[data-testid^="upcoming-card-"]')!.firstElementChild as HTMLElement;
    return { stripRadius, cardRadius: getComputedStyle(paper).borderRadius };
  });
  expect(fanRadii.stripRadius).toBe(fanRadii.cardRadius);
  const fanRail = await page.evaluate(() => {
    const strip = document.querySelector('[data-testid="upcoming-fan-strip"]')!.getBoundingClientRect();
    const rail = document.querySelector('[data-testid="upcoming-fan-slider-rail"]')!.getBoundingClientRect();
    return { left: Math.round(rail.left - strip.left), right: Math.round(rail.right - strip.right) };
  });
  expect(Math.abs(fanRail.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(fanRail.right)).toBeLessThanOrEqual(1);

  const fanGap = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid^="upcoming-card-"]')].slice(0, 2);
    if (cards.length < 2) return -1;
    const a = cards[0]!.getBoundingClientRect();
    const b = cards[1]!.getBoundingClientRect();
    return Math.round(b.left - a.right);
  });
  expect(fanGap).toBeGreaterThanOrEqual(0);            // 不重叠

  // hover 只变底色，不做位移（用户要求去掉光标悬浮动效）
  const firstCard = page.locator('[data-testid^="upcoming-card-"]').first();
  const hovered = await firstCard.evaluate(async (element) => {
    const paper = element.firstElementChild as HTMLElement;
    const before = getComputedStyle(paper).backgroundColor;
    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { before, after: getComputedStyle(paper).backgroundColor, transform: getComputedStyle(paper).transform };
  });
  expect(hovered.transform).toBe("none");
  expect(hovered.after).not.toBe(hovered.before);

  // 点击一张牌＝临时跳过（灰度反馈）
  const targetId = await page.locator('[data-testid^="upcoming-card-"]').nth(3).getAttribute("data-testid");
  const target = page.getByTestId(targetId!);
  const grayscaleOf = (element: Element): string => {
    const image = element.querySelector("img");
    return image ? getComputedStyle(image).filter : "";
  };
  const beforeFilter = await target.evaluate(grayscaleOf);
  await target.click();
  await expect.poll(async () => target.evaluate(grayscaleOf)).not.toBe(beforeFilter);
  expect(await target.evaluate(grayscaleOf)).toContain("grayscale");

  // 拖动滑块 → 整条牌堆平移（放在最后：平移后靠边的卡片会移出可视区）
  const beforeX = (await firstCard.boundingBox())!.x;
  await page.mouse.move(fanSliderBox.x + fanSliderBox.width * 0.5, fanSliderBox.y + fanSliderBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(fanSliderBox.x + fanSliderBox.width * 0.9, fanSliderBox.y + fanSliderBox.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await firstCard.boundingBox())!.x).toBeLessThan(beforeX - 100);
});

test("游戏卡槽：外框居中 + 滑块平移；拖动不碰卡片节点", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1500 });
  await page.goto("/");
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  const strip = page.getByTestId("unused-cards-strip");
  const slider = page.getByTestId("card-selection-slider");
  await expect(strip).toBeVisible();
  await expect(slider).toBeVisible();

  // 滑块在卡条**下方**：不遮挡卡槽
  const stripBox = (await strip.boundingBox())!;
  const sliderBox = (await slider.boundingBox())!;
  expect(sliderBox.y).toBeGreaterThanOrEqual(stripBox.y + stripBox.height);
  // 卡条宽度与牌桌一致（上游同样用 deckWidth）
  const deckBox = (await page.getByTestId("deck-you").boundingBox())!;
  expect(Math.abs(stripBox.width - deckBox.width)).toBeLessThanOrEqual(1);

  // 选卡区域有外框并居中（用户要求）
  const framed = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="unused-cards"]')!;
    const frame = document.querySelector('[data-testid="unused-cards-frame"]')!;
    const style = getComputedStyle(frame);
    const rootBox = root.getBoundingClientRect();
    const frameBox = frame.getBoundingClientRect();
    return {
      border: `${style.borderStyle} ${style.borderWidth}`,
      leftGap: Math.round(frameBox.left - rootBox.left),
      rightGap: Math.round(rootBox.right - frameBox.right),
    };
  });
  expect(framed.border).toBe("solid 1px");
  expect(Math.abs(framed.leftGap - framed.rightGap)).toBeLessThanOrEqual(2);

  // 显示区边界与卡牌同款圆角（滚到边界时被裁掉的卡片不露直角）
  const radii = await page.evaluate(() => {
    const stripRadius = getComputedStyle(document.querySelector('[data-testid="unused-cards-strip"]')!).borderRadius;
    const paper = document.querySelector('[data-testid^="unused-card-"]')!.firstElementChild as HTMLElement;
    return { stripRadius, cardRadius: getComputedStyle(paper).borderRadius };
  });
  expect(radii.stripRadius).not.toBe("0px");
  expect(radii.stripRadius).toBe(radii.cardRadius);

  // 左端：滑轨端点、拇指外缘、第一张卡的边缘都在同一条竖线上
  const leftEdges = await page.evaluate(() => {
    const strip = document.querySelector('[data-testid="unused-cards-strip"]')!.getBoundingClientRect();
    const rail = document.querySelector('[data-testid="card-selection-slider-rail"]')!.getBoundingClientRect();
    const thumb = document.querySelector('[data-testid="card-selection-slider"] .MuiSlider-thumb')!.getBoundingClientRect();
    const card = document.querySelector('[data-testid^="unused-card-"]')!.getBoundingClientRect();
    return {
      rail: Math.round(rail.left - strip.left),
      thumb: Math.round(thumb.left - strip.left),
      card: Math.round(card.left - strip.left),
    };
  });
  expect(Math.abs(leftEdges.rail)).toBeLessThanOrEqual(1);
  expect(Math.abs(leftEdges.thumb)).toBeLessThanOrEqual(1);
  expect(Math.abs(leftEdges.card)).toBeLessThanOrEqual(1);

  // 拖动滑块：只改"整行"的 transform，卡片节点一个都不动（性能）
  await page.evaluate(() => {
    const strip = document.querySelector('[data-testid="unused-cards-strip"]')!;
    const state = window as unknown as { __cardMutations: number; __rowMutations: number };
    state.__cardMutations = 0;
    state.__rowMutations = 0;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const id = (record.target as Element).getAttribute?.("data-testid") ?? "";
        if (id.startsWith("unused-card-")) state.__cardMutations += 1;
        else state.__rowMutations += 1;
      }
    });
    observer.observe(strip, { attributes: true, attributeFilter: ["style"], subtree: true });
  });
  const firstCard = page.locator('[data-testid^="unused-card-"]').first();
  const before = (await firstCard.boundingBox())!.x;
  await page.mouse.move(sliderBox.x + sliderBox.width * 0.2, sliderBox.y + sliderBox.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 20; step += 1) {
    await page.mouse.move(sliderBox.x + sliderBox.width * (0.2 + 0.03 * step), sliderBox.y + sliderBox.height / 2);
  }
  await page.mouse.up();
  await expect.poll(async () => (await firstCard.boundingBox())!.x).toBeLessThan(before - 100);
  const mutations = await page.evaluate(() => {
    const state = window as unknown as { __cardMutations: number; __rowMutations: number };
    return { cards: state.__cardMutations, row: state.__rowMutations };
  });
  expect(mutations.cards).toBe(0);      // 卡片位置是静态的
  expect(mutations.row).toBeGreaterThan(0);   // 只动整行的那一个 transform

  // 先把滑块推到最右端（拖到轨道外一点，保证取到 1）
  await page.mouse.move(sliderBox.x + sliderBox.width * 0.8, sliderBox.y + sliderBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sliderBox.x + sliderBox.width + 40, sliderBox.y + sliderBox.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => page.getAttribute('[data-testid="unused-cards"]', "data-pan")).toBe("1.000");

  // 右端：滑轨端点、拇指外缘、最后一张卡的边缘同样在一条线上，且不顶出外框
  const rightEdges = await page.evaluate(() => {
    const strip = document.querySelector('[data-testid="unused-cards-strip"]')!.getBoundingClientRect();
    const frame = document.querySelector('[data-testid="unused-cards-frame"]')!.getBoundingClientRect();
    const rail = document.querySelector('[data-testid="card-selection-slider-rail"]')!.getBoundingClientRect();
    const thumb = document.querySelector('[data-testid="card-selection-slider"] .MuiSlider-thumb')!.getBoundingClientRect();
    const cards = [...document.querySelectorAll('[data-testid^="unused-card-"]')];
    const last = cards[cards.length - 1]!.getBoundingClientRect();
    return {
      rail: Math.round(rail.right - strip.right),
      thumb: Math.round(thumb.right - strip.right),
      card: Math.round(last.right - strip.right),
      inside: thumb.left >= frame.left && thumb.right <= frame.right,
    };
  });
  expect(Math.abs(rightEdges.rail)).toBeLessThanOrEqual(1);
  expect(Math.abs(rightEdges.thumb)).toBeLessThanOrEqual(1);
  expect(Math.abs(rightEdges.card)).toBeLessThanOrEqual(1);
  expect(rightEdges.inside).toBe(true);
});

test("卡片大小按钮按 0.01 步进并夹在 0.04~0.40", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  const width = async (): Promise<number> => page.evaluate(() => {
    const card = document.querySelector('[data-testid="deck-you"] [data-testid^="deck-you-"]');
    return card ? Math.round(card.getBoundingClientRect().width) : 0;
  });
  const base = await width();
  await page.getByTestId("card-larger").click();
  const larger = await width();
  expect(larger).toBeGreaterThan(base);

  // 一路点到上限：按钮禁用（0.40 × 容器）
  for (let i = 0; i < 40; i += 1) {
    if (await page.getByTestId("card-larger").isDisabled()) break;
    await page.getByTestId("card-larger").click();
  }
  await expect(page.getByTestId("card-larger")).toBeDisabled();
  const max = await width();
  expect(max).toBeGreaterThan(larger);

  // 设置会落盘（上游同样存在 localStorage 的 gameSetting 里）
  const stored = await page.evaluate(() => window.localStorage.getItem("gameSetting"));
  expect(stored).toContain("cardWidthPercentage");
});

/** 展开设置页的某个分区（MD2 扩展面板默认折叠，内容不挂载）。 */
async function expandSection(page: Page, id: string): Promise<void> {
  await page.getByTestId(`section-${id}-summary`).click();
  await page.waitForTimeout(400);   // 等展开动画（250ms）
}

/** 分区的头部（summary）位置，用来验证展开时头部不会移动。 */
async function summaryTop(page: Page, id: string): Promise<number> {
  return page.getByTestId(`section-${id}-summary`).evaluate((element) =>
    Math.round(element.getBoundingClientRect().top));
}

test("设置分区展开时头部不移动，且符合 MD2 扩展面板规格", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  const summary = page.getByTestId("section-preset-summary");
  await summary.waitFor();

  // MD2 规格：4dp 圆角 / elevation 1 / 头部 56dp / 默认折叠
  const spec = await page.getByTestId("section-preset").evaluate((accordion) => {
    const head = accordion.querySelector(".MuiAccordionSummary-root")!;
    const style = getComputedStyle(accordion);
    return {
      radius: style.borderRadius,
      shadow: style.boxShadow !== "none",
      header: Math.round(head.getBoundingClientRect().height),
      collapsed: accordion.className.includes("Mui-expanded") === false,
    };
  });
  expect(spec.radius).toBe("4px");
  expect(spec.shadow).toBe(true);
  expect(spec.header).toBe(56);
  expect(spec.collapsed).toBe(true);

  // 展开过程中头部位置不变（间距由容器 gap 提供，面板自身 margin 恒为 0）
  const before = await summaryTop(page, "preset");
  await summary.click();
  const during = await summaryTop(page, "preset");
  await page.waitForTimeout(120);
  const mid = await summaryTop(page, "preset");
  await page.waitForTimeout(400);
  const after = await summaryTop(page, "preset");
  expect([during, mid, after]).toEqual([before, before, before]);

  // 展开后：头部仍是 56dp，且头部与内容之间有一条分隔线（MD2）
  const expanded = await page.getByTestId("section-preset").evaluate((accordion) => {
    const head = accordion.querySelector(".MuiAccordionSummary-root")!;
    const details = accordion.querySelector(".MuiAccordionDetails-root")!;
    return {
      header: Math.round(head.getBoundingClientRect().height),
      borderTop: getComputedStyle(details).borderTopWidth,
      content: details.getBoundingClientRect().height > 0,
    };
  });
  expect(expanded.header).toBe(56);
  expect(expanded.borderTop).toBe("1px");
  expect(expanded.content).toBe(true);
});

test("卡面图集设置对游戏页生效（选卡菜单 + 牌桌，用户反馈后）", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  await page.getByTestId("game-setup").waitFor();
  await page.getByTestId("mode-cpu").click();
  await page.getByTestId("random-fill").click();
  await page.waitForTimeout(600);

  const sources = () => page.evaluate(() => {
    const unused = document.querySelector('[data-testid^="unused-card-"] img');
    const deck = document.querySelector('[data-testid^="deck-you-card-"] img');
    return {
      unused: unused?.getAttribute("src") ?? "",
      deck: deck?.getAttribute("src") ?? "",
    };
  });

  // 默认图集：dairi（Q 版）→ 目录 cards/
  const before = await sources();
  expect(before.unused).toContain("/cards/");
  expect(before.deck).toContain("/cards/");

  // 设置页换成 ZUN 原画 → 游戏页选卡菜单与牌桌都换成 cards-zun/
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  await expandSection(page, "cardset");
  await page.getByTestId("cardset-radio-zun").waitFor();

  // 原版的图集菜单：每套一行（名称 + 使用按钮 + 原版说明 + 三张示例卡）
  const menu = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid^="cardset-row-"]')];
    const radioOf = (id: string) => document.querySelector<HTMLInputElement>(
      `[data-testid="cardset-radio-${id}"] input`);
    return {
      rows: rows.length,
      examples: rows.map((row) => row.querySelectorAll("img").length),
      description: document.querySelector('[data-testid="cardset-description-dairi-sd"]')?.textContent ?? "",
      radioCount: document.querySelectorAll('[data-testid^="cardset-radio-"] input[type="radio"]').length,
      currentChecked: radioOf("dairi-sd")?.checked,
      otherChecked: radioOf("zun")?.checked,
      ids: ["dairi-sd", "dairi", "enbu", "enbu-dolls", "thbwiki-sd", "zun"].map((id) =>
        document.querySelector(`[data-testid="cardset-title-${id}"]`)?.textContent?.trim() ?? ""),
    };
  });
  expect(menu.rows).toBe(6);
  expect(menu.examples).toEqual([3, 3, 3, 3, 3, 3]);
  expect(menu.radioCount).toBe(6);                       // MD2：多选一用单选组
  expect(menu.ids).toEqual(["dairi-sd", "dairi", "enbu", "enbu-dolls", "thbwiki-sd", "zun"]);
  expect(menu.description).toContain("Free super-deformed tachies from dairi Twitter");
  expect(menu.currentChecked).toBe(true);
  expect(menu.otherChecked).toBe(false);

  // 示例卡强制右对齐（每行最后一图的右边缘 = 整行右边缘），文字位置保持不变
  const alignment = await page.evaluate(() => {
    const ids = ["dairi-sd", "dairi", "enbu", "enbu-dolls", "thbwiki-sd", "zun"];
    return ids.map((id) => {
      const row = document.querySelector(`[data-testid="cardset-row-${id}"]`)!;
      const description = document.querySelector(`[data-testid="cardset-description-${id}"]`)!;
      const images = [...row.querySelectorAll("img")];
      const last = images[images.length - 1]!.getBoundingClientRect();
      return {
        rowRight: Math.round(row.getBoundingClientRect().right),
        imagesRight: Math.round(last.right),
        textLeft: Math.round(description.getBoundingClientRect().left),
      };
    });
  });
  expect([...new Set(alignment.map((entry) => entry.imagesRight))]).toHaveLength(1);   // 图片右对齐
  expect(alignment.every((entry) => entry.rowRight - entry.imagesRight <= 1)).toBe(true);
  expect([...new Set(alignment.map((entry) => entry.textLeft))]).toHaveLength(1);      // 文字位置不变

  await page.getByTestId("cardset-radio-zun").click();
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  await page.waitForTimeout(600);
  const after = await sources();
  expect(after.unused).toContain("/cards-zun/");
  expect(after.deck).toContain("/cards-zun/");
});

test("音乐模式：原曲 / 音MAD 切换（原版 otomads 模式）", async ({ page }) => {
  // 本地曲库默认是**同源**的相对路径（单端口部署形态，见 deploy/）；分开跑 dev 时用 ?localmusic= 覆盖
  const localRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/manifest.json")) localRequests.push(request.url());
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  await expandSection(page, "source");
  await page.getByTestId("music-mode").waitFor();

  // 默认原曲：只有镜像曲目（378 条），不请求本地曲库
  await expect(page.getByTestId("music-mode-originals")).toBeVisible();
  await expandSection(page, "preset");
  await expect(page.getByTestId("preset-stats")).toContainText("378 / 378");
  expect(localRequests).toHaveLength(0);

  // 切到音MAD：只剩曲包曲目（24 条），并自动去取本地曲库的 manifest（同源）
  await page.getByTestId("music-mode-otomads").click();
  await expect(page.getByTestId("preset-stats")).toContainText("24 / 24");
  await expect(page.getByTestId("music-mode-local-hint")).toBeVisible();
  await expect.poll(() => localRequests.length).toBeGreaterThan(0);
  expect(new URL(localRequests[0]!).origin).toBe(new URL(page.url()).origin);

  // 模式落盘：刷新后仍在音MAD
  await page.reload();
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  await expandSection(page, "source");
  const mode = await page.evaluate(() => {
    const checked = [...document.querySelectorAll('input[type="radio"]')]
      .find((input) => input.checked &&
        (input.closest("label")?.textContent ?? "").includes("Otomads"));
    return checked !== undefined;
  });
  expect(mode).toBe(true);

  // 切回原曲：统计回到 378
  await page.getByTestId("music-mode-originals").click();
  await expandSection(page, "preset");
  await expect(page.getByTestId("preset-stats")).toContainText("378 / 378");
});

test("本地曲库地址：默认同源，?localmusic= 可指向本机助手（单端口部署）", async ({ page }) => {
  // 默认：数据里是相对路径 → 请求打到应用自己（同源，单端口部署的形态）
  const sameOrigin: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/manifest.json")) sameOrigin.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  await expandSection(page, "source");
  await page.getByTestId("music-mode-otomads").click();
  await expect.poll(() => sameOrigin.length).toBeGreaterThan(0);
  expect(new URL(sameOrigin[0]!).origin).toBe(new URL(page.url()).origin);

  // 覆盖：?localmusic=127.0.0.1:8011 → 打到本机助手（本机分开跑 dev 时的用法）
  const overridden: string[] = [];
  page.on("request", (request) => {
    // 只看真的去取 manifest 的请求（页面 URL 本身也含 ?localmusic=8011）
    if (request.url().endsWith("/manifest.json") && request.url().includes("8011")) {
      overridden.push(request.url());
    }
  });
  await page.goto("/?localmusic=127.0.0.1:8011");
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  await expandSection(page, "source");
  // 设置页回显的是"存档里的覆盖值"
  await expect(page.getByLabel("local-music-url")).toHaveValue("127.0.0.1:8011");
  await page.getByTestId("music-mode-otomads").click();
  await expect.poll(() => overridden.length).toBeGreaterThan(0);
  expect(overridden[0]).toContain("http://127.0.0.1:8011/manifest.json");
});

test("音乐源回退顺序：显示用源名称，重排不打乱开关（用户反馈后）", async ({ page }) => {
  await page.goto("/?locale=zh");
  await page.getByRole("tab", { name: "设置", exact: true }).click();
  await expandSection(page, "source");
  const display = page.getByTestId("source-fallback-order");
  await expect(display).toBeVisible();

  // 显示的是源名称 + 顺序编号，而不是内部 id
  await expect(display).toContainText("网易云音乐");
  await expect(display).toContainText("→");
  for (const internalId of ["netease163", "cloudflare_r2", "thbwiki"]) {
    await expect(display).not.toContainText(internalId);
  }

  // 行的顺序 = 回退顺序；编号只是位置（上移移动的是"源"本身）
  const rowNames = () => page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="source-order-"]')].map((badge) => ({
      number: (badge.textContent ?? "").trim(),
      name: badge.closest(".MuiBox-root")?.querySelector(".MuiTypography-body2")?.textContent?.trim(),
    })));
  expect(await rowNames()).toEqual([
    { number: "1", name: "网易云音乐" },
    { number: "2", name: "Cloudflare R2" },
    { number: "3", name: "THBWiki" },
    { number: "4", name: "本地曲库" },
  ]);

  // 「本地曲库」默认关闭：上移别的源不能把它打开
  const localSwitch = page.locator('[aria-label="local-enabled"]');
  await expect(localSwitch).not.toBeChecked();
  await page.getByLabel("thbwiki-up").click();
  await page.getByLabel("thbwiki-up").click();
  await expect(display).toContainText("1THBWiki");
  // THBWiki 这一行真的挪到了第一位，编号仍是 1..4
  expect(await rowNames()).toEqual([
    { number: "1", name: "THBWiki" },
    { number: "2", name: "网易云音乐" },
    { number: "3", name: "Cloudflare R2" },
    { number: "4", name: "本地曲库" },
  ]);
  await expect(localSwitch).not.toBeChecked();

  // 第一个源不能再上移，最后一个源不能再下移
  await expect(page.getByLabel("thbwiki-up")).toBeDisabled();
  await expect(page.getByLabel("local-down")).toBeDisabled();

  // 关掉 THBWiki 不会改变它在回退顺序里的位置
  const orderBefore = (await display.textContent()) ?? "";
  await page.locator('[aria-label="thbwiki-enabled"]').click({ force: true });
  await expect(display).toHaveText(orderBefore);
  await expect(page.getByTestId("source-status-thbwiki")).toHaveText("off");
});

test("MD2 细节：下拉标签入框、搜索框居中、边框可见（用户反馈后）", async ({ page }) => {
  await page.goto("/");

  // 列表页搜索框：outlined（没有浮动标签占位）→ 占位文字垂直居中
  await page.getByRole("tab", { name: "List", exact: true }).click();
  await page.locator('input[type="text"]').first().waitFor();
  const search = await page.evaluate(() => {
    const input = document.querySelector('input[type="text"]')!;
    const root = input.closest(".MuiInputBase-root")!;
    const style = getComputedStyle(input);
    return {
      outlined: root.className.includes("MuiOutlinedInput-root"),
      paddingTop: Math.round(Number.parseFloat(style.paddingTop) * 10) / 10,
      paddingBottom: Math.round(Number.parseFloat(style.paddingBottom) * 10) / 10,
      height: Math.round(root.getBoundingClientRect().height),
      icon: root.querySelector("svg") !== null,
    };
  });
  expect(search.outlined).toBe(true);
  expect(search.paddingTop).toBe(search.paddingBottom);   // 上下对称 = 居中
  expect(search.height).toBe(40);                          // MD2 dense 输入框
  expect(search.icon).toBe(true);                          // MD2 搜索框带前置图标

  // 游戏页：下拉标签必须在框内；选卡区外框与卡槽虚线框要有可见边框
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  await page.getByTestId("game-setup").waitFor();
  await page.getByTestId("mode-cpu").click();
  const game = await page.evaluate(() => {
    const select = document.querySelector('[data-testid="deck-rows"]')!;
    const form = select.closest(".MuiFormControl-root")!;
    const label = form.querySelector(".MuiInputLabel-root")!.getBoundingClientRect();
    const box = select.getBoundingClientRect();
    const strip = document.querySelector('[data-testid="unused-cards-strip"]')!;
    const slot = document.querySelector('[data-testid^="deck-you-empty-"]')!;
    return {
      filled: select.closest(".MuiFilledInput-root") !== null,
      labelInside: label.top >= box.top - 1 && label.bottom <= box.bottom + 1,
      frameBorder: getComputedStyle(strip.parentElement!).borderColor,
      slotBorder: getComputedStyle(slot).borderColor,
    };
  });
  expect(game.filled).toBe(true);
  expect(game.labelInside).toBe(true);                     // "行/列"不再出框

  // 电脑参数三个输入框：标签在框内（filled 的标签位不被空着）
  const cpuFields = await page.evaluate(() =>
    ["cpu-mean", "cpu-sigma", "cpu-mistake"].map((label) => {
      const input = document.querySelector(`[aria-label="${label}"]`)!;
      const form = input.closest(".MuiFormControl-root")!;
      const root = input.closest(".MuiInputBase-root")!;
      const formRect = form.getBoundingClientRect();
      const labelRect = form.querySelector("label")!.getBoundingClientRect();
      return {
        labelInside: labelRect.top >= formRect.top - 1 && labelRect.bottom <= formRect.bottom + 1,
        height: Math.round(root.getBoundingClientRect().height),
        caption: form.querySelector("label")?.textContent ?? "",
      };
    }));
  expect(cpuFields.every((field) => field.labelInside)).toBe(true);
  expect([...new Set(cpuFields.map((field) => field.height))]).toEqual([48]);
  // 标签就是原来写在框外的那三个 caption
  expect(cpuFields.every((field) => field.caption.length > 0)).toBe(true);
  expect(game.frameBorder).toBe("rgba(255, 255, 255, 0.28)");
  expect(game.slotBorder).toBe("rgba(255, 255, 255, 0.28)");

  // 设置页音乐源的顺序编号是圆形
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  await expandSection(page, "source");
  await page.getByTestId("source-order-netease163").waitFor();
  const orderBadges = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="source-order-"]')].map((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        text: (element.textContent ?? "").trim(),
        round: style.borderRadius === "50%",
        square: Math.abs(rect.width - rect.height) < 0.5,
        size: Math.round(rect.width),
      };
    }));
  expect(orderBadges.length).toBeGreaterThanOrEqual(2);
  expect(orderBadges.every((badge) => badge.round && badge.square && badge.size === 24)).toBe(true);
  expect(orderBadges.map((badge) => badge.text)).toEqual(["1", "2", "3", "4"]);
});

test("游戏页按钮尺寸、内边距与图标间距统一", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  await page.getByTestId("deck-setup").waitFor();

  const readMetrics = (ids: string[]) => page.evaluate((wanted) => {
    return wanted.map((id) => {
      const element = document.querySelector(`[data-testid="${id}"]`);
      if (!element) return { id, missing: true };
      const style = getComputedStyle(element);
      const svg = element.querySelector("svg");
      let gap: number | null = null;
      if (svg) {
        // 文字节点：取最后一个非空文本节点
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const texts: Node[] = [];
        let node: Node | null;
        while ((node = walker.nextNode())) if (node.textContent?.trim()) texts.push(node);
        if (texts.length > 0) {
          const range = document.createRange();
          range.selectNodeContents(texts[texts.length - 1]!);
          gap = Math.round(range.getBoundingClientRect().left - svg.getBoundingClientRect().right);
        }
      }
      return {
        id,
        height: Math.round(element.getBoundingClientRect().height),
        padding: `${style.paddingLeft}|${style.paddingRight}`,
        fontSize: style.fontSize,
        gap,
      };
    });
  }, ids);

  // 电脑卡组按键只在电脑模式、联机按钮只在多人模式：分两批量
  await page.getByTestId("mode-cpu").click();
  const gameMetrics = await readMetrics(["start-game", "stop-game", "card-smaller", "card-larger",
    "random-fill", "shuffle-deck", "clear-deck", "fill-cpu-deck", "shuffle-cpu-deck", "clear-cpu-deck",
    "next-turn", "give-cards", "filter-by-deck"]);
  await page.getByTestId("mode-multi").click();
  const lobbyMetrics = await readMetrics(["net-host", "net-join"]);
  const metrics = [...gameMetrics, ...lobbyMetrics];

  expect(metrics.filter((entry) => "missing" in entry)).toEqual([]);
  const heights = new Set(metrics.map((entry) => entry.height));
  const paddings = new Set(metrics.map((entry) => entry.padding));
  const fonts = new Set(metrics.map((entry) => entry.fontSize));
  const gaps = new Set(metrics.map((entry) => entry.gap).filter((value): value is number => value !== null));
  expect([...heights]).toEqual([36]);              // MD2 中号按钮 36dp
  expect([...paddings]).toEqual(["16px|16px"]);    // MD2 左右各 16dp
  expect([...fonts]).toEqual(["14px"]);            // MD2 button 14sp
  // 模式/规则那排现在也有图标，图标间距同样并入断言
  expect([...gaps]).toEqual([8]);                  // MD2 8dp 栅格
  // 模式/规则现在是 MD2 单选组：图标与文字间距同样 8dp
  const radioMetrics = await page.evaluate(() => {
    const read = (id: string) => {
      const label = document.querySelector(`[data-testid="${id}"]`)!.closest("label")!;
      const svg = [...label.querySelectorAll("svg")].pop()!;   // 最后一个才是模式图标

      const texts: Node[] = [];
      const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) if (node.textContent?.trim()) texts.push(node);
      const range = document.createRange();
      range.selectNodeContents(texts[texts.length - 1]!);
      return Math.round(range.getBoundingClientRect().left - svg.getBoundingClientRect().right);
    };
    return ["mode-solo", "mode-cpu", "mode-multi", "rule-traditional", "rule-leisure"].map(read);
  });
  expect([...new Set(radioMetrics)]).toEqual([8]);

  // 牌库行列改成 MD2 下拉框（dense 高度 40）
  const selectHeights = await page.evaluate(() =>
    ["deck-rows", "deck-columns"].map((id) =>
      Math.round(document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect().height)));
  expect(selectHeights).toHaveLength(2);
  expect(selectHeights[0]).toBe(selectHeights[1]);
});

test("界面宽度自适应：MD2 响应式页边距（桌面 24 / 移动 16）", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  await page.getByTestId("mode-cpu").click();
  await page.getByTestId("random-fill").click();

  const read = async (width: number) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.waitForTimeout(400);
    return page.evaluate(() => {
      const panel = document.querySelector('[data-testid="game-setup"]')!;
      const deck = document.querySelector('[data-testid="deck-you"]')!;
      const rect = panel.getBoundingClientRect();
      return {
        marginLeft: Math.round(rect.left),
        marginRight: Math.round(document.body.clientWidth - rect.right),
        panelWidth: Math.round(rect.width),
        deckWidth: Math.round(deck.getBoundingClientRect().width),
      };
    });
  };

  const wide = await read(1920);
  const narrow = await read(1100);
  const mobile = await read(640);

  // MD2 响应式页边距：桌面（≥900）24px、移动端 16px；宽度跟着视口变（没有被最大宽度卡住）
  expect(wide.marginLeft).toBe(24);
  expect(wide.marginRight).toBe(24);
  expect(narrow.marginLeft).toBe(24);
  expect(narrow.marginRight).toBe(24);
  expect(mobile.marginLeft).toBe(16);
  expect(mobile.marginRight).toBe(16);
  expect(wide.panelWidth).toBeGreaterThan(narrow.panelWidth + 700);
  // 棋盘按容器宽度的百分比缩放（上游行为：卡片宽度 = 容器宽 × 8%）
  expect(wide.deckWidth).toBeGreaterThan(narrow.deckWidth * 1.5);
});

test("模式切换：棋盘与联机栏按模式显隐，并带动画", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  await page.getByTestId("game-setup").waitFor();

  // 单人：没有对方棋盘、没有联机栏、没有电脑卡组按键
  await expect(page.getByTestId("opponent-board")).toHaveCount(0);
  await expect(page.getByTestId("lobby-reveal")).toHaveCount(0);
  await expect(page.getByTestId("fill-cpu-deck")).toHaveCount(0);

  // 电脑：出现对方棋盘与电脑卡组按键，仍然没有联机栏
  await page.getByTestId("mode-cpu").click();
  await expect(page.getByTestId("opponent-board")).toBeVisible();
  await expect(page.getByTestId("deck-opponent")).toBeVisible();
  await expect(page.getByTestId("fill-cpu-deck")).toBeVisible();
  await expect(page.getByTestId("lobby-reveal")).toHaveCount(0);
  // 显隐动画：外层是 MUI Collapse（高度过渡）
  const collapse = await page.getByTestId("opponent-board").evaluate((element) => ({
    className: element.className,
    transition: getComputedStyle(element).transitionProperty,
  }));
  expect(collapse.className).toContain("MuiCollapse");
  expect(collapse.transition).toContain("height");

  // 多人：有联机栏、对方棋盘在、但电脑卡组按键消失（不可调整对方棋盘）
  await page.getByTestId("mode-multi").click();
  await expect(page.getByTestId("lobby-reveal")).toBeVisible();
  await expect(page.getByTestId("deck-opponent")).toBeVisible();
  await expect(page.getByTestId("fill-cpu-deck")).toHaveCount(0);
  const lobbyTransition = await page.getByTestId("lobby-reveal").evaluate((element) =>
    getComputedStyle(element).transitionProperty);
  expect(lobbyTransition).toContain("height");
});

test("顶部是 MD2 应用栏 + Tabs：高度、大写、字距与指示条", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Player", exact: true }).waitFor();

  const bar = await page.evaluate(() => {
    const appBar = document.querySelector("header.MuiAppBar-root")!;
    const toolbar = appBar.querySelector(".MuiToolbar-root")!;
    const tabs = [...appBar.querySelectorAll('[role="tab"]')];
    const indicator = appBar.querySelector(".MuiTabs-indicator") as HTMLElement | null;
    const style = getComputedStyle(tabs[0]!);
    return {
      appBarHeight: Math.round(appBar.getBoundingClientRect().height),
      toolbarHeight: Math.round(toolbar.getBoundingClientRect().height),
      tabs: tabs.map((tab) => ({
        text: (tab.textContent ?? "").trim(),
        height: Math.round(tab.getBoundingClientRect().height),
      })),
      textTransform: style.textTransform,
      letterSpacing: style.letterSpacing,
      fontSize: style.fontSize,
      indicatorHeight: indicator ? Math.round(indicator.getBoundingClientRect().height) : 0,
    };
  });

  expect(bar.appBarHeight).toBe(64);                       // MD2 桌面工具栏 64dp
  expect(bar.toolbarHeight).toBe(64);
  expect([...new Set(bar.tabs.map((tab) => tab.height))]).toEqual([48]);   // MD2 页签 48dp
  expect(bar.tabs.map((tab) => tab.text).slice(0, 4)).toEqual(["Player", "List", "Config", "Match"]);
  expect(bar.textTransform).toBe("uppercase");             // MD2 按钮/页签大写
  expect(bar.letterSpacing).toBe("1.25px");                // MD2 类型比例：14sp/500/1.25px
  expect(bar.fontSize).toBe("14px");
  expect(bar.indicatorHeight).toBe(2);                     // MD2 指示条 2dp
});

test("游戏页分组标题与按钮的间距、垂直对齐统一", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  await page.getByTestId("deck-setup").waitFor();
  await page.getByTestId("mode-cpu").click();   // "对手"那组按键只在电脑模式

  const measured = await page.evaluate(() => {
    const findLabel = (text: string): Element | undefined =>
      [...document.querySelectorAll("p, span, label")]
        .find((el) => el.children.length === 0 && el.textContent?.trim() === text);
    const pairs: [string, string][] = [["Mode", "mode-solo"], ["Rules", "rule-traditional"],
      ["Card size", "card-smaller"], ["You", "random-fill"], ["Opponent", "fill-cpu-deck"],
      ["Turn", "next-turn"]];
    const labelGaps: number[] = [];
    const centerOffsets: number[] = [];
    const buttonHeights: number[] = [];
    const buttonGaps: number[] = [];
    for (const [text, id] of pairs) {
      const label = findLabel(text);
      const button = document.querySelector(`[data-testid="${id}"]`);
      if (!label || !button) throw new Error(`缺少 ${text} / ${id}`);
      const l = label.getBoundingClientRect();
      const b = button.getBoundingClientRect();
      labelGaps.push(Math.round(b.left - l.right));
      centerOffsets.push(Math.round((b.top + b.height / 2) - (l.top + l.height / 2)));
      // 只有按钮参与"高度统一"断言（模式/规则现在是单选组，高度由 Radio 决定）
      if (button.tagName === "BUTTON") buttonHeights.push(Math.round(b.height));
    }
    const gapBetween = (a: string, b: string): number => {
      const x = document.querySelector(`[data-testid="${a}"]`)!.getBoundingClientRect();
      const y = document.querySelector(`[data-testid="${b}"]`)!.getBoundingClientRect();
      return Math.round(y.left - x.right);
    };
    for (const [a, b] of [["random-fill", "shuffle-deck"], ["shuffle-deck", "clear-deck"],
      ["fill-cpu-deck", "shuffle-cpu-deck"], ["next-turn", "give-cards"], ["start-game", "stop-game"]]) {
      buttonGaps.push(gapBetween(a, b));
    }
    return {
      labelGaps: [...new Set(labelGaps)],
      centerOffsets: [...new Set(centerOffsets)],
      buttonHeights: [...new Set(buttonHeights)],
      buttonGaps: [...new Set(buttonGaps)],
      chipHeight: Math.round(document.querySelector('[data-testid="deck-size"]')!.getBoundingClientRect().height),
    };
  });

  expect(measured.labelGaps).toEqual([8]);      // 标题与它后面那组按钮：统一 8px
  expect(measured.centerOffsets).toEqual([0]);  // 标题与按钮垂直居中对齐
  expect(measured.buttonHeights).toEqual([36]); // 高度统一（MD2 36dp）
  expect(measured.buttonGaps).toEqual([8]);     // 同组按钮之间：MD2 8dp
  expect(measured.chipHeight).toBe(36);         // chip 与按钮同高
});

test("两个界面的选卡滑块样式与对齐方式一致（同一份实现，不许漂移）", async ({ page }) => {
  const readSlider = (testId: string, stripTestId: string) => page.evaluate(([id, stripId]) => {
    const root = document.querySelector(`[data-testid="${id}"]`)!;
    const strip = document.querySelector(`[data-testid="${stripId}"]`)!.getBoundingClientRect();
    const thumbStyle = getComputedStyle(root.querySelector(".MuiSlider-thumb")!);
    const railEl = document.querySelector(`[data-testid="${id}-rail"]`)!;
    const railStyle = getComputedStyle(railEl);
    const rail = railEl.getBoundingClientRect();
    const thumb = root.querySelector(".MuiSlider-thumb")!.getBoundingClientRect();
    const round = (value: number): number => Math.round(value);
    return {
      thumb: [thumbStyle.width, thumbStyle.height, thumbStyle.backgroundColor, thumbStyle.borderRadius,
        thumbStyle.boxShadow].join("|"),
      rail: [railStyle.height, railStyle.backgroundColor, railStyle.opacity, railStyle.borderRadius].join("|"),
      // 对齐关系：滑轨两端和拇指外缘相对卡条边界的偏移
      align: [round(rail.left - strip.left), round(rail.right - strip.right),
        round(thumb.left - strip.left)].join("|"),
      // 拇指中线的垂直距离
      vertical: round((thumb.top + thumb.height / 2) - strip.bottom),
    };
  }, [testId, stripTestId]);

  await page.goto("/");
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  const game = await readSlider("card-selection-slider", "unused-cards-strip");
  await page.getByRole("tab", { name: "Player", exact: true }).click();
  await expect(page.getByTestId("upcoming-fan-slider")).toBeVisible();
  const player = await readSlider("upcoming-fan-slider", "upcoming-fan-strip");

  expect(player).toEqual(game);
  expect(game.thumb).toContain("20px|20px");   // 拇指尺寸/颜色/圆角/阴影
  expect(game.rail).toContain("4px");
  expect(game.align).toBe("0|0|0");            // 滑轨/拇指与卡条边界对齐（两端 + 拇指外缘）
});

test("播放页解析出音源（真实源表 + 远程 URL 写入 audio.src）", async ({ page }) => {
  await page.goto("/");
  // 源表来自本机 /data/sources/*.json，解析成功后曲目能解析出来（新布局里卡片只显示曲名 / 作者或作品 / 角色名，
  // 音源 id 不再显示在卡片上 —— 见 D91；这里改为断言"有曲名"且没有"取不到"的告警）
  await expect(page.getByTestId("now-title")).not.toHaveText("—");
  await expect(page.getByText(/所有已启用的音源都取不到/)).toHaveCount(0);
  // 点播放：headless 里可能被自动播放策略拦住，只断言 src 已被写入
  const src = await page.evaluate(() => {
    const audio = document.createElement("audio");
    return audio.src;
  });
  expect(typeof src).toBe("string");
});

test("播放页：曲名在上略大、角色名在下略小", async ({ page }) => {
  await page.goto("/?locale=zh");
  await expect(page.getByTestId("now-title")).toBeVisible();
  const metrics = await page.evaluate(() => {
    const title = document.querySelector('[data-testid="now-title"]')!;
    const character = document.querySelector('[data-testid="now-character"]')!;
    const box = (el: Element) => {
      const rect = el.getBoundingClientRect();
      return {
        top: Math.round(rect.top),
        size: Number.parseFloat(getComputedStyle(el).fontSize),
        weight: getComputedStyle(el).fontWeight,
        color: getComputedStyle(el).color,
      };
    };
    return { title: box(title), character: box(character) };
  });
  expect(metrics.title.top).toBeLessThan(metrics.character.top);        // 曲名在上
  expect(metrics.title.size).toBeGreaterThan(metrics.character.size);   // 略大
});

test("列表页：点角色展开曲目（默认折叠），点曲目即播放并高亮", async ({ page }) => {
  await page.goto("/?locale=zh");
  await page.getByRole("tab", { name: "列表", exact: true }).click();
  const row = page.locator('[data-testid^="list-row-"]').first();
  await expect(row).toBeVisible();

  const key = ((await row.getAttribute("data-testid")) ?? "").replace("list-row-", "");
  // 默认折叠：曲目列表不存在（未挂载）
  await expect(page.locator('[data-testid^="list-tracks-"]')).toHaveCount(0);

  await row.click();
  const tracks = page.locator(`[data-testid="list-tracks-${key}"] [data-testid^="list-track-"]`);
  await expect(tracks.first()).toBeVisible();
  expect(await tracks.count()).toBeGreaterThan(1);

  // 点第三首 → 立刻播放（该行高亮），播放页显示的正是这一首
  const third = tracks.nth(2);
  const trackId = (await third.getAttribute("data-testid")) ?? "";
  const trackTitle = ((await third.locator(".MuiTypography-body2").first().textContent()) ?? "").trim();
  expect(trackTitle.length).toBeGreaterThan(0);
  await third.click();
  await expect(page.locator(`[data-testid="${trackId}"] .MuiSvgIcon-colorPrimary`)).toHaveCount(1);
  await page.getByRole("tab", { name: "播放", exact: true }).click();
  await expect(page.getByTestId("now-title")).toHaveText(trackTitle);
  await page.getByRole("tab", { name: "列表", exact: true }).click();

  // 再点行本身 → 收起（切回列表时面板重挂载、展开状态是默认的折叠态，所以点两次）
  await row.click();                                   // 展开
  await expect(page.locator(`[data-testid="list-tracks-${key}"]`)).toBeVisible();
  await row.click();                                   // 收起
  await expect(page.locator('[data-testid^="list-tracks-"]')).toHaveCount(0);
});

test("播放控制：tag 下方自上而下「进度条 / 音量 / 播放控件」，行高与行距统一（用户要求）", async ({ page }) => {
  await page.goto("/?locale=zh");
  await expect(page.getByTestId("player-control")).toBeVisible();
  const metrics = await page.evaluate(() => {
    const box = (sel: string) => {
      const el = document.querySelector(sel)!;
      const rect = el.getBoundingClientRect();
      return { top: Math.round(rect.top), bottom: Math.round(rect.bottom),
        height: Math.round(rect.height), left: Math.round(rect.left),
        width: Math.round(rect.width), right: Math.round(rect.right) };
    };
    const seek = box('[data-testid="player-row-seek"]');
    const volume = box('[data-testid="player-row-volume"]');
    const transport = box('[data-testid="player-row-transport"]');
    // 对齐比较用的"行首元素"：进度条滑杆、音量减键、上一首键（都应与标题同一条左边缘）
    return {
      seek, volume, transport,
      gaps: [volume.top - seek.bottom, transport.top - volume.bottom],
      // 时间码在滑杆**两端**（用户要求），三行都以列首为起点
      timeRight: box('[data-testid="playback-time"]').right,
      sliderLeft: box('[data-testid="seek-slider"]').left,
      sliderRight: box('[data-testid="seek-slider"]').right,
      durationLeft: box('[data-testid="playback-duration"]').left,
      // 进度条行与音量行同一起点；播放控件行**居中于滑杆中线**（用户 2026-09-18 要求）
      rowLefts: [
        box('[data-testid="player-row-seek"]').left,
        box('[data-testid="volume-down"]').left,
      ],
      barCenter: Math.round((box('[data-testid="seek-slider"]').left + box('[data-testid="seek-slider"]').right) / 2),
      transportCenter: (() => {
        const buttons = [...document.querySelectorAll('[data-testid="player-row-transport"] button')]
          .map((el) => el.getBoundingClientRect());
        return Math.round((buttons[0]!.left + buttons[buttons.length - 1]!.right) / 2);
      })(),
      // 时间码左边缘要对齐音量键**图标**（24dp）的左边缘，而不是 48dp 判定区域
      timeLeft: box('[data-testid="playback-time"]').left,
      volumeIconLeft: Math.round(document.querySelector('[data-testid="volume-down"] .MuiSvgIcon-root')!
        .getBoundingClientRect().left),
    };
  });
  // 顺序：进度条 → 音量 → 播放控件（都在 tag 下方）
  expect(metrics.seek.top).toBeLessThan(metrics.volume.top);
  expect(metrics.volume.top).toBeLessThan(metrics.transport.top);
  // 行距相等（8dp 栅格）：三行盒子高度一致，间距一致
  expect(metrics.gaps[0]).toBe(metrics.gaps[1]);
  // 统一居中列（用户 2026-09-18 指定：两端同一套布局，全部居中）：
  // 卡面 → 曲名 → 作者/作品 → 角色名 → 进度条 → 音量条 → 播放控件
  const unified = await page.evaluate(() => {
    const rect = (id: string) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
    const mid = (r: DOMRect) => Math.round(r.left + r.width / 2);
    const head = rect("player-head");
    const lines = ["current-card", "now-title", "now-credit", "now-character",
      "player-row-seek", "player-row-volume", "player-row-transport"]
      .map((id) => { const r = rect(id); return { id, c: mid(r), t: Math.round(r.top) }; });
    const bars = ["seek-slider", "volume-slider"].map((id) => { const r = rect(id); return { w: Math.round(r.width), c: mid(r) }; });
    return { headMid: mid(head), lines, bars };
  });
  for (let index = 1; index < unified.lines.length; index += 1) {
    expect(unified.lines[index]!.t, "自上而下顺序不对").toBeGreaterThanOrEqual(unified.lines[index - 1]!.t);
  }
  for (const line of unified.lines) {
    expect(Math.abs(line.c - unified.headMid), `${line.id} 未居中`).toBeLessThanOrEqual(2);
  }
  expect(Math.abs(unified.bars[0]!.w - unified.bars[1]!.w), "两条滑杆不等长").toBeLessThanOrEqual(1);
  expect(Math.abs(unified.bars[0]!.c - unified.bars[1]!.c), "两条滑杆中心不一致").toBeLessThanOrEqual(1);
});
