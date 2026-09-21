import type { KnowledgeNode, KnowledgePlanModule } from '@edu/contracts';

/**
 * Детерминированный планировщик (без модели): узлы в порядке источника режутся на модули
 * по 3–5 узлов; при избытке узлов сначала отбрасываются наименее важные.
 */
export interface PlanOptions {
  minPerModule?: number;
  maxPerModule?: number;
  maxModules?: number;
}

const DEFAULTS = { minPerModule: 3, maxPerModule: 5, maxModules: 8 };

export function planModules(
  nodes: KnowledgeNode[],
  options: PlanOptions = {},
): KnowledgePlanModule[] {
  const { minPerModule, maxPerModule, maxModules } = { ...DEFAULTS, ...options };
  if (nodes.length === 0) return [];

  const capacity = maxModules * maxPerModule;
  let selected = [...nodes];
  if (selected.length > capacity) {
    selected = [...nodes]
      .sort((a, b) => b.importance - a.importance || a.atomIds[0]! - b.atomIds[0]!)
      .slice(0, capacity)
      .sort((a, b) => a.atomIds[0]! - b.atomIds[0]!);
  }

  const count = Math.min(maxModules, Math.max(1, Math.ceil(selected.length / maxPerModule)));
  const size = Math.ceil(selected.length / count);
  const modules: KnowledgeNode[][] = [];
  for (let i = 0; i < selected.length; i += size) modules.push(selected.slice(i, i + size));
  // Слишком короткий хвост — приклеиваем к предыдущему модулю
  const last = modules[modules.length - 1];
  if (modules.length > 1 && last && last.length < minPerModule) {
    modules.pop();
    modules[modules.length - 1]!.push(...last);
  }

  return modules.map((group) => {
    const anchor = [...group].sort((a, b) => b.importance - a.importance)[0]!;
    return { title: anchor.title, nodeIds: group.map((n) => n.id) };
  });
}
