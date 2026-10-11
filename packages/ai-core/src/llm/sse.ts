export interface SseMessage {
  event: string | null;
  data: string;
}

/**
 * Minimal Server-Sent Events parser over a byte stream. Handles events split across chunks,
 * CRLF line endings, multi-line `data:` fields and comment lines.
 */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event: string | null = null;
  let data: string[] = [];

  const flush = (): SseMessage | null => {
    if (data.length === 0 && event === null) return null;
    const message = { event, data: data.join('\n') };
    event = null;
    data = [];
    return message;
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line === '') {
          const message = flush();
          if (message) yield message;
        } else if (line.startsWith(':')) {
          continue;
        } else {
          const colon = line.indexOf(':');
          const field = colon === -1 ? line : line.slice(0, colon);
          const raw = colon === -1 ? '' : line.slice(colon + 1);
          const val = raw.startsWith(' ') ? raw.slice(1) : raw;
          if (field === 'data') data.push(val);
          else if (field === 'event') event = val;
        }
      }
      if (done) {
        if (buffer.trim()) {
          // Trailing line without a final newline.
          const colon = buffer.indexOf(':');
          if (colon > 0 && buffer.slice(0, colon) === 'data')
            data.push(buffer.slice(colon + 1).trimStart());
        }
        const message = flush();
        if (message) yield message;
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
