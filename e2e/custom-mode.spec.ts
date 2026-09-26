/** 模式 3（自定义）的全流程：**应用不带这个模式的任何数据**，一切都来自使用者自己填的源。
 *
 * 数据来自 `e2e/fixtures/custom/` 下那份静态清单（同源，`?customsource=` 指过去）——
 * 用真源而不是 `page.route` 打桩：`normalizeManifestUrl` → 相对地址解析 → 卡面/音频地址
 * 这三步的口径都要在真浏览器里过一遍（D141/D144 那两条踩过的坑都在这一段上）。
 *
 * 期望值一律**跟着 fixture 走**（D97 的教训：写死数字会随数据漂移）。
 */
import { expect, test, type Page } from "@playwright/test";

import { expandSection } from "./ui";

const SOURCE = "/e2e/fixtures/custom/manifest.json";

interface FixtureCard {
  id: string;
  name: string;
  album: string;
  author?: string;
}

/** 读 fixture 那份清单，别在用例里写死卡名/数量。 */
async function loadFixture(page: Page): Promise<FixtureCard[]> {
  const payload = await (await page.request.get(SOURCE)).json();
  return payload.cards as FixtureCard[];
}

/** 切到模式 3（音乐模式单选在「音乐源」分区里，默认折叠）。 */
async function selectCustomMode(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  await expandSection(page, "source");
  await page.getByTestId("music-mode-custom").click();
}

/** 回到设置页并展开某个分区。
 *
 *  **切页签会卸载设置页**（`{tab === "config" && <ConfigPanel/>}`）⇒ 分区又折回去，展开状态不保留：
 *  每条要回设置页点东西的用例都得重新展开一次。 */
async function openCustomSection(page: Page, id: string): Promise<void> {
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  await expandSection(page, id);
}

/** 轮播计数（播放页右下角那行 `N in rotation · M sources`）。 */
function rotationCount(page: Page): Promise<number> {
  return page.getByText(/\d+ in rotation/).textContent()
    .then((text) => Number.parseInt(text ?? "0", 10));
}

test("没配源：0 张卡 + 必填提示，**一个请求都不发**", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  await page.goto("/");
  await selectCustomMode(page);

  // 空兜底数据集：0 卡、没有轮播内容，但界面照常渲染（不报错、不白屏）
  await page.getByRole("tab", { name: "Player", exact: true }).click();
  await expect(page.getByText("0 in rotation")).toBeVisible();
  await page.getByRole("tab", { name: "List", exact: true }).click();
  await expect(page.locator('[data-testid^="list-row-"]')).toHaveCount(0);

  // 设置页那一行：红色必填提示（空值时「重置」也没事可做）
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  await expandSection(page, "source");
  await expect(page.getByTestId("custom-source-required")).toBeVisible();
  await expect(page.getByTestId("custom-source-reset")).toBeDisabled();
  // 地址为空 ⇒ **一个请求都不发**（契约 C7）
  expect(requests.filter((url) => url.includes("/e2e/fixtures/custom/"))).toEqual([]);
});

test("配了源：卡与曲目立刻出现，画的是源给的卡面", async ({ page }) => {
  const cards = await loadFixture(page);
  await page.goto(`/?customsource=${SOURCE}`);
  await selectCustomMode(page);

  // 数据分区（默认折叠 ⇒ 先展开）的数字跟着清单走：0 角色 0 专辑 → 卡数与专辑数
  await openCustomSection(page, "data");
  await expect(page.getByTestId("data-chips")).toContainText(`${cards.length} characters`);
  await expect(page.getByTestId("data-chips")).toContainText("2 albums");     // fixture 里两张专辑

  // 列表页：每张卡一行（key 就是清单里的 `id`），展开就是它那一首（卡名 · 曲名/专辑）
  await page.getByRole("tab", { name: "List", exact: true }).click();
  await expect(page.locator('[data-testid^="list-row-"]')).toHaveCount(cards.length);
  for (const card of cards) {
    await expect(page.getByTestId(`list-row-${card.id}`)).toBeVisible();
  }
  const first = cards[0]!;
  await page.getByTestId(`list-row-${first.id}`).click();
  await expect(page.locator(`[data-testid^="list-track-${first.id}-"]`).first()).toBeVisible();

  // 播放页：当前这张卡画的是**源给的那张图**（相对地址按清单目录解析成绝对地址）
  await page.getByRole("tab", { name: "Player", exact: true }).click();
  await expect(page.getByTestId("current-card-image").locator("img"))
    .toHaveAttribute("src", /\/e2e\/fixtures\/custom\/cover\/[abc]\.png/);
  await expect.poll(() => rotationCount(page)).toBe(cards.length);
});

test("专辑/作者三元按真值表筛选（默认全开；off 一票否决）", async ({ page }) => {
  const cards = await loadFixture(page);
  const oldAlbum = cards.filter((card) => card.album === "E2E 旧作").length;
  const byAuthor = cards.filter((card) => card.author === "E2E 乙").length;
  const withoutAuthor = cards.filter((card) => card.author === undefined).length;
  expect(oldAlbum).toBeGreaterThan(0);
  expect(byAuthor).toBeGreaterThan(0);
  expect(withoutAuthor).toBeGreaterThan(0);        // 有一张**没有作者**的卡（它只看专辑那一维）

  await page.goto(`/?customsource=${SOURCE}`);
  await selectCustomMode(page);
  await openCustomSection(page, "preset");

  await page.getByRole("tab", { name: "Player", exact: true }).click();
  await expect.poll(() => rotationCount(page)).toBe(cards.length);       // 默认（两维 unset）= 全开

  // 专辑 off ⇒ 一票否决：那一张专辑的卡全掉
  await openCustomSection(page, "preset");
  await page.getByTestId("custom-album-E2E 旧作-off").click();
  await page.getByRole("tab", { name: "Player", exact: true }).click();
  await expect.poll(() => rotationCount(page)).toBe(cards.length - oldAlbum);

  // 回到 unset ⇒ 又全开
  await openCustomSection(page, "preset");
  await page.getByTestId("custom-album-E2E 旧作-unset").click();
  await page.getByRole("tab", { name: "Player", exact: true }).click();
  await expect.poll(() => rotationCount(page)).toBe(cards.length);

  // 作者 off ⇒ 只掉他那张；**没有作者**的卡不受作者维度影响（Q7）
  await openCustomSection(page, "preset");
  await page.getByTestId("custom-author-E2E 乙-off").click();
  await page.getByRole("tab", { name: "Player", exact: true }).click();
  await expect.poll(() => rotationCount(page)).toBe(cards.length - byAuthor);

  // 作者也回到 unset ⇒ 全开
  await openCustomSection(page, "preset");
  await page.getByTestId("custom-author-E2E 乙-unset").click();
  await page.getByRole("tab", { name: "Player", exact: true }).click();
  await expect.poll(() => rotationCount(page)).toBe(cards.length);
});

test("逐卡禁用：不进轮播、也不进卡池（游戏页牌堆同口径）", async ({ page }) => {
  const cards = await loadFixture(page);
  await page.goto(`/?customsource=${SOURCE}`);
  await selectCustomMode(page);

  // 游戏页的牌堆 = 卡数
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  await expect(page.getByText(`pool ${cards.length}`)).toBeVisible();

  // 禁用一张卡 ⇒ 轮播与牌堆同时少一张
  const [victim, ...rest] = cards;
  await openCustomSection(page, "single");
  await page.getByTestId(`custom-single-disable-${victim!.id}`).click();

  await page.getByRole("tab", { name: "Match", exact: true }).click();
  await expect(page.getByText(`pool ${cards.length - 1}`)).toBeVisible();
  await page.getByRole("tab", { name: "Player", exact: true }).click();
  await expect.poll(() => rotationCount(page)).toBe(rest.length);

  // 切到别的模式再切回来：模式 3 的三元、禁用、源链接**原样保留**（三把 store 都是这个模式自己的）
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  await expandSection(page, "source");
  await page.getByTestId("music-mode-otomads").click();
  await page.getByTestId("music-mode-custom").click();
  await page.getByRole("tab", { name: "Player", exact: true }).click();
  await expect.poll(() => rotationCount(page)).toBe(rest.length);
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  await expect(page.getByText(`pool ${cards.length - 1}`)).toBeVisible();
});

test("重置 = 清空：回到 0 张卡，刷新后仍是空（默认值本来就是空）", async ({ page }) => {
  await page.goto(`/?customsource=${SOURCE}`);
  await selectCustomMode(page);
  await page.getByRole("tab", { name: "Player", exact: true }).click();
  await expect.poll(() => rotationCount(page)).toBe(3);
  await page.getByRole("tab", { name: "Config", exact: true }).click();

  // 「应用」把**输入框里的值**写进存档：先自己填一遍（模拟用户在设置页填地址）
  await openCustomSection(page, "source");
  await expect(page.getByLabel("custom-source-url")).toHaveValue(SOURCE);
  await page.getByLabel("custom-source-url").fill(SOURCE);
  await page.getByTestId("custom-source-apply").click();
  await expect(page.getByTestId("custom-source-loaded")).toBeVisible();

  // 填过的链接**刷新后还在**（`pickSession` 逐字列出了要落盘的字段）：这次不带 `?customsource=`，
  // 生效的就是存档里那一份
  await page.goto("/");
  await page.getByRole("tab", { name: "Player", exact: true }).click();
  await expect.poll(() => rotationCount(page)).toBe(3);

  // 重置只把值清成空串 ⇒ 回到 0 张卡（不是"回某个默认值"）
  await openCustomSection(page, "source");
  await page.getByTestId("custom-source-reset").click();
  await expect(page.getByLabel("custom-source-url")).toHaveValue("");
  await page.getByRole("tab", { name: "Player", exact: true }).click();
  await expect.poll(() => rotationCount(page)).toBe(0);

  // 存档也是空的：刷新之后仍然 0 张（`?customsource=` 还在，所以这次刷新还会回到 3 张 —— 这正是
  // "URL 参数优先于存档、且不写回存档"那条口径；把参数去掉才是"干净地回到空"）
  await page.goto("/");
  await page.getByRole("tab", { name: "Player", exact: true }).click();
  await expect.poll(() => rotationCount(page)).toBe(0);
});

test("窄屏（320 / 412dp）：模式 3 的设置页不横向溢出", async ({ page }) => {
  await page.goto(`/?customsource=${SOURCE}`);
  for (const width of [320, 412]) {
    await page.setViewportSize({ width, height: 800 });
    await selectCustomMode(page);
    await expect(page.getByTestId("custom-source")).toBeVisible();

    // 这一行自己不许溢出（三控件一行：输入框 → 重置 → 应用）
    const overflow = await page.getByTestId("custom-source").evaluate((element) =>
      element.scrollWidth - element.clientWidth);
    expect(overflow, `${width}dp 的自定义源那一行`).toBeLessThanOrEqual(1);

    // 三元行在窄屏允许折行，但不许把页面撑宽
    await openCustomSection(page, "preset");
    const page_ = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(page_, `${width}dp 的整页`).toBeLessThanOrEqual(1);
  }
});
