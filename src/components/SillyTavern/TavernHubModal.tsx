import { lazy, Suspense, useState, type KeyboardEvent } from 'react'
import { useTavern } from '../../tavern/TavernContext'
import { GameIcon, type GameIconName } from '../icons/GameIcon'
import { ApiPanel } from './panels/ApiPanel'

const LorebookPanel = lazy(() => import('./panels/LorebookPanel').then((module) => ({ default: module.LorebookPanel })))
const PresetPanel = lazy(() => import('./panels/PresetPanel').then((module) => ({ default: module.PresetPanel })))
const CharacterPanel = lazy(() => import('./panels/CharacterPanel').then((module) => ({ default: module.CharacterPanel })))
const SessionPanel = lazy(() => import('./panels/SessionPanel').then((module) => ({ default: module.SessionPanel })))
const VariablesPanel = lazy(() => import('./panels/VariablesPanel').then((module) => ({ default: module.VariablesPanel })))
const RegexPanel = lazy(() => import('./panels/RegexPanel').then((module) => ({ default: module.RegexPanel })))
const RequestInspectorPanel = lazy(() => import('./panels/RequestInspectorPanel').then((module) => ({ default: module.RequestInspectorPanel })))

const tabs = [
  { id: 'api', label: '接口', note: '模型连接', icon: 'settings' },
  { id: 'lorebooks', label: '世界书', note: '规则与记忆', icon: 'book' },
  { id: 'presets', label: '预设', note: '上下文顺序', icon: 'magic' },
  { id: 'characters', label: '角色卡', note: '居民与伙伴', icon: 'profile' },
  { id: 'sessions', label: '会话', note: '楼层与分支', icon: 'history' },
  { id: 'variables', label: '变量', note: '状态快照', icon: 'variables' },
  { id: 'regex', label: '正则', note: '文本流水线', icon: 'regex' },
  { id: 'inspector', label: '检查器', note: '最终出站请求', icon: 'shield' },
] as const satisfies ReadonlyArray<{ id: string; label: string; note: string; icon: GameIconName }>

type TabId = typeof tabs[number]['id']

function PanelFallback() {
  return <div className="tavern-panel-loading" role="status"><i /><i /><i /><span>正在从本地存储装配面板</span></div>
}

export function TavernHubModal({ onClose }: { onClose(): void }) {
  const tavern = useTavern()
  const [activeTab, setActiveTab] = useState<TabId>('api')
  const currentIndex = tabs.findIndex((tab) => tab.id === activeTab)

  const selectByKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    let next = currentIndex
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (currentIndex + 1) % tabs.length
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (currentIndex - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    setActiveTab(tabs[next].id)
    requestAnimationFrame(() => document.getElementById(`tavern-tab-${tabs[next].id}`)?.focus())
  }

  return <section className="tavern-hub" aria-labelledby="tavern-hub-title">
    <header className="tavern-hub-header"><div className="tavern-hub-sigil" aria-hidden="true"><span>T</span><i /><i /><i /></div><div><p>SILLYTAVERN STORY CONSOLE</p><h2 id="tavern-hub-title">雾灯酒馆中枢</h2><span>模型连接、世界信息、角色记忆与剧情楼层控制台</span></div><div className="tavern-hub-state"><i data-state={tavern.status} /><span>{tavern.status === 'ready' ? '酒馆档案已就绪' : tavern.status === 'loading' ? '正在读取酒馆档案' : '酒馆档案异常'}</span><strong>LLM API REQUIRED</strong></div><button id="tavern-hub-close" className="icon-button" type="button" aria-label="关闭酒馆中枢" onClick={onClose}><GameIcon name="close" size={18} /></button></header>
    {tavern.error && <div className="tavern-inline-notice is-error" role="alert"><GameIcon name="warning" size={17} /><span>{tavern.error}</span></div>}
    <div className="tavern-hub-layout"><nav className="tavern-hub-tabs" aria-label="酒馆中枢功能"><div role="tablist" aria-orientation="vertical" onKeyDown={selectByKeyboard}>{tabs.map((tab, index) => <button id={`tavern-tab-${tab.id}`} key={tab.id} role="tab" type="button" aria-label={tab.label} aria-selected={activeTab === tab.id} aria-controls={`tavern-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)}><span>{String(index + 1).padStart(2, '0')}</span><GameIcon name={tab.icon} size={19} /><div><strong>{tab.label}</strong><small>{tab.note}</small></div><i /></button>)}</div><footer><span>LOCAL ARCHIVE</span><strong>{tavern.lorebooks.length} 世界书 · {tavern.characters.length} 角色</strong><small>{tavern.sessions.length} 段持久会话</small></footer></nav>
      <main id={`tavern-panel-${activeTab}`} className="tavern-hub-content" role="tabpanel" aria-labelledby={`tavern-tab-${activeTab}`} tabIndex={0}><Suspense fallback={<PanelFallback />}>{activeTab === 'api' && <ApiPanel />}{activeTab === 'lorebooks' && <LorebookPanel />}{activeTab === 'presets' && <PresetPanel />}{activeTab === 'characters' && <CharacterPanel />}{activeTab === 'sessions' && <SessionPanel />}{activeTab === 'variables' && <VariablesPanel />}{activeTab === 'regex' && <RegexPanel />}{activeTab === 'inspector' && <RequestInspectorPanel />}</Suspense></main>
    </div>
  </section>
}
