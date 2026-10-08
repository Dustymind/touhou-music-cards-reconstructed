/** 移动端适配（Pixel 7：412×915、触摸、DPR 2.625）。
 *
 * 只跑在 `mobile` project 上（桌面两个 project 用 `testIgnore` 排除这份）。
 * 关注四件事：① 不能有横向溢出；② 应用栏能折成两行且页签可点；
 * ③ 播放控制的进度条必须真的看得见（窄屏曾被 flex 挤成 0 宽）；④ 触摸目标不小于 40px。
 */
import { expect, test } from "@playwright/test";

import { aboutContent } from "../src/content/about";
import { noticeContent } from "./noticeContent";
import { clearNoticeRecords, expandSection, shouldAutoSuppressNotice, suppressNotice } from "./ui";

const TABS = ["播放", "列表", "设置", "游戏"];

// 站内公告弹窗是模态的，会在每次 page.goto 时自动打开并抢焦点（每个测试的 context 都是新的
// ⇒ localStorage 也是空的）。本文件只有一条公告用例，它自己管存储（`clearNoticeRecords`）；
// 其余用例一律先压制掉，免得被弹窗挡住触摸目标 —— 放行规则见 `shouldAutoSuppressNotice`。
test.beforeEach(async ({ page }) => {
  if (!shouldAutoSuppressNotice()) return;
  await suppressNotice(page, noticeContent.notices);
});

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

  test("设置页展开音源分区后，320dp 仍不横向溢出", async ({ page }) => {
    // 上面那条只走四个页签的**默认折叠**状态，而且跑在 Pixel 7（412dp）上 —— 音源分区那一排
    // （编号 + 名称 + 状态 + 开关 + 上移 + 下移，六件东西）在 412dp 正好放得下（可用 330px、要 290px），
    // 到 360dp 就要 314px + 40px 间隙 ⇒ 放不下。改前实测（chromium，`scrollWidth − clientWidth`）：
    // en 320dp **49**、en 360dp **9**；折行之后两个宽度都是 **0**。
    //
    // **故意用默认的 en**：这一排的标签在 en 下最长（开关的 `Enabled` 105px vs `已启用` 90px），
    // 是溢出最厉害的那一侧（zh 在 320dp 只差 1px，根本抓不到这条）。
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");
    await page.getByRole("tab", { name: "Config", exact: true }).click();
    await expandSection(page, "source");
    const metrics = await page.evaluate(() => {
      const root = document.documentElement;
      return { client: root.clientWidth, scroll: root.scrollWidth };
    });
    expect(metrics.scroll, "音源分区展开后的整页").toBeLessThanOrEqual(metrics.client + 1);
  });

  test("设置页换行的 tag 行左边缘一致", async ({ page }) => {
    await page.goto("/?locale=zh");
    await page.getByRole("tab", { name: "设置", exact: true }).click();
    await expandSection(page, "data");
    const configRows = await page.evaluate(() => {
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

  test("设置页本地曲库地址：窄屏三个控件仍在一行、间隙 8dp、右侧不出屏", async ({ page }) => {
    // 这一行是「输入框 → 重置 → 应用」：加第三个控件后要确认窄屏没被挤换行、也没顶出视口
    // （只量这一行自己的右边缘：音源分区展开后页面还有**别的**历史溢出，见 HANDOVER 未决项）
    for (const width of [412, 320]) {
      await page.setViewportSize({ width, height: 915 });
      // 会切到音MAD：钉到本机助手（D141 起默认源是 CDN），别依赖外网
      await page.goto("/?locale=zh&localmusic=127.0.0.1:8011");
      await page.getByRole("tab", { name: "设置", exact: true }).click();
      await page.getByTestId("section-source-summary").click();
      await page.waitForTimeout(400);
      // 本地源属于音MAD（契约 sources-separation-v1.md）：切过去这一行才挂载
      await page.getByTestId("music-mode-otomads").click();
      const metrics = await page.evaluate(() => {
        const round = (value: number) => Math.round(value);
        const root = document.documentElement;
        const line = document.querySelector('[data-testid="local-music-url"]')!;
        const input = line.querySelector(".MuiInputBase-root")!.getBoundingClientRect();
        const reset = document.querySelector('[data-testid="local-music-reset"]')!.getBoundingClientRect();
        const apply = document.querySelector('[data-testid="local-music-apply"]')!.getBoundingClientRect();
        const middle = (rect: DOMRect) => round(rect.top + rect.height / 2);
        return {
          centered: middle(input) === middle(reset) && middle(reset) === middle(apply),
          gaps: [round(reset.left - input.right), round(apply.left - reset.right)],
          heights: [round(input.height), round(reset.height), round(apply.height)],
          right: round(line.getBoundingClientRect().right),
          viewport: root.clientWidth,
        };
      });
      expect(metrics.centered, `${width}dp 这一行换行了`).toBe(true);
      expect(metrics.gaps, `${width}dp 的间隙不是 8dp`).toEqual([8, 8]);
      expect(metrics.heights, `${width}dp 的控件高度变了`).toEqual([48, 32, 32]);
      expect(metrics.right, `${width}dp 顶出视口`).toBeLessThanOrEqual(metrics.viewport);
    }
  });

  test("关于弹窗：窄屏放得下、不横向溢出、关闭键点得到", async ({ page }) => {
    await page.goto("/?locale=zh");
    await page.getByTestId("about-open").tap();
    const dialog = page.getByTestId("about-dialog");
    await expect(dialog).toBeVisible();
    // 第一行的标签（跟着内容真源走，用户改了标签这个用例不会假红）
    await expect(dialog).toContainText(aboutContent.rows[0]!.label.zh);

    // 入场是 MD2 的"淡入 + 从 80% 放大"（`Grow`：scale 0.75 → 1，150ms），而且这个 scale 挂在
    // **`.MuiDialog-container`** 上（不是纸张上 —— 纸张的 transform 恒为 none，盯它等于没等）。
    // 动画没落位就量尺寸会小一圈：实测关闭键量出 **27px = 36 × 0.75**，会被误判成"触摸目标不达标"。
    // 与播放页卡面那条用例同一个口径：poll 到缩放归 1 为止，而不是白等一个固定时长。
    await expect.poll(async () => page.evaluate(() => {
      const matrix = new DOMMatrix(getComputedStyle(document.querySelector(".MuiDialog-container")!).transform);
      return matrix.a === 1 && matrix.d === 1 && matrix.e === 0 && matrix.f === 0;
    })).toBe(true);

    const metrics = await page.evaluate(() => {
      const paper = document.querySelector(".MuiDialog-paper")!.getBoundingClientRect();
      const close = document.querySelector('[data-testid="about-close"]')!.getBoundingClientRect();
      const root = document.documentElement;
      return {
        width: Math.round(paper.width),
        viewport: root.clientWidth,
        closeHeight: Math.round(close.height),
        scroll: root.scrollWidth,
        client: root.clientWidth,
      };
    });
    // MD2：最小宽 280；两侧各留 24dp 边距（MUI 默认 32dp，手机上会把对话框压得更窄）
    expect(metrics.width).toBeGreaterThanOrEqual(280);
    expect(metrics.width).toBeLessThanOrEqual(metrics.viewport - 48 + 1);
    expect(metrics.closeHeight).toBeGreaterThanOrEqual(32);         // MD2 文字按钮 small = 32dp
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.client + 1); // 弹窗打开时也不横向溢出

    // 关闭键真的能用（点一下弹窗消失）
    await page.getByTestId("about-close").tap();
    await expect(dialog).toHaveCount(0);
  });

  test("关于弹窗：外置曲库署名很长时，内容区滚动、关闭键仍在（音MAD + 助手在跑）", async ({ page }) => {
    // 音MAD 的默认源现在是 CDN（D141）：这里钉到本机助手，测试不依赖外网
    await page.goto("/?locale=zh&localmusic=127.0.0.1:8011");
    // 切到音MAD 模式（本地源这时才载入；前置条件同其它音MAD 用例：先 `pnpm local`）
    await page.getByRole("tab", { name: "设置", exact: true }).click();
    await expandSection(page, "source");
    await page.getByTestId("music-mode-otomads").click();
    await page.getByTestId("about-open").tap();

    const dialog = page.getByTestId("about-dialog");
    await expect(dialog.locator('[data-auto="pack-authors"]')).toBeVisible();
    await expect.poll(async () => page.evaluate(() =>
      new DOMMatrix(getComputedStyle(document.querySelector(".MuiDialog-container")!).transform).a,
    )).toBe(1);

    const metrics = await page.evaluate(() => {
      const paper = document.querySelector(".MuiDialog-paper")!.getBoundingClientRect();
      const content = document.querySelector(".MuiDialogContent-root")!;
      const close = document.querySelector('[data-testid="about-close"]')!.getBoundingClientRect();
      const root = document.documentElement;
      return {
        paperHeight: Math.round(paper.height),
        viewportHeight: root.clientHeight,
        contentScrolls: content.scrollHeight > content.clientHeight,
        closeTop: Math.round(close.top),
        closeBottom: Math.round(close.bottom),
        scroll: root.scrollWidth,
        client: root.clientWidth,
      };
    });
    // 弹窗不超出屏幕；长名单在内容区**内部滚动**，关闭键始终留在屏幕里
    expect(metrics.paperHeight).toBeLessThanOrEqual(metrics.viewportHeight);
    expect(metrics.contentScrolls).toBe(true);
    expect(metrics.closeBottom).toBeLessThanOrEqual(metrics.viewportHeight);
    expect(metrics.closeTop).toBeGreaterThan(0);
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.client + 1);

    await page.getByTestId("about-close").tap();
    await expect(dialog).toHaveCount(0);
  });

  test("站内公告弹窗：窄屏放得下、告知行与关闭键都在屏内、触摸目标达标", async ({ page }) => {
    // 文件级 `beforeEach` 按标题放过了这条用例（`shouldAutoSuppressNotice`）—— 它**要**公告弹。
    // 这里再清一次记录，保证进站时 `localStorage` 是干净的 ⇒ 一定自动弹出。
    await clearNoticeRecords(page);
    await page.goto("/?locale=zh");

    const dialog = page.getByTestId("notice-dialog");
    await expect(dialog).toBeVisible();

    // 入场是 MD2 的 Grow（scale 0.75 → 1，150ms），挂在 `.MuiDialog-container` 上 ——
    // 动画没落位就量尺寸会小一圈（与「关于弹窗」那条用例同一个口径：poll 到缩放归 1）。
    await expect.poll(async () => page.evaluate(() => {
      const matrix = new DOMMatrix(getComputedStyle(document.querySelector(".MuiDialog-container")!).transform);
      return matrix.a === 1 && matrix.d === 1 && matrix.e === 0 && matrix.f === 0;
    })).toBe(true);

    // 开屏可能是**多条**（D185），正文比「关于」长 ⇒ 底部那行告知会被折在内容区的滚动带下面。
    // 它在内容区**内部滚动**（`DialogContent dividers`），先滚进可视区再量位置。
    const hint = page.getByTestId("notice-hint");
    await hint.scrollIntoViewIfNeeded();

    const metrics = await page.evaluate(() => {
      const paper = document.querySelector(".MuiDialog-paper")!.getBoundingClientRect();
      const close = document.querySelector('[data-testid="notice-close"]')!.getBoundingClientRect();
      const hintBox = document.querySelector('[data-testid="notice-hint"]')!.getBoundingClientRect();
      const root = document.documentElement;
      return {
        width: Math.round(paper.width),
        viewport: root.clientWidth,
        viewportHeight: root.clientHeight,
        closeHeight: Math.round(close.height),
        closeTop: Math.round(close.top),
        closeBottom: Math.round(close.bottom),
        hintBottom: Math.round(hintBox.bottom),
        // 范围收在弹窗内（别把断言寄托在"页面上恰好没有复选框"上）
        checkboxes: document.querySelectorAll('.MuiDialog-paper input[type="checkbox"]').length,
        scroll: root.scrollWidth,
        client: root.clientWidth,
      };
    });
    // MD2：最小宽 280；两侧各留 24dp 边距
    expect(metrics.width).toBeGreaterThanOrEqual(280);
    expect(metrics.width).toBeLessThanOrEqual(metrics.viewport - 48 + 1);
    // 关闭键 ≥32dp（MD2 文字按钮 small）
    expect(metrics.closeHeight).toBeGreaterThanOrEqual(32);
    // **D186**：弹窗上只有一个动作 —— 勾选框已弃用（也不再要求它 ≥40dp），这里只留"一个都没有"的守卫
    expect(metrics.checkboxes).toBe(0);
    // 不横向溢出；告知行与关闭键都在屏内
    expect(metrics.scroll).toBeLessThanOrEqual(metrics.client + 1);
    expect(metrics.hintBottom).toBeLessThanOrEqual(metrics.viewportHeight);
    expect(metrics.closeBottom).toBeLessThanOrEqual(metrics.viewportHeight);
    // 三段式：告知行在关闭键**上方**（原来是"勾选框在关闭键上方"，D186 换成了这行字）
    expect(metrics.hintBottom).toBeLessThanOrEqual(metrics.closeTop + 1);
    // 那句话在窄屏也在，且指向右上角的入口（中文界面 ⇒ 两个关键词都取自 i18n 真源）
    await expect(hint).toContainText("右上角");
    await expect(hint).toContainText("公告");

    // 关闭键点得到（D186：关闭 = 不再自动弹）
    await page.getByTestId("notice-close").tap();
    await expect(dialog).toHaveCount(0);

    // 入口按钮在窄屏也在（48dp 触控区），点它还能打开
    const openBox = await page.evaluate(() => {
      const box = document.querySelector('[data-testid="notice-open"]')!.getBoundingClientRect();
      return { w: Math.round(box.width), h: Math.round(box.height) };
    });
    expect([openBox.w, openBox.h]).toEqual([48, 48]);
    await page.getByTestId("notice-open").tap();
    await expect(dialog).toBeVisible();
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

  test("播放控制：进度条、音量加减按键与常驻音量滑杆都可见可点", async ({ page }) => {
    await page.goto("/?locale=zh");
    const seek = page.getByTestId("seek-slider");
    const volumeDown = page.getByTestId("volume-down");
    const volumeUp = page.getByTestId("volume-up");
    const volumeSlider = page.getByTestId("volume-slider");
    await expect(seek).toBeVisible();
    await expect(volumeDown).toBeVisible();
    await expect(volumeUp).toBeVisible();
    // 音量滑杆**常驻**（用户要求不要折叠）
    await expect(volumeSlider).toBeVisible();
    const boxes = await page.evaluate(() => {
      // 量 Slider 根节点（aria-label 在内部 input 上，尺寸不是控件尺寸）
      const s = document.querySelector('[data-testid="seek-slider"]')!.getBoundingClientRect();
      const v = document.querySelector('[data-testid="volume-up"]')!.getBoundingClientRect();
      const slider = document.querySelector('[data-testid="volume-slider"]')!.getBoundingClientRect();
      return { seekWidth: Math.round(s.width), seekHeight: Math.round(s.height),
        volumeWidth: Math.round(v.width), volumeHeight: Math.round(v.height),
        volumeSliderWidth: Math.round(slider.width), volumeSliderTop: Math.round(slider.top) };
    });
    // 长度上限照搬原版 clamp(0px, 40%, 300px)：窄屏是容器的 40%，绝不会超过 300
    expect(boxes.seekWidth).toBeGreaterThan(90);
    expect(boxes.seekWidth).toBeLessThanOrEqual(300);
    expect(boxes.seekHeight).toBeGreaterThanOrEqual(20);
    expect(boxes.volumeWidth).toBeGreaterThanOrEqual(40);   // 触摸目标
    expect(boxes.volumeHeight).toBeGreaterThanOrEqual(40);
    expect(boxes.volumeSliderWidth).toBeGreaterThan(60);   // 常驻滑杆，窄屏也放得下
  });

  test("播放页窄屏同样是居中列：卡面 → 曲名 → 作者/作品 → 角色名 → 三条控件", async ({ page }) => {
    await page.goto("/?locale=zh");
    await expect(page.getByTestId("now-title")).toBeVisible();
    // `current-card` 带 0.3s 入场动画（`slideIn`：`transform: translateX(12%)` → `0`），而
    // `getBoundingClientRect()` **把动画中途的位移算进去** —— 不等它落位就量，偏移量会随"量到动画
    // 第几毫秒"在 0～12px 之间跳（卡宽 99 时起点位移 11.88px），于是这条用例在阈值 8 边上随机红绿。
    // 用 poll 等 `transform` 归 `none` 而不是 `waitForTimeout`：慢机器上不会假绿，也不白等固定时长。
    await expect.poll(async () => page.evaluate(() =>
      getComputedStyle(document.querySelector('[data-testid="current-card"]')!).transform === "none",
    )).toBe(true);
    const info = await page.evaluate(() => {
      const rect = (id: string) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
      const mid = (r: DOMRect) => Math.round(r.left + r.width / 2);
      const head = rect("player-head");
      const lines = ["current-card", "now-title", "now-credit", "now-character",
        "player-row-seek", "player-row-volume", "player-row-transport"]
        .map((id) => { const r = rect(id); return { id, c: mid(r), t: Math.round(r.top), h: Math.round(r.height) }; });
      return { headMid: mid(head), lines };
    });
    expect(info.lines.every((line) => line.h > 0), "有整行未渲染").toBe(true);
    for (let index = 1; index < info.lines.length; index += 1) {
      expect(info.lines[index]!.t, "自上而下顺序不对").toBeGreaterThanOrEqual(info.lines[index - 1]!.t);
    }
    for (const line of info.lines) {
      expect(Math.abs(line.c - info.headMid), `${line.id} 未居中`).toBeLessThanOrEqual(8);
    }
  });

  test("播放控制三行在移动端居中（行距/行高仍统一）", async ({ page }) => {
    await page.goto("/?locale=zh");
    await expect(page.getByTestId("player-control")).toBeVisible();
    const info = await page.evaluate(() => {
      const control = document.querySelector('[data-testid="player-control"]')!.getBoundingClientRect();
      const mid = control.left + control.width / 2;
      // 整行内容的中心 = 该行所有子元素并集的中心（子元素宽度不等，不能简单取两个中点平均）
      const contentMid = (id: string) => {
        const row = document.querySelector(`[data-testid="${id}"]`)!;
        const rects = [...row.children].map((child) => child.getBoundingClientRect());
        const left = Math.min(...rects.map((rect) => rect.left));
        const right = Math.max(...rects.map((rect) => rect.right));
        return (left + right) / 2;
      };
      const rows = ["player-row-seek", "player-row-volume", "player-row-transport"]
        .map((id) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect());
      return {
        centers: ["player-row-seek", "player-row-volume", "player-row-transport"].map(contentMid),
        mid,
        heights: rows.map((rect) => Math.round(rect.height)),
        sliderWidth: Math.round(document.querySelector('[data-testid="seek-slider"]')!.getBoundingClientRect().width),
        gaps: [Math.round(rows[1]!.top - rows[0]!.bottom), Math.round(rows[2]!.top - rows[1]!.bottom)],
      };
    });
    for (const center of info.centers) expect(Math.abs(center - info.mid)).toBeLessThanOrEqual(6);
    // 行距相等（8dp 栅格）
    expect(info.gaps[0]).toBe(info.gaps[1]);
    // 窄屏进度条与音量条等长（两条两侧占位相同 ⇒ 自动等长），且不被 40% 卡短、不超距
    expect(info.sliderWidth).toBeGreaterThan(180);
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
      // 面板里按"行"懒挂载，所以直接取卡面元素（不要再拿 grid 的直接子节点）
      const cards = [...document.querySelectorAll('[data-testid^="unused-card-"]')];
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
      // 面板里按"行"懒挂载，所以直接取卡面元素（不要再拿 grid 的直接子节点）
      const cards = [...document.querySelectorAll('[data-testid^="unused-card-"]')];
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

    // 展开底部面板：点一张未使用卡 → 进自己牌库。
    // 面板里的卡是**按行懒挂载**的（只挂可见的几行），所以数量用底部栏的计数判断，不数 DOM。
    const countInBar = async (): Promise<number> => {
      const text = (await page.getByTestId("unused-cards-bar").textContent()) ?? "";
      return Number(text.match(/(\d+)/)?.[1] ?? "-1");
    };
    const total = await countInBar();
    expect(total).toBeGreaterThan(100);
    await page.getByTestId("unused-cards-toggle").tap();
    await expect(page.getByTestId("unused-cards-grid")).toBeVisible();
    const unused = page.locator('[data-testid^="unused-card-"]');
    expect(await unused.count()).toBeGreaterThan(4);          // 可见的几行已挂载
    await unused.first().tap();
    await expect(page.getByTestId("deck-you-card-0")).toBeVisible();

    // 收起面板（点拖拽把手）→ 点牌库那张 → 回未使用区，计数回到原值
    await page.getByTestId("unused-cards-handle").tap();
    await expect(page.getByTestId("unused-cards-grid")).toBeHidden();
    await expect(page.getByTestId("unused-cards-bar")).toContainText(String(total - 1));
    await page.getByTestId("deck-you-card-0").tap();
    await expect(page.getByTestId("deck-you-empty-0")).toBeVisible();
    await expect(page.getByTestId("unused-cards-bar")).toContainText(String(total));
  });
});

