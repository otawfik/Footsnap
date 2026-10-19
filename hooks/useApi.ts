import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ApiError } from '../services/api';

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  errorCode?: string;
  /** Re-fetch, bypassing the in-memory cache. */
  refetch: () => Promise<void>;
}

interface Options {
  /** Re-fetch every pollMs while this screen is focused and the app is in the foreground. */
  pollMs?: number | null;
}

/**
 * Fetch on mount and when deps change; keep the last good data while
 * re-fetching so a refresh or a poll doesn't blank the screen.
 */
export function useApi<T>(
  fetcher: (force: boolean) => Promise<T>,
  deps: unknown[] = [],
  { pollMs = null }: Options = {}
): UseApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const latest = useRef(0);

  const run = useCallback(async (force: boolean) => {
    const id = ++latest.current;
    setError(null);
    try {
      const result = await fetcher(force);
      if (id === latest.current) setData(result);
    } catch (e) {
      if (id !== latest.current) return;
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setErrorCode(e instanceof ApiError ? e.code : undefined);
    } finally {
      if (id === latest.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // a new league or player: show the spinner and drop the old data
  useEffect(() => {
    setData(null);
    setLoading(true);
    run(false);
  }, [run]);

  useFocusEffect(
    useCallback(() => {
      if (!pollMs) return;
      let timer = setInterval(() => run(true), pollMs);
      const sub = AppState.addEventListener('change', (s) => {
        clearInterval(timer);
        if (s === 'active') {
          run(true);
          timer = setInterval(() => run(true), pollMs);
        }
      });
      return () => {
        clearInterval(timer);
        sub.remove();
      };
    }, [pollMs, run])
  );

  const refetch = useCallback(() => run(true), [run]);
  return { data, loading, error, errorCode, refetch };
}
