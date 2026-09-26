/** 载入已启用音源的表，并把状态交给界面。 */
import { useEffect, useState } from "react";

import type { SourceRecord } from "../data/types";
import { applyManifestOverrides, loadSourceTables, type TableMap } from "./sources";

interface SourcesState {
  tables: TableMap;
  order: string[];
  status: "loading" | "ready";
}

/** 运行时覆盖的源地址：**两类 kind 各一条**（都是"使用者在设置页里填的一行地址"）。 */
export interface ManifestOverrides {
  /** 本地曲库地址（空 = 用数据里的默认值；D140） */
  local?: string;
  /** 模式 3 的自定义源链接（空 = 这个模式没有数据，**不发请求**；契约 C7） */
  custom?: string;
}

export function useSources(
  sources: readonly SourceRecord[],
  overrides: Record<string, { enabled: boolean; order: number }>,
  /** 运行时覆盖的源地址（见 `ManifestOverrides`） */
  manifests: ManifestOverrides = {},
): SourcesState {
  const [state, setState] = useState<SourcesState>({ tables: {}, order: [], status: "loading" });
  // 依赖用覆盖表的 **JSON 签名**（对象每次渲染都可能换身份），但 effect 里用的是**这份对象本身**：
  // 签名与内容一一对应，没必要再 parse 回来一份（R7②）。两个地址是字符串，直接进依赖。
  const overrideKey = JSON.stringify(overrides);
  const { local = "", custom = "" } = manifests;

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, status: "loading" }));
    loadSourceTables(applyManifestOverrides(sources, { local, custom }), overrides)
      .then((result) => {
        if (!cancelled) setState({ ...result, status: "ready" });
      })
      .catch(() => {
        if (!cancelled) setState({ tables: {}, order: [], status: "ready" });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, overrideKey, local, custom]);

  return state;
}
