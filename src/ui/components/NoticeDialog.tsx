/** 站内公告弹窗（MD2 模态对话框）：标题 + Markdown 正文 + 「不再显示」勾选框 + 单个「关闭」按钮。
 *
 * 版式（**方案 B**，用户 2026-10-04 确认）：自上而下是
 *
 *     DialogTitle（标题）
 *     DialogContent（Markdown 正文 → 末尾一行「不再显示」勾选框）
 *     DialogActions（右对齐的单个「关闭」）
 *
 * 也就是「内容 → 勾选框 → 关闭」三段式 —— MD2 对话框的惯用排版（选完再确认）。
 *
 * MD2 规格与 `AboutDialog.tsx` **逐条对齐**（同一套数字，不重新发明）：
 * 最小宽 280dp / 最大宽 560dp、4dp 圆角、elevation 24、标题与内容 24dp 内边距、
 * 操作区 8dp 内边距且按钮右对齐、遮罩 32% 黑、进入 150ms / 退出 75ms 的「淡入 + 从 80% 放大」。
 *
 * 与「关于」弹窗同一个有意偏离 MD2 的地方：动作按钮取**白色正文色**（不走主色），见
 * `docs/DECISIONS.md` D133；本条沿用。
 *
 * 三种关闭方式都在：点「关闭」、点遮罩、按 Esc。**它们语义相同**（都走 `onClose`）——
 * 勾选框的值由调用方在关闭时读取（见 `src/store/notices.ts` 的 `close()`）。
 */
import {
  Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grow,
} from "@mui/material";

import {
  NOTICE_DEFAULT_CLOSE, NOTICE_DEFAULT_DISMISS, type NoticeContent,
} from "../../content/notices";
import { localized } from "../../i18n/localization";
import { useSession } from "../../store/session";
import { MD2 } from "../../theme/theme";
import { Markdown } from "../markdown";

/** 标题的 DOM id：`aria-labelledby` 要指到它（无障碍）。 */
const TITLE_ID = "notice-dialog-title";

interface NoticeDialogProps {
  /** 要显示的公告；`null` = 不显示（弹窗也会关） */
  notice: NoticeContent | null;
  open: boolean;
  /** 「不再显示」勾选框的当前值（受控） */
  dismissChecked: boolean;
  onDismissCheckedChange: (value: boolean) => void;
  onClose: () => void;
}

export function NoticeDialog({
  notice, open, dismissChecked, onDismissCheckedChange, onClose,
}: NoticeDialogProps) {
  // 订阅语言：文案在 `src/content/notices.ts` 里是 `{ en, zh }`，切语言时弹窗自己就会重渲染
  const locale = useSession((slice) => slice.locale);
  const closeLabel = notice?.close ?? NOTICE_DEFAULT_CLOSE;
  const dismissLabel = notice?.dismiss ?? NOTICE_DEFAULT_DISMISS;

  return (
    <Dialog
      open={open && notice !== null}
      onClose={onClose}
      aria-labelledby={TITLE_ID}
      data-testid="notice-dialog"
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
      {/* MD2：标题 20sp/500（`DialogTitle` 用的 h6 = 主题里的 MD2 20sp），上/左/右 24dp */}
      <DialogTitle id={TITLE_ID} sx={{ px: 3, pt: 3, pb: 1 }}>
        {notice ? localized(notice.title, locale) : ""}
      </DialogTitle>

      {/* 内容左右 24dp、上 8dp。
          `dividers` 给长正文一条滚动边界线；公告可能比 About 长，所以这里开着（About 没开是因为它短）。 */}
      <DialogContent dividers sx={{ px: 3, py: 2 }}>
        {notice && <Markdown source={notice.body} />}

        {/* 「不再显示」勾选框：**在正文之后、动作区之前**（方案 B 的三段式）。
            整行做成 40dp 高的触摸目标（MD2 最小触控区）—— `display: "flex"` + `minHeight` 必须一起给：
            MUI 默认是 `inline-flex`，只给 `minHeight` 在部分布局下量出来仍是被压缩的行高。
            窄屏独立成行、不挤进动作区。 */}
        <FormControlLabel
          data-testid="notice-dismiss"
          sx={{ display: "flex", alignItems: "center", mt: 1, mr: 0, minHeight: 40 }}
          control={
            <Checkbox
              size="small"
              checked={dismissChecked}
              onChange={(_event, checked) => onDismissCheckedChange(checked)}
            />
          }
          label={localized(dismissLabel, locale)}
        />
      </DialogContent>

      {/* MD2：操作区 8dp 内边距 + 按钮右对齐（MUI 的 `DialogActions` 默认就是这样）。
          颜色：与「关于」一致，取白色（`inherit` = onSurface 100%），不走 MD2 的主色动作按钮。 */}
      <DialogActions>
        <Button color="inherit" onClick={onClose} autoFocus data-testid="notice-close">
          {localized(closeLabel, locale)}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
