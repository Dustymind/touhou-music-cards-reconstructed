/** 拖拽状态：HTML5 DnD 的 `dataTransfer` 在 `dragover` 里读不到内容（安全限制），
 *  所以拖的是什么放在这里，`dataTransfer` 只用来启动拖拽（Firefox 需要 setData 才会开始拖）。 */
import type { CardInfo } from "./types";

export type DragPayload =
  | { kind: "deck"; player: number; slot: number; card: CardInfo }
  | { kind: "unused"; card: CardInfo };

export const DRAG_MIME = "application/x-tmc-card";

let current: DragPayload | null = null;

export function beginDrag(payload: DragPayload): void {
  current = payload;
}

export function endDrag(): void {
  current = null;
}

export function currentDrag(): DragPayload | null {
  return current;
}
