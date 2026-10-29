import type { AppState, CameraPreset } from '../App'

interface PropertiesPanelProps {
  state: AppState
  onClose: () => void
  onToggleWireframe: () => void
  onToggleGrid: () => void
  onToggleAutoRotate: () => void
  onSelectCameraPreset: (preset: CameraPreset) => void
  onSelectMaterialColor: (color: string) => void
}

const MATERIAL_SWATCHES = [
  { color: '#c8a98e', label: 'Argila Quente' },
  { color: '#e0b899', label: 'Pele Clara' },
  { color: '#a67856', label: 'Pele Média' },
  { color: '#69452f', label: 'Pele Escura' },
  { color: '#9ca3af', label: 'Cinza Estúdio' },
  { color: '#93c5fd', label: 'Blueprint' },
]

export default function PropertiesPanel({
  state,
  onClose,
  onToggleWireframe,
  onToggleGrid,
  onToggleAutoRotate,
  onSelectCameraPreset,
  onSelectMaterialColor,
}: PropertiesPanelProps) {
  const formatNumber = (n: number) => n.toLocaleString('pt-BR')

  return (
    <aside className={`panel ${state.panelOpen ? 'panel--open' : ''}`} aria-label="Inspetor de Propriedades">
      <div className="panel__header">
        <span className="panel__title">Inspetor do Personagem</span>
        <button className="panel__close" onClick={onClose} aria-label="Fechar painel">
          ✕
        </button>
      </div>

      <div className="panel__body">
        {/* Model Info */}
        <div className="panel__section">
          <div className="panel__section-title">Malha Base 3D</div>
          <div className="panel__info-row">
            <span className="panel__info-label">Arquivo</span>
            <span className="panel__info-value">personagem_base_humano.glb</span>
          </div>
          <div className="panel__info-row">
            <span className="panel__info-label">Status</span>
            <span
              className={`panel__badge ${
                state.modelLoaded ? 'panel__badge--success' : 'panel__badge--warning'
              }`}
            >
              {state.modelLoaded ? '● Ativo na Cena' : '◌ Carregando...'}
            </span>
          </div>
          <div className="panel__info-row">
            <span className="panel__info-label">Vértices</span>
            <span className="panel__info-value">
              {state.modelLoaded ? formatNumber(state.metrics.vertices) : '—'}
            </span>
          </div>
          <div className="panel__info-row">
            <span className="panel__info-label">Triângulos (Faces)</span>
            <span className="panel__info-value">
              {state.modelLoaded ? formatNumber(state.metrics.faces) : '—'}
            </span>
          </div>
          <div className="panel__info-row">
            <span className="panel__info-label">Dimensões (A × L × P)</span>
            <span className="panel__info-value">
              {state.modelLoaded
                ? `${state.metrics.height}m × ${state.metrics.width}m × ${state.metrics.depth}m`
                : '—'}
            </span>
          </div>
        </div>

        {/* Camera Angles */}
        <div className="panel__section">
          <div className="panel__section-title">Ângulos de Câmera</div>
          <div className="panel__cam-controls">
            <button
              className={`panel__cam-btn ${state.cameraPreset === 'perspective' ? 'panel__cam-btn--active' : ''}`}
              onClick={() => onSelectCameraPreset('perspective')}
            >
              3/4 Padrão
            </button>
            <button
              className={`panel__cam-btn ${state.cameraPreset === 'front' ? 'panel__cam-btn--active' : ''}`}
              onClick={() => onSelectCameraPreset('front')}
            >
              Frente
            </button>
            <button
              className={`panel__cam-btn ${state.cameraPreset === 'side' ? 'panel__cam-btn--active' : ''}`}
              onClick={() => onSelectCameraPreset('side')}
            >
              Perfil Lateral
            </button>
            <button
              className={`panel__cam-btn ${state.cameraPreset === 'back' ? 'panel__cam-btn--active' : ''}`}
              onClick={() => onSelectCameraPreset('back')}
            >
              Costas
            </button>
            <button
              className={`panel__cam-btn ${state.cameraPreset === 'head' ? 'panel__cam-btn--active' : ''}`}
              onClick={() => onSelectCameraPreset('head')}
            >
              Close no Rosto
            </button>
            <button
              className={`panel__cam-btn ${state.cameraPreset === 'top' ? 'panel__cam-btn--active' : ''}`}
              onClick={() => onSelectCameraPreset('top')}
            >
              Vista Superior
            </button>
          </div>
        </div>

        {/* Viewport Display Options */}
        <div className="panel__section">
          <div className="panel__section-title">Opções de Exibição</div>
          <div className="panel__cam-controls">
            <button
              className={`panel__cam-btn ${state.wireframe ? 'panel__cam-btn--active' : ''}`}
              onClick={onToggleWireframe}
            >
              Wireframe
            </button>
            <button
              className={`panel__cam-btn ${state.showGrid ? 'panel__cam-btn--active' : ''}`}
              onClick={onToggleGrid}
            >
              Grade do Piso
            </button>
            <button
              className={`panel__cam-btn ${state.autoRotate ? 'panel__cam-btn--active' : ''}`}
              onClick={onToggleAutoRotate}
              style={{ gridColumn: 'span 2' }}
            >
              Rotação Contínua (Turntable)
            </button>
          </div>
        </div>

        {/* Base Preview Shading */}
        <div className="panel__section">
          <div className="panel__section-title">Sombreado Base / Tom</div>
          <div className="panel__swatches">
            {MATERIAL_SWATCHES.map((swatch) => (
              <button
                key={swatch.color}
                className={`panel__swatch ${
                  state.materialColor === swatch.color ? 'panel__swatch--active' : ''
                }`}
                style={{ backgroundColor: swatch.color }}
                onClick={() => onSelectMaterialColor(swatch.color)}
                title={swatch.label}
                aria-label={swatch.label}
              />
            ))}
          </div>
        </div>

        {/* Future Modeling Modules */}
        <div className="panel__section">
          <div className="panel__section-title">Módulos de Edição (Preparados)</div>
          <div className="panel__module-list">
            <div className="panel__module-card">
              <span className="panel__module-name">Proporções Corporais</span>
              <span className="panel__badge panel__badge--info">Próxima Fase</span>
            </div>
            <div className="panel__module-card">
              <span className="panel__module-name">Escultura Facial</span>
              <span className="panel__badge panel__badge--info">Próxima Fase</span>
            </div>
            <div className="panel__module-card">
              <span className="panel__module-name">Cabelo & Vestuário</span>
              <span className="panel__badge panel__badge--info">Próxima Fase</span>
            </div>
            <div className="panel__module-card">
              <span className="panel__module-name">Rigging & Pose</span>
              <span className="panel__badge panel__badge--warning">Sem Esqueleto</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
