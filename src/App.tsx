import { useState } from 'react'
import Header from './components/Header'
import Toolbar from './components/Toolbar'
import Viewport from './components/Viewport'
import PropertiesPanel from './components/PropertiesPanel'
import StatusBar from './components/StatusBar'

export type ToolId = 'select' | 'move' | 'rotate' | 'scale' | 'sculpt' | 'measure'

export type CameraPreset = 'perspective' | 'front' | 'side' | 'back' | 'head' | 'top'

export interface ModelMetrics {
  vertices: number
  faces: number
  meshes: number
  height: number
  width: number
  depth: number
}

export interface AppState {
  activeTool: ToolId
  panelOpen: boolean
  wireframe: boolean
  showGrid: boolean
  autoRotate: boolean
  materialColor: string
  cameraPreset: CameraPreset
  cameraTrigger: number
  modelLoaded: boolean
  modelError: string | null
  metrics: ModelMetrics
}

export default function App() {
  const [state, setState] = useState<AppState>({
    activeTool: 'select',
    panelOpen: true,
    wireframe: false,
    showGrid: true,
    autoRotate: false,
    materialColor: '#c8a98e',
    cameraPreset: 'perspective',
    cameraTrigger: 0,
    modelLoaded: false,
    modelError: null,
    metrics: {
      vertices: 0,
      faces: 0,
      meshes: 0,
      height: 0,
      width: 0,
      depth: 0,
    },
  })

  const setTool = (tool: ToolId) => setState((s) => ({ ...s, activeTool: tool }))
  const togglePanel = () => setState((s) => ({ ...s, panelOpen: !s.panelOpen }))
  const toggleWireframe = () => setState((s) => ({ ...s, wireframe: !s.wireframe }))
  const toggleGrid = () => setState((s) => ({ ...s, showGrid: !s.showGrid }))
  const toggleAutoRotate = () => setState((s) => ({ ...s, autoRotate: !s.autoRotate }))
  const setMaterialColor = (materialColor: string) =>
    setState((s) => ({ ...s, materialColor }))

  const selectCameraPreset = (preset: CameraPreset) =>
    setState((s) => ({
      ...s,
      cameraPreset: preset,
      cameraTrigger: s.cameraTrigger + 1,
    }))

  const onModelLoaded = (metrics: ModelMetrics) =>
    setState((s) => ({
      ...s,
      modelLoaded: true,
      modelError: null,
      metrics,
    }))

  return (
    <div className="app-layout">
      <Header
        onResetCamera={() => selectCameraPreset('perspective')}
        autoRotate={state.autoRotate}
        onToggleAutoRotate={toggleAutoRotate}
      />

      <div className="main-area">
        <Toolbar activeTool={state.activeTool} onSelectTool={setTool} />

        <Viewport
          wireframe={state.wireframe}
          showGrid={state.showGrid}
          autoRotate={state.autoRotate}
          materialColor={state.materialColor}
          cameraPreset={state.cameraPreset}
          cameraTrigger={state.cameraTrigger}
          onSelectCameraPreset={selectCameraPreset}
          onModelLoaded={onModelLoaded}
        />

        <PropertiesPanel
          state={state}
          onClose={togglePanel}
          onToggleWireframe={toggleWireframe}
          onToggleGrid={toggleGrid}
          onToggleAutoRotate={toggleAutoRotate}
          onSelectCameraPreset={selectCameraPreset}
          onSelectMaterialColor={setMaterialColor}
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
