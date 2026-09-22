/** 播放层用的短淡入/淡出包络（线性，时间基）。
 *
 * 为什么不用 Web Audio 的 `GainNode`：那要把 `<audio>` 接进 `MediaElementSource` —— 远程音源没有 CORS 头会被
 * **静音**，而且现有的"用户音量 × 逐曲响度系数"还得搬进音频图里。这里的需求只是"别硬切"，所以在
 * `HTMLMediaElement.volume` 上做一条线性包络就够了 ✓（对所有音源一视同仁 ✓）。
 *
 * 包络按**经过的时间**算，不是按步数算：后台标签页会把定时器节流成 1s 一跳，按步数算会卡在半路
 * （音量停在中间、淡出永远不结束 ✗），按时间算则一跳到位 ✓。
 */

/** 包络的步进（毫秒）：≈ 一帧，200ms 的淡入淡出约 12 步，听感上就是"没有硬切" ✓。 */
export const FADE_STEP_MS = 16;

/** 对局音频的短淡入/淡出时长（毫秒）：短到听不出"渐入渐出"，只把硬切的突兀与爆音抹掉 ✓。
 *  回合切换很频繁（每回合都换一首），所以不能长 —— 超过 ~300ms 就会拖慢"这一回合开始了"的感觉 ✗。 */
export const GAME_FADE_MS = 200;

/** 线性包络：立刻回调一次 `from`，随后每 `FADE_STEP_MS` 回调当前值，到点回调 `to`。
 *
 *  返回取消函数（取消后不再有任何回调，也不会补一次 `to`）。`ms <= 0` 或起止相同则只回调一次 `to` ✓。 */
export function rampGain(
  from: number, to: number, ms: number, onStep: (gain: number) => void,
): () => void {
  if (ms <= 0 || from === to) {
    onStep(to);
    return () => undefined;
  }
  const startedAt = Date.now();
  onStep(from);
  const timer = window.setInterval(() => {
    const progress = Math.min(1, (Date.now() - startedAt) / ms);
    if (progress >= 1) {
      window.clearInterval(timer);
      onStep(to);
      return;
    }
    onStep(from + (to - from) * progress);
  }, FADE_STEP_MS);
  return () => window.clearInterval(timer);
}
