import { hash, verify } from '@node-rs/argon2';

// OWASP Password Storage Cheat Sheet baseline for Argon2id (the library default algorithm):
// m = 19 MiB, t = 2, p = 1.
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;

/**
 * Burns the same amount of work as a real verification so that "unknown email" and
 * "wrong password" take similar time (reduces account enumeration by timing).
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword('genpath-dummy-password-for-timing');
  await verifyPassword(await dummyHash, password);
}
