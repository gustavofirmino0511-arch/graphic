import type {
  AppState,
  BodyProportions,
  CameraPreset,
  ToolId,
  TransformState,
} from '../App'
import { CHARACTER_STYLES, type CharacterStyleId } from '../config/characterStyles'

interface PropertiesPanelProps {
  state: AppState
  onClose: () => void
  onSelectStyle: (styleId: CharacterStyleId) => void
  onSelectTool: (tool: ToolId) => void
  onSelectCharacter: (selected: boolean) => void
  onToggleWireframe: () => void
  onToggleGrid: () => void
  onToggleAutoRotate: () => void
  onSelectCameraPreset: (preset: CameraPreset) => void
  onSelectMaterialColor: (color: string) => void
  onSelectEyeColor: (color: string) => void
  onUpdateTransform: (partial: Partial<TransformState>) => void
  onResetTransform: () => void
  onUpdateProportions: (partial: Partial<BodyProportions>) => void
  onResetProportions: () => void
  onClearMeasurement: () => void
}

const EYE_SWATCHES = [
  { color: '#5c4033', label: 'Castanho Escuro' },
  { color: '#8b5a2b', label: 'Âmbar / Mel' },
  { color: '#2e6f40', label: 'Verde Esmeralda' },
  { color: '#2563eb', label: 'Azul Oceano' },
  { color: '#4f46e5', label: 'Violeta Anime' },
  { color: '#dc2626', label: 'Carmesim Anime' },
]

export default function PropertiesPanel({
  state,
  onClose,
  onSelectStyle,
  onSelectTool,
  onSelectCharacter,
  onToggleWireframe,
  onToggleGrid,
  onToggleAutoRotate,
  onSelectCameraPreset,
  onSelectMaterialColor,
  onSelectEyeColor,
  onUpdateTransform,
  onResetTransform,
  onUpdateProportions,
  onResetProportions,
  onClearMeasurement,
}: PropertiesPanelProps) {
  const formatNumber = (n: number) => n.toLocaleString('pt-BR')
  const styleCfg = CHARACTER_STYLES[state.styleId]

  const { pointA, pointB } = state.measurement
  const measuredDistance =
    pointA && pointB
      ? Math.hypot(
          pointB[0] - pointA[0],
          pointB[1] - pointA[1],
          pointB[2] - pointA[2]
        )
      : null

  const handleScaleAxisChange = (axisIndex: 0 | 1 | 2, val: number) => {
    const clamped = Math.max(0.2, Math.min(3.0, val))
    if (state.transform.uniformScale) {
      onUpdateTransform({ scale: [clamped, clamped, clamped] })
    } else {
      const next: [number, number, number] = [...state.transform.scale]
      next[axisIndex] = clamped
      onUpdateTransform({ scale: next })
    }
  }

  return (
    <aside
      className={`panel ${state.panelOpen ? 'panel--open' : ''}`}
      aria-label="Inspetor de Propriedades"
    >
      <div className="panel__header">
        <span className="panel__title">Inspetor do Personagem</span>
        <button className="panel__close" onClick={onClose} aria-label="Fechar painel">
          ✕
        </button>
      </div>

      <div className="panel__body">
        {/* 1. Style & Base Model Architecture (Realistic vs Anime vs Prototype) */}
        <div className="panel__section">
          <div className="panel__section-title">Estilo e Modelo 3D</div>
          <div className="panel__style-cards">
            {(Object.keys(CHARACTER_STYLES) as CharacterStyleId[]).map((id) => {
              const cfg = CHARACTER_STYLES[id]
              const active = state.styleId === id
              return (
                <button
                  key={id}
                  className={`panel__style-card ${
                    active ? 'panel__style-card--active' : ''
                  }`}
                  onClick={() => onSelectStyle(id)}
                >
                  <div className="panel__style-card-top">
                    <span className="panel__style-name">{cfg.name}</span>
                    <span className="panel__badge panel__badge--info">{cfg.badge}</span>
                  </div>
                  <p className="panel__style-desc">{cfg.description}</p>
                </button>
              )
            })}
          </div>

          <div className="panel__info-row">
            <span className="panel__info-label">Arquivo GLB</span>
            <span className="panel__info-value">
              {styleCfg.modelUrl.replace('/models/', '')}
            </span>
          </div>
          <div className="panel__info-row">
            <span className="panel__info-label">Status</span>
            <span
              className={`panel__badge ${
                state.modelLoaded ? 'panel__badge--success' : 'panel__badge--warning'
              }`}
            >
              {state.modelLoaded ? '● Em Pé no Piso (Y=0)' : '◌ Carregando...'}
            </span>
          </div>
          <div className="panel__info-row">
            <span className="panel__info-label">Vértices / Faces</span>
            <span className="panel__info-value">
              {state.modelLoaded
                ? `${formatNumber(state.metrics.vertices)} / ${formatNumber(
                    state.metrics.faces
                  )}`
                : '—'}
            </span>
          </div>
          <div className="panel__info-row">
            <span className="panel__info-label">Shape Keys (Morphs)</span>
            <span className="panel__info-value">
              {state.metrics.morphTargetCount > 0
                ? `${state.metrics.morphTargetCount} ativos`
                : 'Deformação Axial'}
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

        {/* 2. Camera Angles (All 7 required views) */}
        <div className="panel__section">
          <div className="panel__section-title">Ângulos de Câmera</div>
          <div className="panel__cam-controls">
            <button
              className={`panel__cam-btn ${
                state.cameraPreset === 'fullbody' ? 'panel__cam-btn--active' : ''
              }`}
              onClick={() => onSelectCameraPreset('fullbody')}
              style={{ gridColumn: 'span 2' }}
            >
              Corpo Inteiro (Perspectiva)
            </button>
            <button
              className={`panel__cam-btn ${
                state.cameraPreset === 'front' ? 'panel__cam-btn--active' : ''
              }`}
              onClick={() => onSelectCameraPreset('front')}
            >
              Frente
            </button>
            <button
              className={`panel__cam-btn ${
                state.cameraPreset === 'back' ? 'panel__cam-btn--active' : ''
              }`}
              onClick={() => onSelectCameraPreset('back')}
            >
              Costas
            </button>
            <button
              className={`panel__cam-btn ${
                state.cameraPreset === 'left' ? 'panel__cam-btn--active' : ''
              }`}
              onClick={() => onSelectCameraPreset('left')}
            >
              Perfil Esquerdo
            </button>
            <button
              className={`panel__cam-btn ${
                state.cameraPreset === 'right' ? 'panel__cam-btn--active' : ''
              }`}
              onClick={() => onSelectCameraPreset('right')}
            >
              Perfil Direito
            </button>
            <button
              className={`panel__cam-btn ${
                state.cameraPreset === 'face' ? 'panel__cam-btn--active' : ''
              }`}
              onClick={() => onSelectCameraPreset('face')}
            >
              Aproximar Rosto
            </button>
            <button
              className={`panel__cam-btn ${
                state.cameraPreset === 'top' ? 'panel__cam-btn--active' : ''
              }`}
              onClick={() => onSelectCameraPreset('top')}
            >
              Visão Superior
            </button>
          </div>
        </div>

        {/* 3. Display & Viewport Controls */}
        <div className="panel__section">
          <div className="panel__section-title">Visualização da Cena</div>
          <div className="panel__cam-controls">
            <button
              className={`panel__cam-btn ${
                state.wireframe ? 'panel__cam-btn--active' : ''
              }`}
              onClick={onToggleWireframe}
            >
              Wireframe
            </button>
            <button
              className={`panel__cam-btn ${
                state.showGrid ? 'panel__cam-btn--active' : ''
              }`}
              onClick={onToggleGrid}
            >
              Grade do Piso
            </button>
            <button
              className={`panel__cam-btn ${
                state.autoRotate ? 'panel__cam-btn--active' : ''
              }`}
              onClick={onToggleAutoRotate}
              style={{ gridColumn: 'span 2' }}
            >
              Rotação Contínua (Turntable)
            </button>
          </div>
        </div>

        {/* 4. Skin & Eye Color Customization */}
        <div className="panel__section">
          <div className="panel__section-title">Tom de Pele e Material</div>
          <div className="panel__swatches">
            {styleCfg.swatches.map((swatch) => (
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

          {state.styleId !== 'prototype' && (
            <>
              <div
                className="panel__section-title"
                style={{ marginTop: '10px' }}
              >
                Cor da Íris (Olhos)
              </div>
              <div className="panel__swatches">
                {EYE_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.color}
                    className={`panel__swatch ${
                      state.eyeColor === swatch.color ? 'panel__swatch--active' : ''
                    }`}
                    style={{ backgroundColor: swatch.color }}
                    onClick={() => onSelectEyeColor(swatch.color)}
                    title={swatch.label}
                    aria-label={swatch.label}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* 5. Body Proportions (Real Morph Targets + Height) */}
        <div className="panel__section">
          <div className="panel__section-header-row">
            <span className="panel__section-title" style={{ marginBottom: 0 }}>
              Proporções Corporais
            </span>
            <button className="panel__mini-btn" onClick={onResetProportions}>
              Padrão
            </button>
          </div>

          <div className="panel__slider-group">
            <div className="panel__slider-label">
              <span>Altura Total</span>
              <span className="panel__slider-val">
                {state.proportions.heightMeters.toFixed(2)} m
              </span>
            </div>
            <input
              type="range"
              min="1.45"
              max="2.10"
              step="0.01"
              value={state.proportions.heightMeters}
              onChange={(e) =>
                onUpdateProportions({ heightMeters: Number(e.target.value) })
              }
              className="panel__slider"
            />
          </div>

          <div className="panel__slider-group">
            <div className="panel__slider-label">
              <span>Largura dos Ombros</span>
              <span className="panel__slider-val">
                {Math.round(state.proportions.shoulderWidth * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.05"
              value={state.proportions.shoulderWidth}
              onChange={(e) =>
                onUpdateProportions({ shoulderWidth: Number(e.target.value) })
              }
              className="panel__slider"
            />
          </div>

          <div className="panel__slider-group">
            <div className="panel__slider-label">
              <span>Largura do Tronco</span>
              <span className="panel__slider-val">
                {Math.round(state.proportions.torsoWidth * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.05"
              value={state.proportions.torsoWidth}
              onChange={(e) =>
                onUpdateProportions({ torsoWidth: Number(e.target.value) })
              }
              className="panel__slider"
            />
          </div>

          <div className="panel__slider-group">
            <div className="panel__slider-label">
              <span>Comprimento dos Braços</span>
              <span className="panel__slider-val">
                {Math.round(state.proportions.armLength * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.05"
              value={state.proportions.armLength}
              onChange={(e) =>
                onUpdateProportions({ armLength: Number(e.target.value) })
              }
              className="panel__slider"
            />
          </div>

          <div className="panel__slider-group">
            <div className="panel__slider-label">
              <span>Comprimento das Pernas</span>
              <span className="panel__slider-val">
                {Math.round(state.proportions.legLength * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.05"
              value={state.proportions.legLength}
              onChange={(e) =>
                onUpdateProportions({ legLength: Number(e.target.value) })
              }
              className="panel__slider"
            />
          </div>

          {styleCfg.supportsMorphTargets && (
            <div className="panel__slider-group">
              <div className="panel__slider-label">
                <span>Definição Muscular</span>
                <span className="panel__slider-val">
                  {Math.round(state.proportions.muscleTone * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={state.proportions.muscleTone}
                onChange={(e) =>
                  onUpdateProportions({ muscleTone: Number(e.target.value) })
                }
                className="panel__slider"
              />
            </div>
          )}
        </div>

        {/* 6. Active Tool & Transform Controls (Select, Move, Rotate, Scale, Measure) */}
        <div className="panel__section">
          <div className="panel__section-header-row">
            <span className="panel__section-title" style={{ marginBottom: 0 }}>
              Transformação e Ferramentas
            </span>
            <button className="panel__mini-btn" onClick={onResetTransform}>
              Resetar
            </button>
          </div>

          <div className="panel__info-row">
            <span className="panel__info-label">Seleção na Cena</span>
            <button
              className={`panel__mini-btn ${
                state.isSelected ? 'panel__mini-btn--active' : ''
              }`}
              onClick={() => onSelectCharacter(!state.isSelected)}
            >
              {state.isSelected ? '✓ Personagem Selecionado' : 'Não Selecionado'}
            </button>
          </div>

          {/* Tool quick buttons */}
          <div className="panel__cam-controls" style={{ marginTop: '6px' }}>
            <button
              className={`panel__cam-btn ${
                state.activeTool === 'move' ? 'panel__cam-btn--active' : ''
              }`}
              onClick={() => onSelectTool('move')}
            >
              Mover (X/Y/Z)
            </button>
            <button
              className={`panel__cam-btn ${
                state.activeTool === 'rotate' ? 'panel__cam-btn--active' : ''
              }`}
              onClick={() => onSelectTool('rotate')}
            >
              Rotacionar
            </button>
            <button
              className={`panel__cam-btn ${
                state.activeTool === 'scale' ? 'panel__cam-btn--active' : ''
              }`}
              onClick={() => onSelectTool('scale')}
            >
              Escalar
            </button>
            <button
              className={`panel__cam-btn ${
                state.activeTool === 'measure' ? 'panel__cam-btn--active' : ''
              }`}
              onClick={() => onSelectTool('measure')}
            >
              Medir (2 pts)
            </button>
          </div>

          {/* Position X, Y, Z */}
          <div className="panel__transform-block">
            <div className="panel__transform-title">Posição (metros)</div>
            <div className="panel__xyz-grid">
              {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
                <label key={axis} className="panel__xyz-field">
                  <span className={`panel__xyz-tag panel__xyz-tag--${axis.toLowerCase()}`}>
                    {axis}
                  </span>
                  <input
                    type="number"
                    step="0.05"
                    value={state.transform.position[idx]}
                    onChange={(e) => {
                      const next: [number, number, number] = [
                        ...state.transform.position,
                      ]
                      next[idx] = Number(e.target.value)
                      onUpdateTransform({ position: next })
                    }}
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Rotation X, Y, Z */}
          <div className="panel__transform-block">
            <div className="panel__transform-title">Rotação (graus °)</div>
            <div className="panel__xyz-grid">
              {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
                <label key={axis} className="panel__xyz-field">
                  <span className={`panel__xyz-tag panel__xyz-tag--${axis.toLowerCase()}`}>
                    {axis}
                  </span>
                  <input
                    type="number"
                    step="5"
                    value={state.transform.rotation[idx]}
                    onChange={(e) => {
                      const next: [number, number, number] = [
                        ...state.transform.rotation,
                      ]
                      next[idx] = Number(e.target.value)
                      onUpdateTransform({ rotation: next })
                    }}
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Scale X, Y, Z + Uniform Toggle */}
          <div className="panel__transform-block">
            <div className="panel__transform-title">
              <span>Escala</span>
              <label className="panel__checkbox-label">
                <input
                  type="checkbox"
                  checked={state.transform.uniformScale}
                  onChange={(e) =>
                    onUpdateTransform({ uniformScale: e.target.checked })
                  }
                />
                Uniforme
              </label>
            </div>
            <div className="panel__xyz-grid">
              {(['X', 'Y', 'Z'] as const).map((axis, idx) => (
                <label key={axis} className="panel__xyz-field">
                  <span className={`panel__xyz-tag panel__xyz-tag--${axis.toLowerCase()}`}>
                    {axis}
                  </span>
                  <input
                    type="number"
                    step="0.05"
                    min="0.2"
                    max="3.0"
                    value={state.transform.scale[idx]}
                    onChange={(e) =>
                      handleScaleAxisChange(
                        idx as 0 | 1 | 2,
                        Number(e.target.value)
                      )
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* 7. Measurement Tool Inspector */}
        <div className="panel__section">
          <div className="panel__section-header-row">
            <span className="panel__section-title" style={{ marginBottom: 0 }}>
              Régua de Medição 3D
            </span>
            {(pointA || pointB) && (
              <button className="panel__mini-btn" onClick={onClearMeasurement}>
                Limpar
              </button>
            )}
          </div>

          <div className="panel__info-row">
            <span className="panel__info-label">Ponto A (Inicial)</span>
            <span className="panel__info-value">
              {pointA
                ? `(${pointA[0].toFixed(2)}, ${pointA[1].toFixed(2)}, ${pointA[2].toFixed(2)})`
                : 'Clique na malha'}
            </span>
          </div>
          <div className="panel__info-row">
            <span className="panel__info-label">Ponto B (Final)</span>
            <span className="panel__info-value">
              {pointB
                ? `(${pointB[0].toFixed(2)}, ${pointB[1].toFixed(2)}, ${pointB[2].toFixed(2)})`
                : 'Clique no 2º ponto'}
            </span>
          </div>
          <div className="panel__info-row">
            <span className="panel__info-label">Distância Real</span>
            <span className="panel__info-value" style={{ color: '#4ade80', fontWeight: 700 }}>
              {measuredDistance !== null
                ? `${measuredDistance.toFixed(3)} m (${(measuredDistance * 100).toFixed(1)} cm)`
                : '—'}
            </span>
          </div>
        </div>
      </div>
    </aside>
  )
}
