import { locations } from '../../game/data'
import { formatClock, getCalendarDate } from '../../game/calendar'
import { useGame } from '../../game/GameContext'
import type { SkillId } from '../../game/types'
import { GameIcon, type GameIconName } from '../icons/GameIcon'
import { useFullscreen } from '../../hooks/useFullscreen'

const skillMeta: Record<SkillId, { label: string; icon: GameIconName }> = {
  fishing: { label: '钓鱼', icon: 'fishing' },
  farming: { label: '农耕', icon: 'farming' },
  mining: { label: '挖矿', icon: 'mining' },
  combat: { label: '战斗', icon: 'combat' },
  magic: { label: '魔法', icon: 'magic' },
}

export function TopHud() {
  const { state, dispatch } = useGame()
  const fullscreen = useFullscreen()
  const location = locations.find((item) => item.id === state.location) ?? locations[0]
  const calendar = getCalendarDate(state.year, state.day)
  const openModal = (modal: 'inventory' | 'journal' | 'settings' | 'tavern' | 'calendar') => dispatch({ type: 'OPEN_MODAL', modal })
  const toggleFullscreen = async () => {
    if (await fullscreen.toggle()) return
    dispatch({ type: 'ADD_TOAST', toast: { tone: 'warning', title: '无法切换全屏', message: fullscreen.supported ? '浏览器拒绝了全屏请求，请检查站点权限。' : '当前浏览器不支持网页全屏。' } })
  }

  return (
    <header className="top-hud" aria-label="玩家状态">
      <div className="hud-brand">
        <span className="brand-sigil" aria-hidden="true">M</span>
        <div>
          <p className="eyebrow">MISTVALE CHRONICLES</p>
          <strong>雾灯谷纪事</strong>
          <span className="hud-player-name">{state.playerProfile.name}</span>
        </div>
      </div>

      <div className="hud-location">
        <p className="eyebrow">当前地点</p>
        <strong>{location.name}</strong>
        <span>{location.subtitle}</span>
      </div>

      <button id="hud-open-calendar" className="hud-clock" type="button" aria-label={`打开岁时手册，第${state.year}年${calendar.month}月${calendar.date}日 ${formatClock(state.minutes)}`} aria-expanded={state.activeModal === 'calendar'} onClick={() => openModal('calendar')}>
        <GameIcon name="calendar" size={17} weight="duotone" />
        <span>第{state.year}年 · {state.season}</span>
        <strong>{formatClock(state.minutes)}</strong>
        <span>{calendar.month}月{calendar.date}日 · {state.weekday} · {state.weather}</span>
      </button>

      <div className="hud-resource energy-resource" aria-label={`精力 ${state.energy}/${state.maxEnergy}`}>
        <span className="resource-icon"><GameIcon name="health" weight="duotone" /></span>
        <div><span>精力</span><strong>{state.energy} / {state.maxEnergy}</strong></div>
        <div className="energy-pips" aria-hidden="true">
          {Array.from({ length: state.maxEnergy }, (_, i) => <i key={i} data-filled={i < state.energy} />)}
        </div>
      </div>

      <div className="hud-resource money-resource" aria-label={`金钱 ${state.money} 金币`}>
        <span className="resource-icon"><GameIcon name="coins" weight="duotone" /></span>
        <div><span>金币</span><strong>{state.money.toLocaleString('zh-CN')}</strong></div>
      </div>

      <div className="hud-skills" aria-label="技能等级">
        {(Object.keys(skillMeta) as SkillId[]).map((skillId) => (
          <div className="skill-chip" data-testid={`hud-skill-${skillId}`} key={skillId}>
            <GameIcon name={skillMeta[skillId].icon} size={17} weight="duotone" />
            <span>{skillMeta[skillId].label}</span>
            <strong>{state.skills[skillId].level}</strong>
          </div>
        ))}
      </div>

      <nav className="hud-actions" aria-label="游戏菜单">
        <button id="hud-open-inventory" className="icon-button" aria-label="打开背包" aria-expanded={state.activeModal === 'inventory'} onClick={() => openModal('inventory')}>
          <GameIcon name="backpack" weight="duotone" />
        </button>
        <button id="hud-open-journal" className="icon-button" aria-label="打开任务手册" aria-expanded={state.activeModal === 'journal'} onClick={() => openModal('journal')}>
          <GameIcon name="book" weight="duotone" />
        </button>
        <button id="hud-open-tavern" className="icon-button" aria-label="打开酒馆中枢" aria-expanded={state.activeModal === 'tavern'} onClick={() => openModal('tavern')}>
          <GameIcon name="memory" weight="duotone" />
        </button>
        <button id="hud-toggle-fullscreen" className="icon-button" aria-label={fullscreen.isFullscreen ? '退出全屏' : '进入全屏'} aria-pressed={fullscreen.isFullscreen} onClick={() => void toggleFullscreen()}>
          <GameIcon name={fullscreen.isFullscreen ? 'fullscreenExit' : 'fullscreen'} weight="duotone" />
        </button>
        <button id="hud-open-settings" className="icon-button" aria-label="打开游戏设置" aria-expanded={state.activeModal === 'settings'} onClick={() => openModal('settings')}>
          <GameIcon name="settings" weight="duotone" />
        </button>
      </nav>
    </header>
  )
}
