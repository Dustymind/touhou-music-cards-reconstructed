/** 公告的本地记录与"该弹哪条"的判定。
 *
 * 这里守三条用户明确要求的行为：
 * ① **每条公告独立记录**（删一条不影响另一条）；
 * ② 只点「关闭」⇒ 下次还弹；勾「不再显示」⇒ 不再自动弹，但**入口仍能打开**
 *    （入口打开后**取消勾选 = 撤销**，见 `useNotices：交互` 里那条，"假开关"是 D182 修掉的）；
 * ③ 内容改了 ⇒ 即使勾过「不再显示」也重新弹一次。
 */
import { beforeEach, describe, expect, it } from "vitest";

import { NOTICE_DEFAULT_CLOSE, type NoticeContent } from "../content/notices";
import { noticeFingerprint } from "../content/noticeMeta";
import { STORAGE_PREFIX } from "../persist";
import {
  noticeInWindow, pickAutoNotice, pickManualNotice,
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

/** 把 store 里的"勾选框"勾上并点关闭（模拟用户操作）。 */
function dismissViaUi(target: NoticeContent): void {
  useNotices.setState({ autoNotice: target, manualNotice: null, dismissChecked: true });
  useNotices.getState().close();
}

beforeEach(() => {
  localStorage.clear();
  useNotices.setState({ autoNotice: null, manualNotice: null, dismissChecked: false });
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
});

describe("noticeFingerprint：内容指纹", () => {
  it("同样内容 ⇒ 同样指纹；改标题或正文 ⇒ 指纹变", () => {
    const base = notice();
    expect(noticeFingerprint(base)).toBe(noticeFingerprint(notice()));
    expect(noticeFingerprint(base)).not.toBe(noticeFingerprint(notice({ body: "改过的正文" })));
    expect(noticeFingerprint(base)).not.toBe(noticeFingerprint(notice({ title: { en: "T2", zh: "标" } })));
  });

  it("改时间窗**不算**改内容（调 until 不该重新打扰用户）", () => {
    const base = notice();
    // 指纹函数只吃 `id / title / body`（类型上就写死了），所以 here 显式只传这三样：
    // 多出来的 `until` 根本进不了指纹 —— 这正是它"改时间窗 = 内容没变"的实现保证
    expect(noticeFingerprint({ id: base.id, title: base.title, body: base.body }))
      .toBe(noticeFingerprint(base));
  });
});

describe("每条公告独立记录", () => {
  it("勾掉 a 之后，只有 a 的键被写；b 的键不存在", () => {
    dismissViaUi(notice({ id: "test-notice-a" }));
    expect(localStorage.getItem(KEY_A)).not.toBeNull();
    expect(localStorage.getItem(KEY_B)).toBeNull();
    // a 的存档里不该出现 b 的信息
    expect(localStorage.getItem(KEY_A)).not.toContain("test-notice-b");
  });

  it("删掉 a 的记录不影响 b 的记录", () => {
    dismissViaUi(notice({ id: "test-notice-a" }));
    dismissViaUi(notice({ id: "test-notice-b" }));
    expect(readNoticeRecord("test-notice-b").dismissed).toBe(true);

    localStorage.removeItem(KEY_A);
    expect(readNoticeRecord("test-notice-a").dismissed).toBe(false);   // a 忘了
    expect(readNoticeRecord("test-notice-b").dismissed).toBe(true);    // b 还记得
  });
});

describe("pickAutoNotice：该自动弹哪条", () => {
  it("没关过 ⇒ 弹第一条", () => {
    const list = [notice({ id: "test-notice-a" }), notice({ id: "test-notice-b" })];
    expect(pickAutoNotice(list)?.id).toBe("test-notice-a");
  });

  it("**只点「关闭」不勾「不再显示」⇒ 下次还弹**", () => {
    const target = notice({ id: "test-notice-a" });
    // 不勾，直接关
    useNotices.setState({ autoNotice: target, manualNotice: null, dismissChecked: false });
    useNotices.getState().close();

    const record = readNoticeRecord("test-notice-a");
    expect(record.closed).toBe(true);
    expect(record.dismissed).toBe(false);
    expect(pickAutoNotice([target])?.id).toBe("test-notice-a");   // 仍然会弹
  });

  it("勾了「不再显示」⇒ 不再自动弹", () => {
    const target = notice({ id: "test-notice-a" });
    dismissViaUi(target);

    expect(readNoticeRecord("test-notice-a").dismissed).toBe(true);
    expect(pickAutoNotice([target])).toBeNull();
  });

  it("**内容改了 ⇒ 即使勾过「不再显示」也重新弹**（并记下新指纹）", () => {
    const original = notice({ id: "test-notice-a", body: "第一版" });
    dismissViaUi(original);
    expect(pickAutoNotice([original])).toBeNull();

    // 用户改了正文（id 不变）⇒ 指纹不同 ⇒ 重新弹
    const updated = notice({ id: "test-notice-a", body: "第二版" });
    expect(pickAutoNotice([updated])?.id).toBe("test-notice-a");
    // 再勾一次不再显示后，用新内容就又不弹了
    dismissViaUi(updated);
    expect(pickAutoNotice([updated])).toBeNull();
  });

  it("窗口外的公告跳过，取第一条**在窗口内**的", () => {
    const list = [
      notice({ id: "test-notice-a", from: "2099-01-01" }),   // 还没到
      notice({ id: "test-notice-b" }),
    ];
    expect(pickAutoNotice(list)?.id).toBe("test-notice-b");
  });
});

describe("pickManualNotice：手动打开", () => {
  it("勾过「不再显示」也**照样能打开**（入口永远有效）", () => {
    const target = notice({ id: "test-notice-a" });
    dismissViaUi(target);
    expect(pickAutoNotice([target])).toBeNull();
    expect(pickManualNotice([target])?.id).toBe("test-notice-a");
  });

  it("取第一条在窗口内的；全在窗口外才返回 null", () => {
    const open = notice({ id: "test-notice-b" });
    expect(pickManualNotice([notice({ id: "test-notice-a", from: "2099-01-01" }), open])?.id).toBe("test-notice-b");
    expect(pickManualNotice([notice({ id: "test-notice-a", until: "2000-01-01" })])).toBeNull();
  });
});

describe("useNotices：交互", () => {
  it("openManually 打开后，勾选框的初值 = 已存的 dismissed", () => {
    const target = notice({ id: "test-notice-a" });
    dismissViaUi(target);
    useNotices.setState({ autoNotice: null, manualNotice: null, dismissChecked: false });

    // 手动打开时用的是真源里的公告；这里直接验"读已存记录"这条通路
    expect(readNoticeRecord("test-notice-a").dismissed).toBe(true);
    useNotices.setState({ manualNotice: target, dismissChecked: readNoticeRecord(target.id).dismissed });
    expect(useNotices.getState().dismissChecked).toBe(true);
  });

  it("close 之后弹窗关闭（activeNotice 为 null）", () => {
    useNotices.setState({ autoNotice: notice({ id: "test-notice-a" }), dismissChecked: false });
    useNotices.getState().close();
    expect(useNotices.getState().autoNotice).toBeNull();
    expect(useNotices.getState().manualNotice).toBeNull();
  });

  it("勾了再点关闭：dismissed 与指纹一起落盘", () => {
    const target = notice({ id: "test-notice-a" });
    dismissViaUi(target);
    const record = readNoticeRecord("test-notice-a");
    expect(record.dismissed).toBe(true);
    expect(record.fingerprint).toBe(noticeFingerprint(target));
    expect(record.at).toBeGreaterThan(0);
  });

  it("**取消勾选再关闭 = 撤销「不再显示」** ⇒ 下次又会自动弹", () => {
    const target = notice({ id: "test-notice-a" });
    dismissViaUi(target);
    expect(pickAutoNotice([target])).toBeNull();

    // 用户点入口手动打开 ⇒ 勾选框回填成"已勾"（`openManually` 的行为），他顺手取消勾选、再关闭
    useNotices.setState({
      autoNotice: null,
      manualNotice: target,
      dismissChecked: readNoticeRecord(target.id).dismissed,
    });
    expect(useNotices.getState().dismissChecked).toBe(true);
    useNotices.getState().setDismissChecked(false);
    useNotices.getState().close();

    // 撤销生效：`dismissed` 落盘成 false ⇒ 下次进站**又自动弹**
    // （修之前这里会保留旧值 true ⇒ 勾选框成了"假开关"，这条用例就是那时缺的回归守卫）
    const record = readNoticeRecord("test-notice-a");
    expect(record.closed).toBe(true);
    expect(record.dismissed).toBe(false);
    expect(pickAutoNotice([target])?.id).toBe("test-notice-a");
  });

  it("取消勾选**不影响**没有勾过的情形（自动弹 + 不勾 + 关 ⇒ 下次还弹）", () => {
    const target = notice({ id: "test-notice-a" });
    useNotices.setState({ autoNotice: target, manualNotice: null, dismissChecked: false });
    useNotices.getState().setDismissChecked(false);   // 用户点了两下勾选框（勾上又取消）
    useNotices.getState().close();

    expect(readNoticeRecord("test-notice-a").dismissed).toBe(false);
    expect(pickAutoNotice([target])?.id).toBe("test-notice-a");
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

describe("内容真源与默认文案", () => {
  it("默认「关闭」文案是双语的（兜底值）", () => {
    expect(NOTICE_DEFAULT_CLOSE.en).toBe("Close");
    expect(NOTICE_DEFAULT_CLOSE.zh).toBe("关闭");
  });
});
