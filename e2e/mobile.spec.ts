/** 移动端适配（Pixel 7：412×915、触摸、DPR 2.625）。
 *
 * 只跑在 `mobile` project 上（桌面两个 project 用 `testIgnore` 排除这份）。
 * 关注四件事：① 不能有横向溢出；② 应用栏能折成两行且页签可点；
 * ③ 播放控制的进度条必须真的看得见（窄屏曾被 flex 挤成 0 宽）；④ 触摸目标不小于 40px。
 */
import { expect, test } from "@playwright/test";

const TABS = ["播放", "列表", "设置", "游戏"];

test.describe("移动端布局", () => {
  test("四个页面都没有横向溢出", async ({ page }) => {
    for (const tab of TABS) {
      await page.goto("/?locale=zh");
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await page.waitForTimeout(500);
      const metrics = await page.evaluate(() => {
        const root = document.documentElement;
        return { client: root.clientWidth, scroll: root.scrollWidth };
      });
      expect(metrics.scroll, `${tab} 页横向溢出`).toBeLessThanOrEqual(metrics.client + 1);
    }
  });

  test("换行的 tag 行左边缘一致（播放页 + 设置页）", async ({ page }) => {
    // 播放页：当前曲目的专辑 / 类别 / 音源 chip 会换行，换行后必须与首行同一条左边缘
    await page.goto("/?locale=zh");
    await page.getByRole("tab", { name: "播放", exact: true }).click();
    await page.waitForTimeout(500);
    const playerRows = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="player-control"]')!.closest(".MuiPaper-root")!;
      const rows = new Map<number, number[]>();
      for (const chip of panel.querySelectorAll(".MuiChip-root")) {
        const rect = chip.getBoundingClientRect();
        const top = Math.round(rect.top);
        rows.set(top, [...(rows.get(top) ?? []), Math.round(rect.left)]);
      }
      return [...rows.values()].map((lefts) => Math.min(...lefts));
    });
    expect(playerRows.length).toBeGreaterThan(1);                       // 确实换行了
    expect(new Set(playerRows).size).toBe(1);                           // 各行左边缘一致

    // 设置页"数据"分区：五枚 chip 换行后同样对齐
    await page.getByRole("tab", { name: "设置", exact: true }).click();
    await page.getByTestId("section-data-summary").click();
    await page.waitForTimeout(500);
    const configRows = await page.evaluate(() => {
      // 只看那排统计 chip（下面"语言"那一行的 chip 是跟在标签后面的，本来就该缩进）
      const content = document.querySelector('[data-testid="data-chips"]')!;
      const rows = new Map<number, number[]>();
      for (const chip of content.querySelectorAll(".MuiChip-root")) {
        const rect = chip.getBoundingClientRect();
        const top = Math.round(rect.top);
        rows.set(top, [...(rows.get(top) ?? []), Math.round(rect.left)]);
      }
      return [...rows.values()].map((lefts) => Math.min(...lefts));
    });
    expect(configRows.length).toBeGreaterThan(1);
    expect(new Set(configRows).size).toBe(1);
  });

  test("应用栏在窄屏折成两行：页签独占一行、彩蛋用短文案", async ({ page }) => {
    await page.goto("/?locale=zh");
    await page.getByRole("tab", { name: "播放", exact: true }).waitFor();
    const metrics = await page.evaluate(() => {
      const toolbar = document.querySelector(".MuiToolbar-root")!;
      const title = toolbar.querySelector(".MuiTypography-h6")!;
      const tabs = toolbar.querySelector(".MuiTabs-root")!;
      const overline = toolbar.querySelector(".MuiTypography-overline");
      const alice = [...toolbar.querySelectorAll("button")]
        .find((button) => (button.textContent ?? "").includes("Alice"))!;
      const rect = (el: Element) => el.getBoundingClientRect();
      return {
        titleBottom: Math.round(rect(title).bottom),
        tabsTop: Math.round(rect(tabs).top),
        tabsWidth: Math.round(rect(tabs).width),
        viewport: document.documentElement.clientWidth,
        aliceText: (alice.textContent ?? "").trim(),
        overlineHidden: !overline || getComputedStyle(overline).display === "none",
      };
    });
    // 页签在标题下方（折行），并且占满整行
    expect(metrics.tabsTop).toBeGreaterThanOrEqual(metrics.titleBottom - 4);
    expect(metrics.tabsWidth).toBeGreaterThan(metrics.viewport * 0.9);
    expect(metrics.aliceText).toBe("Alice!");      // 窄屏用短文案
    expect(metrics.overlineHidden).toBe(true);     // 指纹在窄屏不占位
  });

  test("播放控制：进度条与音量按钮都真的可见可点", async ({ page }) => {
    await page.goto("/?locale=zh");
    const seek = page.getByTestId("seek-slider");
    const volume = page.getByTestId("volume-toggle");
    await expect(seek).toBeVisible();
    await expect(volume).toBeVisible();
    const boxes = await page.evaluate(() => {
      // 量 Slider 根节点（aria-label 在内部 input 上，尺寸不是控件尺寸）
      const s = document.querySelector('[data-testid="seek-slider"]')!.getBoundingClientRect();
      const v = document.querySelector('[data-testid="volume-toggle"]')!.getBoundingClientRect();
      return { seekWidth: Math.round(s.width), seekHeight: Math.round(s.height),
        volumeWidth: Math.round(v.width), volumeHeight: Math.round(v.height) };
    });
    expect(boxes.seekWidth).toBeGreaterThan(180);   // 整行进度条
    expect(boxes.seekHeight).toBeGreaterThanOrEqual(20);
    expect(boxes.volumeWidth).toBeGreaterThanOrEqual(40);   // 触摸目标
    expect(boxes.volumeHeight).toBeGreaterThanOrEqual(40);
  });

  test("触摸目标：图标按钮/页签/单选 ≥40px，文字按钮 ≥32px（MD2 small）", async ({ page }) => {
    await page.goto("/?locale=zh");
    await page.getByRole("tab", { name: "播放", exact: true }).waitFor();
    const report = await page.evaluate(() => {
      const box = (el: Element) => el.getBoundingClientRect();
      const rows = [...document.querySelectorAll('button, [role="tab"], [role="radio"], .MuiIconButton-root')]
        .map((el) => ({
          text: (el.textContent ?? "").trim().slice(0, 10),
          iconOnly: el.classList.contains("MuiIconButton-root"),
          w: Math.round(box(el).width),
          h: Math.round(box(el).height),
        }))
        .filter((el) => el.w > 0 && el.h > 0);
      return {
        // 图标按钮、页签、单选：触摸目标按 MD2 ≥40dp
        touch: rows.filter((el) => (el.iconOnly || el.text === "") && (el.h < 40 || el.w < 40)),
        // 文字按钮：MD2 small = 32dp（视觉高度即规格，不再另设更小的）
        text: rows.filter((el) => !el.iconOnly && el.text !== "" && el.h < 32),
      };
    });
    expect(report.touch).toEqual([]);
    expect(report.text).toEqual([]);
  });

  test("游戏页：窄屏选卡是「多行面板」，与卡槽同尺寸且不遮挡牌桌", async ({ page }) => {
    await page.goto("/?locale=zh");
    await page.getByRole("tab", { name: "游戏", exact: true }).click();
    await page.getByTestId("deck-setup").waitFor();
    await page.getByTestId("random-fill").click();
    await page.waitForTimeout(400);

    // 收起来时只有底部栏（不占牌桌高度）
    const bar = page.getByTestId("unused-cards-bar");
    await expect(bar).toBeVisible();
    await expect(page.getByTestId("unused-cards-strip")).toBeHidden();

    await page.getByTestId("unused-cards-toggle").tap();
    const grid = page.getByTestId("unused-cards-grid");
    await expect(grid).toBeVisible();

    // 面板规格：4dp 上圆角、30vh 以内、有拖拽把手、**没有遮罩**（模态遮罩就是"突兀"的来源）
    const sheet = await page.evaluate(() => {
      const paper = document.querySelector('[data-testid="unused-cards-sheet"]')!;
      const handle = document.querySelector('[data-testid="unused-cards-handle"]')!;
      const rect = paper.getBoundingClientRect();
      return {
        radius: getComputedStyle(paper).borderTopLeftRadius,
        height: Math.round(rect.height),
        viewport: window.innerHeight,
        handle: `${Math.round(handle.getBoundingClientRect().width)}×${Math.round(handle.getBoundingClientRect().height)}`,
        scrims: document.querySelectorAll(".MuiBackdrop-root").length,
      };
    });
    expect(sheet.radius).toBe("4px");
    expect(sheet.height).toBeLessThanOrEqual(sheet.viewport * 0.35);
    expect(sheet.handle).toBe("32×4");
    expect(sheet.scrims).toBe(0);

    // 多行 + 与卡槽同尺寸**同列数**（"与当前卡槽相同"）
    const layout = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-testid="unused-cards-grid"] > *')];
      const rows = new Set(cards.map((card) => Math.round(card.getBoundingClientRect().top)));
      const columns = new Set(cards.map((card) => Math.round(card.getBoundingClientRect().left)));
      const slot = document.querySelector('[data-testid^="deck-you-card-"]')!.getBoundingClientRect();
      const first = cards[0]!.getBoundingClientRect();
      // 牌桌自己的列数：同一行里有多少张卡
      const deckRowTop = Math.round(slot.top);
      const deckColumns = [...document.querySelectorAll('[data-testid^="deck-you-card-"]')]
        .filter((card) => Math.round(card.getBoundingClientRect().top) === deckRowTop).length;
      return {
        rows: rows.size, cards: cards.length, columns: columns.size,
        cardWidth: Math.round(first.width), slotWidth: Math.round(slot.width), deckColumns,
      };
    });
    expect(layout.rows).toBeGreaterThan(2);              // 多行，不是单行
    expect(layout.cardWidth).toBe(layout.slotWidth);     // 与卡槽同尺寸
    expect(layout.columns).toBe(layout.deckColumns);     // 与卡槽同列数

    // 面板自带"收起"按钮（面板升起后底部栏被盖住，所以收起入口必须在面板里）；
    // 同时面板用 MD2 深色的 elevation 叠加，和页面分得开
    await expect(page.getByTestId("unused-cards-close")).toBeVisible();
    await expect(page.getByTestId("unused-cards-bar")).toHaveCount(0);   // 打开时底部栏让位
    const overlay = await page.evaluate(() =>
      getComputedStyle(document.querySelector('[data-testid="unused-cards-sheet"]')!).backgroundImage);
    expect(overlay).toContain("linear-gradient");

    // 面板不遮牌桌：滚动后点牌桌的卡，牌库真的少一张
    const before = await page.locator('[data-testid^="deck-you-card-"]').count();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    const visible = await page.evaluate(() => {
      const sheetTop = document.querySelector('[data-testid="unused-cards-sheet"]')!.getBoundingClientRect().top;
      return [...document.querySelectorAll('[data-testid^="deck-you-card-"]')]
        .find((card) => card.getBoundingClientRect().bottom < sheetTop - 8)?.getAttribute("data-testid") ?? null;
    });
    expect(visible).not.toBeNull();
    await page.getByTestId(visible!).tap();
    await expect(page.locator('[data-testid^="deck-you-card-"]')).toHaveCount(before - 1);

    // 拖拽把手**真的有用**：往上拖放大到下一档（30vh → 60vh），往下猛拖收起
    const sheetHeight = () =>
      page.evaluate(() => Math.round(
        document.querySelector('[data-testid="unused-cards-sheet"]')!.getBoundingClientRect().height));
    const small = await sheetHeight();
    const dragHandle = async (steps: number[]) => {
      const box = (await page.getByTestId("unused-cards-handle-area").boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (const dy of steps) await page.mouse.move(x, y + dy, { steps: 5 });
      await page.mouse.up();
      await page.waitForTimeout(600);
    };
    await dragHandle([-60, -120, -180]);
    expect(await sheetHeight()).toBeGreaterThan(small * 1.5);   // 吸附到更大的档位
    await dragHandle([80, 200, 320]);                            // 往下拖到底 → 收起
    await expect(grid).toBeHidden();
    await expect(bar).toBeVisible();

    // 再打开，用面板里的"收起"按钮关闭
    await page.getByTestId("unused-cards-toggle").tap();
    await expect(grid).toBeVisible();
    await page.getByTestId("unused-cards-close").tap();

    // 面板跟随"卡牌大小"联动：放大两档后，卡面变大、面板三档高度跟着变高（列数仍与卡槽一致）
    const smallCardWidth = layout.cardWidth;
    for (let index = 0; index < 2; index += 1) {
      await page.getByTestId("card-larger").tap();
      await page.waitForTimeout(200);
    }
    await page.getByTestId("unused-cards-toggle").tap();
    await expect(grid).toBeVisible();
    const grown = await page.evaluate(() => {
      const sheet = document.querySelector('[data-testid="unused-cards-sheet"]')!.getBoundingClientRect();
      const cards = [...document.querySelectorAll('[data-testid="unused-cards-grid"] > *')];
      const slot = document.querySelector('[data-testid^="deck-you-card-"]')!.getBoundingClientRect();
      return {
        height: Math.round(sheet.height),
        cardWidth: Math.round(cards[0]!.getBoundingClientRect().width),
        slotWidth: Math.round(slot.width),
        columns: new Set(cards.map((card) => Math.round(card.getBoundingClientRect().left))).size,
      };
    });
    expect(grown.cardWidth).toBeGreaterThan(smallCardWidth);      // 卡面跟着"卡牌大小"变大
    expect(grown.cardWidth).toBe(grown.slotWidth);               // 仍与卡槽同尺寸
    expect(grown.height).toBeGreaterThan(small);                 // 面板高度跟着变高
    expect(grown.columns).toBe(layout.deckColumns);              // 列数仍与卡槽一致
    await page.getByTestId("unused-cards-close").tap();
    await expect(grid).toBeHidden();
    await expect(bar).toBeVisible();
  });

  test("游戏页：触摸也能玩（点未使用卡进牌库、点牌库卡拿回来）", async ({ page }) => {
    await page.goto("/?locale=zh");
    await page.getByRole("tab", { name: "游戏", exact: true }).click();
    await page.getByTestId("deck-setup").waitFor();

    // 窄屏下按钮文字不折行（整组换行），至少确认三个动作按钮都在
    for (const testId of ["random-fill", "shuffle-deck", "clear-deck"]) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }
    const wrapped = await page.getByTestId("random-fill").evaluate((el) =>
      el.getBoundingClientRect().height > 44);
    expect(wrapped).toBe(false);   // 单行按钮，没有被挤成两行

    // 展开底部面板：点一张未使用卡 → 进自己牌库（面板里的卡就是触摸目标）
    await page.getByTestId("unused-cards-toggle").tap();
    const unused = page.locator('[data-testid^="unused-card-"]');
    await expect(page.getByTestId("unused-cards-grid")).toBeVisible();
    const before = await unused.count();
    expect(before).toBeGreaterThan(100);
    await unused.first().tap();
    await expect(page.getByTestId("deck-you-card-0")).toBeVisible();
    await expect(unused).toHaveCount(before - 1);

    // 收起面板（点拖拽把手）→ 点牌库那张 → 回未使用区
    await page.getByTestId("unused-cards-handle").tap();
    await expect(page.getByTestId("unused-cards-grid")).toBeHidden();
    await page.getByTestId("deck-you-card-0").tap();
    await expect(page.getByTestId("deck-you-empty-0")).toBeVisible();

    // 再展开：数量回到原值
    await page.getByTestId("unused-cards-toggle").tap();
    await expect(page.getByTestId("unused-cards-grid")).toBeVisible();
    await expect(unused).toHaveCount(before);
  });
});

