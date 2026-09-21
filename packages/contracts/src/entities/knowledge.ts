import { z } from 'zod';

/**
 * База знаний, которую course-builder извлекает из материала (или пишет сам по теме) до
 * генерации уроков. Принцип из StudyMate: модель цитирует **номера атомов**, а не копирует
 * текст; каждая цитата проверяется кодом, узел без подтверждённых цитат в курс не попадает.
 */

/** Атом — минимальная пронумерованная единица исходного текста (абзац/пункт/предложение). */
export const KnowledgeAtomSchema = z.object({
  id: z.number().int().positive(),
  text: z.string().min(1),
  /** Откуда атом: имя файла или `topic` для сгенерированного конспекта. */
  source: z.string().optional(),
});
export type KnowledgeAtom = z.infer<typeof KnowledgeAtomSchema>;

export const KNOWLEDGE_NODE_TYPES = ['CONCEPT', 'FACT', 'PROCEDURE', 'SKILL', 'EXAMPLE'] as const;
export const KnowledgeNodeTypeSchema = z.enum(KNOWLEDGE_NODE_TYPES);
export type KnowledgeNodeType = z.infer<typeof KnowledgeNodeTypeSchema>;

export const KNOWLEDGE_NODE_TYPE_LABELS: Record<KnowledgeNodeType, string> = {
  CONCEPT: 'Понятие',
  FACT: 'Факт',
  PROCEDURE: 'Порядок действий',
  SKILL: 'Навык',
  EXAMPLE: 'Пример',
};

/** Узел знаний: утверждение с якорями на атомы источника. */
export const KnowledgeNodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  statement: z.string().min(1),
  type: KnowledgeNodeTypeSchema,
  /** Подтверждённые кодом номера атомов. */
  atomIds: z.array(z.number().int().positive()).min(1),
  /** 1 — второстепенное, 3 — ключевое. */
  importance: z.number().int().min(1).max(3),
  /** Типичные заблуждения — используются в тестах и практике. */
  misconceptions: z.array(z.string()),
});
export type KnowledgeNode = z.infer<typeof KnowledgeNodeSchema>;

/** Модуль плана курса: подмножество узлов в порядке источника. */
export const KnowledgePlanModuleSchema = z.object({
  title: z.string().min(1),
  nodeIds: z.array(z.string()).min(1),
});
export type KnowledgePlanModule = z.infer<typeof KnowledgePlanModuleSchema>;

export const KnowledgeStatsSchema = z.object({
  atomsTotal: z.number().int().nonnegative(),
  /** Сколько атомов процитировано хотя бы одним узлом. */
  atomsCited: z.number().int().nonnegative(),
  /** atomsCited / atomsTotal, 0..1. */
  coverage: z.number().min(0).max(1),
  /** Узлы, отброшенные из-за неподтверждённых цитат. */
  nodesRejected: z.number().int().nonnegative(),
});
export type KnowledgeStats = z.infer<typeof KnowledgeStatsSchema>;

export const KnowledgeBaseSchema = z.object({
  atoms: z.array(KnowledgeAtomSchema),
  nodes: z.array(KnowledgeNodeSchema),
  plan: z.array(KnowledgePlanModuleSchema),
  stats: KnowledgeStatsSchema,
});
export type KnowledgeBase = z.infer<typeof KnowledgeBaseSchema>;
