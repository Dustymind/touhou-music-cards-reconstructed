/** 彩蛋（对齐上游 `app/types/Cheat.ts`）。
 *
 * 上游的 `?cheatcode=` 白名单是 SHA-256，原文不在仓库里；这里保留同一份白名单，
 * 用 WebCrypto 做校验（异步）。效果与上游一致：文字抖动、卡片随机底色、答案提示框。
 *
 * 随机数走 `src/rng`（D104）：抖动/底色是纯装饰，用 `ephemeralRandom()`（不需要跨端可复现）；
 * `?g=` 的倾斜与文案轮换必须两端一致，用 `stableHash()`（稳定哈希）。
 */
import { ephemeralRandom, ephemeralIntBelow, stableHash } from "./rng";

let cheatEnabled = false;

const GLITCH_CHARS = ["#", "%", "&", "*", "@", "!", "?", "$", " "];
const CHEATER = "cheater";
const VALID_SHA256 = new Set<string>([
  "9e17e6f09b43129226573cb2967ee7293becf81c796ea7df7402b216a60ae297",
]);

export function enableCheat(): void {
  cheatEnabled = true;
}

export function isCheatReally(): boolean {
  return cheatEnabled;
}

/** 上游语义：即使开启也有一半概率返回 false，让抖动闪烁起来。 */
export function isCheat(): boolean {
  if (ephemeralRandom() < 0.5) return false;
  return cheatEnabled;
}

export async function isCheatString(input: string): Promise<boolean> {
  if (!globalThis.crypto?.subtle) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return VALID_SHA256.has(hex);
}

export function glitchString(input: string): string {
  let result = "";
  for (const ch of input) {
    result += ephemeralRandom() < 0.5 ? ch.toUpperCase() : ch.toLowerCase();
  }
  const count = Math.floor(input.length / 4);
  for (let i = 0; i < count; i += 1) {
    const pos = ephemeralIntBelow(result.length);
    const ch = GLITCH_CHARS[ephemeralIntBelow(GLITCH_CHARS.length)] ?? "#";
    result = result.slice(0, pos) + ch + result.slice(pos);
  }
  return result;
}

export function getGlitchCheat(original: string): string {
  const repeats = Math.floor(original.length / CHEATER.length);
  const head = (CHEATER.repeat(repeats) + CHEATER.slice(0, original.length % CHEATER.length))
    .slice(0, Math.ceil(original.length * 0.8));
  return glitchString(head);
}

/** 上游 `cheatSanitize`：开启时把文案换成抖动文本。 */
export function cheatSanitize(input?: string): string {
  const text = input ?? "";
  return isCheat() ? getGlitchCheat(text) : text;
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const table: Array<[number, number, number]> = [
    [v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q],
  ];
  const [r, g, b] = table[i % 6] ?? [0, 0, 0];
  return { r, g, b };
}

export function randomColor(s: number, v: number): string {
  const { r, g, b } = hsvToRgb(ephemeralRandom(), s, v);
  return `rgb(${Math.floor(r * 255)}, ${Math.floor(g * 255)}, ${Math.floor(b * 255)})`;
}

/** `?g` 存在时给卡片一个按文件名确定的 -5°…+4° 倾斜（两端同一张图必须同一个角度）。 */
export function glitchTilt(imageSource: string): number {
  return (stableHash(imageSource) % 10) - 5;
}
