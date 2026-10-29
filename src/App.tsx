import { useState, useCallback, useEffect } from 'react'
import Header from './components/Header'
import Toolbar from './components/Toolbar'
import Viewport from './components/Viewport'
import PropertiesPanel from './components/PropertiesPanel'
import StatusBar from './components/StatusBar'
import { CHARACTER_STYLES, type CharacterStyleId } from './config/characterStyles'

export type ToolId = 'select' | 'move' | 'rotate' | 'scale' | 'sculpt' | 'measure'

export type CameraPreset =
  | 'fullbody'
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'top'
  | 'face'

export interface ModelMetrics {
  vertices: number
  faces: number
  meshes: number
  morphTargetCount: number
  height: number
  width: number
  depth: number
}

export interface TransformState {
  position: [number, number, number]
  rotation: [number, number, number] // degrees [x, y, z]
  scale: [number, number, number]
  uniformScale: boolean
}

export interface BodyProportions {
  heightMeters: number
  shoulderWidth: number // -1 to 1
  torsoWidth: number // -1 to 1
  armLength: number // -1 to 1
  legLength: number // -1 to 1
  muscleTone: number // 0 to 1
}

export interface MeasurementState {
  pointA: [number, number, number] | null
  pointB: [number, number, number] | null
}

export interface AppState {
  styleId: CharacterStyleId
  activeTool: ToolId
  isSelected: boolean
  panelOpen: boolean
  wireframe: boolean
  showGrid: boolean
  autoRotate: boolean
  materialColor: string
  eyeColor: string
  cameraPreset: CameraPreset
  cameraTrigger: number
  modelLoaded: boolean
  metrics: ModelMetrics
  transform: TransformState
  proportions: BodyProportions
  measurement: MeasurementState
}

const DEFAULT_TRANSFORM: TransformState = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  uniformScale: true,
}

function getDefaultProportions(styleId: CharacterStyleId): BodyProportions {
  return {
    heightMeters: CHARACTER_STYLES[styleId].defaultHeightMeters,
    shoulderWidth: 0,
    torsoWidth: 0,
    armLength: 0,
    legLength: 0,
    muscleTone: styleId === 'realistic' ? 0.25 : 0,
  }
}

export default function App() {
  const [state, setState] = useState<AppState>({
    styleId: 'realistic',
    activeTool: 'select',
    isSelected: true,
    panelOpen: true,
    wireframe: false,
    showGrid: true,
    autoRotate: false,
    materialColor: CHARACTER_STYLES.realistic.defaultSkinColor,
    eyeColor: CHARACTER_STYLES.realistic.eyeIrisColor,
    cameraPreset: 'fullbody',
    cameraTrigger: 0,
    modelLoaded: false,
    metrics: {
      vertices: 0,
      faces: 0,
      meshes: 0,
      morphTargetCount: 0,
      height: 1.8,
      width: 1.14,
      depth: 0.46,
    },
    transform: DEFAULT_TRANSFORM,
    proportions: getDefaultProportions('realistic'),
    measurement: {
      pointA: null,
      pointB: null,
    },
  })

  const setTool = useCallback((tool: ToolId) => {
    setState((s) => ({
      ...s,
      activeTool: tool,
      isSelected: tool === 'move' || tool === 'rotate' || tool === 'scale' ? true : s.isSelected,
    }))
  }, [])

  const setSelected = useCallback((isSelected: boolean) => {
    setState((s) => ({ ...s, isSelected }))
  }, [])

  const setStyleId = useCallback((styleId: CharacterStyleId) => {
    const cfg = CHARACTER_STYLES[styleId]
    setState((s) => ({
      ...s,
      styleId,
      modelLoaded: false,
      materialColor: cfg.defaultSkinColor,
      eyeColor: cfg.eyeIrisColor,
      proportions: getDefaultProportions(styleId),
      transform: DEFAULT_TRANSFORM,
    }))
  }, [])

  const togglePanel = useCallback(() => {
    setState((s) => ({ ...s, panelOpen: !s.panelOpen }))
  }, [])

  const toggleWireframe = useCallback(() => {
    setState((s) => ({ ...s, wireframe: !s.wireframe }))
  }, [])

  const toggleGrid = useCallback(() => {
    setState((s) => ({ ...s, showGrid: !s.showGrid }))
  }, [])

  const toggleAutoRotate = useCallback(() => {
    setState((s) => ({ ...s, autoRotate: !s.autoRotate }))
  }, [])

  const setMaterialColor = useCallback((materialColor: string) => {
    setState((s) => ({ ...s, materialColor }))
  }, [])

  const setEyeColor = useCallback((eyeColor: string) => {
    setState((s) => ({ ...s, eyeColor }))
  }, [])

  const selectCameraPreset = useCallback((preset: CameraPreset) => {
    setState((s) => ({
      ...s,
      cameraPreset: preset,
      cameraTrigger: s.cameraTrigger + 1,
    }))
  }, [])

  const onModelLoaded = useCallback((metrics: ModelMetrics) => {
    setState((s) => ({
      ...s,
      modelLoaded: true,
      metrics,
    }))
  }, [])

  const updateTransform = useCallback((partial: Partial<TransformState>) => {
    setState((s) => ({
      ...s,
      transform: { ...s.transform, ...partial },
    }))
  }, [])

  const resetTransform = useCallback(() => {
    setState((s) => ({
      ...s,
      transform: DEFAULT_TRANSFORM,
    }))
  }, [])

  const updateProportions = useCallback((partial: Partial<BodyProportions>) => {
    setState((s) => ({
      ...s,
      proportions: { ...s.proportions, ...partial },
    }))
  }, [])

  const resetProportions = useCallback(() => {
    setState((s) => ({
      ...s,
      proportions: getDefaultProportions(s.styleId),
    }))
  }, [])

  const addMeasurePoint = useCallback((pt: [number, number, number]) => {
    setState((s) => {
      if (!s.measurement.pointA || (s.measurement.pointA && s.measurement.pointB)) {
        return {
          ...s,
          measurement: { pointA: pt, pointB: null },
        }
      }
      return {
        ...s,
        measurement: { ...s.measurement, pointB: pt },
      }
    })
  }, [])

  const clearMeasurement = useCallback(() => {
    setState((s) => ({
      ...s,
      measurement: { pointA: null, pointB: null },
    }))
  }, [])

  // Global keyboard shortcuts (Q, W, E, R, B, M)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const key = e.key.toLowerCase()
      if (key === 'q') setTool('select')
      else if (key === 'w') setTool('move')
      else if (key === 'e') setTool('rotate')
      else if (key === 'r') setTool('scale')
      else if (key === 'b') setTool('sculpt')
      else if (key === 'm') setTool('measure')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setTool])

  return (
    <div className="app-layout">
      <Header
        styleId={state.styleId}
        onSelectStyle={setStyleId}
        onResetCamera={() => selectCameraPreset('fullbody')}
        autoRotate={state.autoRotate}
        onToggleAutoRotate={toggleAutoRotate}
      />

      <div className="main-area">
        <Toolbar activeTool={state.activeTool} onSelectTool={setTool} />

        <Viewport
          state={state}
          onSelectCameraPreset={selectCameraPreset}
          onModelLoaded={onModelLoaded}
          onSelectCharacter={setSelected}
          onUpdateTransform={updateTransform}
          onAddMeasurePoint={addMeasurePoint}
          onClearMeasurement={clearMeasurement}
        />

        <PropertiesPanel
          state={state}
          onClose={togglePanel}
          onSelectStyle={setStyleId}
          onSelectTool={setTool}
          onSelectCharacter={setSelected}
          onToggleWireframe={toggleWireframe}
          onToggleGrid={toggleGrid}
          onToggleAutoRotate={toggleAutoRotate}
          onSelectCameraPreset={selectCameraPreset}
          onSelectMaterialColor={setMaterialColor}
          onSelectEyeColor={setEyeColor}
          onUpdateTransform={updateTransform}
          onResetTransform={resetTransform}
          onUpdateProportions={updateProportions}
          onResetProportions={resetProportions}
          onClearMeasurement={clearMeasurement}
        />
      </div>

      <StatusBar state={state} />

      <button
        className="mobile-panel-toggle"
        onClick={togglePanel}
        aria-label="Alternar painel de propriedades"
        title="Propriedades"
      >
        {state.panelOpen ? '✕' : '⚙'}
      </button>
    </div>
  )
}
