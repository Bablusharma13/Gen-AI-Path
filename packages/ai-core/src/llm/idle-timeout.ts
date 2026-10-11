/**
 * An abort signal that fires after `ms` without activity. Streaming providers call `touch()` for
 * every chunk, so a slow model that keeps producing tokens (e.g. a local model on a CPU) is never
 * cut off mid-answer, while a stalled connection still fails after `ms`.
 */
export interface IdleTimeout {
  readonly signal: AbortSignal;
  /** True once the timeout has fired. */
  readonly fired: boolean;
  /** Restart the countdown (call whenever data arrives). */
  touch(): void;
  /** Stop the timer (call when the request finishes). */
  clear(): void;
}

export function idleTimeout(ms: number): IdleTimeout {
  const controller = new AbortController();
  let fired = false;
  const fire = () => {
    fired = true;
    controller.abort(new DOMException(`No data for ${ms} ms`, 'TimeoutError'));
  };
  // Unref'd: a pending timer never keeps the process alive, so a stream abandoned by its consumer
  // only leaves a timer that fires once, harmlessly.
  const start = () => {
    const t = setTimeout(fire, ms);
    (t as { unref?: () => void }).unref?.();
    return t;
  };
  let timer = start();
  return {
    signal: controller.signal,
    get fired() {
      return fired;
    },
    touch() {
      if (fired) return;
      clearTimeout(timer);
      timer = start();
    },
    clear() {
      clearTimeout(timer);
    },
  };
}
