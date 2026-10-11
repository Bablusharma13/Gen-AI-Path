import { Tiktoken } from 'js-tiktoken/lite';

export const ENCODINGS = {
  o200k_base: 'o200k_base (GPT-4o family, newer OpenAI models)',
  cl100k_base: 'cl100k_base (GPT-4 / GPT-3.5 era)',
} as const;
export type EncodingName = keyof typeof ENCODINGS;

const cache = new Map<EncodingName, Promise<Tiktoken>>();

/** Loads the BPE rank table on demand (they are large) and caches the encoder. */
export function loadEncoding(name: EncodingName): Promise<Tiktoken> {
  let pending = cache.get(name);
  if (!pending) {
    pending = (
      name === 'o200k_base'
        ? import('js-tiktoken/ranks/o200k_base')
        : import('js-tiktoken/ranks/cl100k_base')
    ).then((m) => new Tiktoken(m.default));
    cache.set(name, pending);
  }
  return pending;
}

export interface TokenPiece {
  ids: number[];
  text: string;
  /** More than one token was needed to form this text (e.g. a multi-byte character). */
  merged: boolean;
}

/**
 * Splits text into display pieces. Byte-level BPE can split one character (e.g. Devanagari or
 * emoji) across several tokens; those tokens are grouped so no piece shows a broken character.
 */
export function tokenizePieces(
  encoder: Tiktoken,
  text: string,
): { ids: number[]; pieces: TokenPiece[] } {
  const ids = encoder.encode(text);
  const pieces: TokenPiece[] = [];
  let group: number[] = [];
  for (const id of ids) {
    group.push(id);
    const decoded = encoder.decode(group);
    if (!decoded.endsWith('�') || group.length >= 8) {
      pieces.push({ ids: group, text: decoded, merged: group.length > 1 });
      group = [];
    }
  }
  if (group.length > 0)
    pieces.push({ ids: group, text: encoder.decode(group), merged: group.length > 1 });
  return { ids, pieces };
}
