/** 未使用卡牌区：宽屏内联（单行 + 滑块），窄屏收进**MD2 底部面板**。
 *
 * 手机上把这一大块常驻在页面里会挤掉牌桌的高度，所以窄屏改成：
 * 底部一条粘性栏（标题 + 数量 + 展开/收起）→ 点开是从底部升起的面板，卡面**多行铺开**，
 * 尺寸/间距与牌桌卡槽完全一致（同 `width`、同 `DECK_GAP`）。
 *
 * 刻意**不用模态抽屉**：模态会给整个牌桌盖一层遮罩，操作被打断、观感也突兀
 * （用户反馈"过于突兀，可能不符合 MD2"）。MD2 的 bottom sheet 本来就有非模态的
 * "persistent / expanded" 形态：面板升起来，后面的内容仍可交互，也不需要遮罩。
 * 面板本身仍是 MD2 规格：4dp 上圆角、elevation 16、顶部 32×4 拖拽把手、内容 16dp 内边距、
 * 底部留 `safe-area-inset-bottom`（全面屏手势条）。
 *
 * 交互不受影响：面板里的卡可以点（进牌库）、可以拖（拖回牌桌空位）；牌桌的卡也能拖进来
 * （面板收起时"点牌库的卡"同样能拿回来，见 `UnusedCards` 的点击处理）。
 */
import { useEffect, useRef, useState } from "react";
import {
  Box, Button, Fade, Paper, Slide, Stack, Typography, useMediaQuery, useTheme,
} from "@mui/material";
import ExpandLessRounded from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";

import type { CardSetRecord } from "../../data/types";
import type { CardInfo } from "../../game/types";
import { Localization, t } from "../../i18n/localization";
import { CardAspectRatio, MD2 } from "../../theme/theme";
import { UnusedCards } from "./UnusedCards";

interface UnusedCardsTrayProps {
  /** 牌桌列数：面板里的卡面按同样的列数铺开（"与当前卡槽相同"） */
  columns: number;
  cards: CardInfo[];
  cardSet: CardSetRecord;
  cardFiles: Record<string, string[]>;
  width: number;
  visibleWidth: number;
  interactive: boolean;
  /** 曲目互斥被挡下的卡（`角色-卡序`，D108）：面板里同样压暗且不可点选 */
  blockedKeys?: ReadonlySet<string>;
  onPick: (card: CardInfo) => void;
  onCardDragStart: (card: CardInfo) => void;
  onDropCard?: () => void;
}

/** 面板的三个档位：**按行数**表达（3 / 6 / 10 行卡），高度由"卡牌大小"设置换算而来 —— 卡片放大时
 *  面板跟着变高，这样一行显示的张数与卡片尺寸始终匹配（用户要求与"卡牌大小"联动）。 */
const DETENT_ROWS = [3, 6, 10] as const;
/** 把手 + 标题行 + 内边距 + 底部安全区占掉的固定高度（实测约 96px）。 */
const CHROME_PX = 96;
const MIN_HEIGHT_RATIO = 0.22;
const MAX_HEIGHT_RATIO = 0.85;

/** 视口高度（拖动与档位换算都要用，窗口变化时跟着更新）。 */
function useViewportHeight(): number {
  const [height, setHeight] = useState(() =>
    typeof window === "undefined" ? 800 : window.innerHeight);
  useEffect(() => {
    const onResize = () => setHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return height;
}

export function UnusedCardsTray({ columns, ...props }: UnusedCardsTrayProps) {
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down("sm"));
  const [open, setOpen] = useState(false);
  const drag = useRef<{ startY: number; startH: number; moved: boolean } | null>(null);
  const viewportHeight = useViewportHeight();

  // 档位高度（px）：跟卡面高度与设置里的"卡牌大小"联动
  const cardHeight = Math.round(props.width / CardAspectRatio);
  const rowHeight = cardHeight + 4;   // DECK_GAP
  const detents = DETENT_ROWS.map((rows) => Math.round(
    Math.min(viewportHeight * MAX_HEIGHT_RATIO,
      Math.max(viewportHeight * MIN_HEIGHT_RATIO, CHROME_PX + rows * rowHeight))));
  const [heightPx, setHeightPx] = useState<number>(detents[0]!);
  // 卡片尺寸变化（用户点"放大/缩小"）时，当前档位跟着换算到新高度
  const appliedCardWidth = useRef(props.width);
  useEffect(() => {
    if (appliedCardWidth.current === props.width) return;
    appliedCardWidth.current = props.width;
    setHeightPx((current) => {
      const index = detents.findIndex((value) => Math.abs(value - current) < 24);
      return detents[index >= 0 ? index : 0]!;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.width]);

  // 宽屏：保持原来的内联布局（单行 + 滑块）
  if (!narrow) return <UnusedCards {...props} />;

  return (
    <>
      {/* 底部粘性栏：始终能看到"还有多少张卡"，点开抽屉挑卡 */}
      {/* 面板升起后底部栏被盖住 → 直接隐掉，避免"看不到的按钮"（收起入口在面板里） */}
      {!open && (
      <Paper
        elevation={8}
        square={false}
        data-testid="unused-cards-bar"
        sx={{
          position: "sticky",
          bottom: 0,
          zIndex: (muiTheme) => muiTheme.zIndex.appBar - 1,
          mt: 1.5,
          px: 1.5,
          py: 0.5,
          pb: "calc(4px + env(safe-area-inset-bottom))",
          borderTopLeftRadius: MD2.shape,
          borderTopRightRadius: MD2.shape,
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <Typography variant="body2" sx={{ flex: 1 }}>
          {t(Localization.GameUnusedCards, { count: String(props.cards.length) })}
        </Typography>
        <Button
          size="small"
          color="primary"
          data-testid="unused-cards-toggle"
          startIcon={open ? <ExpandMoreRounded /> : <ExpandLessRounded />}
          onClick={() => setOpen((value) => !value)}
        >
          {t(open ? Localization.GameUnusedCollapse : Localization.GameUnusedExpand)}
        </Button>
      </Paper>
      )}

      {/* 非模态底部面板：从底部升起，后面的牌桌仍可操作（没有遮罩，所以不突兀） */}
      <Fade in={open} unmountOnExit>
        <Box
          sx={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: (muiTheme) => muiTheme.zIndex.appBar - 1,
          }}
        >
          <Slide direction="up" in={open} mountOnEnter unmountOnExit>
            <Paper
              elevation={16}
              data-testid="unused-cards-sheet"
              sx={{
                borderTopLeftRadius: MD2.shape,
                borderTopRightRadius: MD2.shape,
                // MD2 深色主题的"高度"靠 surface 叠加表达：16dp → 15% 白；再加 1px 顶部分隔线
                backgroundImage:
                  "linear-gradient(rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.15))",
                borderTop: `1px solid ${MD2.accordion.divider}`,
                boxShadow: (muiTheme) => muiTheme.shadows[16],
                // 高度由把手拖动控制（三档吸附），三档按"卡牌大小"换算成 px
                height: heightPx,
                maxHeight: `${MAX_HEIGHT_RATIO * 100}vh`,
                overflowY: "auto",
                px: 2,
                pt: 1,
                pb: "calc(12px + env(safe-area-inset-bottom))",
              }}
            >
              {/* MD2 拖拽把手：**真的能拖**——上下拖动改变面板高度（30/60/85vh 三档吸附），
                  往下拖过阈值直接收起；轻点一下也收起 */}
              <Stack
                sx={{ alignItems: "center", py: 0.5, touchAction: "none", cursor: "grab" }}
                onPointerDown={(event) => {
                  drag.current = { startY: event.clientY, startH: heightPx, moved: false };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const state = drag.current;
                  if (!state) return;
                  if (Math.abs(event.clientY - state.startY) > 4) state.moved = true;
                  const next = state.startH + (state.startY - event.clientY);
                  const maxPx: number = detents[detents.length - 1] ?? viewportHeight * MAX_HEIGHT_RATIO;
                  const minPx = viewportHeight * MIN_HEIGHT_RATIO;
                  setHeightPx(Math.min(maxPx, Math.max(minPx, next)));
                }}
                onPointerUp={(event) => {
                  const state = drag.current;
                  drag.current = null;
                  if (!state) return;
                  event.currentTarget.releasePointerCapture?.(event.pointerId);
                  if (state.moved) {
                    // 吸附到最近的档位；拖到底（低于最小档）则收起
                    const smallest = detents[0]!;
                    if (heightPx < smallest - 24) {   // 拖到最小档以下 → 收起
                      setHeightPx(smallest);
                      setOpen(false);
                      return;
                    }
                    const nearest = detents.reduce<number>((best, value) =>
                      Math.abs(value - heightPx) < Math.abs(best - heightPx) ? value : best, smallest);
                    setHeightPx(nearest);
                    return;
                  }
                  setOpen(false);   // 没拖动 = 轻点 → 收起
                }}
                data-testid="unused-cards-handle-area"
              >
                <Box
                  data-testid="unused-cards-handle"
                  sx={{ width: 32, height: 4, borderRadius: 2, bgcolor: MD2.accordion.icon }}
                />
              </Stack>
              {/* 面板自带标题与"收起"：面板升起后会盖住底部栏，所以收起入口必须在面板里 */}
              <Stack direction="row" sx={{ alignItems: "center", gap: 1, mt: 0.5, mb: 0.5 }}>
                <Typography variant="body2" sx={{ flex: 1 }}>
                  {t(Localization.GameUnusedCards, { count: String(props.cards.length) })}
                </Typography>
                <Button
                  size="small"
                  color="primary"
                  data-testid="unused-cards-close"
                  startIcon={<ExpandMoreRounded />}
                  onClick={() => setOpen(false)}
                >
                  {t(Localization.GameUnusedCollapse)}
                </Button>
              </Stack>
              <UnusedCards {...props} layout="grid" columns={columns} />
            </Paper>
          </Slide>
        </Box>
      </Fade>
    </>
  );
}
