import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createRemoteTavernApi } from '../sillytavern/api-adapter'
import { redactRequestInspection } from '../sillytavern/api-adapter'
import { validateTavernApiConfig } from '../sillytavern/api-config'
import { resolveApiKey } from '../sillytavern/api-credentials'
import { getTavernProvider } from '../sillytavern/provider-registry'
import { resolveSessionPreset } from '../sillytavern/prompt-compiler'
import { applyPresetGenerationSettings } from '../sillytavern/preset-generation'
import { tavernRepository, type TavernRepository } from '../sillytavern/repository'
import type {
  CharacterCard,
  ChatMessage,
  ChatPreset,
  ChatSession,
  Lorebook,
  TavernSettings,
  TavernRequestAudit,
} from '../sillytavern/types'
import { variableDefinitionsToRecord } from '../sillytavern/variable-definitions'
import { branchChat, truncateChatAt } from '../sillytavern/variables'
import { createRemoteTurn, type RemoteTurnInspection, type RemoteTurnResult } from './remote-story-engine'
import { DEFAULT_PLAYER_NAME, normalizePlayerName } from '../game/player-profile'

type TavernStatus = 'loading' | 'ready' | 'error'

interface SendTurnInput {
  sessionId: string
  npcId: string
  playerText: string
  variables?: Record<string, unknown>
  affinity?: number
  memoryTags?: string[]
  signal?: AbortSignal
  onDelta?: (raw: string) => void
  onReasoningDelta?: (reasoning: string) => void
}

interface TavernContextValue {
  status: TavernStatus
  error: string | null
  apiLabel: string
  apiReady: boolean
  apiReadinessError: string | null
  lorebooks: Lorebook[]
  presets: ChatPreset[]
  characters: CharacterCard[]
  sessions: ChatSession[]
  requestAudits: TavernRequestAudit[]
  settings: TavernSettings | null
  activeSession: ChatSession | null
  openNpcSession(npcId: string, variables?: Record<string, unknown>): Promise<ChatSession>
  sendTurn(input: SendTurnInput): Promise<ChatSession>
  selectSession(id: string | null): Promise<void>
  updateSettings(patch: Partial<TavernSettings>): Promise<void>
  saveLorebook(value: Lorebook): Promise<void>
  deleteLorebook(id: string): Promise<void>
  savePreset(value: ChatPreset): Promise<void>
  deletePreset(id: string): Promise<void>
  saveCharacter(value: CharacterCard): Promise<void>
  saveSession(value: ChatSession): Promise<void>
  deleteSession(id: string): Promise<void>
  branchSession(sessionId: string, messageIndex: number, name: string): Promise<ChatSession>
  truncateSession(sessionId: string, messageIndex: number): Promise<ChatSession>
  updateVariables(sessionId: string, variables: Record<string, unknown>): Promise<ChatSession>
  clearRequestAudits(): Promise<void>
}

const TavernContext = createContext<TavernContextValue | null>(null)

function replaceById<T extends { id: string }>(items: T[], value: T): T[] {
  const exists = items.some((item) => item.id === value.id)
  return exists ? items.map((item) => item.id === value.id ? value : item) : [value, ...items]
}

export function TavernProvider({ children, repository = tavernRepository, playerName }: { children: ReactNode; repository?: TavernRepository; playerName?: string }) {
  const [status, setStatus] = useState<TavernStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [lorebooks, setLorebooks] = useState<Lorebook[]>([])
  const [presets, setPresets] = useState<ChatPreset[]>([])
  const [characters, setCharacters] = useState<CharacterCard[]>([])
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [settings, setSettings] = useState<TavernSettings | null>(null)
  const [requestAudits, setRequestAudits] = useState<TavernRequestAudit[]>([])
  const turnQueues = useRef(new Map<string, Promise<void>>())
  const currentPlayerName = normalizePlayerName(playerName) ?? normalizePlayerName(settings?.userName) ?? DEFAULT_PLAYER_NAME

  useEffect(() => {
    let cancelled = false
    const initialize = async () => {
      try {
        await repository.initialize()
        const [nextLorebooks, nextPresets, nextCharacters, nextSessions, nextSettings, nextAudits] = await Promise.all([
          repository.listLorebooks(),
          repository.listPresets(),
          repository.listCharacters(),
          repository.listSessions(),
          repository.getSettings(),
          repository.listRequestAudits(),
        ])
        if (cancelled) return
        setLorebooks(nextLorebooks)
        setPresets(nextPresets)
        setCharacters(nextCharacters)
        setSessions(nextSessions)
        setSettings(nextSettings)
        setRequestAudits(nextAudits)
        setStatus('ready')
      } catch (caught) {
        if (cancelled) return
        setError(caught instanceof Error ? caught.message : '本地酒馆数据初始化失败')
        setStatus('error')
      }
    }
    void initialize()
    return () => { cancelled = true }
  }, [repository])

  const persistSettings = useCallback(async (patch: Partial<TavernSettings>) => {
    const current = settings ?? await repository.getSettings()
    const next = { ...current, ...patch, updatedAt: Date.now() }
    await repository.saveSettings(next)
    setSettings(await repository.getSettings())
  }, [repository, settings])

  useEffect(() => {
    if (status !== 'ready' || !settings || !normalizePlayerName(playerName) || settings.userName === currentPlayerName) return
    void persistSettings({ userName: currentPlayerName }).catch((caught) => {
      setError(caught instanceof Error ? caught.message : '玩家姓名同步到酒馆设置失败')
    })
  }, [status, settings, playerName, currentPlayerName, persistSettings])

  const saveSession = useCallback(async (value: ChatSession) => {
    await repository.saveSession(value)
    setSessions((current) => replaceById(current, value).sort((a, b) => b.updatedAt - a.updatedAt))
  }, [repository])

  const openNpcSession = useCallback(async (npcId: string, variables: Record<string, unknown> = {}) => {
    const card = characters.find((candidate) => candidate.npcId === npcId)
      ?? (await repository.listCharacters()).find((candidate) => candidate.npcId === npcId)
    if (!card) throw new Error(`找不到角色卡：${npcId}`)
    const existing = sessions
      .filter((session) => session.npcId === npcId)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    const mergedExisting = existing && Object.keys(variables).length > 0
      ? { ...existing, variables: { ...existing.variables, ...variables } }
      : existing
    const baseSession = mergedExisting ?? {
      id: crypto.randomUUID(),
      name: `${card.name} · 初次会话`,
      characterId: card.id,
      npcId,
      characterName: card.name,
      userName: currentPlayerName,
      presetId: null,
      presetBinding: { mode: 'follow-active' as const },
      lorebookIds: [...card.lorebookIds],
      variables,
      messages: [{
        id: crypto.randomUUID(),
        role: 'assistant' as const,
        content: card.firstMessage,
        timestamp: Date.now(),
        variablesAfter: variables,
      }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    const session = baseSession.userName === currentPlayerName ? baseSession : { ...baseSession, userName: currentPlayerName }
    if (!existing || session !== existing) await saveSession(session)
    await persistSettings({ activeCharacterId: card.id, activeSessionId: session.id })
    return session
  }, [characters, sessions, currentPlayerName, repository, persistSettings, saveSession])

  const sendTurn = useCallback(async (input: SendTurnInput) => {
    const previous = turnQueues.current.get(input.sessionId) ?? Promise.resolve()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const queued = previous.then(() => gate)
    turnQueues.current.set(input.sessionId, queued)
    try {
      return await previous.then(async () => {
    const session = (await repository.getSession(input.sessionId))
      ?? sessions.find((candidate) => candidate.id === input.sessionId)
    if (!session) throw new Error('找不到当前酒馆会话')
    const startedAt = performance.now()
    const currentSettings = settings ?? await repository.getSettings()
    const variables = {
      ...variableDefinitionsToRecord(currentSettings.globalVariables ?? []),
      ...variableDefinitionsToRecord(session.variableDefinitions ?? []),
      ...session.variables,
      ...input.variables,
      playerName: currentPlayerName,
      userName: currentPlayerName,
    }
    const character = characters.find((candidate) => candidate.npcId === input.npcId)
      ?? (await repository.listCharacters()).find((candidate) => candidate.npcId === input.npcId)
    if (!character) throw new Error(`找不到 NPC 角色卡：${input.npcId}`)
    const availablePresets = presets.length ? presets : await repository.listPresets()
    const preset = resolveSessionPreset(session, currentSettings, availablePresets)
    if (!preset) throw new Error('尚未选择可用的酒馆提示词预设。')
    const sessionLorebookIds = session.lorebookIds.length ? session.lorebookIds : currentSettings.activeLorebookIds
    const activeLorebooks = lorebooks.filter((book) => sessionLorebookIds.includes(book.id))
    const effectiveApiConfig = applyPresetGenerationSettings(currentSettings.api, preset.settings)
    const api = createRemoteTavernApi(effectiveApiConfig, resolveApiKey(currentSettings))
    let requestInspection: RemoteTurnInspection | null = null
    let turn: RemoteTurnResult
    const auditBase = (inspection: RemoteTurnInspection, status: TavernRequestAudit['status']): TavernRequestAudit => ({
      id: inspection.preparedRequest.id,
      createdAt: inspection.preparedRequest.createdAt,
      status,
      sessionId: session.id,
      characterName: character.name,
      presetId: preset.id,
      presetName: preset.name,
      presetBinding: session.presetBinding?.mode ?? 'follow-active',
      provider: effectiveApiConfig.provider,
      model: effectiveApiConfig.model,
      preparedRequest: inspection.preparedRequest.request,
      providerRequest: redactRequestInspection(inspection.providerRequest),
      segments: inspection.compilation.segments,
      macroOperations: inspection.compilation.macroOperations,
      matchedLorebookEntries: inspection.compilation.matchedEntries.map((match) => match.entry.id),
      diagnostics: inspection.compilation.diagnostics,
    })
    try {
      turn = await createRemoteTurn({
        api,
        playerText: input.playerText,
        history: session.messages,
        preset,
        lorebooks: activeLorebooks,
        character,
        userName: currentPlayerName,
        variables,
        formatPrompt: currentSettings.formatPromptTemplate,
        regexScripts: currentSettings.regexScripts,
        signal: input.signal,
        onDelta: input.onDelta,
        onReasoningDelta: input.onReasoningDelta,
        onInspection: (value) => { requestInspection = value },
      })
    } catch (caught) {
      if (requestInspection) {
        const failed = {
          ...auditBase(requestInspection, input.signal?.aborted ? 'aborted' : 'failed'),
          error: caught instanceof Error ? caught.message : '请求失败',
        }
        try {
          await repository.saveRequestAudit(failed)
          setRequestAudits(await repository.listRequestAudits())
        } catch {
          // Preserve the provider or abort error if audit persistence fails.
        }
      }
      throw caught
    }
    const succeeded = {
      ...auditBase(turn.inspection, 'succeeded'),
      providerReasoning: turn.providerReasoning || undefined,
      responsePreview: turn.parsed.maintext.slice(0, 500),
    }
    const now = Date.now()
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.playerText,
      timestamp: now,
      variables: variables as Record<string, string | number>,
    }
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: turn.parsed.maintext,
      timestamp: now + 1,
      parsed: turn.parsed,
      variablesAfter: turn.variablesAfter,
      apiUsed: 'remote',
      metadata: {
        processingTime: Math.round(performance.now() - startedAt),
        lorebookEntries: turn.matchedEntryIds,
        providerReasoning: turn.providerReasoning || undefined,
      },
    }
    const next = {
      ...session,
      userName: currentPlayerName,
      messages: [...session.messages, userMessage, assistantMessage],
      variables: turn.variablesAfter,
      updatedAt: now + 1,
    }
    await repository.commitTurn(next, succeeded)
    setSessions((current) => replaceById(current, next).sort((a, b) => b.updatedAt - a.updatedAt))
    setRequestAudits(await repository.listRequestAudits())
    return next
      })
    } finally {
      release()
      if (turnQueues.current.get(input.sessionId) === queued) turnQueues.current.delete(input.sessionId)
    }
  }, [sessions, repository, settings, characters, presets, lorebooks, currentPlayerName])

  const clearRequestAudits = useCallback(async () => {
    await repository.clearRequestAudits()
    setRequestAudits([])
  }, [repository])

  const selectSession = useCallback(async (id: string | null) => {
    await persistSettings({ activeSessionId: id })
  }, [persistSettings])

  const saveLorebook = useCallback(async (value: Lorebook) => {
    await repository.saveLorebook(value)
    setLorebooks((current) => replaceById(current, value))
  }, [repository])
  const deleteLorebook = useCallback(async (id: string) => {
    await repository.deleteLorebook(id)
    setLorebooks((current) => current.filter((item) => item.id !== id))
  }, [repository])
  const savePreset = useCallback(async (value: ChatPreset) => {
    await repository.savePreset(value)
    setPresets((current) => replaceById(current, value))
  }, [repository])
  const deletePreset = useCallback(async (id: string) => {
    await repository.deletePreset(id)
    setPresets((current) => current.filter((item) => item.id !== id))
  }, [repository])
  const saveCharacter = useCallback(async (value: CharacterCard) => {
    await repository.saveCharacter(value)
    setCharacters((current) => replaceById(current, value))
  }, [repository])
  const deleteSession = useCallback(async (id: string) => {
    await repository.deleteSession(id)
    setSessions((current) => current.filter((item) => item.id !== id))
    if (settings?.activeSessionId === id) await persistSettings({ activeSessionId: null })
  }, [repository, settings, persistSettings])

  const branchSession = useCallback(async (sessionId: string, messageIndex: number, name: string) => {
    const source = sessions.find((session) => session.id === sessionId) ?? await repository.getSession(sessionId)
    if (!source) throw new Error('找不到要分支的会话')
    const branch = { ...branchChat(source, messageIndex, {
      name,
      presetId: source.presetId,
      presetBinding: source.presetBinding,
      lorebookIds: source.lorebookIds,
    }), userName: currentPlayerName }
    await saveSession(branch)
    await persistSettings({ activeSessionId: branch.id, activeCharacterId: branch.characterId ?? null })
    return branch
  }, [sessions, repository, saveSession, persistSettings, currentPlayerName])

  const truncateSession = useCallback(async (sessionId: string, messageIndex: number) => {
    const source = sessions.find((session) => session.id === sessionId) ?? await repository.getSession(sessionId)
    if (!source) throw new Error('找不到要截断的会话')
    const next = { ...truncateChatAt(source, messageIndex + 1), userName: currentPlayerName, updatedAt: Date.now() }
    await saveSession(next)
    return next
  }, [sessions, repository, saveSession, currentPlayerName])

  const updateVariables = useCallback(async (sessionId: string, variables: Record<string, unknown>) => {
    const source = sessions.find((session) => session.id === sessionId) ?? await repository.getSession(sessionId)
    if (!source) throw new Error('找不到要更新变量的会话')
    const next = { ...source, userName: currentPlayerName, variables, updatedAt: Date.now() }
    await saveSession(next)
    return next
  }, [sessions, repository, saveSession, currentPlayerName])

  const presentedSessions = useMemo(() => sessions.map((session) => session.userName === currentPlayerName ? session : { ...session, userName: currentPlayerName }), [sessions, currentPlayerName])
  const activeSession = presentedSessions.find((session) => session.id === settings?.activeSessionId) ?? null
  const apiLabel = settings
    ? `${getTavernProvider(settings.api.provider).label} · ${settings.api.model || '未选择模型'}`
    : '模型配置载入中'
  const apiReadinessError = useMemo(() => {
    if (status !== 'ready' || !settings) return null
    if (!resolveApiKey(settings)) return '尚未填写 API 密钥。请先完成接口设置，NPC 才能通过模型回应。'
    return Object.values(validateTavernApiConfig(settings.api)).find(Boolean) ?? null
  }, [settings, status])
  const apiReady = status === 'ready' && Boolean(settings) && !apiReadinessError
  const value = useMemo<TavernContextValue>(() => ({
    status,
    error,
    apiLabel,
    apiReady,
    apiReadinessError,
    lorebooks,
    presets,
    characters,
    sessions: presentedSessions,
    requestAudits,
    settings,
    activeSession,
    openNpcSession,
    sendTurn,
    selectSession,
    updateSettings: persistSettings,
    saveLorebook,
    deleteLorebook,
    savePreset,
    deletePreset,
    saveCharacter,
    saveSession,
    deleteSession,
    branchSession,
    truncateSession,
    updateVariables,
    clearRequestAudits,
  }), [status, error, apiLabel, apiReady, apiReadinessError, lorebooks, presets, characters, presentedSessions, requestAudits, settings, activeSession, openNpcSession, sendTurn, selectSession, persistSettings, saveLorebook, deleteLorebook, savePreset, deletePreset, saveCharacter, saveSession, deleteSession, branchSession, truncateSession, updateVariables, clearRequestAudits])

  return <TavernContext.Provider value={value}>{children}</TavernContext.Provider>
}

export function useTavern() {
  const value = useContext(TavernContext)
  if (!value) throw new Error('useTavern 必须在 TavernProvider 内使用')
  return value
}
