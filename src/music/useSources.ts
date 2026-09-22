/** 载入已启用音源的表，并把状态交给界面。 */
import { useEffect, useState } from "react";

import type { SourceRecord } from "../data/types";
import { applyLocalManifestUrl, loadSourceTables, type TableMap } from "./sources";

interface SourcesState {
  tables: TableMap;
  order: string[];
  status: "loading" | "ready";
}

export function useSources(
  sources: readonly SourceRecord[],
  overrides: Record<string, { enabled: boolean; order: number }>,
  /** 本地曲库地址的运行时覆盖（空 = 用数据里的默认值） */
  localManifestUrl = "",
): SourcesState {
  const [state, setState] = useState<SourcesState>({ tables: {}, order: [], status: "loading" });
  // 依赖用覆盖表的 **JSON 签名**（对象每次渲染都可能换身份），但 effect 里用的是**这份对象本身**：
  // 签名与内容一一对应，没必要再 parse 回来一份（R7②）
  const overrideKey = JSON.stringify(overrides);

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, status: "loading" }));
    loadSourceTables(applyLocalManifestUrl(sources, localManifestUrl), overrides)
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
  }, [sources, overrideKey, localManifestUrl]);

  return state;
}
