import { useMemo, useState, type ChangeEvent } from 'react'
import { useGame } from '../../game/GameContext'
import {
  DEFAULT_GAME_RULES,
  getEnergyCost,
  normalizeGameRules,
  scaleDamage,
  scaleGrowthHours,
  scaleReward,
} from '../../game/rules'
import type { EnergyCostMode, GameRuleSettings } from '../../game/types'
import { GameIcon } from '../icons/GameIcon'
import { MAX_PLAYER_NAME_LENGTH, normalizePlayerName } from '../../game/player-profile'

type MultiplierKey = Exclude<keyof GameRuleSettings, 'energyCostMode'>
type MultiplierDrafts = Record<MultiplierKey, string>

interface RuleDefinition {
  key: MultiplierKey
  label: string
  description: string
  example: (value: number) => string
}

const groups: Array<{ id: string; index: string; title: string; note: string; rules: RuleDefinition[] }> = [
  {
    id: 'growth', index: '01', title: '成长与关系', note: '决定角色成长、村民关系与探索回报的积累速度。',
    rules: [
      { key: 'experienceMultiplier', label: '经验获取倍率', description: '作用于钓鱼、农耕、挖矿、战斗与魔法经验。', example: (value) => `战斗训练 18 经验 → ${scaleReward(18, value)}` },
      { key: 'affinityMultiplier', label: '好感增加倍率', description: '作用于聊天、赠礼与委托关系奖励。', example: (value) => `初次聊天 6 好感 → ${scaleReward(6, value)}` },
      { key: 'dropMultiplier', label: '收集物掉落倍率', description: '作用于作物、矿物与钓鱼收获数量。', example: (value) => `基础收获 3 份 → ${scaleReward(3, value)}` },
    ],
  },
  {
    id: 'economy', index: '02', title: '经营与恢复', note: '调节经营节奏、作物等待时间和恢复道具效能。',
    rules: [
      { key: 'moneyMultiplier', label: '金币收益倍率', description: '作用于出售与委托收入，不改变商店买入价格。', example: (value) => `出售收入 100 金币 → ${scaleReward(100, value)}` },
      { key: 'cropGrowthMultiplier', label: '作物生长倍率', description: '倍率越高，播种后等待时间越短。', example: (value) => `48 小时生长 → ${scaleGrowthHours(48, value)} 小时` },
      { key: 'recoveryMultiplier', label: '恢复效果倍率', description: '作用于医院精力与战斗恢复道具。', example: (value) => `恢复剂 10 生命 → ${scaleReward(10, value)}` },
    ],
  },
  {
    id: 'combat', index: '03', title: '战斗与消耗', note: '分别控制双方伤害，便于定制轻叙事或高压冒险。',
    rules: [
      { key: 'playerDamageMultiplier', label: '玩家伤害倍率', description: '作用于物理攻击与五行法术的最终伤害。', example: (value) => `基础攻击 8 伤害 → ${scaleDamage(8, value)}` },
      { key: 'enemyDamageMultiplier', label: '敌方伤害倍率', description: '作用于矿洞魔物的普通反击与破防伤害。', example: (value) => `魔物反击 6 伤害 → ${scaleDamage(6, value)}` },
    ],
  },
]

const energyModes: Array<{ value: EnergyCostMode; label: string; note: string }> = [
  { value: 'free', label: '自由叙事', note: '互动不消耗精力' },
  { value: 'normal', label: '标准规则', note: '每次行动消耗 1 点' },
  { value: 'double', label: '生存压力', note: '每次行动消耗 2 点' },
]

const multiplierKeys = groups.flatMap((group) => group.rules.map((rule) => rule.key))

function createMultiplierDrafts(rules: GameRuleSettings): MultiplierDrafts {
  return Object.fromEntries(multiplierKeys.map((key) => [key, String(rules[key])])) as MultiplierDrafts
}

export function SettingsModal() {
  const { state, dispatch, saveMeta, exportGameSave, importGameSave, resetGameSave } = useGame()
  const [draft, setDraft] = useState<GameRuleSettings>(() => ({ ...state.rules }))
  const [multiplierDrafts, setMultiplierDrafts] = useState<MultiplierDrafts>(() => createMultiplierDrafts(state.rules))
  const [pendingReset, setPendingReset] = useState(false)
  const [pendingNewGame, setPendingNewGame] = useState(false)
  const [status, setStatus] = useState('')
  const [playerNameDraft, setPlayerNameDraft] = useState(state.playerProfile.name)
  const [playerNameError, setPlayerNameError] = useState('')
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.rules)
  const profile = useMemo(() => {
    const support = (draft.experienceMultiplier + draft.affinityMultiplier + draft.dropMultiplier + draft.moneyMultiplier + draft.recoveryMultiplier) / 5
    const pressure = draft.enemyDamageMultiplier * (draft.energyCostMode === 'double' ? 1.35 : draft.energyCostMode === 'free' ? 0.7 : 1)
    if (support / pressure >= 1.35) return { label: '悠然物语', note: '成长快速，适合专注剧情与关系。' }
    if (support / pressure <= 0.8) return { label: '雾谷求生', note: '资源紧张，每次出行都需要计划。' }
    return { label: '平衡经营', note: '成长、经营与探索压力处于标准区间。' }
  }, [draft])

  const setRangeMultiplier = (key: MultiplierKey, raw: string) => {
    const next = normalizeGameRules({ ...draft, [key]: Number(raw) })
    setDraft(next)
    setMultiplierDrafts((current) => ({ ...current, [key]: String(next[key]) }))
    setStatus('')
  }

  const setNumberMultiplier = (key: MultiplierKey, raw: string) => {
    setMultiplierDrafts((current) => ({ ...current, [key]: raw }))
    if (!raw.trim()) return
    const value = Number(raw)
    if (!Number.isFinite(value) || value < 0.5 || value > 3) return
    setDraft((current) => normalizeGameRules({ ...current, [key]: value }))
    setStatus('')
  }

  const normalizeNumberDraft = (key: MultiplierKey) => {
    if (!multiplierDrafts[key].trim()) return
    setMultiplierDrafts((current) => ({ ...current, [key]: String(draft[key]) }))
  }

  const applyRules = () => {
    dispatch({ type: 'UPDATE_GAME_RULES', rules: draft })
    setStatus('规则已应用')
  }

  const confirmReset = () => {
    dispatch({ type: 'RESET_GAME_RULES' })
    setDraft({ ...DEFAULT_GAME_RULES })
    setMultiplierDrafts(createMultiplierDrafts(DEFAULT_GAME_RULES))
    setPendingReset(false)
    setStatus('已恢复标准规则')
  }

  const exportSave = () => {
    const blob = new Blob([exportGameSave()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `雾灯谷存档-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setStatus('游戏存档已导出')
  }

  const importSave = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const ok = importGameSave(await file.text())
    setStatus(ok ? '游戏存档已导入' : '存档文件无法识别')
  }

  const confirmNewGame = () => {
    resetGameSave()
    setPendingNewGame(false)
  }

  const savePlayerName = () => {
    const name = normalizePlayerName(playerNameDraft)
    if (!name) {
      setPlayerNameError(`请输入 1–${MAX_PLAYER_NAME_LENGTH} 个有效字符。`)
      return
    }
    dispatch({ type: 'SET_PLAYER_NAME', name })
    setPlayerNameDraft(name)
    setPlayerNameError('')
    setStatus(`姓名已更新为“${name}”`)
  }

  return <div className="settings-console">
    <section className="settings-overview" aria-label="当前难度倾向">
      <div className="settings-overview-mark" aria-hidden="true"><GameIcon name="settings" size={28} weight="duotone" /></div>
      <div><span>PLAYSTYLE CALIBRATION</span><h3>{profile.label}</h3><p>{profile.note}</p></div>
      <dl>
        <div><dt>经验</dt><dd>×{draft.experienceMultiplier.toFixed(2)}</dd></div>
        <div><dt>掉落</dt><dd>×{draft.dropMultiplier.toFixed(2)}</dd></div>
        <div><dt>行动</dt><dd>{getEnergyCost(1, draft.energyCostMode)} 精力</dd></div>
      </dl>
    </section>

    <section className="settings-profile-card" aria-labelledby="settings-player-profile-title">
      <div className="settings-profile-mark" aria-hidden="true"><GameIcon name="profile" size={24} weight="duotone" /></div>
      <div className="settings-profile-copy"><span>PLAYER PROFILE</span><h4 id="settings-player-profile-title">玩家档案</h4><p>村民称呼、酒馆宏变量和 AI 请求会同步使用此姓名。</p></div>
      <div className="settings-profile-control">
        <label htmlFor="settings-player-name">玩家姓名</label>
        <div><input id="settings-player-name" autoComplete="nickname" maxLength={MAX_PLAYER_NAME_LENGTH + 1} value={playerNameDraft} onChange={(event) => { setPlayerNameDraft(event.target.value); setPlayerNameError(''); setStatus('') }} aria-invalid={Boolean(playerNameError)} aria-describedby={playerNameError ? 'settings-player-name-error' : undefined} /><button id="settings-player-name-save" type="button" aria-label="保存玩家姓名" onClick={savePlayerName}><GameIcon name="save" size={16} />保存称呼</button></div>
        {playerNameError && <p id="settings-player-name-error" role="alert">{playerNameError}</p>}
      </div>
    </section>

    <div className="settings-rule-groups">
      {groups.map((group) => <section key={group.id} className="settings-rule-group" aria-labelledby={`settings-group-${group.id}`}>
        <header><span>{group.index}</span><div><h4 id={`settings-group-${group.id}`}>{group.title}</h4><p>{group.note}</p></div></header>
        <div className="settings-rule-list">
          {group.rules.map((rule) => <article key={rule.key} className="settings-rule-card">
            <div className="settings-rule-copy"><label htmlFor={`setting-${rule.key}-range`}>{rule.label}</label><p>{rule.description}</p></div>
            <div className="settings-rule-control">
              <input id={`setting-${rule.key}-range`} type="range" min="0.5" max="3" step="0.25" value={draft[rule.key]} onChange={(event) => setRangeMultiplier(rule.key, event.target.value)} />
              <div className="settings-number-wrap"><span>×</span><input id={`setting-${rule.key}-number`} aria-label={`${rule.label}数值`} role="spinbutton" aria-valuemin={0.5} aria-valuemax={3} aria-valuenow={draft[rule.key]} type="text" inputMode="decimal" value={multiplierDrafts[rule.key]} onInput={(event) => setNumberMultiplier(rule.key, event.currentTarget.value)} onChange={(event) => setNumberMultiplier(rule.key, event.target.value)} onBlur={() => normalizeNumberDraft(rule.key)} /></div>
            </div>
            <output htmlFor={`setting-${rule.key}-range setting-${rule.key}-number`}>{rule.example(draft[rule.key])}</output>
          </article>)}
          {group.id === 'combat' && <fieldset className="energy-mode-fieldset"><legend>精力消耗模式</legend><p>统一作用于聊天、赠礼、学习、训练、下矿、采矿与钓鱼。</p><div>{energyModes.map((mode) => <label key={mode.value} htmlFor={`setting-energy-${mode.value}`} className={draft.energyCostMode === mode.value ? 'is-selected' : ''}><input id={`setting-energy-${mode.value}`} type="radio" name="energy-cost-mode" value={mode.value} checked={draft.energyCostMode === mode.value} onChange={() => { setDraft({ ...draft, energyCostMode: mode.value }); setStatus('') }} /><span><strong>{mode.label}</strong><small>{mode.note}</small></span></label>)}</div></fieldset>}
        </div>
      </section>)}
    </div>

    <section className="settings-save-console" aria-label="自动存档管理">
      <div className="settings-save-copy"><span>AUTOSAVE ARCHIVE</span><h4>自动存档</h4><p>地点、时间、背包、农田、关系与探索进度会在每次行动后保存在当前浏览器。</p></div>
      <div className="settings-save-state"><i aria-hidden="true" /><span>{saveMeta.enabled ? '自动保存已开启' : '测试/预览状态'}</span><strong>{saveMeta.savedAt ? new Date(saveMeta.savedAt).toLocaleString('zh-CN') : '等待首次行动'}</strong></div>
      <div className="settings-save-actions">
        <button id="settings-save-export" type="button" aria-label="导出游戏存档" onClick={exportSave}><GameIcon name="save" size={17} />导出存档</button>
        <label id="settings-save-import-label" htmlFor="settings-save-import"><GameIcon name="upload" size={17} />导入存档<input id="settings-save-import" type="file" accept=".json,application/json" aria-label="导入游戏存档" onChange={(event) => void importSave(event)} /></label>
        <button id="settings-save-new" className="danger-ghost" type="button" aria-label="新建游戏存档" onClick={() => setPendingNewGame(true)}><GameIcon name="reset" size={17} />新建游戏</button>
      </div>
    </section>

    {pendingReset && <section className="settings-reset-confirm" role="alert"><GameIcon name="warning" size={20} /><div><strong>确认恢复全部标准规则？</strong><p>八项倍率将回到 1.00，精力消耗恢复为标准模式。</p></div><button id="settings-reset-cancel" type="button" onClick={() => setPendingReset(false)}>取消</button><button id="settings-reset-confirm" className="danger-button" type="button" onClick={confirmReset}>确认恢复</button></section>}
    {pendingNewGame && <section className="settings-reset-confirm" role="alert"><GameIcon name="warning" size={20} /><div><strong>确认清除当前游戏进度？</strong><p>这会回到春季第 1 天的苔灯农场；建议先导出存档备份。</p></div><button id="settings-save-new-cancel" type="button" aria-label="取消新建存档" onClick={() => setPendingNewGame(false)}>取消</button><button id="settings-save-new-confirm" className="danger-button" type="button" aria-label="确认新建存档" onClick={confirmNewGame}>清除并新建</button></section>}

    <footer className="settings-actions">
      <div><span className={dirty ? 'settings-dirty-dot is-dirty' : 'settings-dirty-dot'} aria-hidden="true" /><p>{status || (dirty ? '有尚未应用的规则修改' : '当前规则已同步')}</p></div>
      <button id="settings-reset" type="button" aria-label="恢复标准规则" onClick={() => setPendingReset(true)}><GameIcon name="reset" size={17} />恢复标准</button>
      <button id="settings-apply" className="primary-button" type="button" aria-label="应用玩法规则" disabled={!dirty} onClick={applyRules}><GameIcon name="save" size={17} />应用规则</button>
    </footer>
  </div>
}
