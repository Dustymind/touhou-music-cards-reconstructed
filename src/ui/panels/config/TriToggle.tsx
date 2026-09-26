/** 三态控件（不配置 / 已启用 / 已禁用）——「音乐选择预设」与模式 3 的专辑/作者行**共用一套**。
 *
 * 提取的动机很直接：预设那三个类别开关与模式 3 那两串列表（专辑 / 作者）是同一个控件的同一套行为，
 * 逐字复制一份只会让"三档的文案、顺序、MD2 尺寸"在两处各写一遍 —— 而它们必须一致（用户看的是同一件事）。
 */
import { ToggleButton, ToggleButtonGroup } from "@mui/material";

import { Localization, t } from "../../../i18n/localization";
import type { Tri } from "../../../music/selection";
import { NoFontFamily } from "../../../theme/theme";

/** 三档的显示顺序（与 `Tri` 的声明顺序无关，这里是**界面**口径）。 */
const TRI_ORDER: Tri[] = ["unset", "on", "off"];

/** 三档的文案。 */
function triLabel(value: Tri): string {
  if (value === "on") return t(Localization.ConfigTabTriOn);
  if (value === "off") return t(Localization.ConfigTabTriOff);
  return t(Localization.ConfigTabTriUnset);
}

interface TriToggleProps {
  value: Tri;
  onChange: (value: Tri) => void;
  /** `data-testid` 前缀：三档分别是 `<testId>-unset|-on|-off` */
  testId: string;
}

export function TriToggle({ value, onChange, testId }: TriToggleProps) {
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={value}
      onChange={(_event, next: Tri | null) => next && onChange(next)}
    >
      {TRI_ORDER.map((option) => (
        <ToggleButton key={option} value={option} sx={{ px: 2, fontFamily: NoFontFamily }}
          data-testid={`${testId}-${option}`}>
          {triLabel(option)}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
