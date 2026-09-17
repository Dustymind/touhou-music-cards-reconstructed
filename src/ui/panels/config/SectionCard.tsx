/** 设置页分区外壳：MD2 卡片 + `CardHeader`（标题 h6）+ 内容区。
 *
 * 六个分区原来各写一遍 `<Card><CardHeader titleTypographyProps={{ variant: "h6" }} /><CardContent>`，
 * 抽成一个组件，标题层级与内边距只有一处定义。
 */
import { Card, CardContent, CardHeader, type SxProps } from "@mui/material";

export interface SectionCardProps {
  title: string;
  /** 右上角动作（重置按钮、开关等） */
  action?: React.ReactNode;
  testId?: string;
  children: React.ReactNode;
  contentSx?: SxProps;
}

export function SectionCard({ title, action, testId, children, contentSx }: SectionCardProps) {
  return (
    <Card data-testid={testId}>
      <CardHeader title={title} action={action} titleTypographyProps={{ variant: "h6" }} />
      <CardContent sx={contentSx}>{children}</CardContent>
    </Card>
  );
}
