/**
 * Служебные ручки состояния сервиса. Публичные, без префикса роли.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { DateTimeSchema } from '../common';
import { contractRouterOptions, publicRoute } from './meta';

const c = initContract();

export const HealthStatusSchema = z.object({
  status: z.literal('ok'),
  db: z.enum(['ok', 'down']),
  version: z.string(),
  time: DateTimeSchema,
});
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export const LivenessStatusSchema = z.object({ status: z.literal('ok') });
export type LivenessStatus = z.infer<typeof LivenessStatusSchema>;

export const healthContract = c.router(
  {
    getHealth: {
      method: 'GET',
      path: '/health',
      responses: { 200: HealthStatusSchema },
      summary: 'Состояние сервиса: БД, версия, серверное время',
      metadata: publicRoute(),
    },
    getLiveness: {
      method: 'GET',
      path: '/health/live',
      responses: { 200: LivenessStatusSchema },
      summary: 'Liveness-проба (процесс жив)',
      metadata: publicRoute(),
    },
  },
  contractRouterOptions,
);
