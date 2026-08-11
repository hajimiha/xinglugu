import { useEffect, useRef, type ReactNode } from 'react'
import { GameIcon } from '../components/icons/GameIcon'

interface StartModalFrameProps {
  id: string
  title: string
  onClose(): void
  children: ReactNode
  tavern?: boolean
}

export function StartModalFrame({ id, title, onClose, children, tavern = false }: StartModalFrameProps) {
  const panelRef = useRef<HTMLElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    requestAnimationFrame(() => panelRef.current?.focus())
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      previousFocus.current?.focus()
    }
  }, [onClose])

  return (
    <div
      id={`${id}-overlay`}
      className={`modal-overlay start-modal-overlay ${tavern ? 'is-tavern' : ''}`}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <section
        id={id}
        ref={panelRef}
        className={`modal-panel start-modal-panel ${tavern ? 'modal-tavern' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tavern ? 'tavern-hub-title' : `${id}-title`}
        tabIndex={-1}
      >
        {!tavern && (
          <header className="modal-header">
            <div><p className="eyebrow">XINGLUGU ARCHIVE</p><h2 id={`${id}-title`}>{title}</h2></div>
            <button id={`${id}-close`} className="icon-button" type="button" aria-label={`关闭${title}`} onClick={onClose}>
              <GameIcon name="close" size={18} />
            </button>
          </header>
        )}
        <div className="modal-body">{children}</div>
      </section>
    </div>
  )
}
