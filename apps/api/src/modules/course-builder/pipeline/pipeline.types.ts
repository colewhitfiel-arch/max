/**
 * Порты пайплайна «материалы → курс» (docs/02 §2.7). Foundation: только интерфейсы и заглушки.
 * Реализация извлечения текста и генерации — отдельная задача (Agent G).
 */
import type { CourseDraft, GenerationStage } from '@edu/contracts';

export const CONTENT_EXTRACTOR = Symbol('CONTENT_EXTRACTOR');
export const COURSE_TRANSFORMER = Symbol('COURSE_TRANSFORMER');

export interface ExtractInput {
  fileId: string;
  storageKey: string;
  mime: string;
  fileName: string;
}

export interface ExtractedContent {
  fileId: string;
  text: string;
  meta: { pages?: number; headings?: string[]; chars: number };
}

/** Слой извлечения текста из материалов (pdf/docx/pptx/txt/изображения через OCR). */
export interface ContentExtractor {
  supports(mime: string): boolean;
  extract(input: ExtractInput): Promise<ExtractedContent>;
}

export interface TransformContext {
  jobId: string;
  teacherId: string;
  groupId: string;
  instructions: string | null;
  targetTitle: string | null;
  materials: ExtractedContent[];
}

export interface CourseOutline {
  title: string;
  description?: string;
  modules: Array<{ title: string; summary?: string; sourceRefs?: string[] }>;
}

/** Слой ИИ-преобразования: outline → модули с блоками. Работает через AiService, не через GigaChat напрямую. */
export interface CourseTransformer {
  outline(ctx: TransformContext): Promise<CourseOutline>;
  generateModule(
    ctx: TransformContext,
    module: CourseOutline['modules'][number],
    index: number,
  ): Promise<CourseDraft['modules'][number]>;
}

export interface StageProgress {
  stage: GenerationStage;
  progress: number;
  draft?: CourseDraft;
  error?: string;
}

/** Оркестратор этапов: EXTRACTING → OUTLINING → GENERATING → ASSEMBLING → READY | FAILED. */
export interface CoursePipeline {
  run(jobId: string, report: (p: StageProgress) => Promise<void>): Promise<CourseDraft>;
}
