/** 载入已启用音源的表，并把状态交给界面。 */
import { useEffect, useState } from "react";

import type { SourceRecord } from "../data/types";
import { loadSourceTables, type TableMap } from "./sources";

export interface SourcesState {
  tables: TableMap;
  order: string[];
  status: "loading" | "ready";
}

export function useSources(
  sources: readonly SourceRecord[],
  overrides: Record<string, { enabled: boolean; order: number }>,
): SourcesState {
  const [state, setState] = useState<SourcesState>({ tables: {}, order: [], status: "loading" });
  const overrideKey = JSON.stringify(overrides);

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, status: "loading" }));
    loadSourceTables(sources, JSON.parse(overrideKey) as typeof overrides)
      .then((result) => {
        if (!cancelled) setState({ ...result, status: "ready" });
      })
      .catch(() => {
        if (!cancelled) setState({ tables: {}, order: [], status: "ready" });
      });
    return () => {
      cancelled = true;
    };
  }, [sources, overrideKey]);

  return state;
}
