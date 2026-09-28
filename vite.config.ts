import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  // 相对路径：静态托管（含子目录部署）都能直接跑。
  // GitHub Pages 项目页（`user.github.io/<repo>/`）、Cloudflare Pages / Vercel 的域名根、
  // 单端口反代都在这一种形态下工作，所以**不需要**按平台改 base。
  base: "./",
  // S3：生成物在 gitignored 的 data/public/（内容拷到 dist/ 根 ⇒ 站点内仍是 /data/**）
  publicDir: "data/public",
  plugins: [react()],
  // 本地曲库（音MAD）助手：开发时也和**单端口部署**一样把 /manifest.json 与 /media 转到 8011。
  // 否则 Vite 会把这两个路径当成未知路由、回退成 index.html ✗ —— 本地源拿到的是 HTML 而不是
  // JSON/音频，音MAD 模式看起来"没启用"（列表为空、点了也不播）。
  server: {
    proxy: {
      "/manifest.json": { target: "http://127.0.0.1:8011", changeOrigin: true },
      "/media": { target: "http://127.0.0.1:8011", changeOrigin: true },
    },
  },
  // sourcemap 只在开发模式出：生产那份 3.7 MB 的 `.js.map` 比整个站点（0.8 MB 其余内容）还大四倍，
  // 传上 Pages / Vercel / CF 是白白多传五倍字节 ✗。要线上排查就 `vite build --mode development`。
  build: { outDir: "dist", sourcemap: mode === "development" },
  test: {
    // 单元测试跑在**真实浏览器**里（Playwright 驱动）：chromium 与 firefox 两个实例都跑，
    // 和 e2e 一个口径 —— jsdom 没有布局、没有真媒体、没有真事件，很多问题它看不见。
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      screenshotFailures: false,   // 失败截图不进 test-results（e2e 的 trace 已经够用）
      // 端口写死一个（可用 VITEST_BROWSER_PORT 覆盖）：默认的自动探测会从 63315 往上试，
      // 在没有高位端口的环境（沙箱 / 受限网络）里会一路报到 65536 然后崩掉。
      api: Number(process.env.VITEST_BROWSER_PORT ?? 18001),
      // 单测文件**串行**跑：和 e2e 的 `workers: 1, fullyParallel: false` 一个道理 ——
      // 真浏览器里并行跑多个重文件（App 冒烟要取真实数据 + 跑对局）会把会话拖垮，
      // 表现为 firefox 报 "Failed to connect to the browser session"、页面停在 Loading。
      fileParallelism: false,
      // 视口写成**桌面**尺寸：默认视口是移动端那种小尺寸，会让 `useMediaQuery("(max-width: 599.95px)")`
      // 判定为窄屏、让按容器宽度算出来的卡面尺寸跟着变 —— 单测要的是确定性的桌面口径
      // （窄屏是 e2e 的 mobile project 负责的）。
      instances: [
        { browser: "chromium", viewport: { width: 1280, height: 800 } },
        { browser: "firefox", viewport: { width: 1280, height: 800 } },
      ],
    },
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test-setup.ts"],
    globals: true,
  },
}));
