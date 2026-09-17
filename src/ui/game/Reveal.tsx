/** 显隐动画：棋盘与联机栏出现/收起时做高度 + 淡入动画。
 *
 * 用 `Collapse`（高度）+ `Fade`（透明度）：隐藏时**卸载**，所以"单人模式下没有对方棋盘"
 * 在 DOM 上也是真的（测试直接断言元素不存在）。
 */
import Collapse from "@mui/material/Collapse";
import Fade from "@mui/material/Fade";
import type { ReactNode } from "react";

export interface RevealProps {
  show: boolean;
  children: ReactNode;
  testId?: string;
  timeout?: number;
}

export function Reveal({ show, children, testId, timeout = 300 }: RevealProps) {
  return (
    <Collapse in={show} timeout={timeout} unmountOnExit data-testid={testId}>
      <Fade in={show} timeout={timeout}>
        <div>{children}</div>
      </Fade>
    </Collapse>
  );
}
