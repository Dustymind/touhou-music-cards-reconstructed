/** 双引擎冒烟：数据加载、页签切换、关于弹窗、站内公告、预设交互、对战回合。 */
import { captureAudio, waitForPlaying } from "./audio";
import { dragCard } from "./dnd";
import { noticeContent } from "./noticeContent";
import { clearNoticeRecords, dismissNotice, expandSection, shouldAutoSuppressNotice, suppressNotice } from "./ui";
import { aboutContent } from "../src/content/about";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// 站内公告是**模态**且进站自动弹：不处理它，下面每一条用例都会被它挡住（`getByRole("tab", …)`
// 找不到元素）。这里统一在初始化脚本里把每条公告记成"已看过"，于是**本文件里所有用例都不弹**。
// **例外**：三条「站内公告」用例自己管存储（`clearNoticeRecords` 清一次、再靠 `reload` 验证
// "还会不会弹"），文件级这段会在每次导航重跑、把"已看过"写回去 ⇒ 必须放行，见 `shouldAutoSuppressNotice`。
test.beforeEach(async ({ page }) => {
  if (!shouldAutoSuppressNotice()) return;
  await suppressNotice(page, noticeContent.notices);
});

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

test("关于弹窗：应用栏入口打开、每行内容都在、「关闭」键关得掉", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("about-dialog")).toHaveCount(0);

  await page.getByTestId("about-open").click();
  const dialog = page.getByTestId("about-dialog");
  await expect(dialog).toBeVisible();
  // 弹窗里的每一个字都在内容真源里（用户改了人名/标签这里跟着走，不会假红）
  await expect(dialog).toContainText(aboutContent.title.en);
  for (const row of aboutContent.rows) {
    if ("auto" in row) continue;               // 自动行（外置曲库署名）由下面那条用例专门验
    await expect(dialog).toContainText(row.name);
    if (row.label !== undefined) await expect(dialog).toContainText(row.label.en);
  }
  await expect(dialog).toContainText(aboutContent.close.en);
  // 有地址的行是能点的新标签页链接。**按行定位**（`about-row-<下标>`）：
  // 按文字找会撞车（`Dustymind` 是 `Dustymind/touhou-music-…` 的子串，strict mode 直接报两个元素）
  const linkedIndex = aboutContent.rows.findIndex((row) => row.url !== "");
  expect(linkedIndex).toBeGreaterThanOrEqual(0);
  const link = dialog.getByTestId(`about-row-${linkedIndex}`).getByRole("link");
  await expect(link).toHaveAttribute("href", aboutContent.rows[linkedIndex]!.url);
  await expect(link).toHaveAttribute("target", "_blank");

  // MD2 对话框规格：最小宽 280 / 最大宽 560、4dp 圆角、有 elevation、遮罩 32% 黑
  const box = await page.evaluate(() => {
    const style = getComputedStyle(document.querySelector(".MuiDialog-paper")!);
    return {
      minWidth: style.minWidth,
      maxWidth: style.maxWidth,
      radius: style.borderTopLeftRadius,
      elevation: style.boxShadow === "none" ? 0 : 1,
      scrim: getComputedStyle(document.querySelector(".MuiBackdrop-root")!).backgroundColor,
    };
  });
  expect(box).toMatchObject({ minWidth: "280px", maxWidth: "560px", radius: "4px", elevation: 1 });
  expect(box.scrim).toBe("rgba(0, 0, 0, 0.32)");

  // 关闭按键（MD2 操作区在右下）
  await page.getByTestId("about-close").click();
  await expect(dialog).toHaveCount(0);
});

test("关于弹窗：外置曲库（音MAD）署名自动列出，且在「原作」上方", async ({ page }) => {
  // 名单直接从**真源生成物**取（曲包长什么样，这里就比什么），并挑三个真实署名来验
  const data = JSON.parse(readFileSync("data/public/data/otomads/characters.json", "utf8")) as {
    characters: { music: string[] }[];
  };
  const tracks = JSON.parse(readFileSync("data/public/data/otomads/tracks.json", "utf8")) as {
    tracks: Record<string, { author?: string; authors?: string[] }>;
  };
  // 与 `collectPackAuthors` 同一口径：写了 `authors` 就用数组，否则用整串 `author`（S2 起按曲id 取 TrackIndex）
  const authors = [...new Set(data.characters.flatMap((character) => character.music.flatMap(
    (id) => {
      const track = tracks.tracks[id];
      return (track?.authors ?? (track?.author ? [track.author] : [])).filter(Boolean);
    },
  )))];
  expect(authors.length).toBeGreaterThan(10);

  // 音MAD 的默认源现在是 CDN（D141）：这里显式钉到本机助手，测试不依赖外网
  await page.goto("/?localmusic=127.0.0.1:8011");
  // 切到音MAD 模式：本地源（本机助手 8011）这时才会载入 —— 前置条件与另外几条音MAD 用例相同。
  // 音乐模式开关在「音乐源」分区里，分区默认折叠（D47），先展开。
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  await expandSection(page, "source");
  await page.getByTestId("music-mode-otomads").click();
  await page.getByTestId("about-open").click();

  const dialog = page.getByTestId("about-dialog");
  await expect(dialog).toBeVisible();
  const auto = dialog.locator('[data-auto="pack-authors"]');
  await expect(auto).toBeVisible();                          // 助手在跑才有这一段
  // 标签取自内容真源（页面默认 en；写成 `label.zh` 就成了一条只在中文下对的用例）
  const anchor = aboutContent.rows.find((row) => "auto" in row)!;
  await expect(auto).toContainText(anchor.label.en);
  for (const name of authors.slice(0, 3)) await expect(auto).toContainText(name);

  // 位置：它在「原作」那一行**上方**（用户要求）
  const rows = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="about-row-"]')]
    .map((row) => ({ auto: row.getAttribute("data-auto") === "pack-authors", text: row.textContent ?? "" })));
  const autoIndex = rows.findIndex((row) => row.auto);
  const originalIndex = rows.findIndex((row) => row.text.includes("上海アリス幻樂団"));
  expect(autoIndex).toBeGreaterThanOrEqual(0);
  expect(originalIndex).toBeGreaterThan(autoIndex);

  // 名字不是链接（数据里没有作者主页）
  await expect(auto.locator("a")).toHaveCount(0);
});

// ---- 站内公告（`src/content/notices.ts`）----
//
// e2e 的每个用例一个全新 `context`（`localStorage` 是空的），而站内公告**进站就会自动弹**、
// 且是**模态**（挡住页签等控件）。所以：
//   - 整个文件开头有一个 `beforeEach`：把每条公告都记成"已看过"，本文件里**一条都不弹**，
//     别让后来的用例被挡住；
//   - 下面这几条"专门测公告"的用例**按标题被那段放行**（`shouldAutoSuppressNotice`），
//     它们自己用 `clearNoticeRecords` 拿到"进站就会弹"的前置。
//     **不能**让文件级那段继续生效：它是 `addInitScript`、**每次导航都重跑**，
//     会在 `reload` 时把"已看过"写回去，而这两条用例要验的恰恰是"刷新后还会不会弹"。

/** 真源里的第一条公告（e2e 默认 en 界面）。 */
const FIRST_NOTICE = noticeContent.notices[0]!;

/** 弹窗里 `notice-item-<id>` 的出现顺序（= 展示顺序）。弹窗没开时返回空数组。 */
function noticeItemIds(page: Page): Promise<string[]> {
  return page.evaluate(() => [...document.querySelectorAll('[data-testid^="notice-item-"]')]
    .map((node) => node.getAttribute("data-testid")!.replace("notice-item-", "")));
}

test("站内公告：首次进站把**该弹的全弹出来**，底部一行告知 + 单个「关闭」；关掉后刷新不再弹（D185/D186）", async ({ page }) => {
  await clearNoticeRecords(page);
  await page.goto("/");

  const dialog = page.getByTestId("notice-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-notice-mode", "auto");
  // 内容跟着**内容真源**走（用户改了标题/正文，这里不会假红）
  await expect(dialog).toContainText(FIRST_NOTICE.title.en);
  await expect(dialog).toContainText("Close");
  // 条目顺序 = **内容真源顺序**里它们出现的那一段（子序列 ⇒ 顺序一致）。
  // 不在这里重抄"什么算在生效窗口内"：那是 `src/store/notices.ts` 的口径，
  // 而 e2e **不能** import 它 —— 它链到 `src/content/notices` 的 `?raw`，Playwright 解析不了。
  const idsInOrder = await noticeItemIds(page);
  const sourceOrder = noticeContent.notices.map((notice) => notice.id);
  expect(idsInOrder.length).toBeGreaterThan(0);
  expect(idsInOrder).toEqual(sourceOrder.filter((id) => idsInOrder.includes(id)));

  // **D186**：弹窗上只有一个动作。「不再显示」勾选框已弃用 ⇒ 弹窗里一个复选框、一个旧 testid 都不该有。
  //（范围收在弹窗内：播放页本身没有复选框，但别把这条断言寄托在"页面上恰好没有"这种巧合上。）
  await expect(dialog.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(dialog.locator('[data-testid^="notice-dismiss"]')).toHaveCount(0);

  // 三段式仍是「内容 → 告知 → 关闭」：那行告知在关闭键**上方**，且说的是"去右上角的「公告」看"。
  // ⚠️ 开屏一次摆出**全部**该弹的（D185）⇒ 内容可能超过一屏，内容区在**内部滚动**，
  // 底部那行告知的布局位置会落在可视区**之外**（实测过 bottom 998 vs 关闭键 top 645）。
  // 所以必须先把它滚进可视区再量 —— 直接量 rect 会得到"它在关闭键下面"这个假象。
  await page.getByTestId("notice-hint").scrollIntoViewIfNeeded();
  const order = await page.evaluate(() => {
    const hint = document.querySelector('[data-testid="notice-hint"]')!;
    const close = document.querySelector('[data-testid="notice-close"]')!.getBoundingClientRect();
    return { hintBottom: hint.getBoundingClientRect().bottom, closeTop: close.top, hintText: hint.textContent ?? "" };
  });
  expect(order.hintBottom).toBeLessThanOrEqual(order.closeTop + 1);
  // 那句话取自 i18n 真源（本文件默认 en）⇒ 改文案这里不会假红
  expect(order.hintText).toContain("Notices");

  // 关掉 = **永久不再自动弹**（D186 的一扇单向门：不再有"只关不勾 ⇒ 下次还弹"这条路）⇒ 刷新后安静
  await page.getByTestId("notice-close").click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Player", exact: true })).toBeVisible();
  await expect(page.getByTestId("notice-dialog")).toHaveCount(0);
});

test("站内公告：应用栏入口在「关于」之前，且与它同规格（48dp 触控区）", async ({ page }) => {
  await clearNoticeRecords(page);
  await page.goto("/");
  // 先把自动弹的那条关掉，免得挡着应用栏
  await dismissNotice(page);

  const metrics = await page.evaluate(() => {
    const notice = document.querySelector('[data-testid="notice-open"]')!.getBoundingClientRect();
    const about = document.querySelector('[data-testid="about-open"]')!.getBoundingClientRect();
    return {
      noticeLeft: Math.round(notice.left), aboutLeft: Math.round(about.left),
      noticeW: Math.round(notice.width), noticeH: Math.round(notice.height),
      aboutW: Math.round(about.width), aboutH: Math.round(about.height),
    };
  });
  // 在「关于」**左边**（DOM 顺序在它之前）
  expect(metrics.noticeLeft).toBeLessThan(metrics.aboutLeft);
  // 与「关于」同规格：MD2 48dp 触控区
  expect([metrics.noticeW, metrics.noticeH]).toEqual([48, 48]);
  expect([metrics.noticeW, metrics.noticeH]).toEqual([metrics.aboutW, metrics.aboutH]);
});

test("站内公告：入口打开的是**列表**，与开屏那份同一批同一序；关过之后仍能再翻开（D185/D186）", async ({ page }) => {
  await clearNoticeRecords(page);
  await page.goto("/");

  // 开屏那份（`auto`）：D185 修正后**该弹的都一起摆出来**（用户反馈的那个问题）。
  //
  // ⚠️ 这里**不再断言"真源里 ≥2 条"** —— 那是"内容编排"，会随 `draft` / 有效期变，
  // 让测试跟着红是本末倒置（D188 加 `draft` 后就真的只剩一条生效，这条用例当场失去前提）。
  // 现在**只用"真源里实际有几条生效公告"这个事实**（`noticeContent.notices` 就是应用自己的口径），
  // 验的是**结构**：开屏那批 == 入口那批、顺序一致、版式正确。
  // 真源只有一条时，本用例照样覆盖 D185/D186 的全部行为（版式分支由下面的 `asList` 判据覆盖）。
  const expectedIds = noticeContent.notices.map((notice) => notice.id);
  expect(expectedIds.length, "真源里至少要有一条生效公告，否则弹窗根本不会出现").toBeGreaterThan(0);

  const dialog = page.getByTestId("notice-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-notice-mode", "auto");
  const autoIds = await noticeItemIds(page);
  expect(autoIds).toEqual(expectedIds);

  // 关掉（D186：关闭 = 不再自动弹）再点入口 ⇒ 列表版式；两批的**集合与顺序**必须一模一样 ——
  // 关掉只影响"还自动弹不弹"，**不影响入口里看得到的东西**。
  await page.getByTestId("notice-close").click();
  await expect(dialog).toHaveCount(0);
  await page.getByTestId("notice-open").click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-notice-mode", "manual");

  const listIds = await noticeItemIds(page);
  expect(listIds).toEqual(autoIds);

  // 顺序 = **内容真源顺序**里它们出现的那一段（子序列 ⇒ 顺序一致）。
  // 不在这里重抄一遍"什么算在生效窗口内"：那是 `src/store/notices.ts` 的口径，
  // 而 e2e **不能** import 它 —— 它链到 `src/content/notices` 的 `?raw`，Playwright 解析不了。
  const sourceOrder = noticeContent.notices.map((notice) => notice.id);
  expect(listIds).toEqual(sourceOrder.filter((id) => listIds.includes(id)));

  // 列表版式同样是「只有一个动作」（D186）：没有勾选框，只有底部那一行告知 + 单个「关闭」
  await expect(dialog.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(dialog.getByTestId("notice-hint")).toHaveCount(1);

  await page.getByTestId("notice-close").click();
  await expect(dialog).toHaveCount(0);

  // **列表不会被"关过"消耗掉** —— 关掉之后想再看，靠的就是这个入口 + 那行告知（D186 的退路）
  await page.getByTestId("notice-open").click();
  await expect(dialog).toBeVisible();
  expect(await noticeItemIds(page)).toEqual(autoIds);
  await page.getByTestId("notice-close").click();
  await expect(dialog).toHaveCount(0);
});

test("设置页：秘封父项是批量控制，三态开关改变统计", async ({ page }) => {  await page.goto("/");
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

  // 三态：角色曲 → 已禁用（234 条落选；S1/S2 对齐上游 extra 后 236 → 234）
  await page.getByTestId("tri-角色曲-off").click();
  await expect(stats).toContainText("144 / 378");
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

test("对局音频：回合起播带短淡入、倒计时停播带短淡出（真浏览器采样音量）", async ({ page }) => {
  await captureAudio(page);
  /** 每帧记一次"在播那个元素"的音量：音量包络只有真浏览器看得出来（单测在假 Audio 上跑）。 */
  await page.addInitScript(() => {
    const samples: { t: number; volume: number; paused: boolean }[] = [];
    (window as unknown as { __volumes: typeof samples }).__volumes = samples;
    const started = performance.now();
    const tick = (): void => {
      const list = (window as unknown as { __audios?: HTMLAudioElement[] }).__audios ?? [];
      // dev 下 StrictMode 会造两个元素：优先取"没暂停"的那个（缓冲期 currentTime 还是 0，
      // 按 currentTime 排序会挑到已经废掉的那个 ✗）
      const audio = list.find((item) => !item.paused)
        ?? [...list].sort((a, b) => b.currentTime - a.currentTime)[0];
      if (audio) {
        samples.push({
          t: Math.round(performance.now() - started),
          volume: Number(audio.volume.toFixed(3)),
          paused: audio.paused,
        });
      }
      if (performance.now() - started < 25_000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  await page.getByTestId("random-fill").click();
  await page.getByTestId("start-game").click();
  await expect(page.getByText(/turn #1 · turnStart/)).toBeVisible({ timeout: 20_000 });
  await waitForPlaying(page);                       // 回合开始：音乐起播

  // 让这一回合播一会儿，再推进到下一回合的倒计时（音乐被停下 → 该淡出）
  await page.getByTestId("deck-you-card-0").click();
  await page.getByTestId("next-turn").click();
  await expect(page.getByText(/turn #2 ·/)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);                   // 留出淡出 + 暂停的时间

  const samples = await page.evaluate(() =>
    (window as unknown as { __volumes: { t: number; volume: number; paused: boolean }[] }).__volumes);
  const target = Math.max(...samples.map((sample) => sample.volume));   // 目标音量（音量 × 响度系数）

  // 淡入：起播那一刻明显低于目标，之后有一串中间值逐步升上去（硬切就会一步到目标 ✗）
  const playStart = samples.findIndex((sample) => !sample.paused);
  expect(playStart).toBeGreaterThan(0);
  expect(samples[playStart]!.volume).toBeLessThan(target * 0.5);
  const rising = samples.slice(playStart, playStart + 40)
    .filter((sample) => !sample.paused && sample.volume > 0 && sample.volume < target);
  expect(rising.length).toBeGreaterThan(1);

  // 淡出：播过一段之后进入倒计时 —— 暂停之前先"越来越小"，停完包络复位（下次起播不是哑的）
  const pauseAfter = samples.findIndex((sample, index) => index > playStart && sample.paused);
  expect(pauseAfter).toBeGreaterThan(playStart);
  const falling = samples.slice(Math.max(playStart, pauseAfter - 25), pauseAfter)
    .filter((sample) => sample.volume > 0 && sample.volume < target);
  expect(falling.length).toBeGreaterThan(1);
  expect(samples[pauseAfter - 1]!.volume).toBeLessThan(target * 0.3);
  expect(samples.slice(pauseAfter, pauseAfter + 6).some((sample) => sample.volume === target)).toBe(true);
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
  for (const label of ["数据", "卡面设置", "音乐源", "音乐选择预设", "仅单曲模式"]) {
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


/** 等元素上的 CSS 动画跑完再量尺寸：卡片滑入是 0.3s 的 translateX，量早了会差 10+ px。 */
async function settledAnimations(page: Page, testId: string): Promise<void> {
  await page.waitForFunction((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`);
    return element !== null && element.getAnimations().every((animation) => animation.playState !== "running");
  }, testId, { timeout: 10_000 });
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
      ids: ["dairi-sd", "dairi", "enbu", "enbu-dolls", "thbwiki-sd", "zun", "otomads"].map((id) =>
        document.querySelector(`[data-testid="cardset-title-${id}"]`)?.textContent?.trim() ?? ""),
    };
  });
  // 6 套上游图集 + 1 套本项目自己的音MAD 本地图集（素材用户自己放）
  expect(menu.rows).toBe(7);
  expect(menu.examples).toEqual([3, 3, 3, 3, 3, 3, 3]);
  expect(menu.radioCount).toBe(7);                       // MD2：多选一用单选组
  expect(menu.ids).toEqual(["dairi-sd", "dairi", "enbu", "enbu-dolls", "thbwiki-sd", "zun", "otomads"]);
  expect(menu.description).toContain("Free super-deformed tachies from dairi Twitter");
  expect(menu.currentChecked).toBe(true);
  expect(menu.otherChecked).toBe(false);

  // 示例卡强制右对齐（每行最后一图的右边缘 = 整行右边缘），文字位置保持不变
  const alignment = await page.evaluate(() => {
    const ids = ["dairi-sd", "dairi", "enbu", "enbu-dolls", "thbwiki-sd", "zun", "otomads"];
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
  // 音MAD 的默认源现在是 CDN（D141）：e2e 一律 `?localmusic=` 钉到本机助手（先 `pnpm local`），
  // 不依赖外网；本机助手的 manifest 就是同一批 86 首。
  const localRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/manifest.json")) localRequests.push(request.url());
  });

  await page.goto("/?localmusic=127.0.0.1:8011");
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  await expandSection(page, "source");
  await page.getByTestId("music-mode").waitFor();

  // 默认原曲：只有镜像曲目（378 条），不请求本地曲库
  await expect(page.getByTestId("music-mode-originals")).toBeVisible();
  await expandSection(page, "preset");
  await expect(page.getByTestId("preset-stats")).toContainText("378 / 378");
  expect(localRequests).toHaveLength(0);

  // 切到音MAD：只剩**本地曲库曲包**里的曲目，并自动去取本地曲库的 manifest（这里是覆盖后的本机助手）。
  // 曲目条数**跟着数据走**（用户会往 .music/ 里继续加音MAD，写死 24 会随数据漂移 ✗）：
  // 从 manifest 数一遍，再和设置页的统计对齐。
  const manifest = await page.request.get("/manifest.json");
  expect(manifest.ok()).toBe(true);
  const packedTracks = ((await manifest.json()) as { tracks: unknown[] }).tracks.length;
  expect(packedTracks).toBeGreaterThan(0);

  await page.getByTestId("music-mode-otomads").click();
  await expect(page.getByTestId("music-mode-local-hint")).toBeVisible();
  await expect.poll(async () => (await page.getByTestId("preset-stats").textContent()) ?? "")
    .toContain(`${packedTracks} / ${packedTracks}`);
  await expect.poll(() => localRequests.length).toBeGreaterThan(0);
  expect(localRequests[0]).toBe("http://127.0.0.1:8011/manifest.json");

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

test("本地曲库地址：默认走 CDN，?localmusic= 可指向本机助手，「重置」回默认", async ({ page }) => {
  // 音MAD 的默认源现在是 **CDN**（D141，注册表里的 `table_url`）：
  // 默认路径挡在本机 ⇒ 这条用例不依赖外网；覆盖路径仍指向本机助手（本机分开跑 dev 的用法）。
  const CDN = "https://otomads-cdn.tsukinomiyako-mangesui.top";
  await page.route(`${CDN}/**`, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({ schema: 1, pack: "otomads", tracks: [] }),
  }));
  const cdnRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(`${CDN}/`)) cdnRequests.push(request.url());
  });

  await page.goto("/");
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  await expandSection(page, "source");
  // 音源层按模式拆（契约 sources-separation-v1.md）：本地地址栏只在音MAD（注册表里有本地源）时出现
  await page.getByTestId("music-mode-otomads").click();
  const field = page.getByLabel("local-music-url");
  await expect(field).toBeVisible();
  await expect(field).toHaveValue("");                                    // 空 = 不覆盖（默认值只有这一种写法）
  await expect(field).toHaveAttribute("placeholder", `${CDN}/manifest.json`);   // 默认值就在 placeholder 里
  await expect.poll(() => cdnRequests.length).toBeGreaterThan(0);
  expect(cdnRequests[0]).toBe(`${CDN}/manifest.json`);                    // 默认真的去取 CDN

  // 行内规格：输入框 → 「重置」→「应用」（主操作最右），MD2 8dp 栅格 + small 尺寸
  // （filled 输入框 small 实测 48dp、文字/描边按钮 small 32dp、三者中线对齐 ⇒ 按钮不撑高这一行）
  const geometry = await page.evaluate(() => {
    const round = (value: number) => Math.round(value);
    const root = document.documentElement;
    const line = document.querySelector('[data-testid="local-music-url"]')!;
    const input = line.querySelector(".MuiInputBase-root")!.getBoundingClientRect();
    const resetButton = document.querySelector<HTMLButtonElement>('[data-testid="local-music-reset"]')!;
    const reset = resetButton.getBoundingClientRect();
    const apply = document.querySelector('[data-testid="local-music-apply"]')!.getBoundingClientRect();
    return {
      inputHeight: round(input.height),
      resetHeight: round(reset.height),
      applyHeight: round(apply.height),
      resetGap: round(reset.left - input.right),
      applyGap: round(apply.left - reset.right),
      centered: round(input.top + input.height / 2) === round(reset.top + reset.height / 2)
        && round(reset.top + reset.height / 2) === round(apply.top + apply.height / 2),
      insideViewport: round(line.getBoundingClientRect().right) <= root.clientWidth,
      resetDisabled: resetButton.disabled,
    };
  });
  expect(geometry.inputHeight).toBe(48);
  expect([geometry.resetHeight, geometry.applyHeight]).toEqual([32, 32]);
  expect([geometry.resetGap, geometry.applyGap]).toEqual([8, 8]);   // 8dp 栅格；正值同时钉住"重置在应用左侧"
  expect(geometry.centered).toBe(true);
  expect(geometry.insideViewport).toBe(true);
  expect(geometry.resetDisabled).toBe(true);                        // 已经是默认 ⇒ 没什么可重置

  // 覆盖：?localmusic=127.0.0.1:8011 → 打到本机助手（本机分开跑 dev / 想用自己的曲库时）
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
  await page.getByTestId("music-mode-otomads").click();
  // 设置页回显的是"存档里的覆盖值"
  await expect(field).toHaveValue("127.0.0.1:8011");
  await expect(page.getByTestId("local-music-reset")).toBeEnabled();
  await expect.poll(() => overridden.length).toBeGreaterThan(0);
  expect(overridden[0]).toContain("http://127.0.0.1:8011/manifest.json");

  // 「重置」= 清掉存档里的覆盖 ⇒ 回到**数据里的默认（CDN）**；按钮随即变灰。
  // 地址栏里的 `?localmusic=` 不动（刷新后仍按参数生效 —— "URL 参数优先于存档"那条规则没变，D55）。
  const afterReset: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(`${CDN}/`)) afterReset.push(request.url());
  });
  await page.getByTestId("local-music-reset").click();
  await expect(field).toHaveValue("");
  await expect(page.getByTestId("local-music-reset")).toBeDisabled();
  await expect.poll(() => afterReset.length).toBeGreaterThan(0);
  expect(afterReset[0]).toBe(`${CDN}/manifest.json`);
});

test("音乐源回退顺序：显示用源名称，重排不打乱开关（用户反馈后）", async ({ page }) => {
  // 这一条会切到音MAD：钉到本机助手（D141 起默认源是 CDN），别依赖外网
  await page.goto("/?locale=zh&localmusic=127.0.0.1:8011");
  await page.getByRole("tab", { name: "设置", exact: true }).click();
  await expandSection(page, "source");
  const display = page.getByTestId("source-fallback-order");
  await expect(display).toBeVisible();

  // 显示的是源名称 + 顺序编号，而不是内部 id
  await expect(display).toContainText("网易云音乐");
  await expect(display).toContainText("→");
  for (const internalId of ["netease163", "thbwiki"]) {
    await expect(display).not.toContainText(internalId);
  }

  // 行的顺序 = 回退顺序；编号只是位置（上移移动的是"源"本身）
  const rowNames = () => page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="source-order-"]')].map((badge) => ({
      number: (badge.textContent ?? "").trim(),
      name: badge.closest(".MuiBox-root")?.querySelector(".MuiTypography-body2")?.textContent?.trim(),
    })));
  // 原曲注册表里只有两个远程镜像（本地源属于音MAD，见 sources-separation-v1.md）
  expect(await rowNames()).toEqual([
    { number: "1", name: "网易云音乐" },
    { number: "2", name: "THBWiki" },
  ]);

  await page.getByLabel("thbwiki-up").click();
  await expect(display).toContainText("1THBWiki");
  // THBWiki 这一行真的挪到了第一位，编号仍是 1..2
  expect(await rowNames()).toEqual([
    { number: "1", name: "THBWiki" },
    { number: "2", name: "网易云音乐" },
  ]);

  // 第一个源不能再上移，最后一个源不能再下移
  await expect(page.getByLabel("thbwiki-up")).toBeDisabled();
  await expect(page.getByLabel("netease163-down")).toBeDisabled();

  // 关掉 THBWiki 不会改变它在回退顺序里的位置
  const orderBefore = (await display.textContent()) ?? "";
  await page.locator('[aria-label="thbwiki-enabled"]').click({ force: true });
  await expect(display).toHaveText(orderBefore);
  await expect(page.getByTestId("source-status-thbwiki")).toHaveText("off");

  // 切到音MAD：这一侧**只有**本地曲库一个源（不再有"强制打开"的标记），本地地址栏同时出现
  await page.getByTestId("music-mode-otomads").click();
  await expect(page.getByLabel("local-music-url")).toBeVisible();
  expect(await rowNames()).toEqual([{ number: "1", name: "本地曲库" }]);
  await expect(page.locator('[data-testid^="source-state-"]')).toContainText("已启用");
  // 用户自己把它关掉也不会被拦着，但会给一行提示
  await page.locator('[aria-label="local-enabled"]').click();
  await expect(page.getByTestId("source-none-enabled")).toBeVisible();
});

test("MD2 细节：下拉标签入框、搜索框居中、边框可见（用户反馈后）", async ({ page }) => {
  // 末尾会切到音MAD 看源行：钉到本机助手（D141 起默认源是 CDN），别依赖外网
  await page.goto("/?localmusic=127.0.0.1:8011");

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
      slotWidth: getComputedStyle(slot).borderTopWidth,
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
  // 空卡槽：用户反馈过两次"边框看不见/太虚太细" ⇒ 现在 2dp + 45%（值来自主题的 `--tmc-slot`）
  expect(game.slotBorder).toBe("rgba(255, 255, 255, 0.45)");
  expect(game.slotWidth).toBe("2px");

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
  // 原曲注册表里**两个**远程镜像（D172 移除了 Cloudflare R2；本地源属于音MAD，见 sources-separation-v1.md）
  expect(orderBadges.map((badge) => badge.text)).toEqual(["1", "2"]);
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
  // （"按卡组筛选"现在是 MD2 开关，不是按钮 —— 它单独有开关规格断言，见下一条用例）
  await page.getByTestId("mode-cpu").click();
  const gameMetrics = await readMetrics(["start-game", "stop-game", "card-smaller", "card-larger",
    "random-fill", "shuffle-deck", "clear-deck", "fill-cpu-deck", "shuffle-cpu-deck", "clear-cpu-deck",
    "next-turn", "give-cards"]);
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
      ["fill-cpu-deck", "shuffle-cpu-deck"], ["next-turn", "give-cards"], ["give-cards", "filter-by-deck"],
      ["start-game", "stop-game"]]) {
      buttonGaps.push(gapBetween(a, b));
    }
    // MD2 开关（开关 + 文本标签）：与同组按钮同高、垂直居中（MUI 默认 -11px 边距已被抵消）
    const switchLabel = document.querySelector('[data-testid="filter-by-deck"]')!;
    const switchInput = switchLabel.querySelector("input")!;
    const s = switchLabel.getBoundingClientRect();
    const g = document.querySelector('[data-testid="give-cards"]')!.getBoundingClientRect();
    return {
      labelGaps: [...new Set(labelGaps)],
      centerOffsets: [...new Set(centerOffsets)],
      buttonHeights: [...new Set(buttonHeights)],
      buttonGaps: [...new Set(buttonGaps)],
      chipHeight: Math.round(document.querySelector('[data-testid="deck-size"]')!.getBoundingClientRect().height),
      switchHeight: Math.round(s.height),
      switchCenterOffset: Math.round((s.top + s.height / 2) - (g.top + g.height / 2)),
      switchLabelFont: getComputedStyle(switchLabel.querySelector(".MuiFormControlLabel-label")!).fontSize,
      switchRole: switchInput.getAttribute("role"),
      switchChecked: (switchInput as HTMLInputElement).checked,
    };
  });

  expect(measured.labelGaps).toEqual([8]);      // 标题与它后面那组按钮：统一 8px
  expect(measured.centerOffsets).toEqual([0]);  // 标题与按钮垂直居中对齐
  expect(measured.buttonHeights).toEqual([36]); // 高度统一（MD2 36dp）
  expect(measured.buttonGaps).toEqual([8]);     // 同组按钮/开关之间：MD2 8dp
  expect(measured.chipHeight).toBe(36);         // chip 与按钮同高
  expect(measured.switchHeight).toBe(36);       // 开关行与按钮同高（MD2 36dp）
  expect(measured.switchCenterOffset).toBe(0);  // 开关与按钮垂直居中对齐
  expect(measured.switchLabelFont).toBe("14px"); // MD2 标签 14sp
  expect(measured.switchRole).toBe("switch");   // 真的是开关，不是按钮
  expect(measured.switchChecked).toBe(false);   // 默认关
});

test("联机栏：PeerJS 开关按 MD2 规格对齐（8dp 栅格、不贴名称框）", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  await page.getByTestId("mode-multi").click();
  await expect(page.getByTestId("lobby")).toBeVisible();

  const measured = await page.evaluate(() => {
    const field = document.querySelector('input[aria-label="net-name"]')!.closest(".MuiFormControl-root")!;
    const switchLabel = document.querySelector('input[aria-label="net-peer-mode"]')!.closest("label")!;
    const fieldRect = field.getBoundingClientRect();
    const switchRect = switchLabel.getBoundingClientRect();
    const hostRect = document.querySelector('[data-testid="net-host"]')!.getBoundingClientRect();
    // 标签写成 `label={字符串}` 时 MUI 会给它 `MuiFormControlLabel-label` 类；
    // 直接塞一个 Typography 进去就没有那个类（样式 helper 也管不到它）—— 两种都量
    const labelPart = switchLabel.querySelector(".MuiFormControlLabel-label") ?? switchLabel.lastElementChild!;
    const textPart = labelPart.firstElementChild ?? labelPart;
    return {
      gapFromField: Math.round(switchRect.left - fieldRect.right),   // 名称框 → 开关行
      gapToHost: Math.round(hostRect.left - switchRect.right),       // 开关行 → 建立房间
      centerOffset: Math.round((switchRect.top + switchRect.height / 2) - (fieldRect.top + fieldRect.height / 2)),
      switchHeight: Math.round(switchRect.height),
      labelFont: getComputedStyle(labelPart).fontSize,
      textFont: getComputedStyle(textPart).fontSize,
      labelClass: labelPart.className,
    };
  });

  // MUI 的 FormControlLabel 默认 margin-left: -11px（把涟漪对齐到文字）：
  // 不抵消的话 8dp 栅格被吃掉，开关会**压到名称框上**（实测 -3px ✗）；右侧还默认留 16px → 24px ✗
  expect(measured).toEqual({
    gapFromField: 8,                                                // MD2 8dp 栅格
    gapToHost: 8,                                                   // 右侧同样是 8dp
    centerOffset: 0,                                                // 与名称框垂直居中对齐
    switchHeight: 36,                                               // 开关行与同排按钮同高（MD2 36dp）
    labelFont: "14px",                                              // MD2 标签 14sp
    textFont: "14px",                                               // 标签文字本身也是 14sp（不是 caption 12sp）
    labelClass: expect.stringContaining("MuiFormControlLabel-label"), // 标签得走 MUI 的标签节点
  });
});

test("按卡组筛选开关：开=轮播收窄到卡槽角色，关=恢复完整轮播", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  await page.getByTestId("deck-setup").waitFor();

  const rotationText = async (): Promise<string> =>
    (await page.getByTestId("rotation-count").textContent()) ?? "";
  const before = await rotationText();
  await page.getByTestId("random-fill").click();

  // 打开开关：轮播只剩卡槽里还有牌的角色（数量变小）
  await page.getByLabel("filter-by-deck").check();
  await expect(page.getByLabel("filter-by-deck")).toBeChecked();
  const narrowed = await rotationText();
  expect(narrowed).not.toBe(before);

  // 开局会重洗轮播并清空临时禁用 —— 开关还开着，就该立刻按当前卡槽重筛（D124）：
  // 开关不变、轮播不回满（否则开关显示与实际轮播分叉）
  await page.getByTestId("start-game").click();
  await expect(page.getByText(/turn #0 · countdown/)).toBeVisible();
  await expect(page.getByLabel("filter-by-deck")).toBeChecked();
  await expect(page.getByTestId("rotation-count")).toHaveText(narrowed);
  await page.getByTestId("stop-game").click();          // 回到选牌阶段，继续验"关=恢复完整"

  // 关掉开关：临时禁用清空，轮播恢复完整
  await page.getByLabel("filter-by-deck").uncheck();
  await expect(page.getByLabel("filter-by-deck")).not.toBeChecked();
  await expect(page.getByTestId("rotation-count")).toHaveText(before);
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
  // 卡片是**滑入**的（translateX 12% / 0.3s）：动画没结束就量，会把 10+ px 的位移当成"没居中" ✗
  await settledAnimations(page, "current-card");
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
