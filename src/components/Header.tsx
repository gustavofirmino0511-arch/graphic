import type { ToolId } from '../App'
import { CHARACTER_STYLES, type CharacterStyleId } from '../config/characterStyles'

interface HeaderProps {
  styleId: CharacterStyleId
  activeTool: ToolId
  onSelectStyle: (styleId: CharacterStyleId) => void
  onSelectTool: (tool: ToolId) => void
  onResetCamera: () => void
  autoRotate: boolean
  onToggleAutoRotate: () => void
}

export default function Header({
  styleId,
  activeTool,
  onSelectStyle,
  onSelectTool,
  onResetCamera,
  autoRotate,
  onToggleAutoRotate,
}: HeaderProps) {
  const isBodyEditMode = activeTool === 'sculpt'

  return (
    <header className="header">
      <div className="header__brand">
        <img src="/favicon.svg" alt="Character Forge" className="header__logo" />
        <div className="header__titles">
          <h1 className="header__title">Character Forge</h1>
          <span className="header__subtitle">Estúdio de Criação e Modelagem 3D</span>
        </div>
      </div>

      {/* Style Switcher (Realistic / Anime / Prototype) */}
      <div className="header__style-switch" role="group" aria-label="Estilo do Personagem">
        {(Object.keys(CHARACTER_STYLES) as CharacterStyleId[]).map((id) => {
          const label =
            id === 'realistic' ? 'Realista HD' : id === 'anime' ? 'Anime HD' : 'Protótipo'
          return (
            <button
              key={id}
              className={`header__style-btn ${
                styleId === id ? 'header__style-btn--active' : ''
              }`}
              onClick={() => onSelectStyle(id)}
              title={CHARACTER_STYLES[id].description}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div className="header__actions">
        <button
          className={`header__btn ${isBodyEditMode ? 'header__btn--active' : ''}`}
          onClick={() => onSelectTool(isBodyEditMode ? 'select' : 'sculpt')}
          title="Alternar Modo de Edição Corporal e Pincel 3D (Atalho: B)"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M12 19l7-7 3 3-7 7-3-3z" />
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
          </svg>
          <span>{isBodyEditMode ? 'Editando Corpo (Ativo)' : 'Editar Corpo'}</span>
        </button>

        <button
          className={`header__btn ${autoRotate ? 'header__btn--active' : ''}`}
          onClick={onToggleAutoRotate}
          title="Girar personagem automaticamente (Turntable)"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <polyline points="21 3 21 8 16 8" />
          </svg>
          <span>Turntable</span>
        </button>

        <button
          className="header__btn"
          onClick={onResetCamera}
          title="Enquadrar corpo inteiro e redefinir câmera"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M3 7V5a2 2 0 0 1 2-2h2" />
            <path d="M17 3h2a2 2 0 0 1 2 2v2" />
            <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
            <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          </svg>
          <span>Corpo Inteiro</span>
        </button>
      </div>
    </header>
  )
}
