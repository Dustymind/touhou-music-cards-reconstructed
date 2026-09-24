/** 「关于」弹窗（MD2 模态对话框）：标题 + 若干行"标签 / 内容" + 关闭按钮。
 *
 * **弹窗里的每一个字都在 `src/content/about.ts`**（标题、每行标签与内容、关闭按钮），
 * 这一个组件只负责排版；行数与顺序跟着内容真源的 `rows` 数组走。
 *
 * MD2 对话框规格（https://m2.material.io/components/dialogs）逐条落在下面的注释里：
 * 最小宽 280dp / 最大宽 560dp、4dp 圆角、elevation 24dp、标题与内容 24dp 内边距、
 * 操作区 8dp 内边距且按钮右对齐、遮罩 32% 黑、进入 150ms / 退出 75ms 的"淡入 + 从 80% 放大"。
 *
 * 唯一有意偏离 MD2 的一处：MD2 的对话框动作按钮用主色，**用户要求「关闭」取白色**（正文色），
 * 见 `docs/DECISIONS.md` D133。
 */
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, Grow, Link, Stack, Typography,
} from "@mui/material";

import {
  aboutContent, type AboutAutoRow, type AboutContent, type AboutEntryRow,
} from "../../content/about";
import { localized, type Locale } from "../../i18n/localization";
import { useSession } from "../../store/session";
import { MD2 } from "../../theme/theme";

/** 标题的 DOM id：`aria-labelledby` 要指到它（无障碍）。 */
const TITLE_ID = "about-dialog-title";

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
  /** 内容真源；默认就是用户在 `src/content/about.ts` 里编辑的那份（留出这个口子是为了能测别的行组合） */
  content?: AboutContent;
  /** 外置曲库（音MAD 曲包）的曲目署名：由 `packAuthorsFor()` 算好传进来。**空数组 = 没引入外置曲库**，
   *  那时 `{ auto: "pack-authors" }` 那一行整行不显示（连标签都不显示）。 */
  packAuthors?: string[];
}

export function AboutDialog({ open, onClose, content = aboutContent, packAuthors = [] }: AboutDialogProps) {
  // 订阅语言：文案在 `src/content/about.ts` 里是 `{ en, zh }`，切语言时弹窗自己就会重渲染
  // （不必依赖父组件重渲染），所以用显式带语言的 `localized(...)` 取文字。
  const locale = useSession((slice) => slice.locale);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby={TITLE_ID}
      data-testid="about-dialog"
      // MD2 的宽是"最小 280 / 最大 560"这种**固定区间**，不是断点那套；所以关掉 MUI 的 maxWidth 断点，
      // 用 sx 自己给（见下面 paper）。
      maxWidth={false}
      // MD2：对话框进 150ms / 出 75ms，淡入同时从 80% 放大（`Grow` 就是 scale 0.75→1 + 淡入）。
      // `transitionDuration` 会同时给到弹窗本体与遮罩（Dialog 把它转发进 backdrop 槽）。
      slots={{ transition: Grow }}
      transitionDuration={{ enter: 150, exit: 75 }}
      slotProps={{
        // MD2：遮罩是 32% 黑（MUI 默认 50%，偏暗）
        backdrop: { sx: { backgroundColor: "rgba(0, 0, 0, 0.32)" } },
        paper: {
          sx: {
            minWidth: 280,
            maxWidth: 560,
            // 窄屏留 24dp 边距（MUI 默认 32dp，手机上会把对话框压得太窄）
            m: 3,
            // 圆角显式钉成 MD2 的 4dp（主题的 `MuiPaper.rounded` 也是 4 —— 这里写出来是为了"看得见"）
            borderRadius: `${MD2.shape}px`,
            // MD2 深色表面：不要 MUI 自动叠的那层 elevation 渐变（与全站其它卡片一致）
            backgroundImage: "none",
          },
        },
      }}
    >
      {/* MD2：标题 20sp/500（`DialogTitle` 用的就是 h6，而主题里的 h6 = MD2 类型比例的 20sp），上/左/右 24dp */}
      <DialogTitle id={TITLE_ID} sx={{ px: 3, pt: 3, pb: 1 }}>
        {localized(content.title, locale)}
      </DialogTitle>

      {/* MD2：内容左右 24dp。行间距**按行分别给**（见 `InfoRow` 的 `mt`）：
          有标签的项之间 16dp（8dp 栅格 × 2），没有标签的"续行"与上一行只隔 8dp ——
          这类行本来就是"同一项里的下一行"（例如作者名下面再写一行模型名），
          用项间距会留下一条明显的空行 ✗（用户反馈过）。 */}
      <DialogContent sx={{ px: 3, py: 1 }}>
        {content.rows.map((row, index) => (
          "auto" in row
            ? <AutoRow key={index} index={index} row={row} locale={locale} packAuthors={packAuthors} />
            : <InfoRow key={index} index={index} row={row} locale={locale} />
        ))}
      </DialogContent>

      {/* MD2：操作区 8dp 内边距 + 按钮右对齐（MUI 的 `DialogActions` 默认就是这样，别再加内边距 ——
          按钮自己左右各有 16dp，加上这 8dp 正好让文字落在 24dp 的栅格线上，与上面的标签对齐）。
          颜色：用户要求白色（`inherit` = 跟随纸张正文色 = onSurface 100%），不走 MD2 的主色动作按钮。 */}
      <DialogActions>
        <Button color="inherit" onClick={onClose} data-testid="about-close">
          {localized(content.close, locale)}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** 一行"标签 + 内容"：标签是小字次要色（**可以没有**），内容是一行正文。
 *
 * - **没有标签**（整条不写 `label`，或当前语言下那份留空）= **单行行**：只渲染内容那一行，
 *   连 `caption` 元素都不挂（不是空标签占位）。
 * - 有地址 → 主色链接、新标签页打开；**没地址 → 白色纯文字**（`text.primary` = onSurface 100%）。
 *   "没地址"把三种写法都算上：**不写 `url`** / 空串 / 只有空白 —— 一律不渲染链接元素，
 *   免得出现"没有 href 的空 `<a>`"（那东西既点不动，又会把文字染成主色）。用户明确要求过这两点。
 */
function InfoRow({ index, row, locale }: { index: number; row: AboutEntryRow; locale: Locale }) {
  const url = (row.url ?? "").trim();
  const label = (row.label === undefined ? "" : localized(row.label, locale)).trim();
  const singleLine = label === "";
  // 第一项不留上下间距；"续行"贴紧上一行（8dp），有标签的项之间用 16dp
  const marginTop = index === 0 ? 0 : `${MD2.grid * (singleLine ? 1 : 2)}px`;
  return (
    <Stack
      spacing={0.25}
      sx={{ mt: marginTop }}
      data-testid={`about-row-${index}`}
      // 单行行（没有标签）打个标记：测试与将来的样式钩子都用它，不必去猜 DOM 结构
      data-single-line={singleLine ? "true" : undefined}
    >
      {label !== "" && <Typography variant="caption" color="text.secondary">{label}</Typography>}
      {url === ""
        ? (
          <Typography variant="body1" sx={{ wordBreak: "break-word", color: "text.primary" }}>
            {row.name}
          </Typography>
        )
        : (
          <Typography variant="body1" sx={{ wordBreak: "break-word" }}>
            <Link href={url} target="_blank" rel="noreferrer noopener" color="primary">
              {row.name}
            </Link>
          </Typography>
        )}
    </Stack>
  );
}

/** 作者名之间用「、」连接（中文习惯；两种语言下都用它，名字本身是专有名词）。 */
const AUTHOR_SEPARATOR = "、";

/**
 * **自动行**：内容来自运行时数据（目前只有外置曲库的曲目署名），这里只画标题与名字。
 *
 * - `packAuthors` 为空（没引入外置曲库 / 本地曲库助手没在跑）→ **整行不渲染**，连标签都不出现。
 * - `layout: "paragraph"`（默认）：一段文字，名字用「、」连接、自动换行；
 *   `layout: "lines"`：一行一个名字（名字之间用"续行"的 8dp 间距，读起来是一整块署名）。
 * - 名字是**白色正文色**：数据里只有曲目的来源地址、没有作者主页，所以按"没有链接就不给空链接"的规则处理。
 */
function AutoRow({ index, row, locale, packAuthors }: {
  index: number;
  row: AboutAutoRow;
  locale: Locale;
  packAuthors: string[];
}) {
  if (packAuthors.length === 0) return null;
  const label = localized(row.label, locale).trim();
  const singleLine = label === "";
  // 与普通行同一套间距：续行 8dp、有标签的项之间 16dp
  const marginTop = index === 0 ? 0 : `${MD2.grid * (singleLine ? 1 : 2)}px`;
  return (
    <Stack
      spacing={0.25}
      sx={{ mt: marginTop }}
      data-testid={`about-row-${index}`}
      data-auto="pack-authors"
    >
      {label !== "" && <Typography variant="caption" color="text.secondary">{label}</Typography>}
      {row.layout === "lines"
        ? (
          <Stack spacing={0.25}>
            {packAuthors.map((author) => (
              <Typography key={author} variant="body1" sx={{ wordBreak: "break-word", color: "text.primary" }}>
                {author}
              </Typography>
            ))}
          </Stack>
        )
        : (
          <Typography variant="body1" sx={{ wordBreak: "break-word", color: "text.primary" }}>
            {packAuthors.join(AUTHOR_SEPARATOR)}
          </Typography>
        )}
    </Stack>
  );
}
