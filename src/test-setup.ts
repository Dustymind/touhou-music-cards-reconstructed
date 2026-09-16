// React 19 的 act() 需要显式声明测试环境
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom 没有实现媒体播放：给出最小可用的桩，让播放层逻辑可测
if (typeof HTMLMediaElement !== "undefined") {
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: () => Promise.resolve(),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: () => {} });
  Object.defineProperty(HTMLMediaElement.prototype, "load", { configurable: true, value: () => {} });
}
