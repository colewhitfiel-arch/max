import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { requestContext } from './request-context';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Присваивает каждому запросу request-id (или берёт входящий) и открывает контекст запроса. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, requestId);
  requestContext.run({ requestId }, () => next());
}
