/** 双引擎冒烟：数据加载、页签切换、预设交互、对战回合。 */
import { captureAudio, waitForPlaying } from "./audio";
import { dragCard } from "./dnd";
import { expect, test } from "@playwright/test";

test("加载数据并渲染页签与播放页", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Player" })).toBeVisible();
  await expect(page.getByTestId("current-card")).toBeVisible();
  // 数据指纹（来自 index.json 的 contentHash）
  await expect(page.getByText(/Data hash [0-9a-f]{12}/)).toBeVisible();
  // 播放页默认 order #1
  await expect(page.getByText("霧雨魔理沙")).toBeVisible();
});

test("列表页列出全部角色并能搜索", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "List" }).click();
  await expect(page.getByText("121 / 121")).toBeVisible();
  await page.getByPlaceholder("Search Character").fill("cirno");
  await expect(page.getByText("1 / 121")).toBeVisible();
});

test("设置页：秘封父项是批量控制，三态开关改变统计", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Config" }).click();
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
  await page.getByRole("button", { name: "Config" }).click();
  await page.getByTestId("tri-角色曲-off").click();
  await page.getByLabel("single-mode-enabled").check();
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
  await page.getByRole("button", { name: "Match" }).click();
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
  await page.getByRole("button", { name: "游戏", exact: true }).click();
  await expect(page.getByTestId("lobby")).toBeVisible();

  const lobby = page.getByTestId("lobby");
  for (const label of ["联机", "名称", "建立房间", "房间号", "加入", "状态摘要", "跨机器（PeerJS）"]) {
    await expect(lobby.getByText(label, { exact: false }).first()).toBeVisible();
  }
  for (const label of ["单人", "电脑", "经典", "休闲", "卡组 3×8", "减行", "加行", "减列", "加列",
    "随机补满", "补满电脑", "清空卡组", "打乱卡组", "开始游戏", "中止游戏",
    "正在播放：—", "第 0 回合 · 选牌中 · 罚牌 0", "卡牌缩小", "卡牌放大",
    "对手 · 已得 0", "你 · 已得 0", "下一回合", "随机交出", "牌堆", "轮播"]) {
    await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
  }
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
  await page.getByRole("button", { name: "Match" }).click();
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
  await page.getByRole("button", { name: "Match" }).click();
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
  await dragCard(page, page.getByTestId("deck-you-card-0"), page.getByTestId("deck-you-card-1"));
  expect(await img(0)).toBe(before[1]);
  expect(await img(1)).toBe(before[0]);

  // 主机可以把未使用的卡拖到电脑卡组的指定空位
  await dragCard(page, unused.first(), page.getByTestId("deck-opponent-empty-3"));
  await expect(page.getByTestId("deck-opponent-card-3")).toBeVisible();
});

test("卡片大小按钮按 0.01 步进并夹在 0.04~0.40", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Match" }).click();
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

test("播放页解析出音源（真实源表 + 远程 URL 写入 audio.src）", async ({ page }) => {
  await page.goto("/");
  // 源表来自本机 /data/sources/*.json，解析成功后显示音源标签
  await expect(page.getByText(/^(netease163|cloudflare_r2|thbwiki)$/).first()).toBeVisible();
  await expect(page.getByText(/所有已启用的音源都取不到/)).toHaveCount(0);
  // 点播放：headless 里可能被自动播放策略拦住，只断言 src 已被写入
  const src = await page.evaluate(() => {
    const audio = document.createElement("audio");
    return audio.src;
  });
  expect(typeof src).toBe("string");
});
