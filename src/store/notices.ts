/** 公告的本地记录：**每条公告一个键**（`tmc.v1.notice.<id>`），互不影响。
 *
 * 三条设计（对应 `docs/DECISIONS.md` D182；第 2 条已被 **D186** 改写）：
 *
 * 1. **每条独立**：`localStorage` 键名带公告 id（走 `persist.ts` 的版本化信封）——
 *    删掉一条不影响另一条，将来加第三条也不用动老数据。
 * 2. **点「关闭」= 以后不再自动弹**（D186）。弹窗上只有「关闭」**一个**动作、没有勾选框：
 *    关掉就是"我看过了，别再自动弹"。想再看回来走**右上角的「公告」入口**（永远在、随时能翻出来）——
 *    所以弹窗底部带一行告知（`ShellNoticeHint`），专门告诉用户那条路在哪。
 *
 *    ⚠️ D182～D185 之间**不是**这样：那时"只点关闭"= 下次进站还会弹，另有「不再显示」勾选框，
 *    并且**取消勾选再关闭 = 撤销**。D186 按用户要求把勾选框整个弃用 ⇒ 现在**没有**
 *    "让它重新自动弹"的 UI 通路。这是**有意的一扇单向门**：入口永远能看，但不再打扰。
 * 3. **内容指纹**：记下"关掉时那条公告长什么样"。日后**内容改了**（指纹变了）
 *    ⇒ 重新自动弹一次 —— 否则"关掉过一次"等于永久静音，重要通知发不出去。
 *    这是单向门唯一的例外，也是它唯一该有的例外。
 *
 * ---- 边界：本模块**不定义展示顺序**（D185）----
 *
 * 谁排前面（置顶优先 → `date` 由新到旧）在 `src/content/noticeMeta.ts` 的 `sortNotices`，
 * `noticeContent.notices` 取出来就是排好的。本模块只负责"在排好的顺序里挑哪些显示、
 * 记下用户做过什么"，所以自动弹的那批与入口打开的那份列表**必然同一个顺序**。
 *
 * 两种打开方式（**区别只在"挑哪些"，不在"排哪样"**）：
 * - **进站自动弹**：把**全部该弹的**一次摆出来（`pickAutoNotices`）—— 一批，不是一条；
 *   判据 ① 在生效窗口内 ② 没**关过**（或内容变过 ⇒ 指纹不符）。
 * - **入口按钮手动打开**：列**全部在生效窗口内**的（同一顺序），**不受**"关过"限制
 *   —— 用户主动要看就该看得到 —— 关过也照样列。
 *
 * ⚠️ **曾经只弹一条**（"顺序里第一条符合条件的"）。用户 2026-10-07 反馈"主页开屏未能同时显示
 * 多个公告"后改成一批：多条同时有效时，第二条不该被压着等第一条关掉。
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
  /** 用户点过「关闭」（D186 起：弹窗只有这一个动作，所以"关过"就等于"看过"） */
  closed: boolean;
  /** 关过 ⇒ **不再自动弹**（想看只能走右上角「公告」入口）。见 D186。 */
  dismissed: boolean;
  /** 关掉那一刻那条公告的内容指纹（内容改了 ⇒ 重新弹一次，见 §3） */
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
 * ⚠️ 实现**已搬到 `../content/noticeMeta`**（只算 `id` + 标题 + 正文，窗口与排序字段进不来）。
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
 * **在生效窗口内**的公告，按展示顺序（`noticeContent.notices` 已经排好，`filter` 保序）。
 *
 * 返回的是**新数组** ⇒ 别把它放进 zustand 选择器里现算（每次渲染都是新引用，组件会空转）；
 * 要么当一次性结果用（`pickAutoNotices`），要么存进 store（`manualNotices`）。
 */
export function noticesInWindow(
  notices: readonly NoticeContent[] = noticeContent.notices,
  now: Date = new Date(),
): NoticeContent[] {
  return notices.filter((notice) => noticeInWindow(notice, now));
}

/**
 * 选择"现在该自动弹**哪些**"：展示顺序里**全部**同时满足
 * ① 在生效时间窗内 ② 没**关过**，或**内容变过**（指纹不符）的公告。
 *
 * 返回空数组 = 一条都不该弹。**这是纯函数**（记录按 id 现读），便于单测注入时间。
 *
 * ⚠️ 是**一批**，不是"一条"（D185 修正）：多条公告同时有效时，开屏要把它们**一起**摆出来。
 * 顺序 = 传进来的顺序（`noticeContent.notices` 已在 content 层排好）⇒
 * 开屏这批与入口那份列表**同一顺序**；两者只差"关过的那条还列不列"。
 */
export function pickAutoNotices(
  notices: readonly NoticeContent[] = noticeContent.notices,
  now: Date = new Date(),
): NoticeContent[] {
  return noticesInWindow(notices, now).filter((notice) => {
    const record = readNoticeRecord(notice.id);
    if (!record.dismissed) return true;
    // 关过：只有内容变了才重新弹
    return record.fingerprint !== noticeFingerprint(notice);
  });
}

/** 空列表的**同一个常量**：让选择器返回稳定引用（每次现写 `[]` 都是新对象，会让组件空转）。 */
const NONE: readonly NoticeContent[] = [];

/** 空的一批统一换成 `NONE`（同上：引用稳定）。 */
function orNone(notices: NoticeContent[]): readonly NoticeContent[] {
  return notices.length === 0 ? NONE : notices;
}

/** 首屏算出来的"该自动弹的那一批"。 */
const initialAuto = orNone(pickAutoNotices());

interface NoticesState {
  /** 该**自动弹**的那一批（可能 0 条、可能多条）。用数组是为了让选择器拿到**稳定引用**（见 `AppShell` 的注释）。 */
  autoNotices: readonly NoticeContent[];
  /** 手动打开时要显示的那一批（`null` = 没手动打开）。点入口时算一次 ⇒ 引用稳定。 */
  manualNotices: readonly NoticeContent[] | null;

  /**
   * 点「关闭」：把当前显示的这**一批**逐条记成"看过" —— `closed` + `dismissed` + **关的那一刻的内容指纹**。
   * 关掉之后**不再自动弹**（本次会话内也清空）；想看回来走右上角的「公告」入口（`openManually`）。
   */
  close: () => void;
  /**
   * 点入口按钮：手动打开**全部在窗口内**的公告（同一展示顺序）。
   * **不受**"关过"限制 —— 那是"别再自动弹"，不是"不许看"。
   */
  openManually: () => void;
  /** 测试/诊断：把一条公告的本地记录清掉（等价于"这个用户从没见过它"）。 */
  forget: (id: string) => void;
}

export const useNotices = create<NoticesState>((set, get) => ({
  autoNotices: initialAuto,
  manualNotices: null,

  close() {
    const notices = activeNotices(get());
    if (notices.length === 0) return;
    const at = Date.now();
    for (const notice of notices) {
      // D186：弹窗只有「关闭」一个动作 ⇒ 关掉就是"不再自动弹"。**每一批里的每一条**都要落盘，
      // 否则开屏弹了 3 条、关掉后另外 2 条下次还会跳出来。
      // 指纹必须记**此刻**的（不是旧的）：它是"内容改了要重新弹一次"的唯一判据，
      // 记错就等于要么静音了新内容、要么每次进站都重弹。
      writeNoticeRecord(notice.id, {
        closed: true,
        dismissed: true,
        fingerprint: noticeFingerprint(notice),
        at,
      });
    }
    // 关掉之后本次会话不再自动弹（`pickAutoNotices` 本来就拿不到它们了 —— 落盘已经生效，
    // 这里只是把内存态一起收干净）。
    set({ autoNotices: NONE, manualNotices: null });
  },

  openManually() {
    const notices = noticesInWindow();
    if (notices.length === 0) return;
    set({ manualNotices: notices });
  },

  forget(id) {
    storeFor(id).clear();
    set({ autoNotices: orNone(pickAutoNotices()), manualNotices: null });
  },
}));

/** 当前要显示的公告列表（**手动打开的那份列表优先**于进站自动弹的那批）。 */
export function activeNotices(state: NoticesState): readonly NoticeContent[] {
  return state.manualNotices ?? state.autoNotices;
}

/** 弹窗是否打开。 */
export function noticeOpen(state: NoticesState): boolean {
  return activeNotices(state).length > 0;
}

/**
 * 这次是"手动打开的列表"还是"进站自动弹的那批" —— 决定版式（`NoticeDialog` 用）。
 * 返回的是字符串字面量（不是新对象），所以直接进 zustand 选择器也不会让组件空转。
 */
export function noticeMode(state: NoticesState): "auto" | "manual" | "closed" {
  if (state.manualNotices !== null) return "manual";
  return state.autoNotices.length > 0 ? "auto" : "closed";
}
