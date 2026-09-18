import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // 相对路径：静态托管（含子目录部署）都能直接跑
  base: "./",
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
  build: { outDir: "dist", sourcemap: true },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test-setup.ts"],
    globals: true,
  },
});
