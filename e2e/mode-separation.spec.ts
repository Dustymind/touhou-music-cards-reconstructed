/** B：两个音乐模式的状态互不干扰（状态按模式分键）＋ 列表页跟着模式走。
 *
 * 跑在 chromium 与 firefox 两个 project 上（默认 testDir 下的用例两个引擎都跑，见 playwright.config.ts）。
 * 前置条件：音MAD 的统计取同源 `/manifest.json`，要先起本地曲库助手（见根 `README.md`）。
 * 期望值一律**跟着数据走**（D97 的教训：写死 121 / 24 会随数据漂移）。
 */
import { expect, test, type Page } from "@playwright/test";

/** 展开设置页的某个分区（已经是展开状态就别再点，点了会收起来）。 */
async function expandSection(page: Page, id: string): Promise<void> {
  const summary = page.getByTestId(`section-${id}-summary`);
  if ((await summary.getAttribute("aria-expanded")) !== "true") {
    await summary.click();
    await page.waitForTimeout(400);   // 展开动画 250ms
  }
}

interface Loaded {
  characters: { key: string; music: [string, string, string][] }[];
  playable: { originals: string[]; otomads: string[] };
  onlyOriginals: string;
}

/** 从同源的生成物里数"每个模式下有曲可播的角色"，别写死数字。 */
async function loadCounts(page: Page): Promise<Loaded> {
  const albums = (await (await page.request.get("/data/albums.json")).json()).albums as
    { name: string; pack: string }[];
  const characters = (await (await page.request.get("/data/characters.json")).json()).characters as
    Loaded["characters"];
  const packOf = new Map(albums.map((album) => [album.name, album.pack]));
  const usable = (character: Loaded["characters"][number], pack: string): boolean =>
    character.music.some((entry) => (packOf.get(entry[0]) ?? "originals") === pack);
  const playable = {
    originals: characters.filter((character) => usable(character, "originals")).map((c) => c.key),
    otomads: characters.filter((character) => usable(character, "otomads")).map((c) => c.key),
  };
  const onlyOriginals = playable.originals.find((key) => !playable.otomads.includes(key));
  if (onlyOriginals === undefined) throw new Error("数据里没有'只有原曲曲目'的角色");
  return { characters, playable, onlyOriginals };
}

test("列表页跟着音乐模式：音MAD 下只列有音MAD 曲目的角色", async ({ page }) => {
  const { characters, playable, onlyOriginals } = await loadCounts(page);
  // 数据前提：两个模式的可播角色数不同，否则这条用例证明不了什么
  expect(playable.otomads.length).toBeGreaterThan(0);
  expect(playable.otomads.length).toBeLessThan(playable.originals.length);

  await page.goto("/");
  await page.getByRole("tab", { name: "List", exact: true }).click();
  await expect(page.getByText(`${playable.originals.length} / ${playable.originals.length}`)).toBeVisible();
  await expect(page.getByTestId(`list-row-${onlyOriginals}`)).toBeVisible();

  // 切到音MAD：分母跟着模式变（不是 121），只有原曲曲目的角色不再列出
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  await expandSection(page, "source");
  await page.getByTestId("music-mode-otomads").click();

  await page.getByRole("tab", { name: "List", exact: true }).click();
  await expect(page.getByText(`${playable.otomads.length} / ${playable.otomads.length}`)).toBeVisible();
  await expect(page.getByTestId(`list-row-${onlyOriginals}`)).toHaveCount(0);
  expect(playable.otomads.length).toBeLessThan(characters.length);

  // 行内只列音MAD 曲目：找一个有音MAD 曲目的角色展开，检查它的曲目行
  const key = playable.otomads.find((candidate) => candidate === "cirno") ?? playable.otomads[0]!;
  await page.getByTestId(`list-row-${key}`).click();
  const rows = page.locator(`[data-testid^="list-track-${key}-"]`);
  await expect(rows.first()).toBeVisible();
  const ids = await rows.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-testid") ?? ""));
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) expect(id).toContain(`list-track-${key}-otomads-`);
});

test("切模式不带走另一个模式的预设（状态按模式分键）", async ({ page }) => {
  // 音MAD 的曲目数取同源 manifest（数据里写了多少条会变，不写死）
  const manifest = await page.request.get("/manifest.json");
  expect(manifest.ok()).toBe(true);
  const packed = ((await manifest.json()) as { tracks: unknown[] }).tracks.length;
  expect(packed).toBeGreaterThan(0);

  await page.goto("/");
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  await expandSection(page, "preset");
  const before = (await page.getByTestId("preset-stats").textContent()) ?? "";

  // 原曲：显式关掉「角色曲」→ 可用曲目变少
  await page.getByTestId("tri-角色曲-off").click();
  await expect.poll(async () => (await page.getByTestId("preset-stats").textContent()) ?? "")
    .not.toBe(before);
  const afterOff = (await page.getByTestId("preset-stats").textContent()) ?? "";

  // 切到音MAD：三态开关读的是**另一把**（未配置）→ 统计是满的，不带原曲的"关掉"
  await expandSection(page, "source");
  await page.getByTestId("music-mode-otomads").click();
  await expandSection(page, "preset");
  await expect(page.getByTestId("preset-stats")).toContainText(`${packed} / ${packed}`);

  // 切回原曲：刚才"关掉角色曲"还在（两模式各记各的）
  await expandSection(page, "source");
  await page.getByTestId("music-mode-originals").click();
  await expandSection(page, "preset");
  await expect(page.getByTestId("preset-stats")).toContainText(afterOff);
  // 两把键都落了盘（刷新后各还原各的）
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("tmc.v1.")));
  expect(keys).toContain("tmc.v1.preset.originals");
  expect(keys).toContain("tmc.v1.preset.otomads");
});
