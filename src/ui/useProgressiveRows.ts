/** 长列表的**渐进渲染**：先出 `first` 行，其余分批补齐。
 *
 * 为什么不是 `startTransition`：transition 更新会被 React 合并成**一次**大渲染，分片就白分了
 * （实测长任务仍是 ~1000ms）。这里要的就是"每个宏任务渲染一片"。
 * 为什么不能连着 `setTimeout(0)` 排下一片：浏览器根本没机会绘制，节点数会在一个任务里暴涨
 * （实测从 625 跳到 2858）。所以顺序是 `requestAnimationFrame`（等下一次绘制）→ `setTimeout(0)`
 * （下一个宏任务）→ 再渲染一片。
 *
 * `resetKey` 变了就回到 `first` 行（换搜索词 / 换数据 / 换模式）。
 * **只有行里带重控件的长列表才需要它**（一行一个 MUI `Select` ≈ 60ms）：纯文字行靠 `LazyRow`
 * 的视口懒挂载就够了，套上这一层反而多一层状态。
 */
import { useEffect, useState } from "react";

export function useProgressiveRows(total: number, resetKey: string, first = 12, chunk = 12): number {
  const [rendered, setRendered] = useState(first);

  useEffect(() => {
    setRendered(first);
    let cancelled = false;
    const pump = () => {
      if (cancelled) return;
      setRendered((current) => (current >= total ? current : Math.min(total, current + chunk)));
      schedule();
    };
    const schedule = () => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (cancelled) return;
        setTimeout(pump, 0);
      });
    };
    if (total > first) schedule();
    return () => {
      cancelled = true;
    };
    // 只在"这份列表换了"时重排；total 变了必然带着 resetKey 变（调用方把长度拼进去了）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  return rendered;
}
