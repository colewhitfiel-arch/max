/**
 * Роуты контракта (`apiContract`) как шаблоны «метод + путь». Нужны фильтру ошибок, чтобы
 * отличать ручку из контракта, которую ещё не реализовали (501 NOT_IMPLEMENTED — фронт
 * показывает «раздел в разработке»), от неизвестного пути (404 NOT_FOUND). См. docs/12:
 * «нереализованные ручки отдают Errors.notImplemented, а не 404».
 */
import { API_PREFIX, apiContract } from '@edu/contracts';

interface RoutePattern {
  method: string;
  pattern: RegExp;
}

interface ContractRouteLike {
  method: string;
  path: string;
}

function isRoute(value: unknown): value is ContractRouteLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ContractRouteLike).method === 'string' &&
    typeof (value as ContractRouteLike).path === 'string'
  );
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `/student/assignments/:assignmentId` → `^/api/v1/student/assignments/[^/]+/?$`. */
export function routePattern(path: string, prefix = API_PREFIX): RegExp {
  const source = escapeRegExp(`${prefix}${path}`).replace(/:[A-Za-z0-9_]+/g, '[^/]+');
  return new RegExp(`^${source}/?$`);
}

function collect(router: object, out: RoutePattern[]): void {
  for (const value of Object.values(router)) {
    if (isRoute(value))
      out.push({ method: value.method.toUpperCase(), pattern: routePattern(value.path) });
    else if (typeof value === 'object' && value !== null) collect(value, out);
  }
}

let cache: RoutePattern[] | null = null;

function contractRoutes(): RoutePattern[] {
  if (!cache) {
    cache = [];
    collect(apiContract, cache);
  }
  return cache;
}

/** Есть ли в контракте роут с таким методом и путём (путь с префиксом API, без query). */
export function isContractRoute(method: string, path: string): boolean {
  const m = method.toUpperCase();
  const clean = path.split('?')[0] ?? path;
  return contractRoutes().some((r) => r.method === m && r.pattern.test(clean));
}
