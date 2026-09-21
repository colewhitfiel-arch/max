import { HealthStatusSchema, LivenessStatusSchema } from '@edu/contracts';
import { http } from 'msw';
import { apiUrl, json } from '../lib';

export const healthHandlers = [
  http.get(apiUrl('/health'), () =>
    json(HealthStatusSchema, {
      status: 'ok',
      db: 'ok',
      version: 'mock',
      time: new Date().toISOString(),
    }),
  ),
  http.get(apiUrl('/health/live'), () => json(LivenessStatusSchema, { status: 'ok' })),
];
