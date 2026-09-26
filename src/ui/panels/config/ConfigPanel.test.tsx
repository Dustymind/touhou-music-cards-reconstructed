/** 配置页交互：秘封父复选框是批量控制、三态开关、单曲模式（真实数据 + 真实 store）。 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DataBundle } from "../../../data/types";
import { loadRealBundle, renderHook } from "../../../test-utils";
import { presetStoreFor } from "../../../store/preset";
import { useSession } from "../../../store/session";
import { useNet } from "../../../net/useNet";

/** 面板测试固定在**原曲**模式下跑（B：这三把 store 按音乐模式分键）；
 *  只有"本地曲库地址"那几条要临时切到音MAD —— 原曲注册表里没有本地源，那个输入框不挂载。 */
const usePreset = presetStoreFor("originals");
const useSingleTrack = singleStoreFor("originals");
import { singleStoreFor } from "../../../store/single";
import { sourceStoreFor } from "../../../store/sources";
import { ConfigPanel } from "../ConfigPanel";
import { parseCustomManifest, withCustomManifest } from "../../../data/customManifest";
import { useCustomPreset } from "../../../store/customPreset";
import { useCustomSingle } from "../../../store/customSingle";
import type { TableMap } from "../../../music/sources";

let bundle: DataBundle;

/** 展开某个分区（分区默认折叠 → 内容不挂载，测试要交互得先展开）。 */
async function expand(container: HTMLElement, id: string): Promise<void> {
  const summary = container.querySelector(`[data-testid="section-${id}-summary"]`);
  if (!summary) throw new Error(`找不到分区：${id}`);
  await click(summary);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 320)); });
}

async function renderPanel(tables: TableMap = {}): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<ConfigPanel bundle={bundle} tables={tables} />);
  });
  return { container, root };
}

function input(container: HTMLElement, label: string): HTMLInputElement {
  const element = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!element) throw new Error(`找不到输入：${label}`);
  return element;
}

/** MUI 把 `data-testid` 落在 Radio 的根 span 上，真正的 input 在它内部（与图集那几条用例同款）。 */
function modeRadio(container: HTMLElement, mode: "originals" | "otomads"): HTMLInputElement {
  const element = container.querySelector<HTMLInputElement>(`[data-testid="music-mode-${mode}"] input`);
  if (!element) throw new Error(`找不到音乐模式单选：${mode}`);
  return element;
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function toggle(element: HTMLInputElement): Promise<void> {
  await act(async () => {
    element.click();
  });
}

/** 往受控输入里打字：React 在 input 上装了 value 追踪，直接赋 `element.value` 不会触发 onChange ✗
 *  —— 得走原型上的 setter，再派发一个真的 input 事件（与真人打字同一条路径）。 */
async function type(element: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** 本地曲库地址栏只在**音MAD**（注册表里有本地源）挂载：切模式 → 渲染 → 展开音源分区。 */
async function openLocalMusicUrl(): Promise<{ container: HTMLElement }> {
  useSession.setState({ musicMode: "otomads" });
  const { container } = await renderPanel();
  await expand(container, "source");
  return { container };
}

const MANIFEST_URL = "https://cards.example.com/manifest.json";

/** 模式 3 的清单（用它造一份"源已经把卡表取回来了"的数据）。 */
function customManifest(cards = 3) {
  return parseCustomManifest({
    schema: 1, mode: "custom",
    cards: [
      { id: "alice", name: "爱丽丝", cover: "cover/a.jpg", audio: "media/a.mp3", album: "旧作", title: "曲 a", author: "甲" },
      { id: "marisa", name: "魔理沙", cover: "cover/b.jpg", audio: "media/b.mp3", album: "新作", title: "曲 b", author: "乙" },
      { id: "reimu", name: "灵梦", cover: "cover/c.jpg", audio: "media/c.mp3", album: "新作", title: "曲 c" },
    ].slice(0, cards),
  }, MANIFEST_URL)!;
}

function customTable(cards = 3): TableMap {
  return { custom: { id: "custom", status: "ready", entries: new Map(), custom: customManifest(cards) } };
}

/** 模式 3 的设置页：切模式 → 渲染 → 展开某个分区。 */
async function openCustom(
  id: string,
  { tables = {}, cards = 3 }: { tables?: TableMap; cards?: number } = {},
): Promise<{ container: HTMLElement }> {
  useSession.setState({ musicMode: "custom", customSourceUrl: "", customSourceOverride: null });
  bundle = withCustomManifest(bundle, customManifest(cards));
  const { container } = await renderPanel(tables);
  await expand(container, id);
  return { container };
}

/** 模式 3 的源分区：只有"自定义源链接"那一行，没有开关/顺序/本地曲库地址。 */
async function openCustomSource(tables: TableMap = {}): Promise<{ container: HTMLElement }> {
  useSession.setState({ musicMode: "custom", customSourceUrl: "", customSourceOverride: null });
  const { container } = await renderPanel(tables);
  await expand(container, "source");
  return { container };
}

describe("ConfigPanel", () => {
  beforeEach(async () => {
    localStorage.clear();
    bundle = await loadRealBundle();
    usePreset.setState({
      albums: {}, hifuu: {},
      category: { 角色曲: "unset", 道中曲: "unset", 更多道中曲: "unset" },
    });
    useSingleTrack.setState({ enabled: false, pins: {}, disabledCharacters: {} });
    sourceStoreFor("originals").setState({ overrides: {} });
    useSession.setState({
      locale: "en", tab: "config", cardCollection: "dairi-sd", musicMode: "originals",
      localMusicUrl: "", customCardRatio: "16x9",
    });
    useNet.getState().leave();
    usePreset.getState().sync(bundle.datasets.originals.albums);
    useCustomPreset.setState({ albums: {}, authors: {} });
    useCustomSingle.setState({ disabled: {} });
  });

  /** 切音乐模式是**落盘**的（`setMusicMode` 走 session 的持久化），而浏览器模式下各测试文件
   *  共用同一个 localStorage ⇒ 留在音MAD 会让后面的 App 冒烟从音MAD 起步 ✗（实测：3 条红）。
   *  这个文件本来就从"空存档"起步（上面的 `localStorage.clear()`），跑完也还原成空存档 ✓。 */
  afterEach(() => {
    localStorage.clear();
  });

  it("设置分区默认折叠，展开后才挂载内容（MD2 扩展面板）", async () => {
    const { container } = await renderPanel();
    for (const id of ["data", "cardset", "source", "preset", "single"]) {
      expect(container.querySelector(`[data-testid="section-${id}"]`)).not.toBeNull();
      expect(container.querySelector(`[data-testid="section-${id}-content"]`)).toBeNull();   // 折叠时不挂载
    }
    // 标题始终可见（五个分区标题）
    expect(container.textContent).toContain("Card Settings");
    expect(container.textContent).toContain("Music Source");

    await expand(container, "single");
    expect(container.querySelector('[data-testid="section-single-content"]')).not.toBeNull();
    // 仅单曲模式只有一个开关（原版只有一个；之前头部与内容区各放了一个）
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBe(1);
  });

  it("卡面图集菜单：MD2 单选组（每套一行：单选 + id + 原版说明 + 三张示例卡）", async () => {
    const { container } = await renderPanel();
    await expand(container, "cardset");

    const rows = [...container.querySelectorAll('[data-testid^="cardset-row-"]')];
    // 6 套上游图集 + 1 套本项目自己的音MAD 本地图集（素材用户自己放，见 card-sets.toml）
    expect(rows.length).toBe(7);

    // 每套一个单选按钮，当前图集选中（MD2 用 radio 表达"多选一"）
    // data-testid 落在 Radio 的根 span 上（MUI 的转发规则），真正的 input 在它内部
    const radios = [...container.querySelectorAll('[data-testid^="cardset-radio-"]')]
      .map((element) => element.querySelector<HTMLInputElement>('input[type="radio"]'))
      .filter((element): element is HTMLInputElement => element !== null);
    expect(radios.length).toBe(7);
    const current = container.querySelector<HTMLInputElement>('[data-testid="cardset-radio-dairi-sd"] input')!;
    expect(current.checked).toBe(true);
    const other = container.querySelector<HTMLInputElement>('[data-testid="cardset-radio-zun"] input')!;
    expect(other.checked).toBe(false);

    // id + 原版说明 + 三张示例卡
    expect(rows[0]!.textContent).toContain("dairi-sd");
    expect(rows[0]!.textContent).toContain("Free super-deformed tachies from dairi Twitter");
    for (const row of rows) {
      expect(row.querySelectorAll("img").length).toBe(3);
    }

    // 点另一个图集能切换
    await click(container.querySelector('[data-testid="cardset-radio-zun"]')!.closest("label")!);
    expect(useSession.getState().cardCollection).toBe("zun");
  });

  it("渲染统计、秘封组、三态开关与 CD / 官作分组", async () => {
    const { container } = await renderPanel();
    await expand(container, "data");
    await expand(container, "preset");
    const text = container.textContent ?? "";
    expect(text).toContain("378");                    // 可用/全库（含 21 条补配）
    expect(text).toContain("Hifuu tracks");
    expect(text).toContain("Official games");
    expect(text).toContain("蓬莱人形 ～ Dolls in Pseudo Paradise");
    expect(text).toContain("東方錦上京 ～ Fossilized Wonders");   // CD/官作最后一格
  });

  it("秘封父复选框是批量控制（取消 → 12 张子项全取消；父项显示态派生）", async () => {
    const { container } = await renderPanel();
    await expand(container, "preset");
    const parent = input(container, "hifuu-parent");
    expect(parent.checked).toBe(true);
    await toggle(parent);
    const state = usePreset.getState();
    expect(Object.values(state.hifuu).every((value) => value === false)).toBe(true);
    expect(input(container, "hifuu-parent").checked).toBe(false);

    // 只勾回一张 → 父项半选
    await toggle(input(container, "hifuu-hr01"));
    // MUI 用 aria-checked="mixed" + data-indeterminate 表达半选（DOM 的 indeterminate 属性不暴露）
    expect(input(container, "hifuu-parent").getAttribute("aria-checked")).toBe("mixed");
    expect(usePreset.getState().hifuu["蓬莱人形 ～ Dolls in Pseudo Paradise"]).toBe(true);
  });

  it("三态开关写入预设，并且统计随之变化", async () => {
    const { container } = await renderPanel();
    await expand(container, "preset");
    const before = usePreset.getState();
    expect(before.category.角色曲).toBe("unset");
    await click(container.querySelector('[data-testid="tri-角色曲-off"]')!);
    expect(usePreset.getState().category.角色曲).toBe("off");
    // 236 条角色曲被否决 → 可用数下降（378 - 236 = 142）
    const stats = container.querySelector('[data-testid="preset-stats"]')!.textContent ?? "";
    expect(stats).toContain("142 / 378");
  });

  it("取消一张官作专辑只影响它自己的曲目", async () => {
    const { container } = await renderPanel();
    await expand(container, "preset");
    await toggle(input(container, "album-th20"));
    expect(usePreset.getState().albums["東方錦上京 ～ Fossilized Wonders"]).toBe(false);
    const stats = container.querySelector('[data-testid="preset-stats"]')!.textContent ?? "";
    expect(stats).toContain("364 / 378");   // 取消 th20 的 14 条
  });

  it("仅单曲模式：开关落盘；下拉只列预设启用的曲目；可禁用角色", async () => {
    const { container } = await renderPanel();
    await expand(container, "single");
    await expand(container, "preset");   // 该用例还要关掉「角色曲」预设
    await toggle(input(container, "single-mode"));
    expect(useSingleTrack.getState().enabled).toBe(true);

    // 选曲栏用 outlined（没有浮动标签就不该留上方标签位，否则文本不居中）
    const form = container.querySelector('[data-testid="single-select-chirizuka-ubame"]')!;
    expect(form.querySelector(".MuiOutlinedInput-root")).not.toBeNull();
    expect(form.querySelector(".MuiFilledInput-root")).toBeNull();

    // 关掉「角色曲」后，下拉里不应再出现角色曲
    await click(container.querySelector('[data-testid="tri-角色曲-off"]')!);
    const combobox = container
      .querySelector('[data-testid="single-select-chirizuka-ubame"]')!
      .querySelector('[role="combobox"]')!;
    await act(async () => {
      combobox.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    const options = Array.from(document.querySelectorAll('[role="option"]'))
      .map((node) => node.textContent ?? "");
    expect(options.length).toBeGreaterThan(0);
    // 尘塚ウバメ 有 1 条角色曲 + 1 条道中曲；关掉角色曲后只剩道中曲
    expect(options.some((label) => label.includes("角色曲"))).toBe(false);
    expect(options.some((label) => label.includes("愛おしき塵の住処"))).toBe(true);
  });

  it("禁用角色后它从可用队列里消失", async () => {
    const { container } = await renderPanel();
    await expand(container, "single");
    const hook = await renderHook(() => useSingleTrack((state) => state.disabledCharacters));
    await click(container.querySelector('[data-testid="single-disable-cirno"]')!);
    expect(hook.result.current.cirno).toBe(true);
    await click(container.querySelector('[data-testid="single-disable-cirno"]')!);
    expect(hook.result.current.cirno).toBeUndefined();
  });

  it("房内客户端：音乐模式单选禁用，提示改成「由主机决定」", async () => {
    const { container } = await renderPanel();
    await expand(container, "source");
    expect(modeRadio(container, "otomads").disabled).toBe(false);        // 还没进房

    await act(async () => { useNet.setState({ role: "client" }); });     // 进房 → 本机是客户端

    expect(modeRadio(container, "originals").disabled).toBe(true);
    expect(modeRadio(container, "otomads").disabled).toBe(true);
    expect(container.querySelector('[data-testid="music-mode-hint"]')).toBeNull();
    expect(container.querySelector('[data-testid="music-mode-host-controlled"]')?.textContent)
      .toContain("Set by the host while you are in a room.");

    // 第一道：disabled 让 label 的点击不落到 input 上
    await click(container.querySelector('[data-testid="music-mode-otomads"]')!.closest("label")!);
    expect(useSession.getState().musicMode).toBe("originals");

    // 第二道：把 disabled 摘掉，单独验 onChange 里那句 guard（双保险里的后一道）
    const radio = modeRadio(container, "otomads");
    radio.disabled = false;
    await toggle(radio);
    expect(useSession.getState().musicMode).toBe("originals");
  });

  it("没进房或自己是主机：音乐模式照旧可点，提示回到原来的口径", async () => {
    useNet.setState({ role: "host" });                                   // 主机是权威端，模式由它定
    const { container } = await renderPanel();
    await expand(container, "source");

    expect(container.querySelector('[data-testid="music-mode-host-controlled"]')).toBeNull();
    expect(container.querySelector('[data-testid="music-mode-hint"]')?.textContent)
      .toContain("Originals uses the mirrors below");
    expect(modeRadio(container, "otomads").disabled).toBe(false);

    await click(container.querySelector('[data-testid="music-mode-otomads"]')!.closest("label")!);
    expect(useSession.getState().musicMode).toBe("otomads");
  });

  it("本地曲库地址：输入 → 应用后输入框与 store 一致，并继续跟着 store 走", async () => {
    const { container } = await openLocalMusicUrl();

    await type(input(container, "local-music-url"), "  127.0.0.1:9000  ");
    await click(container.querySelector('[data-testid="local-music-apply"]')!);

    // 应用写回的是 trim 过的值；输入框显示的必须是它，而不是留在编辑区里的原样（旧实现留着草稿 ✗）
    expect(useSession.getState().localMusicUrl).toBe("127.0.0.1:9000");
    expect(input(container, "local-music-url").value).toBe("127.0.0.1:9000");

    // 应用之后回到"没在编辑"：别处写 store，输入框跟着变（旧实现里草稿还在，会一直显示旧值 ✗）
    await act(async () => { useSession.getState().setLocalMusicUrl("127.0.0.1:9999"); });
    expect(input(container, "local-music-url").value).toBe("127.0.0.1:9999");
  });

  it("本地曲库地址：输入框回显 store 的真值（挂载时与别处写入都是）", async () => {
    // 挂载前就在 store 里的值（`?localmusic=` 只在 store 初始化时读一次）→ 输入框直接显示它
    await act(async () => { useSession.getState().setLocalMusicUrl("127.0.0.1:8080"); });
    const { container } = await openLocalMusicUrl();
    expect(input(container, "local-music-url").value).toBe("127.0.0.1:8080");

    // 别处再写 store → 输入框跟着变（旧实现停在挂载时复制的那一份上 ✗）
    await act(async () => { useSession.getState().setLocalMusicUrl("127.0.0.1:9000"); });
    expect(input(container, "local-music-url").value).toBe("127.0.0.1:9000");
    // 只是回显：store 没有被输入框反写
    expect(useSession.getState().localMusicUrl).toBe("127.0.0.1:9000");
  });

  it("本地曲库地址：正在输入时外部变更不吞掉还没应用的内容", async () => {
    const { container } = await openLocalMusicUrl();

    await type(input(container, "local-music-url"), "127.0.0.1:9000");   // 没点应用 = 还在编辑
    await act(async () => { useSession.getState().setLocalMusicUrl("127.0.0.1:9999"); });

    // 编辑中的内容不被外部变更冲掉（"渲染期同步草稿"那种写法会在这里翻车）
    expect(input(container, "local-music-url").value).toBe("127.0.0.1:9000");
    expect(useSession.getState().localMusicUrl).toBe("127.0.0.1:9999");
  });

  it("本地曲库地址：有新覆盖时「重置」可点，点了回到默认（store 与输入框都空）并变灰", async () => {
    // 默认值 = 空串 = 不覆盖（注册表里的 `manifest.json`，同源形态下即本站）
    await act(async () => { useSession.getState().setLocalMusicUrl("127.0.0.1:8011"); });
    const { container } = await openLocalMusicUrl();
    const reset = () => container.querySelector<HTMLButtonElement>('[data-testid="local-music-reset"]')!;

    expect(input(container, "local-music-url").value).toBe("127.0.0.1:8011");
    expect(reset().disabled).toBe(false);

    await click(reset());

    // 覆盖被清掉：落盘的也是空串（`pickString` 认空串 ⇒ 刷新后仍是默认）
    expect(useSession.getState().localMusicUrl).toBe("");
    expect(input(container, "local-music-url").value).toBe("");
    expect(reset().disabled).toBe(true);
  });

  it("本地曲库地址：只打了草稿（store 还是默认）时「重置」也可点，负责把草稿丢掉", async () => {
    const { container } = await openLocalMusicUrl();

    // 还没应用 ⇒ 按钮一开始照样是灰的
    expect(container.querySelector<HTMLButtonElement>('[data-testid="local-music-reset"]')!.disabled).toBe(true);
    await type(input(container, "local-music-url"), "127.0.0.1:9000");
    // 所见即所得：框里有字就可点（此时 store 仍是默认值）
    const reset = container.querySelector<HTMLButtonElement>('[data-testid="local-music-reset"]')!;
    expect(reset.disabled).toBe(false);
    expect(useSession.getState().localMusicUrl).toBe("");

    await click(reset);

    expect(input(container, "local-music-url").value).toBe("");
    expect(useSession.getState().localMusicUrl).toBe("");     // 没有被草稿写进去
  });

  // ---- 模式 3（自定义）：一条源、一行地址、没有开关（契约 custom-mode-v1 C7 / D157）----

  it("自定义源：只挂载那一行（没有开关 / 上移下移 / 本地曲库地址），空值时给红色必填提示", async () => {
    const { container } = await openCustomSource();

    expect(container.querySelector('[data-testid="custom-source"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="local-music-url"]')).toBeNull();
    expect(container.querySelector('[data-testid="source-fallback-order"]')).toBeNull();
    expect(container.querySelector('[data-testid="source-state-custom"]')).toBeNull();

    // 空 = 还没填：红色提示 + 「重置」无事可做 ⇒ 灰掉；也没发过请求 ⇒ 不显示源状态
    expect(container.querySelector('[data-testid="custom-source-required"]')).not.toBeNull();
    expect(container.querySelector<HTMLButtonElement>('[data-testid="custom-source-reset"]')!.disabled).toBe(true);
    expect(container.querySelector('[data-testid="custom-source-loaded"]')).toBeNull();
  });

  it("模式 3：音乐选择 = 专辑三元 + 作者三元（没有类别开关、没有秘封碟、没有专辑复选）", async () => {
    const { container } = await openCustom("preset");

    expect(container.querySelector('[data-testid="custom-preset-stats"]')).not.toBeNull();
    // 两行专辑（清单里首次出现的顺序）+ 两行作者（乙、甲按拼音/字母序）
    expect(container.querySelector('[data-testid="custom-album-旧作-unset"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="custom-album-新作-unset"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="custom-author-甲-unset"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="custom-author-乙-unset"]')).not.toBeNull();
    // 另两个模式那套东西一样都不出现
    expect(container.querySelector('[data-testid="tri-角色曲-unset"]')).toBeNull();
    expect(container.querySelector('[data-testid="hifuu-parent"]')).toBeNull();
    expect(container.querySelector('input[aria-label^="album-"]')).toBeNull();
    // 没有写作者的"灵梦"不进作者列表（Q7）：作者行只有两条
    expect(container.querySelectorAll('[data-testid^="custom-author-"][data-testid$="-unset"]').length)
      .toBe(2);
  });

  it("模式 3：点专辑/作者三态 ⇒ 写进那把 store（并落盘）", async () => {
    const { container } = await openCustom("preset");
    await click(container.querySelector('[data-testid="custom-album-旧作-off"]')!);
    await click(container.querySelector('[data-testid="custom-author-甲-on"]')!);

    expect(useCustomPreset.getState().albums["旧作"]).toBe("off");
    expect(useCustomPreset.getState().authors["甲"]).toBe("on");
  });

  it("模式 3：仅单曲模式只剩逐卡禁用（没有总开关、没有下拉选曲）", async () => {
    const { container } = await openCustom("single");

    expect(container.querySelector('input[aria-label="single-mode"]')).toBeNull();
    expect(container.querySelector('[data-testid="single-select-alice"]')).toBeNull();
    expect(container.querySelector('[data-testid="custom-single-row-alice"]')).not.toBeNull();
    expect(container.textContent).toContain("曲 a · 旧作 · 甲");

    await click(container.querySelector('[data-testid="custom-single-disable-alice"]')!);
    expect(useCustomSingle.getState().disabled).toEqual({ alice: true });
  });

  it("模式 3：卡面设置分区 = 一行只读说明 + 两档卡面比例，图集单选一行都不列（契约 C3 + D164）", async () => {
    const { container } = await openCustomSource();
    await expand(container, "cardset");

    expect(container.querySelector('[data-testid="cardset-fixed"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid^="cardset-row-"]').length).toBe(0);
    // 两档都在，默认选中 16:9；点一下 4:3 就落盘（刷新后还在）
    const wide = container.querySelector<HTMLInputElement>('[data-testid="card-ratio-16x9"]')!;
    const tall = container.querySelector<HTMLInputElement>('[data-testid="card-ratio-4x3"]')!;
    expect(wide.getAttribute("aria-pressed")).toBe("true");
    expect(tall.getAttribute("aria-pressed")).toBe("false");

    await click(tall);
    expect(useSession.getState().customCardRatio).toBe("4x3");
    expect(tall.getAttribute("aria-pressed")).toBe("true");
    expect(wide.getAttribute("aria-pressed")).toBe("false");

    // 另两个模式**没有**这两档（比例只属于自带卡面的模式）
    await act(async () => { useSession.setState({ musicMode: "originals" }); });
    expect(container.querySelector('[data-testid="card-ratio-16x9"]')).toBeNull();
    expect(container.querySelector('[data-testid^="cardset-row-"]')).not.toBeNull();
  });

  it("自定义源：填地址 → 应用 ⇒ 落盘；取回清单后状态显示**卡数**（不是 entries.size）", async () => {
    const { container } = await openCustomSource(customTable(3));
    await type(input(container, "custom-source-url"), "https://cards.example.com");
    await click(container.querySelector('[data-testid="custom-source-apply"]')!);

    expect(useSession.getState().customSourceUrl).toBe("https://cards.example.com");
    expect(container.querySelector('[data-testid="custom-source-required"]')).toBeNull();
    expect(container.querySelector('[data-testid="custom-source-loaded"]')!.textContent)
      .toContain("3");
  });

  it("自定义源：「重置」只把值清成空串（不是回默认值 —— 这里的默认值本来就是空）", async () => {
    useSession.setState({ musicMode: "custom", customSourceUrl: "https://cards.example.com" });
    const { container } = await renderPanel();
    await expand(container, "source");
    expect(input(container, "custom-source-url").value).toBe("https://cards.example.com");

    await click(container.querySelector('[data-testid="custom-source-reset"]')!);
    expect(input(container, "custom-source-url").value).toBe("");
    expect(useSession.getState().customSourceUrl).toBe("");
  });

  it("自定义源：主机下发的值显示在框里，并注明「来自主机」（F3：只在本会话生效）", async () => {
    useSession.setState({ musicMode: "custom", customSourceUrl: "https://mine.example.com" });
    useSession.getState().adoptCustomSourceUrl("https://host.example.com");
    const { container } = await renderPanel();
    await expand(container, "source");

    expect(input(container, "custom-source-url").value).toBe("https://host.example.com");
    expect(container.querySelector('[data-testid="custom-source-from-host"]')).not.toBeNull();
    // 存档没被改写：离开房间就回到自己的源
    expect(useSession.getState().customSourceUrl).toBe("https://mine.example.com");
  });
});
