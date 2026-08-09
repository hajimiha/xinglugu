import type { Npc, Relationship } from '../../game/types'
import { GameIcon } from '../icons/GameIcon'

export function NpcPortrait({ npc, relationship, source, minAffinity, maxAffinity, onUpload, onOpen }: {
  npc: Npc
  relationship: Relationship
  source?: string
  minAffinity: number
  maxAffinity: number
  onUpload: (file: File) => void
  onOpen: () => void
}) {
  const range = `${minAffinity}—${maxAffinity}`
  const uploadId = `npc-upload-${npc.id}-${minAffinity}-${maxAffinity}`
  return (
    <article className="npc-portrait-card">
      <button id={`npc-portrait-${npc.id}`} className="npc-portrait-button" type="button" aria-label={`与${npc.role}${npc.name}互动`} onClick={onOpen}>
        {source
          ? <img src={source} alt={`${npc.name}·好感${range}立绘`} />
          : <span className="portrait-silhouette" aria-hidden="true"><i /><i /><i /></span>}
        <span className="portrait-glass"><small>{npc.role}</small><strong>{npc.name}</strong><em>好感 {relationship.affinity}</em></span>
      </button>
      <label className="portrait-upload" htmlFor={uploadId}><GameIcon name="upload" size={14} />上传好感 {range} 立绘</label>
      <input id={uploadId} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => event.target.files?.[0] && onUpload(event.target.files[0])} />
    </article>
  )
}
