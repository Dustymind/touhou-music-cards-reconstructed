/** HTML5 拖拽在 Playwright 里的稳妥做法：先把两端都滚进视口，再用显式鼠标轨迹拖。
 *  （`locator.dragTo()` 在视口偏小时会因为中途滚动而丢 drop，实测踩过。） */
import type { Locator, Page } from "@playwright/test";

export async function dragCard(page: Page, source: Locator, target: Locator): Promise<void> {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("拖拽两端至少要有一个可见");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 6, from.y + from.height / 2 + 6, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 16 });
  await page.mouse.up();
}
