/** **清单与曲包共用的 `cover` 字段解析**（D165）：一个链接，或逐档三个链接。
 *
 * 两种数据源都写这个字段（模式 3 的 `manifest.json`、音MAD 曲包的 `[[track]] cover`），
 * 而它的形状是应用的契约 ⇒ 解析只能有一处。两条纪律照旧：
 *
 * 1. **形状不对就整份不用**（调用方拿 `undefined` 走兜底），半信半疑地用一份坏清单/坏曲包，
 *    表现是"图错位 / 有的卡没图"这种最难查的故障；
 * 2. **三种档位**（`original` / `16x9` / `4x3`）：写了哪几档就用哪几档，**没写的档回落到主链接**
 *    （前端按 `object-fit: cover` 运行时裁）。
 *
 * 为什么要有"逐档"：`original` 是旧口径的 703:1000 竖版框，而 16:9 / 4:3 是横版。
 * 一张图能满足一个形状、满足不了另一个（1920×1200 的封面塞进竖版框会裁掉约 63%），
 * 所以源可以按档位各给一份**源分辨率**的现裁链接；给不了就只给单链接，由前端裁。
 */
import { CARD_RATIOS, isCardRatio, type CardRatio } from "../theme/cardRatio";
import { isRecord } from "../persist";

/** 解析结果：`primary` 是"没写那一档时用它"的主链接，`byRatio` 只含**写了**的档位。 */
export interface ParsedCover {
  primary: string;
  byRatio: Partial<Record<CardRatio, string>>;
}

/** 非空字符串（去掉首尾空白后仍非空）。 */
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** `cover` → `{ primary, byRatio }`；**认不得的形状返回 `undefined`**（调用方整份拒掉）。
 *
 * - 字符串：单链接，三个档位共用（`byRatio` 为空对象）；
 * - 对象：键必须全是认得的档位、值必须是非空字符串、至少一个键；
 * - 主链接 = `original` → `16x9` → `4x3` 里第一个有的（固定顺序 ⇒ 跨端同值、可复现）。 */
export function parseCoverField(raw: unknown): ParsedCover | undefined {
  const single = text(raw);
  if (single !== undefined) return { primary: single, byRatio: {} };
  if (!isRecord(raw)) return undefined;

  const byRatio: Partial<Record<CardRatio, string>> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isCardRatio(key)) return undefined;
    const url = text(value);
    if (url === undefined) return undefined;
    byRatio[key] = url;
  }
  for (const ratio of CARD_RATIOS) {
    const url = byRatio[ratio];
    if (url !== undefined) return { primary: url, byRatio };
  }
  return undefined;                       // 空对象：等于没有卡面
}
