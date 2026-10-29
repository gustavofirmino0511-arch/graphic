import type { AppState } from '../App'

interface StatusBarProps {
  state: AppState
}

const TOOL_LABELS: Record<AppState['activeTool'], string> = {
  select: 'Selecionar / Orbitar',
  move: 'Mover',
  rotate: 'Rotacionar',
  scale: 'Escalar',
  sculpt: 'Esculpir',
  measure: 'Medir',
}

export default function StatusBar({ state }: StatusBarProps) {
  return (
    <footer className="statusbar">
      <div className="statusbar__left">
        <div className="statusbar__item">
          <span
            className="statusbar__dot"
            style={{ background: state.modelLoaded ? '#4ade80' : '#fbbf24' }}
          />
          <span>
            {state.modelLoaded
              ? 'personagem_base_humano.glb carregado'
              : 'Carregando personagem_base_humano.glb...'}
          </span>
        </div>
        <div className="statusbar__item">
          <span>Modo: {TOOL_LABELS[state.activeTool]}</span>
        </div>
      </div>
      <div className="statusbar__right">
        <div className="statusbar__item">
          <span>Altura: {state.metrics.height.toFixed(2)}m</span>
        </div>
        <div className="statusbar__item">
          <span>Vértices: {state.metrics.vertices.toLocaleString('pt-BR')}</span>
        </div>
        <div className="statusbar__item">
          <span>Faces: {state.metrics.faces.toLocaleString('pt-BR')}</span>
        </div>
      </div>
    </footer>
  )
}
