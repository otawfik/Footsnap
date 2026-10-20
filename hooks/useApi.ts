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
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async (force: boolean, attempt = 0): Promise<void> => {
    const id = ++latest.current;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    setError(null);
    try {
      const result = await fetcher(force);
      if (id === latest.current) setData(result);
    } catch (e) {
      if (id !== latest.current) return;
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setErrorCode(e instanceof ApiError ? e.code : undefined);
      // the free data tier allows 10 requests a minute; when it's busy, try again
      // once its counter resets (a few times at most) instead of waiting for a tap
      if (e instanceof ApiError && e.code === 'RATE_LIMIT' && attempt < 3) {
        const waitS = Math.min(Math.max(e.retryAfterS ?? 15, 3), 61);
        retryTimer.current = setTimeout(() => run(true, attempt + 1), waitS * 1000);
      }
    } finally {
      if (id === latest.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
  }, []);

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
