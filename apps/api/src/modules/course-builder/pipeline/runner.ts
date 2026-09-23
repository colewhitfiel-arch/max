import { Injectable } from '@nestjs/common';
import { renderNodesForPrompt } from '@edu/ai';
import {
  type CourseDraft,
  CourseDraftSchema,
  type GenerationSourceKind,
  type GenerationStage,
  type KnowledgeAtom,
  type KnowledgeBase,
  type KnowledgeNode,
} from '@edu/contracts';
import { Errors } from '../../../common/errors/app-error';
import { AppLogger } from '../../../common/logger/logger.service';
import { type Env } from '../../../config/env';
import { InjectEnv } from '../../../config/env.module';
import { FilesService } from '../../files/files.service';
import { atomize, mapLimit, renderTopicMaterial, windowAtoms } from './atoms';
import { coverageStats, verifySurvey } from './citations';
import { mapLesson, theoryFromNodes } from './draft-mapper';
import { CourseGenerator } from './generator';
import { planModules } from './planner';

export interface PipelineJob {
  id: string;
  /** User.id преподавателя — для меты запросов к модели. */
  userId: string;
  sourceKind: GenerationSourceKind;
  topic: string | null;
  materialIds: string[];
  instructions: string | null;
  targetTitle: string | null;
}

export interface PipelineProgress {
  stage: GenerationStage;
  progress: number;
  knowledge?: KnowledgeBase;
}

export interface PipelineResult {
  draft: CourseDraft;
  knowledge: KnowledgeBase;
}

export class PipelineCancelledError extends Error {
  constructor() {
    super('Генерация отменена');
    this.name = 'PipelineCancelledError';
  }
}

const MIN_NODES = 2;

/** Отчёты по одному: запись в БД с меньшим прогрессом не обгонит запись с большим. */
function serialize<T>(fn: (value: T) => Promise<void>): (value: T) => Promise<void> {
  let chain: Promise<void> = Promise.resolve();
  return (value) => {
    const next = chain.then(() => fn(value));
    chain = next.catch(() => undefined);
    return next;
  };
}

/**
 * Оркестратор стадий (docs/02 §2.7, переработано под атомы):
 *   EXTRACTING  файлы → текст (или конспект по теме от модели) → атомы
 *   OUTLINING   окна атомов → survey (параллельно) → проверка цитат → детерминированный план
 *   GENERATING  по модулю — урок от модели (параллельно), маппинг в блоки контракта
 *   ASSEMBLING  сборка CourseDraft и валидация схемой
 * Отмена проверяется между стадиями и перед каждым окном/уроком; при отмене текущие запросы
 * к модели прерываются через AbortSignal. Прогресс отдаётся наружу через `report`
 * (последовательно — значения не «прыгают назад» из-за параллельных воркеров).
 */
@Injectable()
export class CoursePipelineRunner {
  private readonly log;

  constructor(
    private readonly generator: CourseGenerator,
    private readonly files: FilesService,
    @InjectEnv() private readonly env: Env,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'course-builder' });
  }

  async run(
    job: PipelineJob,
    rawReport: (p: PipelineProgress) => Promise<void>,
    isCancelled: () => Promise<boolean>,
  ): Promise<PipelineResult> {
    const controller = new AbortController();
    try {
      return await this.runStages(job, serialize(rawReport), isCancelled, controller);
    } catch (error) {
      // AbortError летящих запросов после отмены — это отмена, а не сбой
      if (controller.signal.aborted) throw new PipelineCancelledError();
      throw error;
    } finally {
      // Не даём долететь параллельным запросам после первой ошибки
      if (!controller.signal.aborted) controller.abort();
    }
  }

  private async runStages(
    job: PipelineJob,
    report: (p: PipelineProgress) => Promise<void>,
    isCancelled: () => Promise<boolean>,
    controller: AbortController,
  ): Promise<PipelineResult> {
    const parallel = this.env.COURSE_BUILDER_MAX_PARALLEL;
    const instructions = job.instructions ?? undefined;
    const { signal } = controller;
    const guard = async () => {
      if (signal.aborted || (await isCancelled())) {
        controller.abort();
        throw new PipelineCancelledError();
      }
    };

    // ---- EXTRACTING ----
    await report({ stage: 'EXTRACTING', progress: 5 });
    const { atoms, materialTitle } = await this.extract(job, signal);
    if (atoms.length === 0) throw Errors.businessRule('Из материалов не получилось выделить текст');
    this.log.info({ jobId: job.id, atoms: atoms.length }, 'атомы готовы');
    await guard();

    // ---- OUTLINING ----
    await report({ stage: 'OUTLINING', progress: 25 });
    const windows = windowAtoms(atoms);
    let done = 0;
    const surveyed = await mapLimit(windows, parallel, async (window) => {
      await guard();
      const nodes = await this.generator.surveyWindow(window, instructions, job.userId, signal);
      done += 1;
      await report({ stage: 'OUTLINING', progress: 25 + Math.round((done / windows.length) * 25) });
      return nodes;
    });
    const verified = verifySurvey(surveyed.flat(), atoms);
    if (verified.nodes.length < MIN_NODES) {
      throw Errors.businessRule(
        'Модель не нашла в материале достаточно узлов знаний с подтверждёнными цитатами',
      );
    }
    const plan = planModules(verified.nodes);
    const knowledge: KnowledgeBase = {
      atoms,
      nodes: verified.nodes,
      plan,
      stats: coverageStats(verified.nodes, atoms, verified.rejected),
    };
    this.log.info(
      {
        jobId: job.id,
        nodes: verified.nodes.length,
        rejected: verified.rejected,
        modules: plan.length,
      },
      'граф знаний собран',
    );
    await report({ stage: 'OUTLINING', progress: 55, knowledge });
    await guard();

    // ---- GENERATING ----
    await report({ stage: 'GENERATING', progress: 58, knowledge });
    const nodeById = new Map(verified.nodes.map((n) => [n.id, n]));
    const atomById = new Map(atoms.map((a) => [a.id, a]));
    let written = 0;
    const modules = await mapLimit(plan, parallel, async (module, index) => {
      await guard();
      const nodes = module.nodeIds.map((id) => nodeById.get(id)!).filter(Boolean);
      const promptNodes = nodes.map((n) => this.toPromptNode(n, atomById));
      const lesson = await this.generator.writeLesson(
        {
          moduleTitle: module.title,
          nodesText: renderNodesForPrompt(promptNodes),
          ...(instructions ? { instructions } : {}),
          position: { index, total: plan.length },
        },
        job.userId,
        signal,
      );
      written += 1;
      await report({
        stage: 'GENERATING',
        progress: 58 + Math.round((written / plan.length) * 32),
      });
      const sourceRefs = [
        ...new Set(nodes.flatMap((n) => n.atomIds.map((id) => atomById.get(id)?.source ?? ''))),
      ].filter(Boolean);
      return mapLesson(module.title, lesson, sourceRefs, {
        theoryMarkdown: theoryFromNodes(promptNodes),
      });
    });
    await guard();

    // ---- ASSEMBLING ----
    await report({ stage: 'ASSEMBLING', progress: 92, knowledge });
    const draft = CourseDraftSchema.parse({
      title: job.targetTitle ?? materialTitle ?? plan[0]?.title ?? 'Новый курс',
      description: this.describe(job, verified.nodes),
      modules,
    });
    return { draft, knowledge };
  }

  private async extract(
    job: PipelineJob,
    signal: AbortSignal,
  ): Promise<{ atoms: KnowledgeAtom[]; materialTitle: string | null }> {
    if (job.sourceKind === 'TOPIC') {
      if (!job.topic) throw Errors.validation('Для режима «по теме» нужна тема');
      const material = await this.generator.writeMaterial(
        {
          topic: job.topic,
          ...(job.instructions ? { instructions: job.instructions } : {}),
          ...(job.targetTitle ? { targetTitle: job.targetTitle } : {}),
        },
        job.userId,
        signal,
      );
      return {
        atoms: atomize(renderTopicMaterial(material), 'topic'),
        materialTitle: material.title,
      };
    }
    const atoms: KnowledgeAtom[] = [];
    let title: string | null = null;
    for (const fileId of job.materialIds) {
      const material = await this.files.extractMaterialText(fileId);
      title ??= material.meta.headings?.[0] ?? material.fileName.replace(/\.[^.]+$/, '');
      atoms.push(...atomize(material.text, material.fileName, { startId: atoms.length + 1 }));
    }
    if (job.topic) {
      // Тема указана вместе с файлами — это дополнительные атомы преподавателя
      atoms.push(...atomize(job.topic, 'topic', { startId: atoms.length + 1, minChars: 1 }));
    }
    return { atoms, materialTitle: title };
  }

  private toPromptNode(node: KnowledgeNode, atomById: Map<number, KnowledgeAtom>) {
    return {
      id: node.id,
      title: node.title,
      statement: node.statement,
      type: node.type,
      misconceptions: node.misconceptions,
      evidence: node.atomIds.map((id) => atomById.get(id)!).filter(Boolean),
    };
  }

  private describe(job: PipelineJob, nodes: KnowledgeNode[]): string {
    const key = nodes
      .filter((n) => n.importance === 3)
      .slice(0, 4)
      .map((n) => n.title.toLowerCase());
    const source = job.sourceKind === 'TOPIC' ? 'по описанию темы' : 'из материалов преподавателя';
    return key.length > 0
      ? `Курс сгенерирован ${source}. Ключевые темы: ${key.join(', ')}.`
      : `Курс сгенерирован ${source}.`;
  }
}
