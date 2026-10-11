'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type RuntimeStatus = 'idle' | 'loading' | 'ready' | 'running' | 'error';

export interface RunResult {
  stdout: string;
  stderr: string;
  error: string | null;
  truncated: boolean;
  timedOut: boolean;
  durationMs: number;
}

interface Pending {
  resolve: (r: RunResult) => void;
  timer: ReturnType<typeof setTimeout>;
  started: number;
}

const LOAD_TIMEOUT_MS = 90_000;
export const RUN_TIMEOUT_MS = 8_000;

/**
 * Owns the Pyodide Web Worker. A run that exceeds the time limit terminates the worker (the only
 * reliable way to stop runaway code) and a fresh one is created for the next run.
 */
export function usePython() {
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, Pending>());
  const nextId = useRef(1);
  const [status, setStatus] = useState<RuntimeStatus>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);

  const destroy = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    for (const p of pending.current.values()) clearTimeout(p.timer);
    pending.current.clear();
  }, []);

  const spawn = useCallback(() => {
    destroy();
    const worker = new Worker('/workers/pyodide-worker.js');
    workerRef.current = worker;
    worker.onmessage = (
      event: MessageEvent<{
        id: number;
        type: string;
        stdout?: string;
        stderr?: string;
        error?: string | null;
        truncated?: boolean;
      }>,
    ) => {
      const msg = event.data;
      if (msg.type === 'ready') {
        setStatus('ready');
        return;
      }
      if (msg.type === 'error') {
        setStatus('error');
        setLoadError(msg.error ?? 'Python failed to load');
        return;
      }
      const job = pending.current.get(msg.id);
      if (!job) return;
      clearTimeout(job.timer);
      pending.current.delete(msg.id);
      setStatus('ready');
      job.resolve({
        stdout: msg.stdout ?? '',
        stderr: msg.stderr ?? '',
        error: msg.error ?? null,
        truncated: Boolean(msg.truncated),
        timedOut: false,
        durationMs: Math.round(performance.now() - job.started),
      });
    };
    worker.onerror = () => {
      setStatus('error');
      setLoadError('The Python worker crashed. Restart Python and try again.');
    };
    setStatus('loading');
    setLoadError(null);
    worker.postMessage({ id: 0, type: 'init' });
    return worker;
  }, [destroy]);

  useEffect(() => destroy, [destroy]);

  const run = useCallback(
    (code: string, timeoutMs = RUN_TIMEOUT_MS): Promise<RunResult> => {
      const worker = workerRef.current ?? spawn();
      const id = nextId.current++;
      const firstRun = status === 'idle' || status === 'loading';
      setStatus('running');
      return new Promise<RunResult>((resolve) => {
        const started = performance.now();
        const timer = setTimeout(
          () => {
            pending.current.delete(id);
            // Hard stop: kill the worker so infinite loops cannot keep running.
            spawn();
            resolve({
              stdout: '',
              stderr: '',
              error: null,
              truncated: false,
              timedOut: true,
              durationMs: Math.round(performance.now() - started),
            });
          },
          firstRun ? LOAD_TIMEOUT_MS + timeoutMs : timeoutMs,
        );
        pending.current.set(id, { resolve, timer, started });
        worker.postMessage({ id, type: 'run', code });
      });
    },
    [spawn, status],
  );

  return { status, loadError, run, restart: spawn, preload: spawn };
}
