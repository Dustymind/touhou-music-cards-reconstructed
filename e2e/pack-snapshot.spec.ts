/** C 的验收核心（D145）：**源在自己的清单里多给一首曲目 ⇒ 应用里出现、能统计到、能选中并出声**，
 * 而主仓库一个字都不用改。
 *
 * 这是 C 之前做不到的事：曲目表随前端部署，源里加一首只会让设置页「源状态」的计数 +1，曲目选不到
 * （`src/**` 全程遍历 `dataset.characters[].music`，源只提供地址）。
 *
 * 前置：先 `pnpm local`（音MAD 的默认源已经改成 CDN，这里一律 `?localmusic=127.0.0.1:8011` 钉到本机助手，
 * 不依赖外网）。手法：`page.route` 截住助手那份 manifest，把**真清单**取回来只改"包数据"这一小段
 * （源现在会带 `albums` / `characters`），音频仍指向真清单里的真文件 ⇒ "能选中并出声"也是真的。
 */
import { expect, test, type Page } from "@playwright/test";
import { captureAudio, waitForPlaying } from "./audio";

const HELPER_MANIFEST = "http://127.0.0.1:8011/manifest.json";
/** 新增曲目不写作者 ⇒ 磁盘名就是曲名 ⇒ 与清单行按 (专辑, 曲名) 直接对上 */
const NEW_TITLE = "e2e 新增曲目";

interface BakedCharacter {
  key: string;
  music: unknown[][];
  card: string[];
}

/** 展开设置页的某个分区（已经是展开状态就别再点，点了会收起来）。 */
async function expandSection(page: Page, id: string): Promise<void> {
  const summary = page.getByTestId(`section-${id}-summary`);
  if ((await summary.getAttribute("aria-expanded")) !== "true") {
    await summary.click();
    await page.waitForTimeout(400);   // 展开动画 250ms
  }
}

/** 应用栏上的数据指纹（12 位十六进制）—— 联机握手比的就是它。 */
async function fingerprint(page: Page): Promise<string> {
  const text = (await page.getByText(/Data hash [0-9a-f]{12}/).textContent()) ?? "";
  return /([0-9a-f]{12})/.exec(text)?.[1] ?? "";
}

/** 用同源的生成物当"自带那份曲目表"（应用里兜底用的就是它）。 */
async function bakedSnapshot(page: Page): Promise<{ albums: unknown[]; characters: BakedCharacter[] }> {
  const albums = await (await page.request.get("/data/otomads/albums.json")).json() as { albums: unknown[] };
  const characters = await (await page.request.get("/data/otomads/characters.json")).json() as {
    characters: BakedCharacter[];
  };
  return { albums: albums.albums, characters: characters.characters };
}

/** 截住助手的 manifest：取回真清单 → `mutate` 改一改 → 交回应用。 */
async function interceptManifest(
  page: Page,
  mutate: (payload: Record<string, unknown>, baked: Awaited<ReturnType<typeof bakedSnapshot>>) => void,
): Promise<void> {
  await page.route(HELPER_MANIFEST, async (route) => {
    const response = await route.fetch();
    const payload = await response.json() as Record<string, unknown>;
    mutate(payload, await bakedSnapshot(page));
    await route.fulfill({ response, json: payload });
  });
}

/** 切到音MAD 模式并等到预设统计出来（源表载入是异步的：先按自带那份渲染，源回来再重建）。 */
async function useOtomadsMode(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  await expandSection(page, "source");
  await page.getByTestId("music-mode-otomads").click();
  await expandSection(page, "preset");
}

test("源里多一首曲目 ⇒ 应用里出现、统计跟着涨、能选中并出声（主仓库没改）", async ({ page }) => {
  await captureAudio(page);
  const index = await (await page.request.get("/data/otomads/index.json")).json() as {
    counts: { trackEntries: number };
  };
  let donorUrl = "";

  await interceptManifest(page, (payload, baked) => {
    const rows = payload.tracks as string[][];
    const donor = rows[0]!;
    donorUrl = donor[2]!;
    // ① 清单的**地址表**多一行（指向一份真实存在的音频：借用第一首的地址）
    payload.tracks = [...rows, ["otomads", NEW_TITLE, donorUrl, donor[3]]];
    // ② 清单的**曲目表**多一首（加到第一个角色名下）—— 应用就是按这一段决定"有哪些曲目"
    const characters = baked.characters.map(({ key, music, card }) => ({ key, music, card }));
    characters[0]!.music = [...characters[0]!.music, ["otomads", NEW_TITLE, "角色曲"]];
    payload.albums = baked.albums;
    payload.characters = characters;
  });

  await page.goto("/?localmusic=127.0.0.1:8011");
  await useOtomadsMode(page);

  // 统计跟着源走：曲目条目 +1（C 之前这里永远是自带那份的数字）
  const total = index.counts.trackEntries + 1;
  await expect(page.getByTestId("preset-stats")).toContainText(`${total} / ${total}`);

  // 列表页里真的出现了这一首
  const key = (await bakedSnapshot(page)).characters[0]!.key;
  await page.getByRole("tab", { name: "List", exact: true }).click();
  await page.getByTestId(`list-row-${key}`).click();
  const track = page.getByTestId(`list-track-${key}-otomads-${NEW_TITLE}`);
  await expect(track).toBeVisible();

  // 选中它 ⇒ 播放页显示的就是这一首，而且真的开始出声（地址就是清单里那一行的地址）
  await track.click();
  await page.getByRole("tab", { name: "Player", exact: true }).click();
  await expect(page.getByTestId("now-title")).toHaveText(NEW_TITLE);
  const playing = await waitForPlaying(page);
  expect(playing.src.startsWith(donorUrl)).toBe(true);
});

test("老清单（不带这两个键）⇒ 与今天逐字一致；源给的正是同一份数据时，指纹也一样", async ({ page }) => {
  const index = await (await page.request.get("/data/otomads/index.json")).json() as {
    counts: { trackEntries: number };
  };

  // ① 老清单：把"包数据"剥掉 ⇒ 完全走自带那份（今天的行为）
  await interceptManifest(page, (payload) => {
    delete payload.albums;
    delete payload.characters;
  });
  await page.goto("/?localmusic=127.0.0.1:8011");
  await useOtomadsMode(page);
  await expect(page.getByTestId("preset-stats"))
    .toContainText(`${index.counts.trackEntries} / ${index.counts.trackEntries}`);
  const withoutSnapshot = await fingerprint(page);
  expect(withoutSnapshot).toMatch(/^[0-9a-f]{12}$/);

  // ② 带快照，但源给的正是**同一份数据** ⇒ 统计与指纹都不变（D145 §3：有源的一边与只有兜底的一边
  //    在同一份数据上算出来自然相同 ⇒ 两端仍然能联机）
  await page.unroute(HELPER_MANIFEST);
  await interceptManifest(page, (payload, baked) => {
    payload.albums = baked.albums;
    payload.characters = baked.characters.map(({ key, music, card }) => ({ key, music, card }));
  });
  await page.reload();
  await useOtomadsMode(page);
  await expect(page.getByTestId("preset-stats"))
    .toContainText(`${index.counts.trackEntries} / ${index.counts.trackEntries}`);
  expect(await fingerprint(page)).toBe(withoutSnapshot);
});
