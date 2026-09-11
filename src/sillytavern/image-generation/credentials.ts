import type { ImageGenerationProvider, ImagePromptApiSettings } from './types'

const PREFIX = 'xinglugu:image-credential:'
const memory = new Map<string, string>()

function safeStorage(kind: 'session' | 'local'): Storage | null {
  try {
    if (kind === 'session') return typeof sessionStorage === 'undefined' ? null : sessionStorage
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

type CredentialScope = ImageGenerationProvider | `prompt-llm:${string}`

function key(provider: CredentialScope): string {
  return `${PREFIX}${provider}`
}

export function setImageProviderCredential(provider: CredentialScope, value: string, remember: boolean): void {
  const credential = value.trim()
  memory.set(provider, credential)
  const session = safeStorage('session')
  const local = safeStorage('local')
  session?.removeItem(key(provider))
  local?.removeItem(key(provider))
  if (!credential) return
  ;(remember ? local : session)?.setItem(key(provider), credential)
}

export function resolveImageProviderCredential(provider: CredentialScope): string {
  const sessionValue = safeStorage('session')?.getItem(key(provider))?.trim()
  if (sessionValue) return sessionValue
  const localValue = safeStorage('local')?.getItem(key(provider))?.trim()
  if (localValue) return localValue
  return memory.get(provider)?.trim() ?? ''
}

export function clearImageProviderCredential(provider: CredentialScope): void {
  memory.delete(provider)
  safeStorage('session')?.removeItem(key(provider))
  safeStorage('local')?.removeItem(key(provider))
}

function promptScope(api: Pick<ImagePromptApiSettings, 'provider' | 'baseUrl'>): CredentialScope {
  return `prompt-llm:${api.provider}:${api.baseUrl.trim().replace(/\/+$/, '')}`
}

export function setImagePromptCredential(api: ImagePromptApiSettings, value: string, remember: boolean): void {
  setImageProviderCredential(promptScope(api), value, remember)
}

export function resolveImagePromptCredential(api: ImagePromptApiSettings): string {
  return resolveImageProviderCredential(promptScope(api))
}

export function clearImagePromptCredential(api: ImagePromptApiSettings): void {
  clearImageProviderCredential(promptScope(api))
}
