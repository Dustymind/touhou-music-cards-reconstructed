import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 5190);
const PEER_PORT = Number(process.env.PEER_PORT ?? 9100);
export const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
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
