import { ensure } from './errors';
export type ParsedSection = { text: string; location: string };
export function guardDocxZip(bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  ensure(b.readUInt32LE(0) === 0x04034b50, 400, 'Invalid DOCX ZIP signature.');
  let entries = 0,
    total = 0;
  for (let i = 0; i + 46 < b.length; i++) {
    if (b.readUInt32LE(i) !== 0x02014b50) continue;
    const size = b.readUInt32LE(i + 24),
      nameLength = b.readUInt16LE(i + 28),
      extra = b.readUInt16LE(i + 30),
      comment = b.readUInt16LE(i + 32);
    const name = b.subarray(i + 46, i + 46 + nameLength).toString();
    ensure(
      !name.includes('..') && !name.startsWith('/') && !name.includes('\\'),
      400,
      'Unsafe document archive path.',
    );
    total += size;
    entries++;
    ensure(
      total <= 12 * 1024 * 1024 && entries <= 500,
      400,
      'DOCX expanded content exceeds parsing limits.',
    );
    i += 45 + nameLength + extra + comment;
  }
  ensure(entries > 0, 400, 'DOCX archive directory is missing.');
}
export async function parseDocument(
  filename: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<ParsedSection[]> {
  ensure(
    bytes.length >= 4 && bytes.length <= 5 * 1024 * 1024,
    400,
    'Requirements documents must be between 4 bytes and 5 MB.',
  );
  ensure(
    filename.length <= 150 && !/[\\/\x00-\x1f]/.test(filename),
    400,
    'Invalid document filename.',
  );
  const extension = filename.toLowerCase().split('.').pop();
  let sections: ParsedSection[] = [];
  if (extension === 'pdf') {
    ensure(Buffer.from(bytes).subarray(0, 5).toString() === '%PDF-', 400, 'File is not a PDF.');
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({
      data: new Uint8Array(bytes),

      useSystemFonts: false,
      stopAtErrors: true,
    });
    try {
      const pdf = await task.promise;
      ensure(pdf.numPages <= 50, 400, 'PDF is limited to 50 pages.');
      for (let page = 1; page <= pdf.numPages; page++) {
        const content = await (await pdf.getPage(page)).getTextContent();
        const text = content.items
          .map((item) =>
            'str' in item ? item.str + ('hasEOL' in item && item.hasEOL ? '\n' : ' ') : '',
          )
          .join('');
        sections.push({ text, location: `page ${page}` });
      }
    } finally {
      await task.destroy();
    }
  } else if (extension === 'docx') {
    guardDocxZip(bytes);
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    sections = result.value
      .split(/\n\s*\n/)
      .map((text, i) => ({ text, location: `paragraph ${i + 1}` }));
  } else {
    ensure(
      ['txt', 'md', 'markdown'].includes(extension ?? '') &&
        ['text/plain', 'text/markdown', 'application/octet-stream', ''].includes(mimeType),
      400,
      'Use PDF, DOCX, Markdown or TXT requirements documents.',
    );
    const text = Buffer.from(bytes).toString('utf8');
    ensure(
      !text.includes('\uFFFD') && !text.includes('\0'),
      400,
      'Document must be valid UTF-8 text.',
    );
    sections = text.split('\n').map((text, i) => ({ text, location: `line ${i + 1}` }));
  }
  ensure(
    sections.reduce((n, s) => n + s.text.length, 0) <= 120000,
    400,
    'Extracted document text exceeds 120000 characters.',
  );
  sections = sections.map((s) => ({ ...s, text: s.text.trim() })).filter((s) => s.text);
  ensure(sections.length, 400, 'No readable text was found. Scanned PDFs need OCR before upload.');
  return sections;
}
export function chunkSections(sections: ParsedSection[], limit = 1400) {
  const chunks: ParsedSection[] = [];
  let text = '',
    start = '',
    end = '';
  for (const section of sections) {
    for (let i = 0; i < section.text.length; i += limit) {
      const part = section.text.slice(i, i + limit);
      if (text && text.length + 1 + part.length > limit) {
        chunks.push({ text, location: start === end ? start : `${start} – ${end}` });
        text = '';
      }
      if (!text) start = section.location;
      text += (text ? '\n' : '') + part;
      end = section.location;
    }
  }
  if (text) chunks.push({ text, location: start === end ? start : `${start} – ${end}` });
  return chunks;
}
