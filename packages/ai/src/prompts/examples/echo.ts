import { z } from 'zod';
import { definePrompt } from '../registry';

/**
 * Пример промпта для тестов и документации. Продуктовые промпты живут в
 * `prompts/<feature>.ts` и принадлежат владельцам соответствующих A-задач.
 */

export const EchoResultSchema = z.object({
  echo: z.string(),
});
export type EchoResult = z.infer<typeof EchoResultSchema>;

export interface EchoVars {
  text: string;
}

export const echoPrompt = definePrompt({
  id: 'example.echo',
  version: 1,
  description: 'Тестовый промпт: модель возвращает переданный текст в виде JSON { echo }',
  system: 'Ты — эхо-сервис. Отвечай строго JSON вида {"echo": string}, без пояснений.',
  user: (vars: EchoVars) => vars.text,
  schema: EchoResultSchema,
  temperature: 0,
});
