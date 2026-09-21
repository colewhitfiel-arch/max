import type { CourseDraft } from '@edu/contracts';
import { Errors } from '../../../common/errors/app-error';
import {
  type ContentExtractor,
  type CourseOutline,
  type CourseTransformer,
  type ExtractInput,
  type ExtractedContent,
  type TransformContext,
} from './pipeline.types';

/** Извлекает только plain-text/markdown; остальные форматы — задача Agent G. */
export class PlainTextExtractor implements ContentExtractor {
  supports(mime: string): boolean {
    return mime.startsWith('text/');
  }
  async extract(input: ExtractInput): Promise<ExtractedContent> {
    throw Errors.notImplemented(`Извлечение текста (${input.mime})`);
  }
}

/** Детерминированный трансформер для проверки оркестрации без ИИ. */
export class MockCourseTransformer implements CourseTransformer {
  async outline(ctx: TransformContext): Promise<CourseOutline> {
    return {
      title: ctx.targetTitle ?? 'Курс из материалов',
      modules: ctx.materials.map((m, i) => ({ title: `Модуль ${i + 1}`, sourceRefs: [m.fileId] })),
    };
  }
  async generateModule(
    _ctx: TransformContext,
    module: CourseOutline['modules'][number],
  ): Promise<CourseDraft['modules'][number]> {
    return {
      title: module.title,
      sourceRefs: module.sourceRefs,
      blocks: [
        {
          type: 'TEXT',
          title: module.title,
          content: { markdown: `# ${module.title}\n\n(черновик)` },
        },
      ],
    };
  }
}
