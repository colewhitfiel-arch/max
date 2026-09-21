import type { ComponentType } from 'react';

/**
 * Ленивый роут React Router: `lazy: lazyRoute(() => import('./ui/HomePage'), 'HomePage')`.
 * Даёт code-splitting по страницам без boilerplate.
 */
export function lazyRoute<M extends Record<string, unknown>>(
  load: () => Promise<M>,
  exportName: keyof M & string,
) {
  return async () => {
    const module = await load();
    return { Component: module[exportName] as ComponentType };
  };
}
