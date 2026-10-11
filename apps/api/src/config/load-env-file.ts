import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

/**
 * Loads the monorepo-root `.env` (if present) into process.env without overriding variables that
 * are already set. Walks up from the current directory until it finds `pnpm-workspace.yaml`.
 * In production, variables normally come from the platform and no file exists.
 */
export function loadEnvFile(startDir: string = process.cwd()): string | null {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 5; i += 1) {
    const candidate = path.join(dir, '.env');
    if (existsSync(candidate)) {
      applyEnv(readFileSync(candidate, 'utf8'));
      return candidate;
    }
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function applyEnv(content: string): void {
  const parsed = parseEnv(content);
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined && value !== undefined) process.env[key] = value;
  }
}
