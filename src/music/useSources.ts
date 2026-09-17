/** 载入已启用音源的表，并把状态交给界面。 */
import { useEffect, useState } from "react";

import type { SourceRecord } from "../data/types";
import { applyLocalManifestUrl, loadSourceTables, type TableMap } from "./sources";

export interface SourcesState {
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
  const overrideKey = JSON.stringify(overrides);

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, status: "loading" }));
    loadSourceTables(applyLocalManifestUrl(sources, localManifestUrl),
      JSON.parse(overrideKey) as typeof overrides)
      .then((result) => {
        if (!cancelled) setState({ ...result, status: "ready" });
      })
      .catch(() => {
        if (!cancelled) setState({ tables: {}, order: [], status: "ready" });
      });
    return () => {
      cancelled = true;
    };
  }, [sources, overrideKey, localManifestUrl]);

  return state;
}
