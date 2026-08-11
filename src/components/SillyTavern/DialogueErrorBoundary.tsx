import { Component, type ErrorInfo, type ReactNode } from 'react'
import { GameIcon } from '../icons/GameIcon'

interface DialogueErrorBoundaryProps {
  children: ReactNode
  npcName: string
  onClose: () => void
  onReset: () => void | Promise<void>
}

interface DialogueErrorBoundaryState {
  failed: boolean
}

export class DialogueErrorBoundary extends Component<DialogueErrorBoundaryProps, DialogueErrorBoundaryState> {
  state: DialogueErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): DialogueErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Dialogue render was recovered by the local error boundary.', error, info)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <section className="dialogue-recovery" role="alert" aria-labelledby="dialogue-recovery-title">
        <div className="dialogue-recovery-mark" aria-hidden="true"><GameIcon name="warning" size={28} /></div>
        <p className="eyebrow">SESSION RECOVERY</p>
        <h2 id="dialogue-recovery-title">{this.props.npcName}的旧会话无法显示</h2>
        <p>检测到旧设备留下的不完整酒馆记录。游戏场景与存档仍然安全，可以只清理这名角色的对话记录后重新开始交谈。</p>
        <div>
          <button id="dialogue-recovery-reset" className="primary-button" type="button" onClick={() => void this.props.onReset()}>
            <GameIcon name="history" size={16} />清理旧会话并重试
          </button>
          <button id="dialogue-recovery-close" className="secondary-button" type="button" onClick={this.props.onClose}>
            返回场景
          </button>
        </div>
      </section>
    )
  }
}
