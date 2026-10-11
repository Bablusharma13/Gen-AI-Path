export type DependencyState = 'up' | 'down' | 'not_configured';

export interface ReadinessReport {
  status: 'ready' | 'degraded' | 'not_ready';
  version: string;
  uptimeSec: number;
  checks: {
    mongodb: { state: DependencyState; latencyMs?: number };
    redis: { state: DependencyState; latencyMs?: number };
    queue: { mode: 'bullmq' | 'inline' };
    ai: { state: 'configured' | 'not_configured' | 'mock'; provider: string };
    embeddings: { provider: string; semantic: boolean };
  };
}
