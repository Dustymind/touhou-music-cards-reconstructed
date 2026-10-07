/** 公告的本地记录：**每条公告一个键**（`tmc.v1.notice.<id>`），互不影响。
 *
 * 三条设计（对应 `docs/DECISIONS.md` D182）：
 *
 * 1. **每条独立**：`localStorage` 键名带公告 id（走 `persist.ts` 的版本化信封）——
 *    删掉一条不影响另一条，将来加第三条也不用动老数据。
 * 2. **"关闭"与"不再显示"分开**：只点「关闭」= 这次看完就收，**下次进站还会弹**；
 *    勾了「不再显示」= 以后**不自动弹**（但入口按钮永远在，随时能翻出来看）。
 *    勾选框是**双向**的：手动打开时它显示为已勾，用户**取消勾选再关闭 = 撤销**"不再显示"
 *    ⇒ 下次进站会重新弹（见 `close()` 里的注释与 D182 修正）。
 * 3. **内容指纹**：记下"勾不再显示时那条公告长什么样"。日后**内容改了**（指纹变了）
 *    ⇒ 重新自动弹一次 —— 否则"关掉过一次"等于永久静音，重要通知发不出去。
 *
 * 本模块**只管"用户做过什么"，不存公告内容本身**（内容真源在 `src/content/notices.ts`）。
 */
import { create } from "zustand";

import { noticeContent, type NoticeContent } from "../content/notices";
// 指纹的实现在 `../content/noticeMeta`（**纯 TS、无 Vite 语法**）—— e2e 也要用它，
// 而 e2e 不能 import 到 `../content/notices`（那边有 `?raw`，Playwright 解析不了）。
import { noticeFingerprint } from "../content/noticeMeta";
import { defineStore, isRecord, pickBoolean, pickNumber, pickString } from "../persist";

/** 一条公告的本地记录。 */
export interface NoticeRecord {
  /** 用户点过「关闭」（不管有没有勾「不再显示」） */
  closed: boolean;
  /** 用户勾了「不再显示」—— 之后**不再自动弹** */
  dismissed: boolean;
  /** 勾「不再显示」时那条公告的内容指纹（内容改了 ⇒ 重新弹，见 §3） */
  fingerprint: string;
  /** 最近一次关闭的时间戳（ms，纯诊断用，不参与任何判断） */
  at: number;
}

const EMPTY_RECORD: NoticeRecord = { closed: false, dismissed: false, fingerprint: "", at: 0 };

/** 每条公告一个存储句柄。**键名在定义时就定死**（`tmc.v1.notice.<id>`）。 */
const handles = new Map<string, ReturnType<typeof defineStore<NoticeRecord>>>();

function storeFor(id: string) {
  const existing = handles.get(id);
  if (existing) return existing;
  const handle = defineStore<NoticeRecord>({
    name: `notice.${id}`,
    version: 1,
    fallback: EMPTY_RECORD,
    validate(raw) {
      if (!isRecord(raw)) return null;
      // 缺字段用默认值补齐（与 session / appearance 同口径）；整份不是对象才判非法
      return {
        closed: pickBoolean(raw.closed) ?? false,
        dismissed: pickBoolean(raw.dismissed) ?? false,
        fingerprint: pickString(raw.fingerprint) ?? "",
        at: pickNumber(raw.at, 0) ?? 0,
      };
    },
  });
  handles.set(id, handle);
  return handle;
}

/**
 * 一条公告的**内容指纹**：改了标题或正文就算"新内容"，该重新提示一次。
 *
 * ⚠️ 实现**已搬到 `../content/noticeMeta`**（只算 `id` + 标题 + 正文，窗口字段进不来）。
 * 搬家的原因：e2e 的 `suppressNotice` 要用同一个指纹，而 e2e 不能 import 到
 * `../content/notices`（那边有 `?raw`）。**不要在这里重新定义一份** —— 两份迟早会不一致，
 * 而不一致的后果是"e2e 里公告压不住"这种难查的现象。要用就从 `../content/noticeMeta` import。
 */

/** 读一条公告的记录（坏存档回落为空记录）。 */
export function readNoticeRecord(id: string): NoticeRecord {
  return storeFor(id).load();
}

/** 写一条公告的记录。 */
function writeNoticeRecord(id: string, record: NoticeRecord): void {
  storeFor(id).save(record);
}

/** 公告当前是否在生效时间窗内（`from` / `until` 都是 `YYYY-MM-DD`，含当天，本地时间）。 */
export function noticeInWindow(notice: NoticeContent, now: Date = new Date()): boolean {
  // 用 `YYYY-MM-DD` 字符串比较：它字典序 = 时间序，且不用管时区偏移
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  if (notice.from !== undefined && today < notice.from) return false;
  if (notice.until !== undefined && today > notice.until) return false;
  return true;
}

/**
 * 选择"现在该自动弹哪一条"：按 `notices` 数组顺序取**第一条**同时满足
 * ① 在生效时间窗内 ② 没勾过「不再显示」，或**内容变过**（指纹不符）的公告。
 *
 * 返回 `null` = 一条都不该弹。**这是纯函数**（记录按 id 现读），便于单测注入时间。
 */
export function pickAutoNotice(
  notices: readonly NoticeContent[] = noticeContent.notices,
  now: Date = new Date(),
): NoticeContent | null {
  for (const notice of notices) {
    if (!noticeInWindow(notice, now)) continue;
    const record = readNoticeRecord(notice.id);
    if (!record.dismissed) return notice;
    // 勾过不再显示：只有内容变了才重新弹
    if (record.fingerprint !== noticeFingerprint(notice)) return notice;
  }
  return null;
}

/** 手动打开时用哪一条：**第一条在生效窗口内的**（不受「不再显示」限制 —— 用户主动要看）。 */
export function pickManualNotice(
  notices: readonly NoticeContent[] = noticeContent.notices,
  now: Date = new Date(),
): NoticeContent | null {
  return notices.find((notice) => noticeInWindow(notice, now)) ?? null;
}

/** 首屏算出来的"该自动弹的那条"。 */
const initialAuto = pickAutoNotice();

interface NoticesState {
  /** 当前应该**自动弹出**的那条（没有就是 `null`）。首帧算一次，之后由用户动作更新。 */
  autoNotice: NoticeContent | null;
  /** 用户点入口按钮**手动打开**的那条（`null` = 没开）。手动打开**不受**「不再显示」限制。 */
  manualNotice: NoticeContent | null;
  /** 「不再显示」勾选框的当前值（每次打开时按已存记录重置）。 */
  dismissChecked: boolean;

  /** 勾选框：**只改内存里的值**，等点「关闭」才落盘（关掉弹窗 = 放弃这次选择）。 */
  setDismissChecked: (value: boolean) => void;
  /**
   * 点「关闭」：把这条记成已关闭；`dismissChecked` 为真时同时记下「不再显示」+ 内容指纹。
   * 关掉之后**不再自动弹**（本次会话内），并清掉手动打开态。
   */
  close: () => void;
  /**
   * 点入口按钮：手动打开（第一条在窗口内的公告）。
   * 勾选框初始值 = 已存的 `dismissed`（用户可以顺手取消勾选，下次就又会自动弹）。
   */
  openManually: () => void;
  /** 测试/诊断：把一条公告的本地记录清掉（等价于"这个用户从没见过它"）。 */
  forget: (id: string) => void;
}

export const useNotices = create<NoticesState>((set, get) => ({
  autoNotice: initialAuto,
  manualNotice: null,
  dismissChecked: false,

  setDismissChecked(value) {
    set({ dismissChecked: value });
  },

  close() {
    const notice = get().manualNotice ?? get().autoNotice;
    if (!notice) return;
    const checked = get().dismissChecked;
    const record: NoticeRecord = {
      closed: true,
      // 勾选框是**双向**的：勾上 = 记下"不再显示" + 当时的内容指纹；**取消勾选 = 撤销**（D182 修正）。
      // ⚠️ 这里**不能**写成"未勾时保留存里的旧值" —— 那样 `openManually` 回填出来的"已勾"就成了假开关：
      // 用户取消勾选再关闭，`dismissed` 仍是 `true`，下次照样不弹（而注释与界面都承诺"会重新弹"）。
      dismissed: checked,
      fingerprint: checked ? noticeFingerprint(notice) : readNoticeRecord(notice.id).fingerprint,
      at: Date.now(),
    };
    writeNoticeRecord(notice.id, record);
    // 关掉之后本次会话不再自动弹这条（`pickAutoNotice` 也拿不到它了：closed 不影响、
    // dismissed 才影响 —— 这里显式清掉 autoNotice，用户没勾的话刷新页面会再弹一次，符合预期）
    set({ autoNotice: null, manualNotice: null, dismissChecked: false });
  },

  openManually() {
    const notice = pickManualNotice();
    if (!notice) return;
    set({
      manualNotice: notice,
      autoNotice: null,               // 手动打开时不重复弹
      dismissChecked: readNoticeRecord(notice.id).dismissed,
    });
  },

  forget(id) {
    storeFor(id).clear();
    set({ autoNotice: pickAutoNotice(), manualNotice: null, dismissChecked: false });
  },
}));

/** 当前要显示的公告（手动优先）。 */
export function activeNotice(state: NoticesState): NoticeContent | null {
  return state.manualNotice ?? state.autoNotice;
}

/** 弹窗是否打开。 */
export function noticeOpen(state: NoticesState): boolean {
  return activeNotice(state) !== null;
}
