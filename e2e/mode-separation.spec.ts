/** B：两个音乐模式的状态互不干扰（状态按模式分键）＋ 列表页跟着模式走。
 *
 * 跑在 chromium 与 firefox 两个 project 上（默认 testDir 下的用例两个引擎都跑，见 playwright.config.ts）。
 * 前置条件：起本地曲库助手，且每条 `page.goto` 都带 `?localmusic=127.0.0.1:8011` ——
 * 音MAD 的默认源**已经改成 CDN**（D141），e2e 一律钉到本机助手（统计也取同源 `/manifest.json`），不依赖外网。
 * 期望值一律**跟着数据走**（D97 的教训：写死 121 / 24 会随数据漂移）。
 */
import { expect, test, type Page } from "@playwright/test";
import { expandSection } from "./ui";


interface Loaded {
  playable: { originals: string[]; otomads: string[] };
  onlyOriginals: string;
}

/** 从同源的生成物里数每个数据集有多少角色，别写死数字。
 *
 * C 之后数据分两份：`/data/*.json` 是原曲数据集，`/data/otomads/*.json` 是音MAD 数据集。
 */
async function loadCounts(page: Page): Promise<Loaded> {
  const read = async (base: string): Promise<string[]> => {
    const payload = await (await page.request.get(`${base}/characters.json`)).json();
    return (payload.characters as { key: string }[]).map((character) => character.key);
  };
  const playable = { originals: await read("/data"), otomads: await read("/data/otomads") };
  const onlyOriginals = playable.originals.find((key) => !playable.otomads.includes(key));
  if (onlyOriginals === undefined) throw new Error("数据里没有'只有原曲曲目'的角色");
  return { playable, onlyOriginals };
}

test("列表页跟着音乐模式：音MAD 下只列有音MAD 曲目的角色", async ({ page }) => {
  const { playable, onlyOriginals } = await loadCounts(page);
  // 数据前提：两个模式的可播角色数不同，否则这条用例证明不了什么
  expect(playable.otomads.length).toBeGreaterThan(0);
  expect(playable.otomads.length).toBeLessThan(playable.originals.length);

  await page.goto("/?localmusic=127.0.0.1:8011");
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

  await page.goto("/?localmusic=127.0.0.1:8011");
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

/** 源封面图集（D153）：**只在音MAD 模式、且源真的给了封面时**出现；选中后卡面就是 B 站图床直链。
 *
 * 期望值跟着**同源生成物**走（不写死"8 套"）：`covers` 还没有就整条跳过 ——
 * 那说明数据仓库还没跑 `fetch_covers`，此时**不该**多出这套图集（这条也被下面第一段断言守着）。
 */
test("卡面图集：源给了封面才多出「B 站封面」，且只在音MAD 模式", async ({ page }) => {
  const payload = await (await page.request.get("/data/otomads/characters.json")).json();
  const covered = ((payload.characters ?? []) as { key: string; covers?: string[] }[])
    .filter((character) => (character.covers?.length ?? 0) > 0);
  test.skip(covered.length === 0, "音MAD 生成物里还没有 covers（数据仓库未跑 fetch_covers / 未重新生成）");
  expect(covered[0]!.covers![0]).toMatch(/^https:\/\//);

  await page.goto("/?localmusic=127.0.0.1:8011");
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  await expandSection(page, "cardset");
  // 原曲模式：这套图集 mode 不匹配 ⇒ 一行都不该有（smoke 里那条"行数 = 现有图集数"同理）
  await expect(page.getByTestId("cardset-row-otomads-cover")).toHaveCount(0);

  // 切到音MAD：出现，且它的三张示例卡直接就是绝对 URL（不拼目录、不做 URL 编码）
  await expandSection(page, "source");
  await page.getByTestId("music-mode-otomads").click();
  await expandSection(page, "cardset");
  const row = page.getByTestId("cardset-row-otomads-cover");
  await expect(row).toBeVisible();
  const images = row.locator("img");
  await expect(images).toHaveCount(3);
  const srcs = await images.evaluateAll((elements) =>
    elements.map((element) => (element as HTMLImageElement).getAttribute("src") ?? ""));
  expect(srcs.filter((src) => src.startsWith("https://")).length).toBe(3);
  // B 站图床按 Referer 拦（带外部 Referer 一律 403）⇒ 卡面图统一不带 Referer
  const policies = await images.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("referrerpolicy")));
  expect(policies).toEqual(["no-referrer", "no-referrer", "no-referrer"]);
});

test("音MAD 模式下不再下载原曲的镜像表（音源层按模式拆的直接收益）", async ({ page }) => {
  // 原曲：镜像表会被取（控制组）
  const originals: string[] = [];
  page.on("request", (request) => {
    if (/\/data\/sources\/[a-z0-9_]+\.json$/.test(new URL(request.url()).pathname)) {
      originals.push(request.url());
    }
  });
  await page.goto("/?localmusic=127.0.0.1:8011");
  await expect.poll(() => originals.length).toBeGreaterThan(0);

  // 切到音MAD（音源注册表里只有本地曲库）→ 那些表一次都不该再取
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  await expandSection(page, "source");
  await page.getByTestId("music-mode-otomads").click();
  await expect(page.getByLabel("local-music-url")).toBeVisible();
  const afterSwitch = originals.length;

  await page.getByRole("tab", { name: "Player", exact: true }).click();
  await page.waitForTimeout(1500);           // 留出"如果会取"的时间
  expect(originals.length).toBe(afterSwitch);

  // 而音MAD 侧的注册表只有本地曲库一个源（切页签会卸载配置页，分区要重新展开）
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  await expandSection(page, "source");
  await expect(page.locator('[data-testid^="source-order-"]')).toHaveCount(1);
});

/** D168：音MAD 的 B 站封面集下，**音频必须跟卡面对应**。
 *
 *  这副牌是"一张卡 = 一首曲目"（D153）：抢拍时看着牌面找歌，所以"这一回合放哪一首"必须就是
 *  **场上那张卡**的那一首。修之前放的是按种子从该角色的全部曲目里挑的一首 —— 牌面（`covers[i]`）
 *  与实际在放的（`music[j]`，i≠j）对不上，用户报的就是这个。
 *
 *  期望值**跟着数据算**（同源 manifest 的 `characters[].covers` 与 `tracks`）：不写死曲名与下标。
 *  判定"对不对应"用卡序：牌桌上的 `data-card-key` 是 `角色-卡序`，音频文件名能反查它是第几首。
 *  牌面按曲目给才记卡序，所以这里必须开**源封面集**（别的图集下按种子选曲是**有意**的）。
 *
 *  回合数取 4：像这条用例这样"只看不点"时，抢拍靠 CPU，每回合一张牌。修之前每回合有
 *  ~1/N（该角色曲目数）的概率**碰巧**对上，4 回合基本兜得住。
 */
test("音MAD 封面集：播放的那一首就是牌桌上那张卡的曲目（D168）", async ({ page }) => {
  // `usePlayer` 造的是 `new Audio()`（不挂 DOM）⇒ 只能在构造函数上截胡
  await page.addInitScript(() => {
    const original = window.Audio;
    const captured: HTMLAudioElement[] = [];
    (window as unknown as { __audios: HTMLAudioElement[] }).__audios = captured;
    (window as unknown as { Audio: unknown }).Audio = function (...args: unknown[]) {
      const element = new original(...(args as []));
      captured.push(element);
      return element;
    };
    (window as unknown as { Audio: { prototype: object } }).Audio.prototype = original.prototype;
  });

  const manifest = await (await page.request.get("http://127.0.0.1:8011/manifest.json")).json() as {
    characters: { key: string; music: (string | string[])[][]; covers?: string[] }[];
    tracks: string[][];
  };
  const byKey = new Map(manifest.characters.map((character) => [character.key, character]));
  /** 音频文件名的磁盘 stem → 这是哪个角色的第几首（`entry[3]` 是 `作者` 那个整串，D135）。 */
  const byStem = new Map<string, { key: string; index: number }>();
  for (const character of manifest.characters) {
    character.music.forEach((entry, index) => {
      const stem = entry[3] ? `${entry[3]} - ${entry[1]}` : String(entry[1]);
      byStem.set(stem, { key: character.key, index });
    });
  }

  await page.goto("/?localmusic=127.0.0.1:8011");
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  await expandSection(page, "source");
  await page.getByTestId("music-mode-otomads").click();
  await expandSection(page, "cardset");
  await page.getByTestId("cardset-row-otomads-cover").click();

  await page.getByRole("tab", { name: "Match", exact: true }).click();
  await page.getByTestId("mode-cpu").click();
  // 按卡组筛选：轮播只留卡槽里还有牌的角色 ⇒ 每一回合那张牌都确实在场上（这条才是被判定的前提）
  await page.getByLabel("filter-by-deck").check();
  await page.getByTestId("random-fill").click();
  await page.getByTestId("fill-cpu-deck").click();
  await page.getByTestId("start-game").click();

  const checked: string[] = [];
  for (let turn = 1; turn <= 4; turn += 1) {
    await expect(page.getByText(new RegExp(`turn #${turn} · turnStart`))).toBeVisible({ timeout: 30_000 });
    const src = await page.waitForFunction(() => {
      const list = (window as unknown as { __audios: HTMLAudioElement[] }).__audios ?? [];
      const audio = list.find((item) => !item.paused && item.currentTime > 0);
      return audio ? audio.src : null;
    }, null, { timeout: 20_000 }).then((handle) => handle.jsonValue() as Promise<string>);
    const stem = decodeURIComponent(new URL(src).pathname.split("/").pop() ?? "").replace(/\.mp3$/, "");

    // 音频是哪一首 → 对应角色的卡序
    const found = byStem.get(stem);
    expect(found, `manifest 里没有这一条音频：${stem}`).toBeDefined();
    const { key: characterKey, index } = found!;

    // 牌桌上这个角色的那张卡（自己或对手的都算 —— 牌桌是两边共用的）
    // `data-card-key` 只有牌桌上有（`DeckGrid`），"未使用卡牌"区没有这个属性 ⇒ 不会误取
    const card = await page.evaluate((key) => {
      const node = document.querySelector(`[data-card-key^="${key}-"]`);
      return node
        ? {
          cardKey: node.getAttribute("data-card-key") ?? "",
          cover: (node.querySelector("img") as HTMLImageElement | null)?.getAttribute("alt") ?? null,
        }
        : null;
    }, characterKey);
    expect(card, `场上应该有 ${characterKey} 的牌（按卡组筛选）`).not.toBeNull();
    expect(card!.cardKey, `回合 ${turn}：放的是第 ${index} 首，场上那张牌就得是第 ${index} 张`)
      .toBe(`${characterKey}-${index}`);
    // 顺带把"卡面 = 那一首的封面"也钉住（用户看到的就是这张图）
    expect(card!.cover).toBe(byKey.get(characterKey)?.covers?.[index] ?? null);
    checked.push(`${characterKey}-${index}`);

    await page.getByTestId("next-turn").click();
  }
  expect(checked).toHaveLength(4);
});
