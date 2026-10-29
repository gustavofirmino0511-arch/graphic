import type { ToolId } from '../App'

interface ToolbarProps {
  activeTool: ToolId
  onSelectTool: (tool: ToolId) => void
}

interface ToolDef {
  id: ToolId
  label: string
  icon: JSX.Element
}

const tools: ToolDef[] = [
  {
    id: 'select',
    label: 'Selecionar',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
      </svg>
    ),
  },
  {
    id: 'move',
    label: 'Mover',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/>
        <polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/>
        <line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>
      </svg>
    ),
  },
  {
    id: 'rotate',
    label: 'Rotacionar',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
    ),
  },
  {
    id: 'scale',
    label: 'Escalar',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
        <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
      </svg>
    ),
  },
  {
    id: 'sculpt',
    label: 'Esculpir',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
        <path d="M2 2l7.586 7.586"/>
      </svg>
    ),
  },
  {
    id: 'measure',
    label: 'Medir',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M2 12h5"/><path d="M17 12h5"/><path d="M7 4v16"/><path d="M17 4v16"/>
        <path d="M12 2v4"/><path d="M12 18v4"/><path d="M9 12h6"/>
      </svg>
    ),
  },
]

export default function Toolbar({ activeTool, onSelectTool }: ToolbarProps) {
  return (
    <aside className="toolbar" role="toolbar" aria-label="Tools">
      {tools.map((tool, i) => (
        <span key={tool.id}>
          <button
            className={`toolbar__btn ${activeTool === tool.id ? 'toolbar__btn--active' : ''}`}
            onClick={() => onSelectTool(tool.id)}
            aria-label={tool.label}
            title={tool.label}
          >
            {tool.icon}
            <span className="toolbar__tooltip">{tool.label}</span>
          </button>
          {i === 0 && <div className="toolbar__separator" />}
        </span>
      ))}
      <div className="toolbar__spacer" />
      <button className="toolbar__btn" aria-label="Ajuda" title="Ajuda">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span className="toolbar__tooltip">Ajuda</span>
      </button>
    </aside>
  )
}
