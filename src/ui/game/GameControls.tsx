/** 游戏页的少量共用控件：分组标题、单选行、数字下拉框。
 *
 * 抽出来是为了不再在 `GamePanel` 里重复五段几乎一样的单选 JSX，以及两段一样的下拉 JSX。
 */
import type { SvgIconComponent } from "@mui/icons-material";
import {
  Box, FormControl, FormControlLabel, InputLabel, MenuItem, Radio, Select, Stack, Typography,
  type SxProps,
} from "@mui/material";

import { MD2 } from "../../theme/theme";
import { gameLabelSx, gameRadioLabelSx } from "./GameButton";

/** 分组标题：与控件同高、垂直居中。 */
export function GameGroupLabel({ children }: { children: React.ReactNode }) {
  return <Typography sx={gameLabelSx}>{children}</Typography>;
}

interface GameRadioOptionProps {
  value: string;
  label: string;
  testId: string;
  icon: SvgIconComponent;
  iconSx: SxProps;
}

/** 一行单选：圆形单选 + 图标 + 文本。 */
export function GameRadioOption({ value, label, testId, icon: Icon, iconSx }: GameRadioOptionProps) {
  return (
    <FormControlLabel
      value={value}
      control={<Radio data-testid={testId} size="small" />}
      label={
        <Stack direction="row" sx={{ alignItems: "center", gap: `${MD2.button.iconGap}px` }}>
          <Icon sx={iconSx} />
          <Box component="span">{label}</Box>
        </Stack>
      }
      sx={gameRadioLabelSx}
    />
  );
}

interface NumberSelectProps {
  testId: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

/** MD2 数字下拉框（牌库行列）。 */
export function NumberSelect({ testId, label, value, min, max, onChange }: NumberSelectProps) {
  return (
    <FormControl size="small" variant="filled" sx={{ minWidth: 96 }}>
      <InputLabel id={`${testId}-label`}>{label}</InputLabel>
      <Select
        labelId={`${testId}-label`}
        label={label}
        value={value}
        data-testid={testId}
        onChange={(event) => onChange(Number(event.target.value))}
      >
        {Array.from({ length: max - min + 1 }, (_unused, index) => min + index).map((option) => (
          <MenuItem key={option} value={option} data-testid={`${testId}-${option}`}>{option}</MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
