import mammoth from 'mammoth';
// Импорт из lib/ обходит debug-обёртку pdf-parse, которая при загрузке читает тестовый PDF.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { Errors } from '../../../common/errors/app-error';

export interface ExtractedText {
  text: string;
  meta: { pages?: number; headings?: string[]; chars: number };
}

const TEXT_MIMES = new Set(['text/plain', 'text/markdown', 'text/csv']);
const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export function supportsExtraction(mime: string): boolean {
  return TEXT_MIMES.has(mime) || mime === PDF_MIME || mime === DOCX_MIME || mime === PPTX_MIME;
}

/** Форматы, из которых текст реально извлекается уже сейчас (pptx — ещё нет). */
export function canExtractNow(mime: string): boolean {
  return TEXT_MIMES.has(mime) || mime === PDF_MIME || mime === DOCX_MIME;
}

/** Заголовки markdown/структуры — для меты файла. */
function collectHeadings(text: string): string[] {
  const headings: string[] = [];
  for (const line of text.split('\n')) {
    const match = /^#{1,3}\s+(.+)$/.exec(line.trim());
    if (match?.[1]) headings.push(match[1].trim());
    if (headings.length >= 30) break;
  }
  return headings;
}

/** Нормализация: единые переводы строк, схлопнутые пробелы, не более двух пустых строк подряд. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Извлечение текста из материала по MIME: txt/md как есть, pdf — pdf-parse, docx — mammoth.
 * pptx пока не поддерживается (NOT_IMPLEMENTED — job завершится с понятной ошибкой).
 */
export async function extractText(mime: string, buffer: Buffer): Promise<ExtractedText> {
  if (TEXT_MIMES.has(mime)) {
    const text = normalizeText(buffer.toString('utf8'));
    return { text, meta: { chars: text.length, headings: collectHeadings(text) } };
  }
  if (mime === PDF_MIME) {
    const parsed = await pdfParse(buffer);
    const text = normalizeText(parsed.text ?? '');
    return { text, meta: { pages: parsed.numpages, chars: text.length } };
  }
  if (mime === DOCX_MIME) {
    const result = await mammoth.extractRawText({ buffer });
    const text = normalizeText(result.value ?? '');
    return { text, meta: { chars: text.length, headings: collectHeadings(text) } };
  }
  if (mime === PPTX_MIME) throw Errors.notImplemented('Извлечение текста из pptx');
  throw Errors.businessRule(`Формат ${mime} не поддерживается для извлечения текста`);
}
