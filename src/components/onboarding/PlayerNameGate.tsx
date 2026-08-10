import { useState, type FormEvent } from 'react'
import { useGame } from '../../game/GameContext'
import { MAX_PLAYER_NAME_LENGTH, normalizePlayerName } from '../../game/player-profile'
import { GameIcon } from '../icons/GameIcon'

export function PlayerNameGate() {
  const { state, dispatch } = useGame()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  if (state.playerProfile.hasConfirmedName) return null

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = normalizePlayerName(draft)
    if (!name) {
      setError(draft.trim() ? `姓名需为 1–${MAX_PLAYER_NAME_LENGTH} 个字符，且不能包含控制字符。` : '请输入姓名后再进入雾灯谷。')
      return
    }
    dispatch({ type: 'SET_PLAYER_NAME', name })
  }

  return <div className="player-name-gate" role="presentation">
    <section className="player-name-card" role="dialog" aria-modal="true" aria-labelledby="player-name-registration-title" aria-describedby="player-name-registration-note">
      <div className="player-name-sigil" aria-hidden="true"><GameIcon name="profile" size={32} weight="duotone" /></div>
      <p className="eyebrow">NEW ARRIVAL RECORD</p>
      <h1 id="player-name-registration-title">登记旅人名</h1>
      <p id="player-name-registration-note">这个名字会写入存档，并成为村民称呼你、酒馆预设替换 <code>{'{{user}}'}</code> 时使用的身份。</p>
      <form onSubmit={submit} noValidate>
        <label htmlFor="player-name-registration-input">玩家姓名</label>
        <div className="player-name-input-row">
          <input id="player-name-registration-input" name="player-name" autoComplete="nickname" autoFocus maxLength={MAX_PLAYER_NAME_LENGTH + 1} value={draft} onChange={(event) => { setDraft(event.target.value); setError('') }} aria-invalid={Boolean(error)} aria-describedby={error ? 'player-name-registration-error' : 'player-name-registration-help'} />
          <span aria-hidden="true">{Array.from(draft.trim()).length}/{MAX_PLAYER_NAME_LENGTH}</span>
        </div>
        {error ? <p id="player-name-registration-error" className="player-name-error" role="alert">{error}</p> : <p id="player-name-registration-help" className="player-name-help">之后可在游戏设置的“玩家档案”中更改。</p>}
        <button id="player-name-registration-submit" className="primary-button" type="submit"><GameIcon name="success" size={18} weight="duotone" />确认姓名并进入雾灯谷</button>
      </form>
    </section>
  </div>
}
