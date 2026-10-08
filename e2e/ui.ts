/** e2e 共用的 UI 动作（与 `audio.ts` / `dnd.ts` 同一层：只碰页面，不碰数据）。 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { noticeFingerprint } from "../src/content/noticeMeta";

/** 展开设置页的某个分区（MD2 扩展面板默认折叠）。**幂等**：已经是展开状态就别再点，点了会收起来。
 *
 * 以前三份 spec 各写一遍，其中 `smoke.spec.ts` 那份是**无条件点击** —— 它只在"所有分区默认折叠"时
 * 才不出错，一旦某个用例先展开过就变成 flake ⇒ 统一用这一份幂等实现。
 */
export async function expandSection(page: Page, id: string): Promise<void> {
  const summary = page.getByTestId(`section-${id}-summary`);
  if ((await summary.getAttribute("aria-expanded")) !== "true") {
    await summary.click();
    await page.waitForTimeout(400);   // 展开动画 250ms（MD2.accordion.timeout.enter）
  }
}

/** 公告相关本地存储键的前缀（`src/store/notices.ts` 里是 `tmc.v1.notice.<id>`）。 */
export const NOTICE_KEY_PREFIX = "tmc.v1.notice.";

/**
 * 进站前**清掉"公告已读/关过"的记录**（只清公告的键，别动别的存档）。
 *
 * 为什么每个用例都要：Playwright 每个用例一个全新的 `context` ⇒ `localStorage` 是空的 ⇒
 * 站内公告会在**每一次 `page.goto("/")` 之后自动弹出**，而它是**模态**（会挡住页签等控件，
 * `getByRole("tab", …)` 会找不到元素）。所以：
 *
 * - **只关心自己那件事的用例**：`beforeEach` 里先调它，`goto` 之后再 `dismissNotice` 收掉；
 * - **专门测公告的用例**：只调它（保留"进站就会弹"这个前置），别急着关。
 *
 * ⚠️ **只在"这个 context 的第一次导航"清**（用 `sessionStorage` 当一次性闸门）。
 * 这不是洁癖：`addInitScript` 是**每次导航都会跑**的，而无条件清键会把"点了「关闭」之后
 * 刷新"这件事**测反** —— 刷新时脚本又把记录抹了，于是公告照弹，
 * 「关过一次 ⇒ 刷新不再弹」这条用例永远红。
 */
export async function clearNoticeRecords(page: Page): Promise<void> {
  await page.addInitScript((prefix) => {
    // sessionStorage 在同一 context 的多次导航间保留 ⇒ 只在第一跳清一次
    if (sessionStorage.getItem("__tmc_notice_cleared") === "1") return;
    sessionStorage.setItem("__tmc_notice_cleared", "1");
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(prefix)) localStorage.removeItem(key);
    }
  }, NOTICE_KEY_PREFIX);
}

/**
 * 把站内公告弹窗收掉（**幂等**：没弹就直接返回）。
 *
 * 用于那些"不关心公告、只是被它挡住"的用例。通常在 `page.goto()` 之后立刻调用。
 * 给一个很短的等待窗口：自动弹出是同步渲染的，正常立刻就在；没出现就当没有。
 */
export async function dismissNotice(page: Page): Promise<void> {
  const dialog = page.getByTestId("notice-dialog");
  const appeared = await dialog.waitFor({ state: "visible", timeout: 1500 }).then(() => true, () => false);
  if (!appeared) return;
  await page.getByTestId("notice-close").click();
  await expect(dialog).toHaveCount(0);
}

/**
 * **让公告别弹**：在页面脚本跑起来之前，就把每条公告都记成"**关过**"（`closed` + `dismissed`），
 * 且指纹写成**与当前内容一致** —— 于是自动弹出判据判定"关过了、内容也没变" ⇒ 一条都不弹。
 *
 * 给"完全不关心公告"的用例用（一次 `addInitScript`，之后这个用例里所有 `goto` / `reload` 都安静），
 * 比在每个 `goto` 后面补一句 `dismissNotice` 稳得多。
 *
 * ⚠️ **传 Page 还是 Context 有讲究**：`addInitScript` 的作用域是"那个 page"或"那个 context"。
 * `test.beforeEach` 里拿到的是**默认**的 `page` 夹具；而有的用例（`multiplayer.spec.ts`）
 * 自己 `browser.newContext()` 另开一个 context —— 那个 context 里 `localStorage` 是**空的**，
 * 夹具上的压制**够不着它**，公告会在里面照弹、把 `getByRole("tab", …)` 挡死。
 * 这种用例必须**在自建的 context / page 上再调一次**本函数（传 context 可一次覆盖它开的所有页面）。
 *
 * 指纹直接调**应用自己的** `noticeFingerprint`（与 e2e 里 `import { aboutContent }` 同一个套路）：
 * 不在这里重抄一份哈希 —— 那样一改算法就会静默失真。存储格式（`{ v, data }`）是
 * `src/persist.ts` 的公开契约，这里按它写。
 *
 * ⚠️ 它从 `../src/content/noticeMeta` import（**纯 TS**），**不是**从 `../src/content/notices` ——
 * 后者有 `?raw`，Playwright 的加载器解析不了，import 过去会让**所有** spec 报
 * `SyntaxError` + `Error: No tests found`。同一原因，`noticeContent` 走 `./noticeContent`。
 */
export async function suppressNotice(target: NoticeTarget, notices: readonly NoticeForE2E[]): Promise<void> {
  const records = notices.map((notice) => ({
    id: notice.id,
    fingerprint: noticeFingerprint(notice),
  }));
  await target.addInitScript((list: { id: string; fingerprint: string }[]) => {
    for (const item of list) {
      localStorage.setItem(`tmc.v1.notice.${item.id}`, JSON.stringify({
        v: 1,
        data: { closed: true, dismissed: true, fingerprint: item.fingerprint, at: 0 },
      }));
    }
  }, records);
}

/** `suppressNotice` 需要的公告字段（与 `noticeFingerprint` 的入参一致）。 */
export type NoticeForE2E = Parameters<typeof noticeFingerprint>[0];

/** `suppressNotice` 能落在哪：一个页面，或**整个 context**（后者连带它开出来的所有页面）。 */
export type NoticeTarget = Page | BrowserContext;

/** 用例标题里出现这段文字，就说明"这条用例自己管公告的存储"。 */
export const NOTICE_TEST_MARKER = "站内公告";

/**
 * 文件级 `beforeEach` 该不该自动压制公告 —— **专门测公告的用例要放行**。
 *
 * 站内公告是**模态**的、进站自动弹，不压制就会把后面每条用例的 `getByRole("tab", …)` 挡死，
 * 所以各 spec 文件开头都有一段 `beforeEach` 调 `suppressNotice`。但**测公告的用例**恰恰要
 * "进站就会弹"这个前置，而且得自己控存储：先清一次、再靠 `reload` 验证"是还会弹还是不再弹"。
 * 文件级那段是 `addInitScript`、**每次导航都会重跑** —— 它会在 reload 时把"已看过"重新写回去，
 * 于是「关过一次 ⇒ 刷新不再弹」这条**永远红**（实测就是这个现象）。
 * 所以这类用例按标题放行，公告的两条相反预期（会弹 / 不会弹）都交给用例自己。
 */
export function shouldAutoSuppressNotice(): boolean {
  const info = test.info();
  const full = [info.title, ...info.titlePath].join(" › ");
  return !full.includes(NOTICE_TEST_MARKER);
}
