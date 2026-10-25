"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BackendNotConnectedError } from "@/lib/api";
import type { AsyncState } from "@/types/sentinel";

const toMessage = (err: unknown) =>
  err instanceof Error ? err.message : "Unknown error";

/**
 * Loads a resource from the API layer and exposes `{ data, isLoading, error, refetch }`.
 * Optionally polls every `pollMs` (used for telemetry feeds until WebSocket is wired).
 */
export function useAsyncResource<T>(
  fetcher: () => Promise<T>,
  options: { pollMs?: number } = {},
) {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    isLoading: true,
    error: null,
  });
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const refetch = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const data = await fetcherRef.current();
      setState({ data, isLoading: false, error: null });
    } catch (err) {
      setState({ data: null, isLoading: false, error: toMessage(err) });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const data = await fetcherRef.current();
        if (!cancelled) setState({ data, isLoading: false, error: null });
      } catch (err) {
        if (!cancelled) setState({ data: null, isLoading: false, error: toMessage(err) });
      }
    };
    run();
    const id = options.pollMs ? setInterval(run, options.pollMs) : undefined;
    return () => {
      cancelled = true;
      if (id) clearInterval(id);
    };
  }, [options.pollMs]);

  const setData = useCallback((updater: T | null | ((prev: T | null) => T | null)) => {
    setState((s) => ({
      ...s,
      data: typeof updater === "function" ? (updater as (prev: T | null) => T | null)(s.data) : updater,
    }));
  }, []);

  return { ...state, refetch, setData };
}

export type ActionNotice = { kind: "info" | "error" | "success"; message: string } | null;

/**
 * Wraps a write-action from the API layer with pending / notice state.
 */
export function useAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
) {
  const [isPending, setPending] = useState(false);
  const [notice, setNotice] = useState<ActionNotice>(null);
  const [result, setResult] = useState<TResult | null>(null);

  const run = useCallback(
    async (...args: TArgs) => {
      setPending(true);
      setNotice(null);
      try {
        const res = await action(...args);
        setResult(res);
        setNotice({ kind: "success", message: "Operation acknowledged by backend." });
        return res;
      } catch (err) {
        if (err instanceof BackendNotConnectedError) {
          setNotice({ kind: "info", message: err.message });
        } else {
          setNotice({ kind: "error", message: toMessage(err) });
        }
        return null;
      } finally {
        setPending(false);
      }
    },
    [action],
  );

  return { run, isPending, notice, result, setNotice };
}
