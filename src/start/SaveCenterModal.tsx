import { useState, type ChangeEvent } from 'react'
import { useGame } from '../game/GameContext'
import { GameIcon } from '../components/icons/GameIcon'
import { getCalendarDate } from '../game/calendar'
import { locations } from '../game/data'
import type { CloudSaveController } from '../cloud/useCloudSave'
import { CLOUD_SAVE_BACKUP_KEY } from '../cloud/useCloudSave'
import { getBrowserGameStorage } from '../game/game-save-storage'

export type { CloudSaveController } from '../cloud/useCloudSave'

interface SaveCenterModalProps {
  cloud: CloudSaveController
  onEnterGame(): void
}

export function SaveCenterModal({ cloud, onEnterGame }: SaveCenterModalProps) {
  const { state, saveMeta, exportGameSave, importGameSave } = useGame()
  const [status, setStatus] = useState('')
  const calendarDate = getCalendarDate(state.year, state.day)
  const locationName = locations.find((location) => location.id === state.location)?.name ?? state.location
  let cloudBackup: string | null = null
  try { cloudBackup = getBrowserGameStorage()?.getItem(CLOUD_SAVE_BACKUP_KEY) ?? null } catch { /* 设备禁止本地存储 */ }

  const importSave = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const imported = importGameSave(await file.text())
    if (!imported) {
      setStatus('这个文件不是可识别的游戏存档。')
      return
    }
    setStatus('JSON 存档已导入，正在进入游戏。')
    onEnterGame()
  }

  const exportSave = () => {
    const blob = new Blob([exportGameSave()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `性撸谷存档-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setStatus('本地存档已导出。')
  }

  const loadCloud = async () => {
    if (await cloud.download()) onEnterGame()
  }

  const restoreCloudBackup = () => {
    if (!cloudBackup || !importGameSave(cloudBackup)) {
      setStatus('没有找到可恢复的云端读取前备份。')
      return
    }
    setStatus('已恢复云端读取前的本地备份。')
    onEnterGame()
  }

  return (
    <div className="save-center">
      <header className="save-center-intro">
        <span>LOCAL · CLOUD · JSON</span>
        <h3>选择要继续的旅程</h3>
        <p>本地自动存档始终保留。GitHub 云存档接入后会显示为第二个可选择来源，不会替换本地档案。</p>
      </header>

      <div className="save-source-grid">
        <article className="save-source-card is-local">
          <div className="save-source-icon" aria-hidden="true"><GameIcon name="save" size={25} weight="duotone" /></div>
          <div><span>LOCAL ARCHIVE</span><h4>本地存档</h4></div>
          <dl>
            <div><dt>玩家</dt><dd>{state.playerProfile.name || '尚未命名'}</dd></div>
            <div><dt>日期</dt><dd>第{state.year}年 {calendarDate.month}月{calendarDate.date}日</dd></div>
            <div><dt>地点</dt><dd>{locationName}</dd></div>
            <div><dt>金币</dt><dd>{state.money}</dd></div>
          </dl>
          <p>{saveMeta.savedAt ? `最近保存：${new Date(saveMeta.savedAt).toLocaleString('zh-CN')}` : '等待首次自动保存'}</p>
          <button id="save-center-load-local" className="primary-button" type="button" onClick={onEnterGame}>
            <GameIcon name="history" size={17} />读取本地进度
          </button>
          {cloudBackup && (
            <button id="save-center-restore-cloud-backup" type="button" onClick={restoreCloudBackup}>
              <GameIcon name="history" size={17} />恢复云端读取前备份
            </button>
          )}
        </article>

        <article className={`save-source-card is-cloud${cloud.account?.authenticated ? ' is-connected' : ''}`}>
          <div className="save-source-icon" aria-hidden="true"><GameIcon name="branch" size={25} weight="duotone" /></div>
          <div><span>PRIVATE GIST</span><h4>GitHub 云存档</h4></div>
          {cloud.account === null && <p>正在检查 GitHub 登录状态……</p>}
          {cloud.account && !cloud.account.configured && <p>部署端尚未配置 GitHub OAuth。你仍可使用本地自动存档与 JSON 备份。</p>}
          {cloud.account && cloud.account.configured && !cloud.account.authenticated && (
            <>
              <p>登录后可把存档写入你账号下的私有 Gist。游戏无法读取你的其他仓库或文件。</p>
              <a id="save-center-github-login" className="cloud-login-button" href={cloud.loginUrl}>
                <GameIcon name="branch" size={17} />使用 GitHub 登录
              </a>
            </>
          )}
          {cloud.account?.authenticated && (
            <>
              <div className="cloud-account-row">
                {cloud.account.user.avatarUrl && <img src={cloud.account.user.avatarUrl} alt="" referrerPolicy="no-referrer" />}
                <div><span>CONNECTED ACCOUNT</span><strong>@{cloud.account.user.login}</strong></div>
                <button id="save-center-github-logout" type="button" onClick={() => void cloud.logout()} disabled={cloud.busy}>退出</button>
              </div>
              <dl>
                <div><dt>云端状态</dt><dd>{cloud.slot?.exists ? '已有存档' : '尚未创建'}</dd></div>
                <div><dt>更新时间</dt><dd>{cloud.slot?.updatedAt ? new Date(cloud.slot.updatedAt).toLocaleString('zh-CN') : '—'}</dd></div>
              </dl>
              <label className="cloud-auto-toggle" htmlFor="save-center-cloud-auto">
                <input id="save-center-cloud-auto" type="checkbox" checked={cloud.autoSync} disabled={cloud.busy || !cloud.slot?.exists} onChange={(event) => cloud.setAutoSync(event.target.checked)} />
                <span>进度变化 4 秒后自动同步</span>
              </label>
              <div className="cloud-action-row">
                <button id="save-center-load-cloud" type="button" disabled={cloud.busy || !cloud.slot?.exists} onClick={() => void loadCloud()}>
                  <GameIcon name="download" size={17} />读取云端进度
                </button>
                <button id="save-center-upload-cloud" className="primary-button" type="button" disabled={cloud.busy} onClick={() => void cloud.upload()}>
                  <GameIcon name="upload" size={17} />上传本地进度
                </button>
                {cloud.conflict && (
                  <button id="save-center-force-cloud" className="danger-button" type="button" disabled={cloud.busy} onClick={() => void cloud.upload(true)}>
                    以本地覆盖云端
                  </button>
                )}
              </div>
            </>
          )}
          {cloud.account && !cloud.account.configured && <button id="save-center-cloud-unavailable" type="button" disabled>服务端尚未配置</button>}
        </article>
      </div>

      <section className="save-json-tools" aria-label="JSON 存档工具">
        <div><span>PORTABLE SAVE</span><h4>跨设备文件</h4><p>导入此前导出的 JSON，或下载当前进度作为离线备份。</p></div>
        <div>
          <label id="save-center-import-label" htmlFor="save-center-import">
            <GameIcon name="upload" size={17} />导入 JSON
            <input id="save-center-import" className="sr-only" type="file" accept=".json,application/json" aria-label="导入 JSON 存档" onChange={(event) => void importSave(event)} />
          </label>
          <button id="save-center-export" type="button" onClick={exportSave}><GameIcon name="download" size={17} />导出当前存档</button>
        </div>
      </section>
      {(status || cloud.status) && <p className="save-center-status" role="status">{status || cloud.status}</p>}
    </div>
  )
}
