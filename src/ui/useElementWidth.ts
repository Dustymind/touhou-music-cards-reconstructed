import { useEffect, useState, type RefObject } from "react";

/** 容器**实测宽度**（`ResizeObserver` → `clientWidth`）—— 卡片面板、卡条、下一首预告三处共用。
 *
 * 三处原本各写一遍同样的 effect（还各自持一份 `useState`），差异只有"量到之前用什么兜底"
 * 与"什么时候重新观测"：
 *
 * - `initial`：还没量到时先用它（jsdom / 首帧；卡条用 `visibleWidth` 属性，卡片面板用 1000）。
 * - `key`：它变了就重新观测（卡条传 `visibleWidth`；其余传 `null` ⇒ 等价于只挂一次）。
 */
export function useElementWidth(
  ref: RefObject<HTMLElement | null>,
  key: unknown = null,
  initial = 0,
): number {
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [key]);
  return width;
}
