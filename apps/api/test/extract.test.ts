import { describe, expect, it } from 'vitest';
import {
  detectFileType,
  ExtractionError,
  extractText,
  safeFilename,
  zipUncompressedSize,
} from '../src/modules/knowledge/extract';
import { makeDocx, makePdf, makeZip } from './fixtures/files';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('file type detection', () => {
  it('accepts matching extension, MIME and content', () => {
    expect(detectFileType('notes.md', 'text/markdown', Buffer.from('# Hi'))).toBe('md');
    expect(detectFileType('notes.txt', 'text/plain', Buffer.from('hello'))).toBe('txt');
    expect(detectFileType('policy.pdf', 'application/pdf', makePdf(['x']))).toBe('pdf');
    expect(detectFileType('guide.docx', DOCX_MIME, makeDocx(['x']))).toBe('docx');
    // Browsers often send octet-stream for .md: the content check still applies.
    expect(detectFileType('README.markdown', 'application/octet-stream', Buffer.from('text'))).toBe(
      'md',
    );
  });

  it('rejects unsupported extensions, mismatched content and mismatched MIME types', () => {
    const cases: [string, string, Buffer][] = [
      ['run.exe', 'application/octet-stream', Buffer.from('MZ')],
      ['fake.pdf', 'application/pdf', Buffer.from('just text')],
      ['fake.docx', DOCX_MIME, Buffer.from('just text')],
      ['binary.txt', 'text/plain', Buffer.from([0x00, 0x01, 0x02])],
      ['latin1.txt', 'text/plain', Buffer.from([0x63, 0x61, 0x66, 0xe9])],
      ['pdf-in-disguise.md', 'text/markdown', makePdf(['x'])],
      ['image.md', 'image/png', Buffer.from('# hi')],
      ['empty.txt', 'text/plain', Buffer.alloc(0)],
    ];
    for (const [name, mime, buf] of cases) {
      expect(() => detectFileType(name, mime, buf), name).toThrow(ExtractionError);
    }
  });

  it('cleans file names', () => {
    expect(safeFilename('../../etc/passwd')).toBe('passwd');
    expect(safeFilename('C:\\Users\\me\\Report <final>.pdf')).toBe('Report final.pdf');
    expect(safeFilename('\u0000\u0001')).toBe('document');
  });
});

describe('text extraction', () => {
  it('extracts text from Markdown, PDF and DOCX', async () => {
    expect(await extractText('md', Buffer.from('# Title\r\n\r\n\r\n\r\nBody  \r\n'))).toBe(
      '# Title\n\nBody',
    );
    const pdfText = await extractText(
      'pdf',
      makePdf(['Refunds are accepted within 14 days.', 'Keep the receipt.']),
    );
    expect(pdfText).toContain('Refunds are accepted within 14 days.');
    expect(pdfText).toContain('Keep the receipt.');
    const docxText = await extractText(
      'docx',
      makeDocx(['Onboarding guide', 'Laptops ship with 16 GB RAM.']),
    );
    expect(docxText).toContain('Laptops ship with 16 GB RAM.');
  });

  it('rejects a ZIP that is not a Word document, and an oversized ZIP before decompressing it', async () => {
    const notWord = makeZip([{ name: 'hello.txt', data: Buffer.from('hi') }]);
    await expect(extractText('docx', notWord)).rejects.toThrow('not a Word document');

    const bomb = makeZip([{ name: 'word/document.xml', data: Buffer.from('<x/>') }]);
    // Forge the declared uncompressed size in the central directory (offset 24 of the entry).
    const central = bomb.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    bomb.writeUInt32LE(4_000_000_000, central + 24);
    expect(zipUncompressedSize(bomb).bytes).toBe(4_000_000_000);
    await expect(extractText('docx', bomb)).rejects.toThrow('unusually large');
  });

  it('rejects documents without text', async () => {
    await expect(extractText('txt', Buffer.from('   \n\n  '))).rejects.toThrow('no text');
  });
});
