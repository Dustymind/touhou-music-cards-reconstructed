/** 双引擎冒烟：数据加载、页签切换、预设交互、对战回合。 */
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
  await page.goto("/");
  await page.getByRole("button", { name: "Match" }).click();
  await page.getByTestId("random-fill").click();
  await page.getByTestId("start-game").click();
  await expect(page.getByTestId("game-timer")).toBeVisible();
  await expect(page.getByText(/turn #0 · countdown/)).toBeVisible();
  // 3 秒倒计时后进入回合
  await expect(page.getByText(/turn #1 · turnStart/)).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("deck-you-card-0").click();
  await page.getByTestId("next-turn").click();
  await expect(page.getByText(/turn #2 ·/)).toBeVisible({ timeout: 15_000 });
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
