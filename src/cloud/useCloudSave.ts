import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGame } from '../game/GameContext'
import { getBrowserGameStorage } from '../game/game-save-storage'
import { CloudConflictError, cloudSaveClient, type CloudAccount, type CloudSaveSlot } from './cloud-save-client'

export const CLOUD_SAVE_BACKUP_KEY = 'mistvale-game-save-backup-before-cloud-v1'
const CLOUD_REVISION_KEY = 'mistvale-cloud-save-revision-v1'
const CLOUD_AUTO_SYNC_KEY = 'mistvale-cloud-save-auto-v1'
const CLOUD_ACCOUNT_KEY = 'mistvale-cloud-save-account-v1'

function readLocalValue(key: string): string | null {
  try { return getBrowserGameStorage()?.getItem(key) ?? null } catch { return null }
}

function writeLocalValue(key: string, value: string | null): void {
  try {
    const storage = getBrowserGameStorage()
    if (value === null) storage?.removeItem(key)
    else storage?.setItem(key, value)
  } catch { /* 云存档仍可手动使用 */ }
}

export interface CloudSaveController {
  account: CloudAccount | null
  slot: CloudSaveSlot | null
  busy: boolean
  status: string
  conflict: boolean
  autoSync: boolean
  loginUrl: string
  refresh(): Promise<void>
  logout(): Promise<void>
  upload(force?: boolean): Promise<boolean>
  download(): Promise<boolean>
  setAutoSync(enabled: boolean): void
}

export function useCloudSave(): CloudSaveController {
  const { exportGameSave, importGameSave, saveMeta } = useGame()
  const [account, setAccount] = useState<CloudAccount | null>(null)
  const [slot, setSlot] = useState<CloudSaveSlot | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(() => {
    if (typeof window === 'undefined') return ''
    const result = new URLSearchParams(window.location.search).get('github')
    if (result === 'connected') return 'GitHub 登录成功，正在读取云存档状态。'
    if (result === 'denied') return 'GitHub 授权被取消，本地存档不受影响。'
    if (result === 'expired') return 'GitHub 登录请求已过期，请重新登录。'
    if (result === 'error') return 'GitHub 登录未完成，请稍后重试。'
    return ''
  })
  const [conflict, setConflict] = useState(false)
  const [autoSync, setAutoSyncState] = useState(() => readLocalValue(CLOUD_AUTO_SYNC_KEY) === '1')
  const revisionRef = useRef<string | null>(readLocalValue(CLOUD_REVISION_KEY))
  const lastSyncedSavedAtRef = useRef<number | null>(null)
  const uploadQueue = useRef<Promise<unknown>>(Promise.resolve())

  const refresh = useCallback(async () => {
    try {
      const nextAccount = await cloudSaveClient.getAccount()
      setAccount(nextAccount)
      if (!nextAccount.authenticated) {
        setSlot(null)
        return
      }
      const previousAccount = readLocalValue(CLOUD_ACCOUNT_KEY)
      if (previousAccount !== nextAccount.user.login) {
        revisionRef.current = null
        writeLocalValue(CLOUD_REVISION_KEY, null)
        writeLocalValue(CLOUD_AUTO_SYNC_KEY, null)
        setAutoSyncState(false)
      }
      writeLocalValue(CLOUD_ACCOUNT_KEY, nextAccount.user.login)
      setSlot(await cloudSaveClient.download())
    } catch {
      setAccount({ authenticated: false, configured: false })
      setSlot(null)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const rememberRevision = useCallback((revision: string) => {
    revisionRef.current = revision
    writeLocalValue(CLOUD_REVISION_KEY, revision)
  }, [])

  const setAutoSync = useCallback((enabled: boolean) => {
    const safeEnabled = enabled && Boolean(revisionRef.current)
    setAutoSyncState(safeEnabled)
    writeLocalValue(CLOUD_AUTO_SYNC_KEY, safeEnabled ? '1' : null)
    setStatus(safeEnabled ? '已开启自动云同步。' : '已关闭自动云同步。')
  }, [])

  const upload = useCallback(async (force = false) => {
    if (!account?.authenticated) return false
    setBusy(true)
    setConflict(false)
    try {
      const result = await cloudSaveClient.upload(exportGameSave(), revisionRef.current, force)
      rememberRevision(result.revision)
      setSlot({ exists: true, revision: result.revision, updatedAt: result.updatedAt })
      setAutoSyncState(true)
      writeLocalValue(CLOUD_AUTO_SYNC_KEY, '1')
      setStatus('当前本地进度已安全上传到 GitHub 私有 Gist。')
      lastSyncedSavedAtRef.current = saveMeta.savedAt
      return true
    } catch (error) {
      if (error instanceof CloudConflictError) {
        setConflict(true)
        setStatus('云端已有更新版本，已停止覆盖。请先读取云档，或明确选择以本地覆盖云端。')
      } else {
        setStatus(error instanceof Error ? error.message : '上传云存档失败。')
      }
      return false
    } finally {
      setBusy(false)
    }
  }, [account, exportGameSave, rememberRevision, saveMeta.savedAt])

  const download = useCallback(async () => {
    if (!account?.authenticated) return false
    setBusy(true)
    setConflict(false)
    try {
      const remote = await cloudSaveClient.download()
      if (!remote.exists || !remote.serializedSave || !remote.revision) {
        setStatus('这个 GitHub 账号还没有云存档。')
        setSlot(remote)
        return false
      }
      writeLocalValue(CLOUD_SAVE_BACKUP_KEY, exportGameSave())
      if (!importGameSave(remote.serializedSave)) throw new Error('云端文件不是可识别的游戏存档。')
      rememberRevision(remote.revision)
      setSlot(remote)
      setAutoSyncState(true)
      writeLocalValue(CLOUD_AUTO_SYNC_KEY, '1')
      setStatus('云端进度已读取；原本地进度已另存为恢复备份。')
      return true
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '读取云存档失败。')
      return false
    } finally {
      setBusy(false)
    }
  }, [account, exportGameSave, importGameSave, rememberRevision])

  const logout = useCallback(async () => {
    setBusy(true)
    try {
      await cloudSaveClient.logout()
      setAccount({ authenticated: false, configured: true })
      setSlot(null)
      setStatus('已退出 GitHub；本地存档不受影响。')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '退出 GitHub 失败。')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (!autoSync || !account?.authenticated || !revisionRef.current || !saveMeta.savedAt || lastSyncedSavedAtRef.current === saveMeta.savedAt) return
    const timer = window.setTimeout(() => {
      lastSyncedSavedAtRef.current = saveMeta.savedAt
      const serializedSave = exportGameSave()
      uploadQueue.current = uploadQueue.current
        .catch(() => undefined)
        .then(async () => {
          try {
            const result = await cloudSaveClient.upload(serializedSave, revisionRef.current)
            rememberRevision(result.revision)
            setSlot({ exists: true, revision: result.revision, updatedAt: result.updatedAt })
            setConflict(false)
          } catch (error) {
            if (error instanceof CloudConflictError) {
              setConflict(true)
              setAutoSyncState(false)
              writeLocalValue(CLOUD_AUTO_SYNC_KEY, null)
              setStatus('检测到另一台设备的新云档，自动同步已暂停，未覆盖云端。')
            }
          }
        })
    }, 4000)
    return () => window.clearTimeout(timer)
  }, [account, autoSync, exportGameSave, rememberRevision, saveMeta.savedAt])

  return useMemo(() => ({
    account, slot, busy, status, conflict, autoSync,
    loginUrl: cloudSaveClient.getLoginUrl('/?panel=save'),
    refresh, logout, upload, download, setAutoSync,
  }), [account, slot, busy, status, conflict, autoSync, refresh, logout, upload, download, setAutoSync])
}
