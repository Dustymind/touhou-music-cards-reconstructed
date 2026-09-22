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

/** 打开设置页的音乐源分区（已经是展开状态就别再点，点了会收起来）。 */
async function openMusicSource(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Config", exact: true }).click();
  const summary = page.getByTestId("section-source-summary");
  if ((await summary.getAttribute("aria-expanded")) !== "true") await summary.click();
}

/** 完整状态摘要（界面上只显示前 24 字符，这里读 `data-digest`） */
async function digest(page: Page): Promise<string> {
  return (await page.getByTestId("net-digest").getAttribute("data-digest")) ?? "";
}

/** 种子权威的现场快照（D104）：dev 构建把 store 挂在 `window.__TMC_SEEDS__` 上 */
async function seeds(page: Page): Promise<{ ownSeed: number; adoptedSeed: number | null; authority: string }> {
  return page.evaluate(() => {
    const store = (window as unknown as {
      __TMC_SEEDS__?: { getState: () => { ownSeed: number; adoptedSeed: number | null; authority: string } };
    }).__TMC_SEEDS__;
    if (!store) return { ownSeed: -1, adoptedSeed: null, authority: "missing" };
    const state = store.getState();
    return { ownSeed: state.ownSeed, adoptedSeed: state.adoptedSeed, authority: state.authority };
  });
}

test("联机：主机发种子、客户端采用；客户端「重新抽选」由主机换种子后下发（D104）", async ({ browser }) => {
  const context = await browser.newContext();
  const host = await context.newPage();
  const guest = await context.newPage();
  await openGame(host, "/");
  await openGame(guest, "/");

  const code = await hostRoom(host);
  await joinRoom(guest, code);
  await expect(guest.getByTestId("net-status")).toContainText(/已连接|connected/, { timeout: 20_000 });

  // 主机是权威端；客户端进房即副本端，并会采用主机的会话种子（配置随 welcome / 快照下发）
  const hostSeed = await seeds(host);
  expect(hostSeed.authority).toBe("authority");
  await expect.poll(async () => (await seeds(guest)).authority, { timeout: 20_000 }).toBe("replica");
  await expect.poll(async () => (await seeds(guest)).adoptedSeed, { timeout: 20_000 })
    .toBe(hostSeed.ownSeed);
  const guestOwnSeed = (await seeds(guest)).ownSeed;

  // 客户端按「重新抽选」：不能自己换种子，只能请求主机
  await guest.getByRole("tab", { name: "Player", exact: true }).click();
  await host.getByRole("tab", { name: "Player", exact: true }).click();
  await guest.getByRole("button", { name: "Shuffle" }).click();

  await expect.poll(async () => (await seeds(host)).ownSeed, { timeout: 20_000 })
    .not.toBe(hostSeed.ownSeed);                                     // 主机换了新种子
  const rerolled = await seeds(host);
  await expect.poll(async () => (await seeds(guest)).adoptedSeed, { timeout: 20_000 })
    .toBe(rerolled.ownSeed);                                         // 客户端采用新种子
  expect((await seeds(guest)).ownSeed).toBe(guestOwnSeed);           // 但没动自己那份（离开房间还用得上）

  // 主机自己按「重新抽选」也要让客户端跟上（种子不在 GameState 里，靠同一条配置通道）
  await host.getByRole("button", { name: "Shuffle" }).click();
  await expect.poll(async () => (await seeds(guest)).adoptedSeed, { timeout: 20_000 })
    .toBe((await seeds(host)).ownSeed);

  await context.close();
});

test("访客页的音乐模式由主机决定：单选禁用，提示换成主机口径（D119）", async ({ browser }) => {
  const context = await browser.newContext();
  const host = await context.newPage();
  const guest = await context.newPage();
  await openGame(host, "/");
  await openGame(guest, "/");

  const code = await hostRoom(host);
  await joinRoom(guest, code);
  await expect(guest.getByTestId("net-status")).toContainText(/已连接|connected/, { timeout: 20_000 });

  // 主机是权威端：它自己那页照旧可点，提示也还是原来那条
  await openMusicSource(host);
  await expect(host.locator('[data-testid="music-mode-otomads"] input')).toBeEnabled();
  await expect(host.getByTestId("music-mode-host-controlled")).toHaveCount(0);

  // 访客：两个单选都禁用 + 提示「由主机决定」（手切会被下发的 config 改回去，D104 / D119）
  await openMusicSource(guest);
  await expect(guest.locator('[data-testid="music-mode-originals"] input')).toBeDisabled();
  await expect(guest.locator('[data-testid="music-mode-otomads"] input')).toBeDisabled();
  await expect(guest.getByTestId("music-mode-host-controlled")).toBeVisible();

  await context.close();
});

test("握手期拒绝：数据哈希不同的一端进不来（协议 v4：两个模式各比一次）", async ({ browser }) => {
  const context = await browser.newContext();
  const host = await context.newPage();
  await openGame(host, "/");
  const code = await hostRoom(host);

  // 访客页的数据换成"另一份"：两个模式各比一次，任一不同都在**握手期**被拒（契约 §6 C3）。
  // 注意：必须和主机同 context —— 本地 PeerServer 的配置在 localStorage 里。
  const guest = await context.newPage();
  await guest.addInitScript(() => {
    Object.defineProperty(window, "__TMC_DATA_HASH__", {
      configurable: true,
      get: () => ({ originals: "000000000000", otomads: "111111111111" }),
      set: () => undefined,
    });
  });
  await openGame(guest, "/");
  await joinRoom(guest, code);

  await expect(guest.getByTestId("net-error")).toBeVisible({ timeout: 30_000 });
  await expect(guest.getByTestId("net-error")).toContainText(/数据|data/i);
  // 主机不把被拒绝的一方算进参与者（参与者列表就是大厅文本里的 "N: 名字"）
  await expect(host.getByTestId("lobby")).not.toContainText("Guest");

  await context.close();
});

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

  // 双方都看到两名参与者（双标签页握手在整轮 E2E 末尾跑，默认 5s 会偶发超时，统一放宽）
  const HANDSHAKE = { timeout: 20_000 } as const;
  await expect(host.getByTestId("lobby")).toContainText("1: Guest", HANDSHAKE);
  await expect(guest.getByTestId("lobby")).toContainText("0: Host", HANDSHAKE);
  await expect(guest.getByTestId("net-status")).toContainText("connected", HANDSHAKE);

  // 聊天双向
  await guest.getByLabel("chat-input").fill("hi from guest");
  await guest.getByTestId("chat-send").click();
  await expect(host.getByTestId("chat-log")).toContainText("hi from guest", HANDSHAKE);
  await host.getByLabel("chat-input").fill("hi from host");
  await host.getByTestId("chat-send").click();
  await expect(guest.getByTestId("chat-log")).toContainText("hi from host", HANDSHAKE);

  // 各自补满自己的牌库（多人模式下不能替对方补牌）→ 开局
  await host.getByTestId("random-fill").click();
  await guest.getByTestId("random-fill").click();
  await expect.poll(async () => (await digest(host)).includes("p1["), { timeout: 20_000 }).toBe(true);
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
  await expect.poll(async () => (await digest(host)).includes("p1["), { timeout: 20_000 }).toBe(true);
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
