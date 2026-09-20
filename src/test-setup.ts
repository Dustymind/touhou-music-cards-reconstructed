// React 19 的 act() 需要显式声明测试环境
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 单测跑在**真实浏览器**里（vitest 浏览器模式 + Playwright）：媒体元素是真的，但测试不该真出声、
// 真下载，所以统一给最小可用的桩，让播放层逻辑可测。
if (typeof HTMLMediaElement !== "undefined") {
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: () => Promise.resolve(),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: () => {} });
  Object.defineProperty(HTMLMediaElement.prototype, "load", { configurable: true, value: () => {} });
}
