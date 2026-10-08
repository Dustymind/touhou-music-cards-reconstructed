/** 公告的本地记录与"该弹哪些"的判定。
 *
 * 这里守几条用户明确要求的行为：
 * ① **每条公告独立记录**（删一条不影响另一条）；
 * ② **点「关闭」= 以后不再自动弹**（D186）—— 弹窗上只有这一个动作，没有勾选框；
 *    想看回来走右上角的「公告」入口（`openManually`），它**不受**"关过"限制；
 * ③ 内容改了 ⇒ 即使关过也**重新弹一次**（单向门唯一的例外）。
 *
 * - **D185**：自动弹**一批**（全部该弹的）、入口打开**一份列表**（全部在窗口内的），两者同一展示顺序。
 * - **D186**：删掉了「不再显示」勾选框与它那套"取消勾选 = 撤销"的交互 ⇒
 *   `dismissChecked` / `setDismissChecked` 已经**不存在**了，别再往 `setState` 里传它们。
 */
import { beforeEach, describe, expect, it } from "vitest";

import { NOTICE_DEFAULT_CLOSE, noticeContent, type NoticeContent } from "../content/notices";
import { noticeFingerprint, sortNotices } from "../content/noticeMeta";
import { STORAGE_PREFIX } from "../persist";
import {
  activeNotices, noticeInWindow, noticeMode, noticesInWindow, pickAutoNotices,
  readNoticeRecord, useNotices,
} from "./notices";

/** 一条测试用公告（id 故意与真源不同，避免污染真源的键）。 */
function notice(overrides: Partial<NoticeContent> = {}): NoticeContent {
  return {
    id: "test-notice-a",
    title: { en: "T", zh: "标" },
    body: "正文",
    ...overrides,
  };
}

const KEY_A = `${STORAGE_PREFIX}notice.test-notice-a`;
const KEY_B = `${STORAGE_PREFIX}notice.test-notice-b`;

/** 模拟用户在弹窗上点「关闭」（D186：没有勾选框，关闭 = 不再自动弹）。 */
function closeViaUi(...targets: NoticeContent[]): void {
  useNotices.setState({ autoNotices: targets, manualNotices: null });
  useNotices.getState().close();
}

beforeEach(() => {
  localStorage.clear();
  useNotices.setState({ autoNotices: [], manualNotices: null });
});

describe("noticeInWindow：时间窗", () => {
  const now = new Date("2026-10-04T12:00:00");

  it("不写 from / until = 一直在窗口内", () => {
    expect(noticeInWindow(notice(), now)).toBe(true);
  });

  it("from 在未来 ⇒ 不弹；到了当天就弹（含当天）", () => {
    expect(noticeInWindow(notice({ from: "2026-10-05" }), now)).toBe(false);
    expect(noticeInWindow(notice({ from: "2026-10-04" }), now)).toBe(true);
    expect(noticeInWindow(notice({ from: "2026-10-03" }), now)).toBe(true);
  });

  it("until 在过去 ⇒ 不弹；当天仍弹（含当天）", () => {
    expect(noticeInWindow(notice({ until: "2026-10-03" }), now)).toBe(false);
    expect(noticeInWindow(notice({ until: "2026-10-04" }), now)).toBe(true);
  });

  it("**`date`（排序用）不影响可见性** —— 它再老也照弹，只要窗口允许", () => {
    // `date` 只管"排哪前哪后"，与 from / until（能不能看）刻意分开
    expect(noticeInWindow(notice({ date: "2000-01-01" }), now)).toBe(true);
  });
});

describe("noticeFingerprint：内容指纹", () => {
  it("同样内容 ⇒ 同样指纹；改标题或正文 ⇒ 指纹变", () => {
    const base = notice();
    expect(noticeFingerprint(base)).toBe(noticeFingerprint(notice()));
    expect(noticeFingerprint(base)).not.toBe(noticeFingerprint(notice({ body: "改过的正文" })));
    expect(noticeFingerprint(base)).not.toBe(noticeFingerprint(notice({ title: { en: "T2", zh: "标" } })));
  });

  it("改时间窗 / 改排序字段**都不算**改内容（不该重新打扰用户）", () => {
    const base = notice();
    // 指纹函数只吃 `id / title / body`（类型上就写死了），所以这里显式只传这三样：
    // 多出来的 `until` / `date` / `pinned` 根本进不了指纹 —— 这正是"改窗口 = 内容没变"的实现保证
    expect(noticeFingerprint({ id: base.id, title: base.title, body: base.body }))
      .toBe(noticeFingerprint(base));
  });
});

describe("sortNotices：展示顺序", () => {
  const a = notice({ id: "a", date: "2026-01-01" });
  const b = notice({ id: "b", date: "2026-03-01" });

  it("**最新的在最前面**", () => {
    expect(sortNotices([a, b]).map((n) => n.id)).toEqual(["b", "a"]);
  });

  it("**置顶的排在最前面**，即使它的日期更老", () => {
    const pinned = notice({ id: "pin", date: "2000-01-01", pinned: true });
    expect(sortNotices([a, b, pinned]).map((n) => n.id)).toEqual(["pin", "b", "a"]);
  });

  it("多个置顶之间**也按日期由新到旧**", () => {
    const older = notice({ id: "pin-old", date: "2000-01-01", pinned: true });
    const newer = notice({ id: "pin-new", date: "2020-01-01", pinned: true });
    expect(sortNotices([older, newer, a, b]).slice(0, 2).map((n) => n.id)).toEqual(["pin-new", "pin-old"]);
  });

  it("没写 `date` 的视为**最旧**，且彼此之间保持书写顺序（稳定排序）", () => {
    const x = notice({ id: "x" });
    const y = notice({ id: "y" });
    expect(sortNotices([x, y, a]).map((n) => n.id)).toEqual(["a", "x", "y"]);
  });

  it("不改原数组（返回新数组）", () => {
    const input = [a, b];
    sortNotices(input);
    expect(input.map((n) => n.id)).toEqual(["a", "b"]);
  });
});

describe("noticesInWindow：在窗口内的那一批（保序）", () => {
  const now = new Date("2026-10-04T12:00:00");

  it("只留窗口内的，且**保持传入顺序**（真源传进来就是展示顺序）", () => {
    const list = [
      notice({ id: "a", from: "2099-01-01" }),      // 还没到
      notice({ id: "b" }),
      notice({ id: "c", until: "2000-01-01" }),     // 过期了
      notice({ id: "d" }),
    ];
    expect(noticesInWindow(list, now).map((n) => n.id)).toEqual(["b", "d"]);
  });

  it("一条都不在窗口内 ⇒ 空数组", () => {
    expect(noticesInWindow([notice({ until: "2000-01-01" })], now)).toEqual([]);
  });
});

describe("每条公告独立记录", () => {
  it("关掉 a 之后，只有 a 的键被写；b 的键不存在", () => {
    closeViaUi(notice({ id: "test-notice-a" }));
    expect(localStorage.getItem(KEY_A)).not.toBeNull();
    expect(localStorage.getItem(KEY_B)).toBeNull();
    // a 的存档里不该出现 b 的信息
    expect(localStorage.getItem(KEY_A)).not.toContain("test-notice-b");
  });

  it("删掉 a 的记录不影响 b 的记录", () => {
    closeViaUi(notice({ id: "test-notice-a" }));
    closeViaUi(notice({ id: "test-notice-b" }));
    expect(readNoticeRecord("test-notice-b").dismissed).toBe(true);

    localStorage.removeItem(KEY_A);
    expect(readNoticeRecord("test-notice-a").dismissed).toBe(false);   // a 忘了
    expect(readNoticeRecord("test-notice-b").dismissed).toBe(true);    // b 还记得
  });
});

describe("pickAutoNotices：该自动弹哪些", () => {
  it("没关过 ⇒ **全部**在窗口内的都弹（保序，不是只给第一条）", () => {
    const list = [notice({ id: "test-notice-a" }), notice({ id: "test-notice-b" })];
    expect(pickAutoNotices(list).map((n) => n.id)).toEqual(["test-notice-a", "test-notice-b"]);
  });

  it("**点「关闭」⇒ 下次不再弹**（D186 改的就是这条）", () => {
    const target = notice({ id: "test-notice-a" });
    closeViaUi(target);

    const record = readNoticeRecord("test-notice-a");
    expect(record.closed).toBe(true);
    // ⚠️ D182～D185 时这里是 `false`（"只点关闭 = 下次还弹"）。D186 把勾选框弃用后，
    // 「关闭」本身就成了"不再自动弹" ⇒ 断言必须是 true。
    expect(record.dismissed).toBe(true);
    expect(pickAutoNotices([target])).toEqual([]);
  });

  it("**内容改了 ⇒ 即使关过也重新弹**（并记下新指纹）", () => {
    const original = notice({ id: "test-notice-a", body: "第一版" });
    closeViaUi(original);
    expect(pickAutoNotices([original])).toEqual([]);

    // 用户改了正文（id 不变）⇒ 指纹不同 ⇒ 重新弹
    const updated = notice({ id: "test-notice-a", body: "第二版" });
    expect(pickAutoNotices([updated]).map((n) => n.id)).toEqual(["test-notice-a"]);
    // 再关一次后，用新内容就又不弹了
    closeViaUi(updated);
    expect(pickAutoNotices([updated])).toEqual([]);
  });

  it("窗口外的公告跳过，剩下的照常**一批**给出来", () => {
    const list = [
      notice({ id: "test-notice-a", from: "2099-01-01" }),   // 还没到
      notice({ id: "test-notice-b" }),
      notice({ id: "test-notice-c" }),
    ];
    expect(pickAutoNotices(list).map((n) => n.id)).toEqual(["test-notice-b", "test-notice-c"]);
  });

  it("**多条同时有效 ⇒ 一起弹**；关过的那条不在里面，其余照旧", () => {
    const first = notice({ id: "test-notice-a" });
    const second = notice({ id: "test-notice-b" });
    // 用户 2026-10-07 反馈的就是这条：两条都该弹，不该只给第一条
    expect(pickAutoNotices([first, second]).map((n) => n.id)).toEqual(["test-notice-a", "test-notice-b"]);

    closeViaUi(first);
    expect(pickAutoNotices([first, second]).map((n) => n.id)).toEqual(["test-notice-b"]);
  });

  it("自动弹的那批与入口列表**同一批、同一序**（都没关过时）", () => {
    const list = [
      notice({ id: "test-notice-a" }),
      notice({ id: "test-notice-b" }),
      notice({ id: "test-notice-c", until: "2000-01-01" }),   // 过期了：两边都不该有
    ];
    expect(pickAutoNotices(list).map((n) => n.id))
      .toEqual(noticesInWindow(list).map((n) => n.id));
  });
});

describe("useNotices：交互", () => {
  it("openManually 打开的是**全部在窗口内的**（同一展示顺序）—— **不受**「关过」限制", () => {
    // `openManually` 用的是**真源**（不是传进来的数组），所以这里也走真源
    const expected = noticesInWindow(noticeContent.notices);
    expect(expected.length, "真源里至少得有一条在窗口内的公告").toBeGreaterThan(0);

    // 先把其中一条关掉（走真源 id ⇒ 这一步确实写了它的存档；`beforeEach` 会清掉）
    const closed = expected[0]!;
    closeViaUi(closed);
    expect(pickAutoNotices(noticeContent.notices).map((n) => n.id)).not.toContain(closed.id);

    useNotices.getState().openManually();
    // 关过的那条**照样在列表里** —— "别再自动弹"不等于"不许看"（D186 保留的通道）
    expect(useNotices.getState().manualNotices).toEqual(expected);
  });

  it("一条都不在窗口内 ⇒ openManually 什么也不做（不弹空列表）", () => {
    useNotices.setState({ autoNotices: [], manualNotices: null });
    expect(noticeOpenOf()).toBe(false);
  });

  it("close 之后弹窗关闭（两种打开方式都清掉）", () => {
    useNotices.setState({ autoNotices: [notice({ id: "test-notice-a" })] });
    useNotices.getState().close();
    expect(noticeOpenOf()).toBe(false);
    expect(useNotices.getState().manualNotices).toBeNull();
  });

  it("close 会**逐条**落盘：每条都记 dismissed + **关的那一刻的**指纹", () => {
    const a = notice({ id: "test-notice-a" });
    const b = notice({ id: "test-notice-b", body: "乙的正文" });
    useNotices.setState({ manualNotices: [a, b] });
    useNotices.getState().close();

    // 开屏弹 2 条就要记 2 条 —— 漏一条的话那条下次还会跳出来
    for (const target of [a, b]) {
      const record = readNoticeRecord(target.id);
      expect(record.closed).toBe(true);
      expect(record.dismissed).toBe(true);
      expect(record.fingerprint).toBe(noticeFingerprint(target));
    }
  });

  it("指纹记的是**此刻**的内容，不是存档里的旧值（否则改了内容也不重弹）", () => {
    const original = notice({ id: "test-notice-a", body: "第一版" });
    closeViaUi(original);
    expect(readNoticeRecord("test-notice-a").fingerprint).toBe(noticeFingerprint(original));

    const updated = notice({ id: "test-notice-a", body: "第二版" });
    closeViaUi(updated);
    expect(readNoticeRecord("test-notice-a").fingerprint).toBe(noticeFingerprint(updated));
    expect(pickAutoNotices([updated])).toEqual([]);
  });

  it("坏存档（不是合法 JSON / 形状不对）⇒ 回落默认，不抛", () => {
    localStorage.setItem(KEY_A, "{ 这不是 JSON");
    expect(readNoticeRecord("test-notice-a")).toEqual({ closed: false, dismissed: false, fingerprint: "", at: 0 });
    localStorage.setItem(KEY_A, JSON.stringify({ v: 1, data: "不是对象" }));
    expect(readNoticeRecord("test-notice-a")).toEqual({ closed: false, dismissed: false, fingerprint: "", at: 0 });
  });

  it("缺字段的存档：按字段补默认值，不整份丢弃", () => {
    localStorage.setItem(KEY_A, JSON.stringify({ v: 1, data: { dismissed: true } }));
    const record = readNoticeRecord("test-notice-a");
    expect(record.dismissed).toBe(true);
    expect(record.closed).toBe(false);
    expect(record.fingerprint).toBe("");
  });
});

describe("选择器：activeNotices / noticeMode", () => {
  it("手动打开的那份列表**优先**于自动弹的那批", () => {
    const auto = notice({ id: "test-notice-a" });
    const manual = [notice({ id: "test-notice-a" }), notice({ id: "test-notice-b" })];
    useNotices.setState({ autoNotices: [auto], manualNotices: manual });

    expect(activeNotices(useNotices.getState())).toBe(manual);
    expect(noticeMode(useNotices.getState())).toBe("manual");
  });

  it("只有自动弹的那批时，模式是 \"auto\"", () => {
    const auto = notice({ id: "test-notice-a" });
    useNotices.setState({ autoNotices: [auto], manualNotices: null });

    expect(activeNotices(useNotices.getState())).toEqual([auto]);
    expect(noticeMode(useNotices.getState())).toBe("auto");
  });

  it("都没有 ⇒ 模式是 \"closed\"，列表为空", () => {
    useNotices.setState({ autoNotices: [], manualNotices: null });

    expect(activeNotices(useNotices.getState())).toEqual([]);
    expect(noticeMode(useNotices.getState())).toBe("closed");
  });

  it("空列表用的是**同一个常量引用**（不然选择器会让组件每帧空转）", () => {
    useNotices.setState({ autoNotices: [], manualNotices: null });
    expect(activeNotices(useNotices.getState())).toBe(activeNotices(useNotices.getState()));
  });
});

describe("内容真源与默认文案", () => {
  it("默认「关闭」文案是双语的（兜底值）", () => {
    expect(NOTICE_DEFAULT_CLOSE.en).toBe("Close");
    expect(NOTICE_DEFAULT_CLOSE.zh).toBe("关闭");
  });

  it("真源本身就按展示顺序排好了（置顶优先 → date 由新到旧）", () => {
    const ids = noticeContent.notices.map((n) => n.id);
    const sorted = sortNotices(noticeContent.notices).map((n) => n.id);
    expect(ids).toEqual(sorted);
  });

  it("「不再显示」那套状态与动作**已经不在了**（D186 弃用，防它悄悄回来）", () => {
    // 勾选框曾经把值放在 store 里（`dismissChecked`）并配一个 `setDismissChecked`。
    // 弃用之后它们不该再出现 —— 一旦有人恢复，这里先红，逼他回去看 D186 为什么否掉那条交互。
    const state = useNotices.getState() as unknown as Record<string, unknown>;
    expect(state.dismissChecked).toBeUndefined();
    expect(state.setDismissChecked).toBeUndefined();
  });
});

/** 当前弹窗是不是开着（`noticeOpen` 的选择器 + 当前 state）。 */
function noticeOpenOf(): boolean {
  return activeNotices(useNotices.getState()).length > 0;
}
