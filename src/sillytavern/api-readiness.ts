import { validateTavernApiConfig } from './api-config'
import type { TavernSettings } from './types'

export function getTavernApiReadiness(settings: TavernSettings): { ready: boolean; error: string | null } {
  if (!settings.api.persistedApiKey?.trim()) return { ready: false, error: '尚未填写 API 密钥。请先完成接口设置，NPC 才能通过模型回应。' }
  const error = Object.values(validateTavernApiConfig(settings.api)).find(Boolean) ?? null
  return { ready: !error, error }
}
