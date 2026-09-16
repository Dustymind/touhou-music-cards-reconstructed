import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // 相对路径：静态托管（含子目录部署）都能直接跑
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", sourcemap: true },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test-setup.ts"],
    globals: true,
  },
});
