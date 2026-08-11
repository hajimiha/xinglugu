import { useState, type ChangeEvent } from 'react'
import { useGame } from '../game/GameContext'
import { GameIcon } from '../components/icons/GameIcon'
import { getCalendarDate } from '../game/calendar'
import { locations } from '../game/data'

interface SaveCenterModalProps {
  onEnterGame(): void
}

export function SaveCenterModal({ onEnterGame }: SaveCenterModalProps) {
  const { state, saveMeta, exportGameSave, importGameSave } = useGame()
  const [status, setStatus] = useState('')
  const calendarDate = getCalendarDate(state.year, state.day)
  const locationName = locations.find((location) => location.id === state.location)?.name ?? state.location

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
        </article>

        <article className="save-source-card is-cloud" aria-disabled="true">
          <div className="save-source-icon" aria-hidden="true"><GameIcon name="branch" size={25} weight="duotone" /></div>
          <div><span>PRIVATE GIST</span><h4>GitHub 云存档</h4></div>
          <p>云存档服务将在 GitHub 登录配置完成后启用；目前不会影响本地游玩或本地自动保存。</p>
          <button id="save-center-cloud-placeholder" type="button" disabled>尚未连接</button>
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
      {status && <p className="save-center-status" role="status">{status}</p>}
    </div>
  )
}
