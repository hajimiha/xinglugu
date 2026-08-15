import type { ImageGenerationProvider } from './types'

const PREFIX = 'xinglugu:image-credential:'
const memory = new Map<ImageGenerationProvider, string>()

function safeStorage(kind: 'session' | 'local'): Storage | null {
  try {
    if (kind === 'session') return typeof sessionStorage === 'undefined' ? null : sessionStorage
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function key(provider: ImageGenerationProvider): string {
  return `${PREFIX}${provider}`
}

export function setImageProviderCredential(provider: ImageGenerationProvider, value: string, remember: boolean): void {
  const credential = value.trim()
  memory.set(provider, credential)
  const session = safeStorage('session')
  const local = safeStorage('local')
  session?.removeItem(key(provider))
  local?.removeItem(key(provider))
  if (!credential) return
  ;(remember ? local : session)?.setItem(key(provider), credential)
}

export function resolveImageProviderCredential(provider: ImageGenerationProvider): string {
  const sessionValue = safeStorage('session')?.getItem(key(provider))?.trim()
  if (sessionValue) return sessionValue
  const localValue = safeStorage('local')?.getItem(key(provider))?.trim()
  if (localValue) return localValue
  return memory.get(provider)?.trim() ?? ''
}

export function clearImageProviderCredential(provider: ImageGenerationProvider): void {
  memory.delete(provider)
  safeStorage('session')?.removeItem(key(provider))
  safeStorage('local')?.removeItem(key(provider))
}

