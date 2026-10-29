import type { AppState } from '../App'
import { CHARACTER_STYLES } from '../config/characterStyles'

interface StatusBarProps {
  state: AppState
}

const TOOL_LABELS: Record<AppState['activeTool'], string> = {
  select: 'Selecionar',
  move: 'Mover (X, Y, Z)',
  rotate: 'Rotacionar (X, Y, Z)',
  scale: 'Escalar',
  sculpt: 'Proporções Corporais',
  measure: 'Medir Distância (2 Pontos)',
}

export default function StatusBar({ state }: StatusBarProps) {
  const styleCfg = CHARACTER_STYLES[state.styleId]
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
              ? `${styleCfg.name} (${styleCfg.badge})`
              : 'Carregando modelo 3D...'}
          </span>
        </div>
        <div className="statusbar__item">
          <span>Ferramenta: {TOOL_LABELS[state.activeTool]}</span>
        </div>
        <div className="statusbar__item">
          <span>
            Objeto: {state.isSelected ? 'Personagem [Selecionado]' : 'Nenhum'}
          </span>
        </div>
      </div>
      <div className="statusbar__right">
        <div className="statusbar__item">
          <span>Altura: {state.metrics.height.toFixed(2)} m</span>
        </div>
        <div className="statusbar__item">
          <span>Vértices: {state.metrics.vertices.toLocaleString('pt-BR')}</span>
        </div>
        <div className="statusbar__item">
          <span>Triângulos: {state.metrics.faces.toLocaleString('pt-BR')}</span>
        </div>
      </div>
    </footer>
  )
}
