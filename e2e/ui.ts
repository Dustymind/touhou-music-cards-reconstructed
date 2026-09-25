/** e2e 共用的 UI 动作（与 `audio.ts` / `dnd.ts` 同一层：只碰页面，不碰数据）。 */
import type { Page } from "@playwright/test";

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
