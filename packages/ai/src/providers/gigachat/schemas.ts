import { z } from 'zod';
import type { AiUsage } from '../../types';

/**
 * Схемы ответов GigaChat API. Намеренно мягкие (`passthrough`, опциональные поля):
 * проверяем только то, что реально используем.
 */

export const GigaUsageSchema = z
  .object({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    total_tokens: z.number().optional(),
  })
  .passthrough();

export const OAuthResponseSchema = z
  .object({
    access_token: z.string().min(1),
    /** Unix time истечения токена (в документации — миллисекунды). */
    expires_at: z.number(),
  })
  .passthrough();

export const ChatCompletionSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            message: z
              .object({ role: z.string().optional(), content: z.string().default('') })
              .passthrough(),
            finish_reason: z.string().nullish(),
            index: z.number().optional(),
          })
          .passthrough(),
      )
      .min(1),
    model: z.string().optional(),
    usage: GigaUsageSchema.nullish(),
  })
  .passthrough();

export const ChatChunkSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            delta: z
              .object({ content: z.string().optional(), role: z.string().optional() })
              .passthrough()
              .optional(),
            finish_reason: z.string().nullish(),
            index: z.number().optional(),
          })
          .passthrough(),
      )
      .default([]),
    model: z.string().optional(),
    usage: GigaUsageSchema.nullish(),
  })
  .passthrough();

export const EmbeddingsResponseSchema = z
  .object({
    data: z.array(
      z
        .object({
          embedding: z.array(z.number()),
          index: z.number().optional(),
          usage: z.object({ prompt_tokens: z.number().optional() }).passthrough().optional(),
        })
        .passthrough(),
    ),
    model: z.string().optional(),
    usage: GigaUsageSchema.nullish(),
  })
  .passthrough();

export function toUsage(
  usage: z.output<typeof GigaUsageSchema> | null | undefined,
): AiUsage | undefined {
  if (!usage) return undefined;
  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: usage.total_tokens ?? promptTokens + completionTokens,
  };
}
