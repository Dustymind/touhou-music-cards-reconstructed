/** 抓取 `usePlayer` 造的播放元素：它用 `new Audio()` 且不挂进 DOM，只能在构造函数上截胡。
 *  dev 下 StrictMode 会把 effect 跑两遍（于是有两个元素、第一个已被清掉），所以要找"正在播的那个"。 */
import { expect, type Page } from "@playwright/test";

export async function captureAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = window.Audio;
    const captured: HTMLAudioElement[] = [];
    (window as unknown as { __audios: HTMLAudioElement[] }).__audios = captured;
    (window as unknown as { Audio: unknown }).Audio = function (...args: unknown[]) {
      const element = new original(...(args as []));
      captured.push(element);
      return element;
    };
    (window as unknown as { Audio: { prototype: object } }).Audio.prototype = original.prototype;
  });
}

/** 等这一端真的放出声音（`currentTime` 在走），返回音源与当前播放位置。 */
export async function waitForPlaying(
  page: Page, timeoutMs = 20_000,
): Promise<{ src: string; time: number }> {
  const handle = await page.waitForFunction(() => {
    const list = (window as unknown as { __audios: HTMLAudioElement[] }).__audios ?? [];
    const playing = list.find((audio) => !audio.paused && audio.currentTime > 0);
    return playing ? { src: playing.src, time: playing.currentTime } : null;
  }, null, { timeout: timeoutMs });
  const state = (await handle.jsonValue()) as { src: string; time: number };
  expect(state.src).toMatch(/^https?:\/\//);
  return state;
}
