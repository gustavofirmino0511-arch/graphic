import { useState, useCallback, useEffect } from 'react'
import Header from './components/Header'
import Toolbar from './components/Toolbar'
import Viewport from './components/Viewport'
import PropertiesPanel from './components/PropertiesPanel'
import StatusBar from './components/StatusBar'
import { CHARACTER_STYLES, type CharacterStyleId } from './config/characterStyles'
import {
  BODY_PRESETS,
  DEFAULT_FACIAL_PROPORTIONS,
  FACE_PRESETS,
  GENERAL_CHARACTER_PRESETS,
  computeProportionsFromBodyMass,
  type BodyPresetId,
  type BrushSettings,
  type ExtendedBodyProportions,
  type FacePresetId,
  type FacialProportions,
  type GeneralPresetId,
} from './systems/bodyEditorSystem'
import {
  DEFAULT_JOINT_POSE,
  type JointPoseState,
} from './systems/skeletonSystem'
import type {
  PerformanceQuality,
  SkeletonDisplayMode,
} from './systems/anatomicalSkeletonSystem'

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
  skeletonJointCount: number
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

export type BodyProportions = ExtendedBodyProportions

export interface MeasurementState {
  pointA: [number, number, number] | null
  pointB: [number, number, number] | null
}

export interface SculptHistoryMeta {
  undoSteps: number
  redoSteps: number
  undoTrigger: number
  redoTrigger: number
  resetSculptTrigger: number
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
  bodyMass: number // -1 (extreme skeletal emaciation) to +1 (heavy/fat)
  proportions: BodyProportions
  faceProportions: FacialProportions
  jointPose: JointPoseState
  skeletonDisplayMode: SkeletonDisplayMode
  skeletonOpacity: number
  performanceQuality: PerformanceQuality
  brush: BrushSettings
  sculptHistory: SculptHistoryMeta
  measurement: MeasurementState
}

const DEFAULT_TRANSFORM: TransformState = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  uniformScale: true,
}

const DEFAULT_BRUSH: BrushSettings = {
  enabled: true,
  mode: 'inflate',
  radius: 0.08,
  strength: 0.45,
  symmetryX: true,
  protectFacialStructures: true,
  protectExtremities: true,
  facialFineMode: true,
}

function getDefaultProportions(styleId: CharacterStyleId): BodyProportions {
  return {
    heightMeters: CHARACTER_STYLES[styleId].defaultHeightMeters,
    ...BODY_PRESETS.default.values,
    muscleTone: styleId === 'realistic' ? 0.25 : 0,
  }
}

export default function App() {
  const [state, setState] = useState<AppState>({
    styleId: 'realistic',
    activeTool: 'sculpt',
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
      skeletonJointCount: 20,
      height: 1.8,
      width: 1.14,
      depth: 0.46,
    },
    transform: DEFAULT_TRANSFORM,
    bodyMass: 0,
    proportions: getDefaultProportions('realistic'),
    faceProportions: DEFAULT_FACIAL_PROPORTIONS,
    jointPose: DEFAULT_JOINT_POSE,
    skeletonDisplayMode: 'auto',
    skeletonOpacity: 0.88,
    performanceQuality: 'balanced',
    brush: DEFAULT_BRUSH,
    sculptHistory: {
      undoSteps: 0,
      redoSteps: 0,
      undoTrigger: 0,
      redoTrigger: 0,
      resetSculptTrigger: 0,
    },
    measurement: {
      pointA: null,
      pointB: null,
    },
  })

  const setTool = useCallback((tool: ToolId) => {
    setState((s) => ({
      ...s,
      activeTool: tool,
      isSelected:
        tool === 'move' || tool === 'rotate' || tool === 'scale' || tool === 'sculpt'
          ? true
          : s.isSelected,
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
      bodyMass: 0,
      proportions: getDefaultProportions(styleId),
      faceProportions: DEFAULT_FACIAL_PROPORTIONS,
      jointPose: {
        ...DEFAULT_JOINT_POSE,
        showSkeleton: s.jointPose.showSkeleton,
      },
      transform: DEFAULT_TRANSFORM,
      sculptHistory: {
        undoSteps: 0,
        redoSteps: 0,
        undoTrigger: 0,
        redoTrigger: 0,
        resetSculptTrigger: s.sculptHistory.resetSculptTrigger + 1,
      },
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

  const applyBodyPreset = useCallback((presetId: BodyPresetId) => {
    const preset = BODY_PRESETS[presetId]
    setState((s) => ({
      ...s,
      proportions: {
        ...s.proportions,
        ...preset.values,
      },
    }))
  }, [])

  const resetProportions = useCallback(() => {
    setState((s) => ({
      ...s,
      bodyMass: 0,
      proportions: getDefaultProportions(s.styleId),
    }))
  }, [])

  const applyGeneralPreset = useCallback((presetId: GeneralPresetId) => {
    const preset = GENERAL_CHARACTER_PRESETS[presetId]
    if (!preset) return
    setState((s) => ({
      ...s,
      bodyMass: preset.bodyMass,
      proportions: {
        ...s.proportions,
        ...preset.body,
      },
      faceProportions: {
        ...preset.face,
      },
    }))
  }, [])

  const updateBodyMass = useCallback((bodyMass: number) => {
    setState((s) => {
      const computed = computeProportionsFromBodyMass(bodyMass, s.proportions.heightMeters)
      return {
        ...s,
        bodyMass,
        proportions: computed.body,
        faceProportions: computed.face,
      }
    })
  }, [])

  const setSkeletonDisplayMode = useCallback((skeletonDisplayMode: SkeletonDisplayMode) => {
    setState((s) => ({ ...s, skeletonDisplayMode }))
  }, [])

  const setSkeletonOpacity = useCallback((skeletonOpacity: number) => {
    setState((s) => ({ ...s, skeletonOpacity }))
  }, [])

  const setPerformanceQuality = useCallback((performanceQuality: PerformanceQuality) => {
    setState((s) => ({ ...s, performanceQuality }))
  }, [])

  const updateFaceProportions = useCallback((partial: Partial<FacialProportions>) => {
    setState((s) => ({
      ...s,
      faceProportions: { ...s.faceProportions, ...partial },
    }))
  }, [])

  const applyFacePreset = useCallback((presetId: FacePresetId) => {
    const preset = FACE_PRESETS[presetId]
    if (!preset) return
    setState((s) => ({
      ...s,
      faceProportions: { ...preset.values },
    }))
  }, [])

  const resetFaceProportions = useCallback(() => {
    setState((s) => ({
      ...s,
      faceProportions: DEFAULT_FACIAL_PROPORTIONS,
    }))
  }, [])

  const updateJointPose = useCallback((partial: Partial<JointPoseState>) => {
    setState((s) => ({
      ...s,
      jointPose: { ...s.jointPose, ...partial },
    }))
  }, [])

  const resetJointPose = useCallback(() => {
    setState((s) => ({
      ...s,
      jointPose: {
        ...DEFAULT_JOINT_POSE,
        showSkeleton: s.jointPose.showSkeleton,
      },
    }))
  }, [])

  const updateBrush = useCallback((partial: Partial<BrushSettings>) => {
    setState((s) => ({
      ...s,
      brush: { ...s.brush, ...partial },
    }))
  }, [])

  const onSculptHistoryChange = useCallback((undoSteps: number, redoSteps: number) => {
    setState((s) => ({
      ...s,
      sculptHistory: {
        ...s.sculptHistory,
        undoSteps,
        redoSteps,
      },
    }))
  }, [])

  const triggerUndoSculpt = useCallback(() => {
    setState((s) => {
      if (s.sculptHistory.undoSteps <= 0) return s
      return {
        ...s,
        sculptHistory: {
          ...s.sculptHistory,
          undoTrigger: s.sculptHistory.undoTrigger + 1,
        },
      }
    })
  }, [])

  const triggerRedoSculpt = useCallback(() => {
    setState((s) => {
      if (s.sculptHistory.redoSteps <= 0) return s
      return {
        ...s,
        sculptHistory: {
          ...s.sculptHistory,
          redoTrigger: s.sculptHistory.redoTrigger + 1,
        },
      }
    })
  }, [])

  const triggerResetSculpt = useCallback(() => {
    setState((s) => ({
      ...s,
      sculptHistory: {
        ...s.sculptHistory,
        undoSteps: 0,
        redoSteps: 0,
        resetSculptTrigger: s.sculptHistory.resetSculptTrigger + 1,
      },
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

  // Global keyboard shortcuts (Q, W, E, R, B, M, Ctrl+Z, Ctrl+Y)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) triggerRedoSculpt()
        else triggerUndoSculpt()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        triggerRedoSculpt()
        return
      }

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
  }, [setTool, triggerUndoSculpt, triggerRedoSculpt])

  return (
    <div className="app-layout">
      <Header
        styleId={state.styleId}
        activeTool={state.activeTool}
        onSelectStyle={setStyleId}
        onSelectTool={setTool}
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
          onUpdateBrush={updateBrush}
          onSetSkeletonDisplayMode={setSkeletonDisplayMode}
          onSculptHistoryChange={onSculptHistoryChange}
          onUndoSculpt={triggerUndoSculpt}
          onRedoSculpt={triggerRedoSculpt}
          onResetSculpt={triggerResetSculpt}
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
          onApplyGeneralPreset={applyGeneralPreset}
          onUpdateBodyMass={updateBodyMass}
          onUpdateProportions={updateProportions}
          onApplyBodyPreset={applyBodyPreset}
          onResetProportions={resetProportions}
          onUpdateFaceProportions={updateFaceProportions}
          onApplyFacePreset={applyFacePreset}
          onResetFaceProportions={resetFaceProportions}
          onUpdateJointPose={updateJointPose}
          onResetJointPose={resetJointPose}
          onSetSkeletonDisplayMode={setSkeletonDisplayMode}
          onSetSkeletonOpacity={setSkeletonOpacity}
          onSetPerformanceQuality={setPerformanceQuality}
          onUpdateBrush={updateBrush}
          onUndoSculpt={triggerUndoSculpt}
          onRedoSculpt={triggerRedoSculpt}
          onResetSculpt={triggerResetSculpt}
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
