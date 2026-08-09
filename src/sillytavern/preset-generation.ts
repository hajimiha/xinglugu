import type { TavernApiConfig } from './types'

function finiteNumber(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null
}

export function applyPresetGenerationSettings(
  base: TavernApiConfig,
  settings: Record<string, unknown>,
): TavernApiConfig {
  const temperature = finiteNumber(settings.temperature, 0, 2)
  const topP = finiteNumber(settings.top_p, 0, 1)
  const frequencyPenalty = finiteNumber(settings.frequency_penalty, -2, 2)
  const presencePenalty = finiteNumber(settings.presence_penalty, -2, 2)
  const contextLength = finiteNumber(settings.openai_max_context ?? settings.max_context, 2)
  const maxResponseLength = finiteNumber(
    settings.openai_max_tokens ?? settings.max_tokens ?? settings.amount_gen,
    1,
  )
  return {
    ...base,
    ...(temperature === null ? {} : { temperature }),
    ...(topP === null ? {} : { topP }),
    ...(frequencyPenalty === null ? {} : { frequencyPenalty }),
    ...(presencePenalty === null ? {} : { presencePenalty }),
    ...(contextLength === null ? {} : { contextLength: Math.floor(contextLength) }),
    ...(maxResponseLength === null ? {} : { maxResponseLength: Math.floor(maxResponseLength) }),
    ...(typeof settings.stream_openai === 'boolean' ? { streaming: settings.stream_openai } : {}),
  }
}
