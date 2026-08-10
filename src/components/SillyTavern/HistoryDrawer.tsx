import { useState } from 'react'
import type { ChatSession } from '../../sillytavern/types'
import { GameIcon } from '../icons/GameIcon'

interface HistoryDrawerProps {
  session: ChatSession
  onClose(): void
  onBranch(messageIndex: number): Promise<void>
  onTruncate(messageIndex: number): Promise<void>
}

export function HistoryDrawer({ session, onClose, onBranch, onTruncate }: HistoryDrawerProps) {
  const [pending, setPending] = useState<{ action: 'branch' | 'truncate'; index: number } | null>(null)
  const [working, setWorking] = useState(false)

  const commit = async () => {
    if (!pending || working) return
    setWorking(true)
    try {
      if (pending.action === 'branch') await onBranch(pending.index)
      else await onTruncate(pending.index)
      setPending(null)
    } finally {
      setWorking(false)
    }
  }

  return (
    <aside id={`tavern-history-${session.id}`} className="tavern-history" aria-labelledby={`tavern-history-title-${session.id}`}>
      <header>
        <div>
          <span>SESSION ARCHIVE</span>
          <h3 id={`tavern-history-title-${session.id}`}>会话历史</h3>
        </div>
        <button id={`tavern-history-close-${session.id}`} className="icon-button" type="button" aria-label="关闭会话历史" onClick={onClose}>
          <GameIcon name="close" size={17} />
        </button>
      </header>
      <ol className="tavern-history-list">
        {session.messages.map((message, index) => (
          <li key={message.id}>
            <div className="history-node" aria-hidden="true"><i /></div>
            <article>
              <span>{message.role === 'assistant' ? session.characterName : message.role === 'user' ? session.userName : '系统记录'}</span>
              <p>{message.content}</p>
              <time>{new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>
            </article>
            <div className="history-actions">
              <button id={`tavern-history-branch-${message.id}`} type="button" aria-label={`从第${index + 1}条消息创建分支`} onClick={() => setPending({ action: 'branch', index })}>
                <GameIcon name="branch" size={15} />分支
              </button>
              {index < session.messages.length - 1 && (
                <button id={`tavern-history-truncate-${message.id}`} type="button" aria-label={`删除第${index + 1}条消息之后的内容`} onClick={() => setPending({ action: 'truncate', index })}>
                  <GameIcon name="trash" size={15} />删后续
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
      {pending && (
        <div className="tavern-inline-confirm" role="alertdialog" aria-labelledby={`history-confirm-title-${session.id}`}>
          <GameIcon name="warning" size={20} />
          <div>
            <strong id={`history-confirm-title-${session.id}`}>{pending.action === 'branch' ? '从此处创建独立分支？' : '删除此处之后的消息？'}</strong>
            <p>{pending.action === 'branch' ? '原会话会保留，并创建一份可独立发展的副本。' : '会话变量也会恢复到这一条消息的快照。'}</p>
          </div>
          <button id={`history-confirm-cancel-${session.id}`} type="button" disabled={working} onClick={() => setPending(null)}>取消</button>
          <button id={`history-confirm-commit-${session.id}`} className={pending.action === 'truncate' ? 'danger-button' : 'primary-button'} type="button" disabled={working} onClick={() => void commit()}>{working ? '处理中' : '确认'}</button>
        </div>
      )}
    </aside>
  )
}
