/** 一次性载入运行时数据，并把状态暴露给界面。 */
import { useCallback, useEffect, useState } from "react";

import { DataLoadError, loadDataBundle } from "./load";
import type { DataBundle } from "./types";

export type DataStatus = "loading" | "ready" | "error";

export interface DataState {
  status: DataStatus;
  bundle: DataBundle | null;
  error: string | null;
  reload: () => void;
}

export function useDataBundle(base = "./data"): DataState {
  const [status, setStatus] = useState<DataStatus>("loading");
  const [bundle, setBundle] = useState<DataBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    loadDataBundle(base)
      .then((loaded) => {
        if (cancelled) return;
        setBundle(loaded);
        setStatus("ready");
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const message = cause instanceof DataLoadError
          ? cause.message
          : cause instanceof Error ? cause.message : String(cause);
        setError(message);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [base, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { status, bundle, error, reload };
}
