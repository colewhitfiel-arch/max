import type { KnowledgeAtom, KnowledgeNode, KnowledgeStats } from '@edu/contracts';
import type { SurveyResult } from '@edu/ai';

/**
 * Проверка цитат (принцип StudyMate): узел остаётся в графе, только если ссылается на реально
 * существующие атомы. Несуществующие номера отбрасываются, узлы без улик — отклоняются,
 * дубли по названию — сливаются. Узлы упорядочиваются по первому процитированному атому.
 */

export interface VerifiedSurvey {
  nodes: KnowledgeNode[];
  rejected: number;
}

const normalizeTitle = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export function verifySurvey(raw: SurveyResult['nodes'], atoms: KnowledgeAtom[]): VerifiedSurvey {
  const known = new Set(atoms.map((a) => a.id));
  const byTitle = new Map<string, KnowledgeNode>();
  let rejected = 0;

  for (const candidate of raw) {
    const atomIds = [...new Set(candidate.atomIds.filter((id) => known.has(id)))].sort(
      (a, b) => a - b,
    );
    if (atomIds.length === 0) {
      rejected += 1;
      continue;
    }
    const key = normalizeTitle(candidate.title);
    const existing = key ? byTitle.get(key) : undefined;
    if (existing) {
      existing.atomIds = [...new Set([...existing.atomIds, ...atomIds])].sort((a, b) => a - b);
      existing.importance = Math.max(existing.importance, candidate.importance);
      existing.misconceptions = [
        ...new Set([...existing.misconceptions, ...candidate.misconceptions]),
      ];
      continue;
    }
    const node: KnowledgeNode = {
      id: '',
      title: candidate.title.trim(),
      statement: candidate.statement.trim(),
      type: candidate.type,
      atomIds,
      importance: candidate.importance,
      misconceptions: candidate.misconceptions.map((m) => m.trim()).filter(Boolean),
    };
    byTitle.set(key || `#${byTitle.size}`, node);
  }

  const nodes = [...byTitle.values()].sort((a, b) => a.atomIds[0]! - b.atomIds[0]!);
  nodes.forEach((node, index) => {
    node.id = `n${index + 1}`;
  });
  return { nodes, rejected };
}

export function coverageStats(
  nodes: KnowledgeNode[],
  atoms: KnowledgeAtom[],
  rejected: number,
): KnowledgeStats {
  const cited = new Set(nodes.flatMap((n) => n.atomIds));
  const atomsTotal = atoms.length;
  const atomsCited = atoms.filter((a) => cited.has(a.id)).length;
  return {
    atomsTotal,
    atomsCited,
    coverage: atomsTotal === 0 ? 0 : Math.round((atomsCited / atomsTotal) * 1000) / 1000,
    nodesRejected: rejected,
  };
}
