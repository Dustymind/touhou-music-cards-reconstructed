/** 站内公告弹窗（MD2 模态对话框）。**两种打开方式、同一个组件**（D185）：
 *
 * - **进站自动弹**（`mode: "auto"`）：显示**该弹的那一批**（可能多条 —— 用户 2026-10-07 反馈
 *   "主页开屏未能同时显示多个公告"后改的）。
 *
 *   只有**一条**时走**方案 B**（用户 2026-10-04 确认）：
 *
 *       DialogTitle（该条公告的标题）
 *       DialogContent（Markdown 正文 → 末了一行告知）
 *       DialogActions（右对齐的单个「关闭」）
 *
 *   也就是「内容 → 告知 → 关闭」三段式 —— MD2 对话框的惯用排版（读完再确认）。
 *   **两条以上**时改成列表版式（见下）：否则弹窗标题只能写第一条的名字，等于把其余几条藏了。
 *
 * - **入口按钮打开的列表**（`mode: "manual"`）：按**展示顺序**（置顶优先 → `date` 由新到旧，
 *   见 `src/content/noticeMeta.ts` 的 `sortNotices`）列出**所有在生效窗口内**的公告，可上下翻看。
 *   标题换成通用的「公告 / Notices」，**每条**自带小标题（+ 置顶徽章 + 发布日期）与正文。
 *
 * **版式的分水岭是"几条"，不是"哪种打开方式"**（`asList`）：入口打开的列表恒为列表版式；
 * 自动弹的那份只在**多于一条**时才走列表版式。所以"一条公告"的观感与"多条"只是多一层小标题。
 *
 * **弹窗上只有一个动作：关闭**（D186）。原来每条还带一个「不再显示」勾选框，已按用户要求弃用 ——
 * 关掉**就是**"以后不再自动弹"，而"想再看"这条退路交给底部那行告知
 * （`ShellNoticeHint`：去右上角的「公告」入口）+ 永远都在的入口按钮。
 * 于是这里**没有**"让它重新自动弹"的开关，这是有意的一扇单向门（见 `src/store/notices.ts` 开头）。
 *
 * MD2 规格与 `AboutDialog.tsx` **逐条对齐**（同一套数字，不重新发明）：
 * 最小宽 280dp / 最大宽 560dp、4dp 圆角、elevation 24、标题与内容 24dp 内边距、
 * 操作区 8dp 内边距且按钮右对齐、遮罩 32% 黑、进入 150ms / 退出 75ms 的「淡入 + 从 80% 放大」。
 *
 * 与「关于」弹窗同一个有意偏离 MD2 的地方：动作按钮取**白色正文色**（不走主色），见
 * `docs/DECISIONS.md` D133；本条沿用。
 *
 * 三种关闭方式都在：点「关闭」、点遮罩、按 Esc。**它们语义相同**（都走 `onClose`）——
 * 落盘在调用方的 `close()` 里（见 `src/store/notices.ts`）。
 */
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  Grow, Stack, Typography,
} from "@mui/material";

import { NOTICE_DEFAULT_CLOSE, type NoticeContent } from "../../content/notices";
import { Localization, localized, t } from "../../i18n/localization";
import { useSession } from "../../store/session";
import { MD2 } from "../../theme/theme";
import { Markdown } from "../markdown";

/** 标题的 DOM id：`aria-labelledby` 要指到它（无障碍）。 */
const TITLE_ID = "notice-dialog-title";

interface NoticeDialogProps {
  /**
   * 要显示的公告（**已按展示顺序排好**）：自动弹时是**全部该弹的**（可能多条），
   * 手动打开时是**全部在窗口内的**。
   */
  notices: readonly NoticeContent[];
  /** `"auto"` = 进站自动弹的那一批；`"manual"` = 入口打开的列表。**只影响 `data-notice-mode`**，版式另按条数分（见 `asList`）。 */
  mode: "auto" | "manual";
  open: boolean;
  onClose: () => void;
}

export function NoticeDialog({ notices, mode, open, onClose }: NoticeDialogProps) {
  // 订阅语言：文案在 `src/content/notices.ts` 里是 `{ en, zh }`，切语言时弹窗自己就会重渲染
  const locale = useSession((slice) => slice.locale);
  // 单条时「关闭」文案跟着**那条**公告走（与改动前逐字一致）。多条时各条可能各有各的，
  // 但「关闭」是"这个弹窗怎么关"、不是每条各自的事 ⇒ 取第一条的，没有就用默认。
  const closeLabel = notices[0]?.close ?? NOTICE_DEFAULT_CLOSE;
  // **版式的分水岭是"几条"**：入口打开的列表恒为列表版式；自动弹的那份在**多于一条**时也走它
  // （两条以上还只把第一条的名字写进标题，其余几条就等于被藏了 —— 那正是用户反馈的那个问题）。
  const asList = mode === "manual" || notices.length > 1;

  return (
    <Dialog
      open={open && notices.length > 0}
      onClose={onClose}
      aria-labelledby={TITLE_ID}
      data-testid="notice-dialog"
      // e2e 用它区分"自动弹的那条"与"入口打开的列表"（两种版式：标题与每条的小标题不一样）
      data-notice-mode={mode}
      // MD2 的宽是「最小 280 / 最大 560」这种固定区间，不是断点那套；关掉 MUI 的 maxWidth 断点自给
      maxWidth={false}
      // MD2：对话框进 150ms / 出 75ms，淡入同时从 80% 放大（`Grow` = scale 0.75→1 + 淡入）
      slots={{ transition: Grow }}
      transitionDuration={{ enter: 150, exit: 75 }}
      slotProps={{
        // MD2：遮罩 32% 黑（MUI 默认 50%，偏暗）
        backdrop: { sx: { backgroundColor: "rgba(0, 0, 0, 0.32)" } },
        paper: {
          sx: {
            minWidth: 280,
            maxWidth: 560,
            // 窄屏留 24dp 边距（MUI 默认 32dp，手机上会把对话框压得太窄）
            m: 3,
            borderRadius: `${MD2.shape}px`,
            // MD2 深色表面：不要 MUI 自动叠的那层 elevation 渐变（与全站其它卡片一致）
            backgroundImage: "none",
          },
        },
      }}
    >
      {/* MD2：标题 20sp/500（`DialogTitle` 用的 h6 = 主题里的 MD2 20sp），上/左/右 24dp。
          **只有一条**时才用那条公告自己的标题；列表版式用通用标题（与入口按钮同一个键，
          同一件事的两种入口）—— 多条时各条的名字在各自的正文小标题上，标题里只写第一条会是误导。 */}
      <DialogTitle id={TITLE_ID} sx={{ px: 3, pt: 3, pb: 1 }}>
        {asList
          ? t(Localization.ShellNoticeOpen)
          : (notices[0] === undefined ? "" : localized(notices[0].title, locale))}
      </DialogTitle>

      {/* 内容左右 24dp、上 8dp。
          `dividers` 给长正文一条滚动边界线；公告可能比 About 长，所以这里开着（About 没开是因为它短）。
          列表模式下**更要**开着：几条公告叠起来必然超过一屏，得有个明确的滚动区。 */}
      <DialogContent dividers sx={{ px: 3, py: 2 }}>
        <Stack spacing={2} divider={asList ? <Divider /> : undefined}>
          {notices.map((notice) => (
            <Box key={notice.id} data-testid={`notice-item-${notice.id}`}>
              {/* 列表版式才需要每条的小标题：单条时 DialogTitle 已经是这条的标题了，再来一行是重复 */}
              {asList && (
                <Stack direction="row" spacing={1} alignItems="baseline" sx={{ flexWrap: "wrap", mb: 1 }}>
                  <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
                    {localized(notice.title, locale)}
                  </Typography>
                  {notice.pinned === true && (
                    <Chip size="small" label={t(Localization.ShellNoticePinned)} data-testid="notice-pinned" />
                  )}
                  {notice.date !== undefined && (
                    // 发布日期：让人看得出"为什么它排在前面"（排序键不写出来就是个黑箱）
                    <Typography variant="caption" color="text.secondary">{notice.date}</Typography>
                  )}
                </Stack>
              )}

              <Markdown source={notice.body} />
            </Box>
          ))}
        </Stack>

        {/* 底部那行**告知**（D186 取代了原来的「不再显示」勾选框）：正文之后、动作区之前。
            一句话要说清**两件事** —— 关掉 = 不再自动弹；想看回来去右上角的「公告」。
            只放**一次**（不是每条一份）：它讲的是"这个弹窗怎么关"，不是某条公告的属性。
            用 `caption`（12sp）而不是正文体：它是辅助说明，不该跟公告正文抢注意力。 */}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 2, lineHeight: 1.5 }}
          data-testid="notice-hint"
        >
          {t(Localization.ShellNoticeHint)}
        </Typography>
      </DialogContent>

      {/* MD2：操作区 8dp 内边距 + 按钮右对齐（MUI 的 `DialogActions` 默认就是这样）。
          **只有一个**「关闭」——列表里也不给每条一个按钮，避免"一屏十几个按钮"。
          颜色：与「关于」一致，取白色（`inherit` = onSurface 100%），不走 MD2 的主色动作按钮。 */}
      <DialogActions>
        <Button color="inherit" onClick={onClose} autoFocus data-testid="notice-close">
          {localized(closeLabel, locale)}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
