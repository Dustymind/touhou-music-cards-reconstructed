/** 设置页分区：MD2 扩展面板（默认折叠）。
 *
 * 动效：MD2 标准缓动（cubic-bezier(0.4, 0, 0.2, 1)）、展开 250ms / 收起 200ms；
 * 性能：折叠时**不挂载**内容（`unmountOnExit`）——预设那一区有几百个复选框，
 * 音乐源/单曲也各有列表，默认折叠后首屏只渲染五个标题。
 */
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import {
  Accordion, AccordionDetails, AccordionSummary, Box, Typography, type SxProps,
} from "@mui/material";

import { MD2 } from "../../../theme/theme";

interface SectionPanelProps {
  /** 折叠面板标题（也是 `data-testid` 的前缀） */
  title: string;
  /** 面板 id：用于 `section-<id>` / `section-<id>-summary` 测试选择器 */
  id: string;
  children: React.ReactNode;
  /** 内容区附加样式 */
  contentSx?: SxProps;
  /** 默认是否展开（默认折叠，用户要求） */
  defaultExpanded?: boolean;
}

export function SectionPanel({ title, id, children, contentSx, defaultExpanded = false }: SectionPanelProps) {
  const summaryId = `section-${id}-summary`;
  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      data-testid={`section-${id}`}
      slotProps={{
        transition: {
          unmountOnExit: true,
          timeout: MD2.accordion.timeout,
          easing: MD2.accordion.easing,
        },
      }}
    >
      <AccordionSummary
        id={summaryId}
        data-testid={summaryId}
        aria-controls={`section-${id}-content`}
        expandIcon={<ExpandMoreRounded />}
      >
        {/* MD2：扩展面板头部文字是 subtitle1（16sp/400） */}
        <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>{title}</Typography>
      </AccordionSummary>
      <AccordionDetails sx={contentSx}>
        <Box data-testid={`section-${id}-content`} id={`section-${id}-content`}>
          {children}
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}
