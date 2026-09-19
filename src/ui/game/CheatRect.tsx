/** 彩蛋：在答案卡周围画一圈随机色块（对齐上游 `CheatRect`）。
 *  纯装饰 → 用 `ephemeralRandom()`（不需要跨端一致，也不参与种子体系，见 D104）。 */
import { Box } from "@mui/material";
import { useMemo } from "react";

import { randomColor } from "../../cheat";
import { ephemeralRandom } from "../../rng";

interface Box {
  left: number;
  top: number;
  size: number;
  color: string;
  rotate: number;
}

function buildBoxes(width: number, height: number): Box[] {
  const count = Math.ceil(((width + height) * 2) / 20);
  const boxes: Box[] = [];
  for (let i = 0; i < count; i += 1) {
    const perimeter = 2 * (width + height);
    const at = (i / count) * perimeter;
    let x = 0;
    let y = 0;
    if (at < width) {
      x = at;
      y = 0;
    } else if (at < width + height) {
      x = width;
      y = at - width;
    } else if (at < 2 * width + height) {
      x = width - (at - width - height);
      y = height;
    } else {
      x = 0;
      y = height - (at - 2 * width - height);
    }
    const jitter = 0.1 * Math.min(width, height);
    boxes.push({
      left: x + (ephemeralRandom() * 2 - 1) * jitter,
      top: y + (ephemeralRandom() * 2 - 1) * jitter,
      size: 10 + ephemeralRandom() * 20,
      color: randomColor(1, 1),
      rotate: ephemeralRandom() * 360,
    });
  }
  return boxes;
}

export function CheatRect({ width, height }: { width: number; height: number }) {
  const boxes = useMemo(() => buildBoxes(width, height), [width, height]);
  return (
    <Box sx={{ position: "absolute", inset: 0, zIndex: 2000, pointerEvents: "none" }}
      data-testid="cheat-rect">
      {boxes.map((box, index) => (
        <Box
          key={index}
          sx={{
            position: "absolute",
            left: box.left,
            top: box.top,
            width: box.size,
            height: box.size,
            backgroundColor: box.color,
            transform: `rotate(${box.rotate}deg)`,
          }}
        />
      ))}
    </Box>
  );
}
