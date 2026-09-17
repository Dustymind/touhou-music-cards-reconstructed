/** 联机端到端：同浏览器双标签页（BroadcastChannel）与跨浏览器（本地 PeerServer + WebRTC）。 */
import { chromium, expect, firefox, test, type Page } from "@playwright/test";

import { BASE_URL } from "../playwright.config";
import { captureAudio, waitForPlaying } from "./audio";

const PEER_QUERY = "?peerhost=127.0.0.1&peerport=9100&peerpath=/&peersecure=0";

async function openGame(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.getByRole("tab", { name: "Match", exact: true }).click();
  // 联机栏只在"多人"模式下出现（用户要求）
  await page.getByTestId("mode-multi").click();
  await expect(page.getByTestId("lobby")).toBeVisible();
}

async function hostRoom(page: Page, name = "Host"): Promise<string> {
  await page.getByLabel("net-name").fill(name);
  await page.getByTestId("net-host").click();
  await expect(page.getByTestId("net-share-code")).toBeVisible();
  const text = (await page.getByTestId("net-share-code").textContent()) ?? "";
  return text.replace("code:", "").trim();
}

async function joinRoom(page: Page, code: string, name = "Guest"): Promise<void> {
  await page.getByLabel("net-name").fill(name);
  await page.getByLabel("net-room").fill(code);
  await page.getByTestId("net-join").click();
}

/** 完整状态摘要（界面上只显示前 24 字符，这里读 `data-digest`） */
async function digest(page: Page): Promise<string> {
  return (await page.getByTestId("net-digest").getAttribute("data-digest")) ?? "";
}

test("同浏览器两个标签页联机：握手 / 聊天 / 快照同步", async ({ browser }) => {
  const context = await browser.newContext();
  const host = await context.newPage();
  const guest = await context.newPage();
  await captureAudio(host);
  await captureAudio(guest);
  await openGame(host, "/");
  await openGame(guest, "/");

  const code = await hostRoom(host);
  expect(code.length).toBeGreaterThan(2);
  await joinRoom(guest, code);

  // 双方都看到两名参与者
  await expect(host.getByTestId("lobby")).toContainText("1: Guest");
  await expect(guest.getByTestId("lobby")).toContainText("0: Host");
  await expect(guest.getByTestId("net-status")).toContainText("connected");

  // 聊天双向
  await guest.getByLabel("chat-input").fill("hi from guest");
  await guest.getByTestId("chat-send").click();
  await expect(host.getByTestId("chat-log")).toContainText("hi from guest");
  await host.getByLabel("chat-input").fill("hi from host");
  await host.getByTestId("chat-send").click();
  await expect(guest.getByTestId("chat-log")).toContainText("hi from host");

  // 各自补满自己的牌库（多人模式下不能替对方补牌）→ 开局
  await host.getByTestId("random-fill").click();
  await guest.getByTestId("random-fill").click();
  await expect.poll(async () => (await digest(host)).includes("p1[")).toBe(true);
  await host.getByTestId("start-game").click();
  await expect(guest.getByText(/turn #0 · countdown/)).toBeVisible();
  await expect(guest.getByText(/turn #1 · turnStart/)).toBeVisible({ timeout: 20_000 });
  expect(await digest(guest)).toBe(await digest(host));

  // 两端都要真的出声：主机本地起播，客户端拿到快照后起播
  const hostPlaying = await waitForPlaying(host);
  const guestPlaying = await waitForPlaying(guest);
  expect(guestPlaying.src).toBeTruthy();
  // 同一回合两端听的是同一首（种子由 (turnSeq, currentKey) 派生）
  expect(new URL(guestPlaying.src).pathname).toBe(new URL(hostPlaying.src).pathname);

  // 客户端抢拍 → 主机落地 → 两端仍一致
  // 客户端抢拍 → 主机必须收到意图并落到状态里（摘要是含抢拍记录的状态总结）
  const before = await digest(host);
  await guest.getByTestId("deck-you-card-0").click();
  await expect.poll(async () => digest(host), { timeout: 20_000 }).not.toBe(before);
  expect(await digest(guest)).toBe(await digest(host));

  await context.close();
});

test("跨浏览器联机：Chromium 主机 + Firefox 客户端（本地 PeerServer）", async () => {
  test.skip(test.info().project.name !== "chromium", "内部自己开两个浏览器，只在 chromium 项目跑一次");
  // 本机回环联调：关掉浏览器的 mDNS 候选地址混淆（`.local` 在容器里解析不了），
  // 让 ICE 直接用 127.0.0.1 建连。真实跨机器联机不需要这两个开关。
  const browserA = await chromium.launch({ args: ["--disable-features=WebRtcHideLocalIpsWithMdns"] });
  const browserB = await firefox.launch({
    firefoxUserPrefs: { "media.peerconnection.ice.obfuscate_host_addresses": false },
  });
  const host = await browserA.newPage();
  const guest = await browserB.newPage();
  await captureAudio(host);
  await captureAudio(guest);
  await openGame(host, `${BASE_URL}/${PEER_QUERY}`);
  await openGame(guest, `${BASE_URL}/${PEER_QUERY}`);

  const code = await hostRoom(host, "Chromium");
  await joinRoom(guest, code, "Firefox");

  // WebRTC 建立后：双方互相可见
  await expect(host.getByTestId("lobby")).toContainText("Firefox", { timeout: 30_000 });
  await expect(guest.getByTestId("lobby")).toContainText("Chromium", { timeout: 30_000 });

  // 聊天跨浏览器
  await guest.getByLabel("chat-input").fill("hello from firefox");
  await guest.getByTestId("chat-send").click();
  await expect(host.getByTestId("chat-log")).toContainText("hello from firefox", { timeout: 30_000 });

  // 开局同步：Firefox 端跟随 Chromium 主机的状态（各自补自己的牌库）
  await host.getByTestId("random-fill").click();
  await guest.getByTestId("random-fill").click();
  await expect.poll(async () => (await digest(host)).includes("p1[")).toBe(true);
  await host.getByTestId("start-game").click();
  await expect(guest.getByText(/turn #0 · countdown/)).toBeVisible({ timeout: 30_000 });
  await expect(guest.getByText(/turn #1 · turnStart/)).toBeVisible({ timeout: 30_000 });
  expect(await digest(guest)).toBe(await digest(host));

  // Firefox 客户端同样出声（跨浏览器 autoplay 与同步都验证）
  await waitForPlaying(host, 30_000);
  const guestPlaying = await waitForPlaying(guest, 30_000);
  expect(guestPlaying.src).toBeTruthy();

  // Firefox 客户端抢拍 → Chromium 主机状态变化 → 两端一致
  const beforeCross = await digest(host);
  await guest.getByTestId("deck-you-card-0").click();
  await expect.poll(async () => digest(host), { timeout: 30_000 }).not.toBe(beforeCross);
  expect(await digest(guest)).toBe(await digest(host));

  await browserA.close();
  await browserB.close();
});
