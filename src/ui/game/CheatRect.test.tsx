import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { CheatRect } from "./CheatRect";
import { enableCheat, isCheatReally, isCheatString } from "../../cheat";
import { glitchEnabled, preferLocalCards } from "../../runtime";

async function render(node: React.ReactElement): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return container;
}

describe("彩蛋", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    window.history.replaceState({}, "", "/");
  });

  it("答案提示框画出一圈随机色块", async () => {
    const container = await render(<CheatRect width={80} height={114} />);
    const rect = container.querySelector('[data-testid="cheat-rect"]');
    expect(rect).not.toBeNull();
    expect(rect!.children.length).toBeGreaterThan(5);
  });

  it("cheat 开关与哈希白名单", async () => {
    expect(isCheatReally()).toBe(false);
    // 白名单里是 SHA-256；未知明文一律不通过
    await expect(isCheatString("definitely-not-the-code")).resolves.toBe(false);
    enableCheat();
    expect(isCheatReally()).toBe(true);
  });

  it("URL 参数：?g / ?local", () => {
    window.history.replaceState({}, "", "/?g=1&local=1");
    expect(glitchEnabled()).toBe(true);
    expect(preferLocalCards()).toBe(true);
    window.history.replaceState({}, "", "/");
    expect(glitchEnabled()).toBe(false);
  });
});
