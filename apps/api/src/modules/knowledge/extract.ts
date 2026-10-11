import { KNOWLEDGE_FILE_TYPES, type KnowledgeFileType } from '@genpath/shared';

/** A failure whose message is safe to show to the uploader. */
export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}

export const MAX_EXTRACTED_CHARS = 1_000_000;
const MAX_DOCX_UNCOMPRESSED_BYTES = 60 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 2000;

const EXTENSIONS: Record<string, KnowledgeFileType> = {
  '.txt': 'txt',
  '.md': 'md',
  '.markdown': 'md',
  '.pdf': 'pdf',
  '.docx': 'docx',
};

/** MIME types browsers commonly send for each file type. `application/octet-stream` means "unknown". */
const ACCEPTED_MIME: Record<KnowledgeFileType, string[]> = {
  txt: ['text/plain'],
  md: ['text/markdown', 'text/x-markdown', 'text/plain'],
  pdf: ['application/pdf'],
  docx: [KNOWLEDGE_FILE_TYPES.docx.mime],
};

const startsWith = (buf: Buffer, bytes: number[]) => bytes.every((b, i) => buf[i] === b);
const isPdf = (buf: Buffer) => startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
const isZip = (buf: Buffer) => startsWith(buf, [0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04

function isUtf8Text(buf: Buffer): boolean {
  if (buf.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

/** Sums uncompressed sizes from the ZIP central directory without decompressing anything. */
export function zipUncompressedSize(buf: Buffer): {
  entries: number;
  bytes: number;
  names: string[];
} {
  // End of central directory record: signature 0x06054b50, searched from the end (comment ≤ 64 KiB).
  const min = Math.max(0, buf.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1)
    throw new ExtractionError('This .docx file is damaged (no ZIP directory found).');
  const entries = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  let bytes = 0;
  const names: string[] = [];
  for (let n = 0; n < entries; n += 1) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== 0x02014b50) {
      throw new ExtractionError('This .docx file is damaged (invalid ZIP directory).');
    }
    bytes += buf.readUInt32LE(offset + 24);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    names.push(buf.toString('utf8', offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { entries, bytes, names };
}

/**
 * Decides the file type from the extension, then requires the content (magic bytes) and the
 * declared MIME type to agree. Anything ambiguous is rejected rather than guessed.
 */
export function detectFileType(filename: string, mimeType: string, buf: Buffer): KnowledgeFileType {
  const ext = /\.[a-z0-9]+$/i.exec(filename)?.[0]?.toLowerCase() ?? '';
  const type = EXTENSIONS[ext];
  if (!type) throw new ExtractionError('Only .txt, .md, .pdf and .docx files can be uploaded.');
  if (buf.length === 0) throw new ExtractionError('The file is empty.');

  const mime = mimeType.toLowerCase().split(';')[0]!.trim();
  if (mime && mime !== 'application/octet-stream' && !ACCEPTED_MIME[type].includes(mime)) {
    throw new ExtractionError(
      `The file says it is ${mime}, which does not match its .${ext.slice(1)} extension.`,
    );
  }

  const contentMatches =
    type === 'pdf'
      ? isPdf(buf)
      : type === 'docx'
        ? isZip(buf)
        : !isPdf(buf) && !isZip(buf) && isUtf8Text(buf);
  if (!contentMatches) {
    throw new ExtractionError(
      type === 'txt' || type === 'md'
        ? 'Text files must be UTF-8 encoded text.'
        : `The file content is not a valid ${KNOWLEDGE_FILE_TYPES[type].label} file.`,
    );
  }
  return type;
}

function normalise(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replaceAll('\u0000', '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function extractText(type: KnowledgeFileType, buf: Buffer): Promise<string> {
  let text: string;
  switch (type) {
    case 'txt':
    case 'md':
      text = new TextDecoder('utf-8').decode(buf);
      break;
    case 'pdf': {
      const { extractText: extractPdf } = await import('unpdf');
      try {
        const result = await extractPdf(new Uint8Array(buf), { mergePages: true });
        text = result.text;
      } catch {
        throw new ExtractionError('Could not read this PDF. It may be encrypted or damaged.');
      }
      if (!text.trim()) {
        throw new ExtractionError(
          'No text found in this PDF. Scanned PDFs need OCR, which is not supported yet.',
        );
      }
      break;
    }
    case 'docx': {
      const zip = zipUncompressedSize(buf);
      if (zip.entries > MAX_ZIP_ENTRIES || zip.bytes > MAX_DOCX_UNCOMPRESSED_BYTES) {
        throw new ExtractionError(
          'This .docx file expands to an unusually large size and was rejected.',
        );
      }
      if (!zip.names.includes('word/document.xml')) {
        throw new ExtractionError('This file is a ZIP archive but not a Word document.');
      }
      const { default: mammoth } = await import('mammoth');
      try {
        text = (await mammoth.extractRawText({ buffer: buf })).value;
      } catch {
        throw new ExtractionError('Could not read this Word document. It may be damaged.');
      }
      break;
    }
  }
  const clean = normalise(text);
  if (!clean) throw new ExtractionError('The document contains no text.');
  if (clean.length > MAX_EXTRACTED_CHARS) {
    throw new ExtractionError(
      `The document has more than ${MAX_EXTRACTED_CHARS.toLocaleString('en')} characters of text.`,
    );
  }
  return clean;
}

/** Keeps only a safe display name: no directories, control characters or overly long names. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'document';
  // Removing control characters from file names is the point of this pattern.
  // eslint-disable-next-line no-control-regex
  const unsafe = /[\u0000-\u001f\u007f<>:"|?*]/g;
  const cleaned = base.replace(unsafe, '').trim().slice(0, 200);
  return cleaned || 'document';
}
