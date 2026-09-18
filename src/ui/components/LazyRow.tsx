/** 行级懒挂载：滚动到视口附近（默认提前 240px）才挂载子内容，之前用等高占位避免跳动。
 *
 * 用途：设置页里那些"一行一个 MUI Select/Checkbox"的长列表（仅单曲模式 121 行、预设专辑 ~200 行）。
 * 实测 dev 下单行 Select ≈ 60ms，整表一次性挂载会产生 ~1s 的长任务（控制台 `[Violation] ...`），
 * 而且展开动画会被卡住；懒挂载后只挂载可见的十几行，长任务消失。
 *
 * `IntersectionObserver` 不存在时（jsdom 单测）直接挂载，保证单测里 DOM 照旧齐全。
 */
import { useEffect, useRef, useState } from "react";

interface LazyRowProps {
  children: React.ReactNode;
  /** 提前量（px），越大越早挂载 */
  margin?: number;
  /** 占位高度（px） */
  placeholderHeight?: number;
  /** 占位与内容共用同一个 testid：占位阶段也能被定位/滚动到（测试与无障碍都用得上） */
  testId?: string;
}

export function LazyRow({ children, margin = 240, placeholderHeight = 48, testId }: LazyRowProps) {
  const [shown, setShown] = useState(false);
  const holder = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = holder.current;
    if (shown || !element) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShown(true);
        observer.disconnect();
      }
    }, { rootMargin: `${margin}px 0px` });
    observer.observe(element);
    return () => observer.disconnect();
  }, [shown, margin]);

  return (
    <div ref={holder} data-testid={testId} style={{ minHeight: shown ? undefined : placeholderHeight }}>
      {shown ? children : null}
    </div>
  );
}
