import type { ToolId } from '../App'

interface ToolbarProps {
  activeTool: ToolId
  onSelectTool: (tool: ToolId) => void
}

interface ToolDef {
  id: ToolId
  label: string
  shortcut: string
  icon: JSX.Element
}

const tools: ToolDef[] = [
  {
    id: 'select',
    label: 'Selecionar Objeto',
    shortcut: 'Q',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
      </svg>
    ),
  },
  {
    id: 'move',
    label: 'Mover (Eixos X, Y, Z)',
    shortcut: 'W',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <polyline points="5 9 2 12 5 15" />
        <polyline points="9 5 12 2 15 5" />
        <polyline points="15 19 12 22 9 19" />
        <polyline points="19 9 22 12 19 15" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="12" y1="2" x2="12" y2="22" />
      </svg>
    ),
  },
  {
    id: 'rotate',
    label: 'Rotacionar (Eixos X, Y, Z)',
    shortcut: 'E',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </svg>
    ),
  },
  {
    id: 'scale',
    label: 'Escalar (Uniforme / Eixos)',
    shortcut: 'R',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <polyline points="15 3 21 3 21 9" />
        <polyline points="9 21 3 21 3 15" />
        <line x1="21" y1="3" x2="14" y2="10" />
        <line x1="3" y1="21" x2="10" y2="14" />
      </svg>
    ),
  },
  {
    id: 'sculpt',
    label: 'Proporções Corporais',
    shortcut: 'B',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="5" r="3" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="6" y1="11" x2="18" y2="11" />
        <line x1="12" y1="16" x2="8" y2="22" />
        <line x1="12" y1="16" x2="16" y2="22" />
      </svg>
    ),
  },
  {
    id: 'measure',
    label: 'Medir Distância (2 Pontos)',
    shortcut: 'M',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M2 12h5" />
        <path d="M17 12h5" />
        <path d="M7 4v16" />
        <path d="M17 4v16" />
        <path d="M12 2v4" />
        <path d="M12 18v4" />
        <path d="M9 12h6" />
      </svg>
    ),
  },
]

export default function Toolbar({ activeTool, onSelectTool }: ToolbarProps) {
  return (
    <aside className="toolbar" role="toolbar" aria-label="Ferramentas de Edição">
      {tools.map((tool, i) => (
        <span key={tool.id}>
          <button
            className={`toolbar__btn ${activeTool === tool.id ? 'toolbar__btn--active' : ''}`}
            onClick={() => onSelectTool(tool.id)}
            aria-label={tool.label}
            title={`${tool.label} (${tool.shortcut})`}
          >
            {tool.icon}
            <span className="toolbar__tooltip">
              {tool.label} <kbd>{tool.shortcut}</kbd>
            </span>
          </button>
          {(i === 0 || i === 3) && <div className="toolbar__separator" />}
        </span>
      ))}
    </aside>
  )
}
