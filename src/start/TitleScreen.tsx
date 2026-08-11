import desktopCover from '../assets/xinglugu-title-desktop.webp'
import mobileCover from '../assets/xinglugu-title-mobile.webp'

export interface TitleScreenProps {
  hasLocalSave: boolean
  onStart(): void
  onLoad(): void
  onWorkshop(): void
  onSettings(): void
}

const titleActions = [
  { id: 'title-start-game', label: '开始游戏', key: 'start' },
  { id: 'title-load-save', label: '继续游戏并读取存档', key: 'load' },
  { id: 'title-workshop', label: '创意工坊', key: 'workshop' },
  { id: 'title-settings', label: '设置', key: 'settings' },
] as const

export function TitleScreen({ hasLocalSave, onStart, onLoad, onWorkshop, onSettings }: TitleScreenProps) {
  const callbacks = { start: onStart, load: onLoad, workshop: onWorkshop, settings: onSettings }

  return (
    <main id="game-title-screen" className="title-screen">
      <h1 className="sr-only">性撸谷物语</h1>
      <picture className="title-screen-backdrop" aria-hidden="true">
        <source media="(orientation: portrait)" srcSet={mobileCover} />
        <img src={desktopCover} alt="" />
      </picture>

      <div className="title-artboard">
        <picture>
          <source media="(orientation: portrait)" srcSet={mobileCover} width="941" height="1672" />
          <img
            className="title-cover-image"
            src={desktopCover}
            width="1672"
            height="941"
            alt="性撸谷物语像素农场封面"
            draggable="false"
          />
        </picture>

        <nav className="title-menu-hotspots" aria-label="游戏开始菜单" aria-describedby="title-save-state">
          {titleActions.map((action) => (
            <button
              id={action.id}
              className="title-hotspot"
              type="button"
              aria-label={action.label}
              onClick={callbacks[action.key]}
              key={action.id}
            >
              <span className="sr-only">{action.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <p id="title-save-state" className="sr-only" role="status">
        {hasLocalSave ? '已检测到本地存档' : '尚未检测到本地存档，可开始新游戏或导入存档'}
      </p>
    </main>
  )
}
