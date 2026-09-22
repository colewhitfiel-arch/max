import type { KnowledgeAtom } from '@edu/contracts';
import type { TopicMaterial } from '@edu/ai';

/**
 * Атомизация: материал → пронумерованные атомы (абзац / пункт / группа предложений).
 * Модель дальше цитирует номера атомов, а код проверяет цитаты (citations.ts).
 */

export interface AtomizeOptions {
  /** Абзацы короче — склеиваются со следующим. */
  minChars?: number;
  /** Абзацы длиннее — режутся по предложениям. */
  maxChars?: number;
  /** С какого номера нумеровать (при нескольких файлах — продолжаем). */
  startId?: number;
}

const DEFAULTS = { minChars: 40, maxChars: 600, startId: 1 };

const HEADING = /^#{1,6}\s+(.+)$/;
const BULLET = /^[-*•·]\s+|^\d+[.)]\s+/;

/** Абзацы: разделены пустой строкой; заголовки приклеиваются к следующему абзацу. */
function splitParagraphs(text: string): string[] {
  const out: string[] = [];
  let pendingHeading: string | null = null;
  for (const raw of text.split(/\n\s*\n/)) {
    const block = raw.trim();
    if (!block) continue;
    const heading = HEADING.exec(block);
    if (heading && !block.includes('\n')) {
      pendingHeading = heading[1]!.trim();
      continue;
    }
    // Список внутри абзаца — по пункту на атом
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const isList = lines.length > 1 && lines.every((l) => BULLET.test(l));
    const pieces = isList ? lines.map((l) => l.replace(BULLET, '')) : [lines.join(' ')];
    for (const piece of pieces) {
      const clean = piece.replace(/\s+/g, ' ').trim();
      if (!clean) continue;
      out.push(pendingHeading ? `${pendingHeading}. ${clean}` : clean);
      pendingHeading = null;
    }
  }
  if (pendingHeading) out.push(pendingHeading);
  return out;
}

/** Режет длинный абзац по предложениям в куски ≤ maxChars. */
function splitLong(paragraph: string, maxChars: number): string[] {
  if (paragraph.length <= maxChars) return [paragraph];
  const sentences = paragraph.match(/[^.!?…]+[.!?…]+["»)]?\s*|[^.!?…]+$/g) ?? [paragraph];
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > maxChars) {
      chunks.push(current.trim());
      current = '';
    }
    current += sentence;
    // Одно предложение длиннее лимита — режем жёстко по словам
    while (current.length > maxChars) {
      const cut = current.lastIndexOf(' ', maxChars);
      const at = cut > maxChars / 2 ? cut : maxChars;
      chunks.push(current.slice(0, at).trim());
      current = current.slice(at);
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

export function atomize(
  text: string,
  source: string,
  options: AtomizeOptions = {},
): KnowledgeAtom[] {
  const { minChars, maxChars, startId } = { ...DEFAULTS, ...options };
  const pieces: string[] = [];
  let carry = '';
  for (const paragraph of splitParagraphs(text)) {
    const merged = carry ? `${carry} ${paragraph}` : paragraph;
    if (merged.length < minChars) {
      carry = merged;
      continue;
    }
    carry = '';
    pieces.push(...splitLong(merged, maxChars));
  }
  if (carry) {
    if (pieces.length > 0 && carry.length < minChars) pieces[pieces.length - 1] += ` ${carry}`;
    else pieces.push(carry);
  }
  return pieces.map((atomText, index) => ({ id: startId + index, text: atomText, source }));
}

/** Конспект, написанный моделью по теме, → markdown-текст (дальше — обычная атомизация). */
export function renderTopicMaterial(material: TopicMaterial): string {
  return [
    `# ${material.title}`,
    ...material.sections.flatMap((section) => [`## ${section.heading}`, ...section.paragraphs]),
  ].join('\n\n');
}

/** Окна для survey: последовательные атомы с бюджетом символов; окна читаются параллельно. */
export function windowAtoms(atoms: KnowledgeAtom[], maxChars = 9000): KnowledgeAtom[][] {
  const windows: KnowledgeAtom[][] = [];
  let current: KnowledgeAtom[] = [];
  let size = 0;
  for (const atom of atoms) {
    if (current.length > 0 && size + atom.text.length > maxChars) {
      windows.push(current);
      current = [];
      size = 0;
    }
    current.push(atom);
    size += atom.text.length + 8;
  }
  if (current.length > 0) windows.push(current);
  return windows;
}

/** Параллельная обработка с лимитом одновременных задач (порядок результатов сохраняется). */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  // После первой ошибки новые элементы не стартуют: Promise.all уже отклонён, а лишние
  // запросы к модели только жгут лимиты и могут перезаписать состояние задачи позже.
  const worker = async () => {
    for (;;) {
      if (failed) return;
      const index = next;
      next += 1;
      if (index >= items.length) return;
      try {
        results[index] = await fn(items[index]!, index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
