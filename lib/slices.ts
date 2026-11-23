/**
 * Long work in short tasks. A generator that yields between small steps is run a slice at a time:
 * steps are taken until `budgetMs` has passed, then the thread goes back to the browser (a tap, a
 * scroll, a frame) before the next slice. One step is never split, so a slice lasts at most the
 * budget plus one step.
 */
export interface SliceOptions {
  /** how long one slice may run before giving the thread back */
  budgetMs?: number;
  now?: () => number;
  /** schedules the next slice; returns how to cancel it */
  later?: (fn: () => void) => () => void;
}

const timeout = (fn: () => void) => {
  const t = setTimeout(fn, 0);
  return () => clearTimeout(t);
};

/** Run `steps` to the end in slices, handing each yielded value to `onStep`, then call `onDone`. Returns a cancel. */
export function runInSlices<T>(steps: Iterator<T>, onStep: (value: T) => void, onDone: () => void, { budgetMs = 8, now = () => performance.now(), later = timeout }: SliceOptions = {}): () => void {
  let cancelNext: (() => void) | null = null;
  let stopped = false;
  const slice = () => {
    cancelNext = null;
    const start = now();
    do {
      const step = steps.next();
      if (stopped) return;
      if (step.done) {
        onDone();
        return;
      }
      onStep(step.value);
    } while (now() - start < budgetMs);
    cancelNext = later(slice);
  };
  cancelNext = later(slice);
  return () => {
    stopped = true;
    cancelNext?.();
  };
}
