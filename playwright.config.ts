import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 5190);
const PEER_PORT = Number(process.env.PEER_PORT ?? 9100);
export const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  // ⚠️ **单 worker 串行是刻意的，别调大**（调大会得到假红/假绿，不是"更快"）：
  // 1. 站内公告是**模态**且状态存在 `localStorage`，多个 worker 会互相污染存储；
  // 2. 夹具靠 `addInitScript` 按 **context** 注入（`suppressNotice`），并发下会串台；
  // 3. 端口只有一份：dev server 5190 / PeerJS 9100 / 曲库助手 8011 ——
  //    **同时开多个 Playwright 实例会互抢 5190**（本项目踩过多次）。
  // ⇒ 代价是全量约 40 分钟。日常改动用 `pnpm e2e:quick`（只 chromium）或 `pnpm e2e:file <spec>`，
  // 全量留给推送前跑一次（D184 的增量测试那套就是为此建的）。
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // 性能守卫放在独立 project（`pnpm e2e:perf`）：它测的是"点击长任务"，
      // 同机还跑着 dev/代理/曲库时会被负载击穿 ✗，不适合混在全量里（用户要求单独跑）
      testIgnore: [/mobile\.spec\.ts/, /perf\.spec\.ts/],
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      testIgnore: [/mobile\.spec\.ts/, /perf\.spec\.ts/],
    },
    // 移动端：Android 手机（触摸 + 窄屏 + 高 DPR），只跑 e2e/mobile.spec.ts
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
    // 单独跑：`pnpm e2e:perf`（不进 `pnpm e2e`）
    { name: "perf", use: { ...devices["Desktop Chrome"] }, testMatch: /perf\.spec\.ts/ },
    // 点击长任务守卫只跑一次（chromium），firefox 由 testIgnore 排除，避免重复

  ],
  webServer: [
    {
      command: `pnpm dev --port ${PORT} --host 127.0.0.1`,
      url: `${BASE_URL}/`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: "node e2e/peer-server.mjs",
      url: `http://127.0.0.1:${PEER_PORT}/peerjs/id`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
