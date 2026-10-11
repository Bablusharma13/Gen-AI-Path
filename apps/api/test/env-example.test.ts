import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env';

const example = parseEnv(readFileSync(path.resolve(__dirname, '../../../.env.example'), 'utf8'));

describe('.env.example', () => {
  it('is a valid development configuration once secrets are filled in', () => {
    const config = loadConfig({
      ...example,
      JWT_SECRET: 'x'.repeat(48),
      JWT_REFRESH_SECRET: 'y'.repeat(48),
    });
    expect(config.ai.provider).toBe('none');
    expect(config.knowledge).toEqual({
      minScore: undefined,
      chunkWords: 180,
      chunkOverlapWords: 30,
    });
  });

  it('ships no secrets', () => {
    for (const key of [
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'AI_API_KEY',
      'AI_EMBEDDING_API_KEY',
      'OBJECT_STORAGE_SECRET_KEY',
      'SMTP_URL',
    ]) {
      expect(example[key], key).toBe('');
    }
  });

  it('documents every variable the API reads', () => {
    const source = readFileSync(path.resolve(__dirname, '../src/config/env.ts'), 'utf8');
    const schemaKeys = [...source.matchAll(/^\s{4}([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]!);
    expect(schemaKeys.length).toBeGreaterThan(30);
    const missing = schemaKeys.filter((k) => !(k in example) && k !== 'SMTP_URL');
    expect(missing).toEqual([]);
  });
});
