import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createRemoteTavernApi, redactRequestInspection } from '../sillytavern/api-adapter'
import { getTavernApiReadiness } from '../sillytavern/api-readiness'
import { resolveApiKey } from '../sillytavern/api-credentials'
import { getTavernProvider } from '../sillytavern/provider-registry'
import { resolveSessionResources } from '../sillytavern/prompt-compiler'
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
import { applyDefinedVariablePatch, variableDefinitionsToRecord } from '../sillytavern/variable-definitions'
import { branchChat, truncateChatAt } from '../sillytavern/variables'
import { createRemoteTurn, type RemoteTurnInspection, type RemoteTurnResult } from './remote-story-engine'
import { DEFAULT_PLAYER_NAME, normalizePlayerName } from '../game/player-profile'
import { installWorkshopPackage as installPackage, type WorkshopInstallResult } from '../workshop/install-package'
import type { WorkshopPackage } from '../workshop/types'
import { assembleImagePrompt, extractTaggedImagePrompt, type StructuredImagePrompt } from '../sillytavern/image-generation/prompt'
import { generateStructuredImagePrompt } from '../sillytavern/image-generation/prompt-service'
import { createImageProviderAdapters } from '../sillytavern/image-generation/providers'
import type { ImageProviderResources } from '../sillytavern/image-generation/providers'
import { ImageGenerationService } from '../sillytavern/image-generation/service'
import {
  clearImageProviderCredential,
  resolveImageProviderCredential,
  setImageProviderCredential,
} from '../sillytavern/image-generation/credentials'
import type {
  ImageGenerationAsset,
  ImageGenerationJob,
  ImageGenerationProvider,
  ImageGenerationSettings,
  ImageGenerationReference,
  ImageReferenceKind,
  ImagePromptMode,
} from '../sillytavern/image-generation/types'

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

export interface GenerateDialogueImageInput {
  sessionId: string
  npcId: string
  messageId?: string
  instruction?: string
  sourceText?: string
  mode?: ImagePromptMode
  signal?: AbortSignal
  prepared?: StructuredImagePrompt
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
  imageJobs: ImageGenerationJob[]
  imageAssets: ImageGenerationAsset[]
  imageReferences: ImageGenerationReference[]
  imageError: string | null
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
  installWorkshopPackage(value: WorkshopPackage): Promise<WorkshopInstallResult>
  saveSession(value: ChatSession): Promise<void>
  deleteSession(id: string): Promise<void>
  branchSession(sessionId: string, messageIndex: number, name: string): Promise<ChatSession>
  truncateSession(sessionId: string, messageIndex: number): Promise<ChatSession>
  updateVariables(sessionId: string, variables: Record<string, unknown>): Promise<ChatSession>
  clearRequestAudits(): Promise<void>
  generateDialogueImage(input: GenerateDialogueImageInput): Promise<ImageGenerationJob>
  prepareDialogueImagePrompt(input: Omit<GenerateDialogueImageInput, 'prepared'>): Promise<StructuredImagePrompt>
  retryImageJob(jobId: string): Promise<ImageGenerationJob>
  cancelImageJob(jobId: string): Promise<void>
  deleteImageAsset(assetId: string): Promise<void>
  deleteImageJob(jobId: string): Promise<void>
  clearImageArchive(): Promise<void>
  addImageReference(file: File, kind: ImageReferenceKind): Promise<void>
  updateImageReference(referenceId: string, patch: Partial<Pick<ImageGenerationReference, 'name' | 'kind' | 'strength' | 'informationExtracted' | 'enabled'>>): Promise<void>
  deleteImageReference(referenceId: string): Promise<void>
  testImageProvider(provider?: ImageGenerationProvider, signal?: AbortSignal): Promise<string>
  listImageProviderResources(settingsOverride?: ImageGenerationSettings, signal?: AbortSignal): Promise<ImageProviderResources>
  saveImageProviderCredential(provider: ImageGenerationProvider, value: string, remember: boolean): void
  clearImageProviderCredential(provider: ImageGenerationProvider): void
  hasImageProviderCredential(provider: ImageGenerationProvider): boolean
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
  const [imageJobs, setImageJobs] = useState<ImageGenerationJob[]>([])
  const [imageAssets, setImageAssets] = useState<ImageGenerationAsset[]>([])
  const [imageReferences, setImageReferences] = useState<ImageGenerationReference[]>([])
  const [imageError, setImageError] = useState<string | null>(null)
  const turnQueues = useRef(new Map<string, Promise<void>>())
  const imageRepository = useMemo(() => repository.getImageGenerationRepository(), [repository])
  const imageService = useMemo(
    () => new ImageGenerationService(imageRepository, createImageProviderAdapters()),
    [imageRepository],
  )
  const currentPlayerName = normalizePlayerName(playerName) ?? normalizePlayerName(settings?.userName) ?? DEFAULT_PLAYER_NAME

  useEffect(() => {
    let cancelled = false
    const initialize = async () => {
      try {
        await repository.initialize()
        await imageRepository.recoverInterruptedJobs()
        const [nextLorebooks, nextPresets, nextCharacters, nextSessions, nextSettings, nextAudits, nextImageJobs, nextImageAssets, nextImageReferences] = await Promise.all([
          repository.listLorebooks(),
          repository.listPresets(),
          repository.listCharacters(),
          repository.listSessions(),
          repository.getSettings(),
          repository.listRequestAudits(),
          imageRepository.listJobs(),
          imageRepository.listAssets(),
          imageRepository.listReferences(),
        ])
        if (cancelled) return
        setLorebooks(nextLorebooks)
        setPresets(nextPresets)
        setCharacters(nextCharacters)
        setSessions(nextSessions)
        setSettings(nextSettings)
        setRequestAudits(nextAudits)
        setImageJobs(nextImageJobs)
        setImageAssets(nextImageAssets)
        setImageReferences(nextImageReferences)
        setStatus('ready')
      } catch (caught) {
        if (cancelled) return
        setError(caught instanceof Error ? caught.message : '本地酒馆数据初始化失败')
        setStatus('error')
      }
    }
    void initialize()
    return () => { cancelled = true }
  }, [repository, imageRepository])

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
    const resources = resolveSessionResources(session, currentSettings, availablePresets, lorebooks)
    const preset = resources.preset
    const activeLorebooks = resources.lorebooks
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
    const variableTransaction = applyDefinedVariablePatch({
      patch: turn.variablePatch,
      globalDefinitions: currentSettings.globalVariables ?? [],
      sessionDefinitions: session.variableDefinitions ?? [],
      readOnlyKeys: [...Object.keys(input.variables ?? {}), 'playerName', 'userName'],
    })
    const committedSettings = JSON.stringify(variableTransaction.globalDefinitions) === JSON.stringify(currentSettings.globalVariables ?? [])
      ? undefined
      : { ...currentSettings, globalVariables: variableTransaction.globalDefinitions, updatedAt: Date.now() }
    succeeded.diagnostics = [
      ...succeeded.diagnostics,
      ...turn.regexErrors,
      ...variableTransaction.diagnostics,
    ]
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
      variablesAfter: variableTransaction.sessionVariables,
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
      variables: variableTransaction.sessionVariables,
      variableDefinitions: variableTransaction.sessionDefinitions,
      updatedAt: now + 1,
    }
    await repository.commitTurn(next, succeeded, committedSettings)
    setSessions((current) => replaceById(current, next).sort((a, b) => b.updatedAt - a.updatedAt))
    if (committedSettings) setSettings(committedSettings)
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
    const [nextPresets, nextSessions, nextSettings] = await Promise.all([
      repository.listPresets(),
      repository.listSessions(),
      repository.getSettings(),
    ])
    setPresets(nextPresets)
    setSessions(nextSessions)
    setSettings(nextSettings)
  }, [repository])
  const saveCharacter = useCallback(async (value: CharacterCard) => {
    await repository.saveCharacter(value)
    setCharacters((current) => replaceById(current, value))
  }, [repository])

  const installWorkshopPackage = useCallback(async (workshopPackage: WorkshopPackage) => {
    const result = await installPackage(workshopPackage, {
      lorebooks,
      presets,
      characters,
      saveLorebook,
      savePreset,
      saveCharacters: (values) => repository.saveCharacters(values),
    })
    const [nextLorebooks, nextPresets, nextCharacters] = await Promise.all([
      repository.listLorebooks(),
      repository.listPresets(),
      repository.listCharacters(),
    ])
    setLorebooks(nextLorebooks)
    setPresets(nextPresets)
    setCharacters(nextCharacters)
    return result
  }, [characters, lorebooks, presets, repository, saveCharacter, saveLorebook, savePreset])
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

  const refreshImageArchive = useCallback(async () => {
    const [nextJobs, nextAssets, nextReferences] = await Promise.all([
      imageRepository.listJobs(),
      imageRepository.listAssets(),
      imageRepository.listReferences(),
    ])
    setImageJobs(nextJobs)
    setImageAssets(nextAssets)
    setImageReferences(nextReferences)
  }, [imageRepository])

  const prepareDialogueImagePrompt = useCallback(async (input: Omit<GenerateDialogueImageInput, 'prepared'>): Promise<StructuredImagePrompt> => {
    const currentSettings = settings ?? await repository.getSettings()
    const imageSettings = currentSettings.imageGeneration
    const session = sessions.find((item) => item.id === input.sessionId) ?? await repository.getSession(input.sessionId)
    if (!session) throw new Error('找不到用于绘图的酒馆会话。')
    const character = characters.find((item) => item.npcId === input.npcId)
      ?? (await repository.listCharacters()).find((item) => item.npcId === input.npcId)
    if (!character) throw new Error(`找不到绘图角色卡：${input.npcId}`)
    const sourceText = input.sourceText
      ?? (input.messageId ? session.messages.find((message) => message.id === input.messageId)?.content : undefined)
      ?? [...session.messages].reverse().find((message) => message.role === 'assistant')?.content
      ?? ''
    const mode = input.mode ?? imageSettings.prompt.mode
    let title = `${character.name}的场景`
    let generatedPositive = ''
    let generatedNegative = ''
    let valid = true
    if (mode === 'manual') {
      generatedPositive = input.instruction?.trim() ?? ''
      if (!generatedPositive) throw new Error('请输入希望生成的画面描述。')
    } else if (mode === 'tagged') {
      generatedPositive = extractTaggedImagePrompt(sourceText, imageSettings.prompt.triggerStart, imageSettings.prompt.triggerEnd)
      if (!generatedPositive) throw new Error('当前回复中没有找到绘图标记，请改用智能整理或手动描述。')
    } else {
      const resources = resolveSessionResources(session, currentSettings, presets.length ? presets : await repository.listPresets(), lorebooks)
      const effectiveApiConfig = applyPresetGenerationSettings(currentSettings.api, resources.preset.settings)
      const api = createRemoteTavernApi(effectiveApiConfig, resolveApiKey(currentSettings))
      const structured = await generateStructuredImagePrompt(api, {
        session, character, lorebooks: resources.lorebooks, settings: imageSettings,
        instruction: input.instruction, sourceText, variables: session.variables,
      }, input.signal)
      title = structured.title
      generatedPositive = structured.positive
      generatedNegative = structured.negative
      valid = structured.valid
    }
    const preset = imageSettings.prompt.presets.find((item) => item.id === imageSettings.prompt.activePresetId) ?? imageSettings.prompt.presets[0]
    if (!preset) throw new Error('当前没有可用的绘图提示词预设。')
    const prompt = assembleImagePrompt({ generatedPositive, generatedNegative, preset, replacements: imageSettings.prompt.replacements })
    return { title, positive: prompt.positive, negative: prompt.negative, valid }
  }, [settings, repository, sessions, characters, presets, lorebooks])

  const generateDialogueImage = useCallback(async (input: GenerateDialogueImageInput) => {
    const currentSettings = settings ?? await repository.getSettings()
    const imageSettings = currentSettings.imageGeneration
    if (!imageSettings.enabled) throw new Error('对话绘图尚未启用，请先前往酒馆中枢的“绘图”页开启。')
    const session = sessions.find((item) => item.id === input.sessionId) ?? await repository.getSession(input.sessionId)
    if (!session) throw new Error('找不到用于绘图的酒馆会话。')
    const character = characters.find((item) => item.npcId === input.npcId)
      ?? (await repository.listCharacters()).find((item) => item.npcId === input.npcId)
    if (!character) throw new Error(`找不到绘图角色卡：${input.npcId}`)
    if (input.messageId && !input.prepared) {
      const existing = imageJobs.find((job) => job.messageId === input.messageId && !['failed', 'cancelled', 'interrupted'].includes(job.status))
        ?? (await imageRepository.listJobsForSession(session.id)).find((job) => job.messageId === input.messageId && !['failed', 'cancelled', 'interrupted'].includes(job.status))
      if (existing) return existing
    }
    const prompt = input.prepared ?? await prepareDialogueImagePrompt(input)
    setImageError(null)
    try {
      const job = await imageService.generate({
        sessionId: session.id,
        npcId: character.npcId,
        messageId: input.messageId,
        settings: imageSettings,
        title: prompt.title,
        positivePrompt: prompt.positive,
        negativePrompt: prompt.negative,
        credential: resolveImageProviderCredential(imageSettings.provider),
        references: imageReferences,
      })
      await imageRepository.enforceCacheBudget(imageSettings.cache)
      await refreshImageArchive()
      if (job.status === 'failed') throw new Error(job.error || '绘图任务失败。')
      return job
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '绘图任务失败。'
      setImageError(message)
      await refreshImageArchive()
      throw caught
    }
  }, [settings, repository, sessions, characters, imageJobs, imageRepository, imageService, refreshImageArchive, prepareDialogueImagePrompt, imageReferences])

  const retryImageJob = useCallback(async (jobId: string) => {
    const source = imageJobs.find((job) => job.id === jobId) ?? await imageRepository.getJob(jobId)
    if (!source) throw new Error('找不到要重试的绘图任务。')
    const currentSettings = settings ?? await repository.getSettings()
    const retrySettings = { ...currentSettings.imageGeneration, provider: source.provider }
    const job = await imageService.generate({
      sessionId: source.sessionId, npcId: source.npcId, messageId: source.messageId,
      settings: retrySettings, title: source.title, positivePrompt: source.positivePrompt,
      negativePrompt: source.negativePrompt, credential: resolveImageProviderCredential(source.provider), retryOfJobId: source.id,
      references: imageReferences,
    })
    await refreshImageArchive()
    return job
  }, [imageJobs, imageRepository, settings, repository, imageService, refreshImageArchive, imageReferences])

  const cancelImageJob = useCallback(async (jobId: string) => {
    await imageService.cancel(jobId)
    await refreshImageArchive()
  }, [imageService, refreshImageArchive])

  const deleteImageAsset = useCallback(async (assetId: string) => {
    await imageRepository.deleteAsset(assetId)
    await refreshImageArchive()
  }, [imageRepository, refreshImageArchive])

  const deleteImageJob = useCallback(async (jobId: string) => {
    await imageRepository.deleteJob(jobId)
    await refreshImageArchive()
  }, [imageRepository, refreshImageArchive])

  const clearImageArchive = useCallback(async () => {
    const activeJobs = await imageRepository.listActiveJobs()
    await Promise.all(activeJobs.map((job) => imageService.cancel(job.id)))
    await imageRepository.clearArchive()
    await refreshImageArchive()
  }, [imageRepository, imageService, refreshImageArchive])

  const addImageReference = useCallback(async (file: File, kind: ImageReferenceKind) => {
    if (!file.type.startsWith('image/') || !file.size || file.size > 20 * 1024 * 1024) {
      throw new Error('参考图必须是 20 MB 以内的有效图片。')
    }
    await imageRepository.saveReference({
      id: crypto.randomUUID(), name: file.name.slice(0, 120), kind, blob: file,
      mimeType: file.type, bytes: file.size, strength: 0.6, informationExtracted: 1,
      enabled: true, createdAt: Date.now(),
    })
    await refreshImageArchive()
  }, [imageRepository, refreshImageArchive])

  const deleteImageReference = useCallback(async (referenceId: string) => {
    await imageRepository.deleteReference(referenceId)
    await refreshImageArchive()
  }, [imageRepository, refreshImageArchive])

  const updateImageReference = useCallback(async (referenceId: string, patch: Partial<Pick<ImageGenerationReference, 'name' | 'kind' | 'strength' | 'informationExtracted' | 'enabled'>>) => {
    const reference = imageReferences.find((item) => item.id === referenceId)
    if (!reference) throw new Error('找不到要修改的参考图。')
    await imageRepository.saveReference({
      ...reference,
      ...patch,
      strength: Math.min(1, Math.max(0, patch.strength ?? reference.strength)),
      informationExtracted: Math.min(1, Math.max(0, patch.informationExtracted ?? reference.informationExtracted)),
    })
    await refreshImageArchive()
  }, [imageReferences, imageRepository, refreshImageArchive])

  const testImageProvider = useCallback(async (provider?: ImageGenerationProvider, signal?: AbortSignal) => {
    const currentSettings = settings ?? await repository.getSettings()
    const selected = provider ?? currentSettings.imageGeneration.provider
    const adapter = createImageProviderAdapters()[selected]
    const result = await adapter.testConnection(currentSettings.imageGeneration, resolveImageProviderCredential(selected), signal)
    return [result.label, ...(result.details ?? [])].join(' · ')
  }, [settings, repository])

  const listImageProviderResources = useCallback(async (settingsOverride?: ImageGenerationSettings, signal?: AbortSignal) => {
    const currentSettings = settingsOverride ?? (settings ?? await repository.getSettings()).imageGeneration
    const adapter = createImageProviderAdapters()[currentSettings.provider]
    if (!adapter.listResources) throw new Error(`${adapter.label} 暂不提供资源列表，请手动填写模型参数。`)
    return adapter.listResources(currentSettings, resolveImageProviderCredential(currentSettings.provider), signal)
  }, [settings, repository])

  const saveProviderCredential = useCallback((provider: ImageGenerationProvider, value: string, remember: boolean) => {
    setImageProviderCredential(provider, value, remember)
  }, [])

  const removeProviderCredential = useCallback((provider: ImageGenerationProvider) => {
    clearImageProviderCredential(provider)
  }, [])

  const hasProviderCredential = useCallback((provider: ImageGenerationProvider) => Boolean(resolveImageProviderCredential(provider)), [])

  const presentedSessions = useMemo(() => sessions.map((session) => session.userName === currentPlayerName ? session : { ...session, userName: currentPlayerName }), [sessions, currentPlayerName])
  const activeSession = presentedSessions.find((session) => session.id === settings?.activeSessionId) ?? null
  const apiLabel = settings
    ? `${getTavernProvider(settings.api.provider).label} · ${settings.api.model || '未选择模型'}`
    : '模型配置载入中'
  const apiReadinessError = useMemo(() => {
    if (status !== 'ready' || !settings) return null
    return getTavernApiReadiness({ ...settings, api: { ...settings.api, persistedApiKey: resolveApiKey(settings) } }).error
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
    imageJobs,
    imageAssets,
    imageReferences,
    imageError,
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
    installWorkshopPackage,
    saveSession,
    deleteSession,
    branchSession,
    truncateSession,
    updateVariables,
    clearRequestAudits,
    generateDialogueImage,
    prepareDialogueImagePrompt,
    retryImageJob,
    cancelImageJob,
    deleteImageAsset,
    deleteImageJob,
    clearImageArchive,
    addImageReference,
    updateImageReference,
    deleteImageReference,
    testImageProvider,
    listImageProviderResources,
    saveImageProviderCredential: saveProviderCredential,
    clearImageProviderCredential: removeProviderCredential,
    hasImageProviderCredential: hasProviderCredential,
  }), [status, error, apiLabel, apiReady, apiReadinessError, lorebooks, presets, characters, presentedSessions, requestAudits, imageJobs, imageAssets, imageReferences, imageError, settings, activeSession, openNpcSession, sendTurn, selectSession, persistSettings, saveLorebook, deleteLorebook, savePreset, deletePreset, saveCharacter, installWorkshopPackage, saveSession, deleteSession, branchSession, truncateSession, updateVariables, clearRequestAudits, generateDialogueImage, prepareDialogueImagePrompt, retryImageJob, cancelImageJob, deleteImageAsset, deleteImageJob, clearImageArchive, addImageReference, updateImageReference, deleteImageReference, testImageProvider, listImageProviderResources, saveProviderCredential, removeProviderCredential, hasProviderCredential])

  return <TavernContext.Provider value={value}>{children}</TavernContext.Provider>
}

export function useTavern() {
  const value = useContext(TavernContext)
  if (!value) throw new Error('useTavern 必须在 TavernProvider 内使用')
  return value
}
