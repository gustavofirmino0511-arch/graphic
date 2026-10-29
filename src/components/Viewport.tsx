import { Suspense, useRef, useEffect, useMemo } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  OrbitControls,
  ContactShadows,
  TransformControls,
  Line,
  Html,
  useGLTF,
} from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import type {
  AppState,
  CameraPreset,
  ModelMetrics,
  TransformState,
} from '../App'
import {
  CHARACTER_STYLES,
  createEyeTexture,
  createAnimeToonGradientMap,
} from '../config/characterStyles'

interface ViewportProps {
  state: AppState
  onSelectCameraPreset: (preset: CameraPreset) => void
  onModelLoaded: (metrics: ModelMetrics) => void
  onSelectCharacter: (selected: boolean) => void
  onUpdateTransform: (partial: Partial<TransformState>) => void
  onAddMeasurePoint: (pt: [number, number, number]) => void
  onClearMeasurement: () => void
}

const CAMERA_LABELS: Record<CameraPreset, string> = {
  fullbody: 'Corpo Inteiro',
  front: 'Frente',
  back: 'Costas',
  left: 'Perfil Esquerdo',
  right: 'Perfil Direito',
  top: 'Visão Superior',
  face: 'Rosto',
}

function getCameraPose(
  preset: CameraPreset,
  characterHeight: number
): { position: [number, number, number]; target: [number, number, number] } {
  const h = Math.max(1.2, characterHeight || 1.8)
  const midY = h * 0.52
  const headY = h * 0.9
  const dist = Math.max(2.5, h * 1.55)

  switch (preset) {
    case 'fullbody':
      return {
        position: [dist * 0.52, h * 0.68, dist * 0.95],
        target: [0, midY, 0],
      }
    case 'front':
      return {
        position: [0, midY, dist],
        target: [0, midY, 0],
      }
    case 'back':
      return {
        position: [0, midY, -dist],
        target: [0, midY, 0],
      }
    case 'left':
      // Character faces +Z, so anatomical left arm is on +X
      return {
        position: [dist, midY, 0],
        target: [0, midY, 0],
      }
    case 'right':
      // Character faces +Z, so anatomical right arm is on -X
      return {
        position: [-dist, midY, 0],
        target: [0, midY, 0],
      }
    case 'top':
      return {
        position: [0, h + 1.85, 0.25],
        target: [0, midY, 0],
      }
    case 'face':
      return {
        position: [0, headY + 0.02, 0.62],
        target: [0, headY, 0],
      }
  }
}

/**
 * Loads, normalizes orientation (fixing Z-up models like personagem_base_humano.glb),
 * aligns feet at Y = 0, applies realistic/anime materials, and drives morph targets.
 */
function CharacterMesh({
  state,
  onModelLoaded,
  onPointerDownCharacter,
}: {
  state: AppState
  onModelLoaded: (metrics: ModelMetrics) => void
  onPointerDownCharacter: (e: ThreeEvent<PointerEvent>) => void
}) {
  const styleCfg = CHARACTER_STYLES[state.styleId]
  const { scene: gltfScene } = useGLTF(styleCfg.modelUrl)
  const baseMetricsRef = useRef<{
    vertices: number
    faces: number
    meshes: number
    morphTargetCount: number
    baseHeight: number
    baseWidth: number
    baseDepth: number
  } | null>(null)

  const eyeTexture = useMemo(
    () => createEyeTexture(state.eyeColor, styleCfg.useToonShading),
    [state.eyeColor, styleCfg.useToonShading]
  )

  const toonGradient = useMemo(() => createAnimeToonGradientMap(), [])

  // Clone scene and normalize geometry orientation once per model URL
  const { clonedScene, bodyMeshes, eyeMeshes } = useMemo(() => {
    const root = gltfScene.clone(true)
    const bodies: THREE.Mesh[] = []
    const eyes: THREE.Mesh[] = []

    root.position.set(0, 0, 0)
    root.rotation.set(0, 0, 0)
    root.scale.set(1, 1, 1)
    root.updateMatrixWorld(true)

    // Measure raw bounds first to detect Z-up exported meshes (such as personagem_base_humano.glb)
    const rawBox = new THREE.Box3().setFromObject(root)
    const rawSize = rawBox.getSize(new THREE.Vector3())
    const isZUp = rawSize.z > rawSize.y * 1.4

    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry = child.geometry.clone()
        // Reset local node transform into geometry if needed
        if (isZUp) {
          // Convert Z-up (-Y forward) to Y-up (+Z forward) so character stands upright
          child.geometry.rotateX(-Math.PI / 2)
        }
        if (!child.geometry.attributes.normal) {
          child.geometry.computeVertexNormals()
        }
        // Save pristine base positions for fallback parametric proportions on meshes without morph targets
        if (child.geometry.attributes.position) {
          child.userData.basePositions = new Float32Array(
            child.geometry.attributes.position.array
          )
        }
        if (child.name.toLowerCase().includes('eye')) {
          eyes.push(child)
        } else {
          bodies.push(child)
        }
      }
    })

    // Recompute upright bounding box and align feet to Y = 0, centered on X and Z
    const uprightBox = new THREE.Box3().setFromObject(root)
    const center = uprightBox.getCenter(new THREE.Vector3())
    const minY = uprightBox.min.y

    if (Math.abs(center.x) > 0.0005 || Math.abs(minY) > 0.0005 || Math.abs(center.z) > 0.0005) {
      root.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.translate(-center.x, -minY, -center.z)
          if (child.geometry.attributes.position) {
            child.userData.basePositions = new Float32Array(
              child.geometry.attributes.position.array
            )
          }
        }
      })
    }

    return { clonedScene: root, bodyMeshes: bodies, eyeMeshes: eyes }
  }, [gltfScene])

  // Compute initial model metrics
  useEffect(() => {
    let totalVertices = 0
    let totalFaces = 0
    let morphTargetCount = 0

    const box = new THREE.Box3().setFromObject(clonedScene)
    const size = box.getSize(new THREE.Vector3())

    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const geo = child.geometry
        if (geo.attributes.position) {
          totalVertices += geo.attributes.position.count
        }
        if (geo.index) {
          totalFaces += Math.round(geo.index.count / 3)
        } else if (geo.attributes.position) {
          totalFaces += Math.round(geo.attributes.position.count / 3)
        }
        if (child.morphTargetInfluences) {
          morphTargetCount = Math.max(morphTargetCount, child.morphTargetInfluences.length)
        }
      }
    })

    const baseHeight = Math.max(0.1, size.y)
    const baseWidth = Math.max(0.1, size.x)
    const baseDepth = Math.max(0.1, size.z)

    baseMetricsRef.current = {
      vertices: totalVertices,
      faces: totalFaces,
      meshes: bodyMeshes.length + eyeMeshes.length,
      morphTargetCount,
      baseHeight,
      baseWidth,
      baseDepth,
    }

    onModelLoaded({
      vertices: totalVertices,
      faces: totalFaces,
      meshes: bodyMeshes.length + eyeMeshes.length,
      morphTargetCount,
      height: Number(state.proportions.heightMeters.toFixed(2)),
      width: Number(baseWidth.toFixed(2)),
      depth: Number(baseDepth.toFixed(2)),
    })
  }, [clonedScene, bodyMeshes, eyeMeshes, onModelLoaded, state.proportions.heightMeters])

  // Apply skin and eye materials
  useEffect(() => {
    for (const mesh of bodyMeshes) {
      if (styleCfg.useToonShading && !state.wireframe) {
        mesh.material = new THREE.MeshToonMaterial({
          color: new THREE.Color(state.materialColor),
          gradientMap: toonGradient,
        })
      } else {
        mesh.material = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(state.materialColor),
          roughness: styleCfg.skinRoughness,
          metalness: styleCfg.skinMetalness,
          clearcoat: styleCfg.skinClearcoat,
          clearcoatRoughness: 0.45,
          sheen: styleCfg.skinSheen,
          sheenRoughness: 0.55,
          sheenColor: new THREE.Color('#ffd6c2'),
          wireframe: state.wireframe,
          side: THREE.DoubleSide,
        })
      }
      mesh.castShadow = true
      mesh.receiveShadow = true
    }

    for (const eye of eyeMeshes) {
      eye.material = new THREE.MeshPhysicalMaterial({
        map: eyeTexture,
        roughness: styleCfg.useToonShading ? 0.14 : 0.04,
        metalness: 0.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
        wireframe: state.wireframe,
        side: THREE.DoubleSide,
      })
      eye.castShadow = false
      eye.receiveShadow = true
    }
  }, [
    bodyMeshes,
    eyeMeshes,
    state.materialColor,
    state.wireframe,
    styleCfg,
    eyeTexture,
    toonGradient,
  ])

  // Apply body proportions (Morph Targets when present, or parametric vertex shaping on prototype)
  useEffect(() => {
    const {
      heightMeters,
      shoulderWidth,
      torsoWidth,
      armLength,
      legLength,
      muscleTone,
    } = state.proportions

    const baseInfo = baseMetricsRef.current
    if (!baseInfo) return

    const allMeshes = [...bodyMeshes, ...eyeMeshes]
    let hasMorphs = false

    for (const mesh of allMeshes) {
      const dict = mesh.morphTargetDictionary
      const inf = mesh.morphTargetInfluences
      if (dict && inf && inf.length > 0) {
        hasMorphs = true
        const setMorph = (name: string, val: number) => {
          const idx = dict[name]
          if (idx !== undefined) {
            inf[idx] = Math.max(0, Math.min(1.5, val))
          }
        }
        setMorph('shoulderWidthPlus', shoulderWidth > 0 ? shoulderWidth : 0)
        setMorph('shoulderWidthMinus', shoulderWidth < 0 ? -shoulderWidth : 0)
        setMorph('torsoWidthPlus', torsoWidth > 0 ? torsoWidth : 0)
        setMorph('torsoWidthMinus', torsoWidth < 0 ? -torsoWidth : 0)
        setMorph('armLengthPlus', armLength > 0 ? armLength : 0)
        setMorph('armLengthMinus', armLength < 0 ? -armLength : 0)
        setMorph('legLengthPlus', legLength > 0 ? legLength : 0)
        setMorph('legLengthMinus', legLength < 0 ? -legLength : 0)
        setMorph('muscleTone', muscleTone)
      }
    }

    // Fallback parametric vertex deformation for meshes without morph targets (personagem_base_humano.glb)
    if (!hasMorphs) {
      for (const mesh of bodyMeshes) {
        const basePos: Float32Array | undefined = mesh.userData.basePositions
        const posAttr = mesh.geometry.attributes.position as THREE.BufferAttribute
        if (!basePos || !posAttr) continue

        const arr = posAttr.array as Float32Array
        const h = baseInfo.baseHeight
        let minDeformedY = Infinity

        for (let i = 0; i < arr.length; i += 3) {
          let x = basePos[i]
          let y = basePos[i + 1]
          let z = basePos[i + 2]
          const yNorm = y / h

          // Leg length adjustment (below hip yNorm < 0.52)
          if (yNorm < 0.52) {
            y *= 1 + legLength * 0.14 * (1 - yNorm / 0.52)
          }
          // Torso width adjustment (0.48 < yNorm < 0.78 and near trunk |x| < 0.24)
          if (yNorm > 0.45 && yNorm < 0.82 && Math.abs(x) < 0.25) {
            const w = 1 - Math.abs(yNorm - 0.64) / 0.2
            x *= 1 + torsoWidth * 0.22 * Math.max(0, w)
            z *= 1 + torsoWidth * 0.18 * Math.max(0, w)
          }
          // Shoulder width adjustment (0.72 < yNorm < 0.86)
          if (yNorm > 0.7 && yNorm < 0.86 && Math.abs(x) < 0.35) {
            const s = 1 - Math.abs(yNorm - 0.79) / 0.09
            x *= 1 + shoulderWidth * 0.2 * Math.max(0, s)
          }
          // Arm length adjustment (|x| > 0.22 in T-pose)
          if (Math.abs(x) > 0.22 && yNorm > 0.65 && yNorm < 0.88) {
            const sign = Math.sign(x)
            const armSpan = Math.abs(x) - 0.22
            x = sign * (0.22 + armSpan * (1 + armLength * 0.22))
          }

          arr[i] = x
          arr[i + 1] = y
          arr[i + 2] = z
          if (y < minDeformedY) minDeformedY = y
        }

        // Keep feet grounded at Y = 0
        if (Number.isFinite(minDeformedY) && Math.abs(minDeformedY) > 0.0001) {
          for (let i = 1; i < arr.length; i += 3) {
            arr[i] -= minDeformedY
          }
        }
        posAttr.needsUpdate = true
        mesh.geometry.computeVertexNormals()
      }
    }

    // Scale overall character to match requested heightMeters and keep feet grounded at Y = 0
    const heightScale = heightMeters / baseInfo.baseHeight
    // When morph target legLength is used on MakeHuman mesh, compensate sole shift so feet stay at Y = 0
    const morphFootShift = hasMorphs ? legLength * 0.056 : 0

    clonedScene.scale.set(heightScale, heightScale, heightScale)
    clonedScene.position.set(0, morphFootShift * heightScale, 0)

    const effectiveWidth =
      baseInfo.baseWidth *
      heightScale *
      (1 + shoulderWidth * 0.06 + armLength * 0.08)
    const effectiveDepth =
      baseInfo.baseDepth * heightScale * (1 + torsoWidth * 0.08)

    onModelLoaded({
      vertices: baseInfo.vertices,
      faces: baseInfo.faces,
      meshes: baseInfo.meshes,
      morphTargetCount: baseInfo.morphTargetCount,
      height: Number(heightMeters.toFixed(2)),
      width: Number(effectiveWidth.toFixed(2)),
      depth: Number(effectiveDepth.toFixed(2)),
    })
  }, [state.proportions, bodyMeshes, eyeMeshes, clonedScene, onModelLoaded])

  return (
    <primitive
      object={clonedScene}
      onPointerDown={onPointerDownCharacter}
    />
  )
}

/** Camera controller that frames the character cleanly for every preset */
function CameraRig({
  preset,
  trigger,
  autoRotate,
  characterHeight,
}: {
  preset: CameraPreset
  trigger: number
  autoRotate: boolean
  characterHeight: number
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const { camera } = useThree()

  useEffect(() => {
    const pose = getCameraPose(preset, characterHeight)
    camera.position.set(...pose.position)
    if (controlsRef.current) {
      controlsRef.current.target.set(...pose.target)
      controlsRef.current.update()
    }
  }, [preset, trigger, camera, characterHeight])

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      target={[0, Math.max(1.2, characterHeight) * 0.52, 0]}
      minDistance={0.22}
      maxDistance={12}
      minPolarAngle={0.04}
      maxPolarAngle={Math.PI - 0.04}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.75}
      zoomSpeed={1.0}
      panSpeed={0.65}
      autoRotate={autoRotate}
      autoRotateSpeed={1.8}
    />
  )
}

/** Studio floor grid + subtle coordinate axis markers */
function FloorGrid({
  visible,
  onFloorClick,
}: {
  visible: boolean
  onFloorClick: (e: ThreeEvent<PointerEvent>) => void
}) {
  return (
    <group>
      {visible && (
        <>
          <gridHelper args={[10, 20, '#343452', '#1e1e32']} position={[0, 0.001, 0]} />
          <gridHelper args={[10, 5, '#4b4b72', '#4b4b72']} position={[0, 0.002, 0]} />
        </>
      )}
      {/* Invisible floor plane to capture clicks for deselecting or floor measurement */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        onPointerDown={onFloorClick}
        visible={false}
      >
        <planeGeometry args={[20, 20]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  )
}

/** Visual selection ring at the base of the character */
function SelectionIndicator({
  visible,
  position,
}: {
  visible: boolean
  position: [number, number, number]
}) {
  if (!visible) return null
  return (
    <group position={[position[0], Math.max(0.004, position[1] + 0.004), position[2]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, 0.46, 64]} />
        <meshBasicMaterial color="#6c63ff" side={THREE.DoubleSide} transparent opacity={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.02, 0.42, 64]} />
        <meshBasicMaterial color="#6c63ff" side={THREE.DoubleSide} transparent opacity={0.1} />
      </mesh>
    </group>
  )
}

/** 3D Two-point Distance Ruler & Markers */
function MeasurementOverlay({
  pointA,
  pointB,
}: {
  pointA: [number, number, number] | null
  pointB: [number, number, number] | null
}) {
  if (!pointA) return null

  const distance = pointB
    ? Math.hypot(
        pointB[0] - pointA[0],
        pointB[1] - pointA[1],
        pointB[2] - pointA[2]
      )
    : null

  const midPoint: [number, number, number] | null = pointB
    ? [
        (pointA[0] + pointB[0]) * 0.5,
        (pointA[1] + pointB[1]) * 0.5,
        (pointA[2] + pointB[2]) * 0.5,
      ]
    : null

  return (
    <group>
      {/* Point A Marker */}
      <mesh position={pointA}>
        <sphereGeometry args={[0.018, 20, 20]} />
        <meshBasicMaterial color="#4ade80" depthTest={false} />
      </mesh>

      {/* Point B Marker and Line */}
      {pointB && (
        <>
          <mesh position={pointB}>
            <sphereGeometry args={[0.018, 20, 20]} />
            <meshBasicMaterial color="#fbbf24" depthTest={false} />
          </mesh>

          <Line
            points={[pointA, pointB]}
            color="#38bdf8"
            lineWidth={2.5}
            depthTest={false}
          />

          {midPoint && distance !== null && (
            <Html position={midPoint} center>
              <div className="viewport__measure-badge">
                <strong>{distance.toFixed(3)} m</strong> ({(distance * 100).toFixed(1)} cm)
              </div>
            </Html>
          )}
        </>
      )}
    </group>
  )
}

function LoadingFallback() {
  return (
    <mesh position={[0, 0.9, 0]}>
      <octahedronGeometry args={[0.22, 1]} />
      <meshStandardMaterial color="#6c63ff" wireframe />
    </mesh>
  )
}

export default function Viewport({
  state,
  onSelectCameraPreset,
  onModelLoaded,
  onSelectCharacter,
  onUpdateTransform,
  onAddMeasurePoint,
  onClearMeasurement,
}: ViewportProps) {
  const transformGroupRef = useRef<THREE.Group>(null)
  const isTransformTool =
    state.activeTool === 'move' ||
    state.activeTool === 'rotate' ||
    state.activeTool === 'scale'

  const transformMode: 'translate' | 'rotate' | 'scale' =
    state.activeTool === 'move'
      ? 'translate'
      : state.activeTool === 'rotate'
      ? 'rotate'
      : 'scale'

  // Sync state.transform -> group transform
  useEffect(() => {
    const grp = transformGroupRef.current
    if (!grp) return
    grp.position.set(...state.transform.position)
    grp.rotation.set(
      THREE.MathUtils.degToRad(state.transform.rotation[0]),
      THREE.MathUtils.degToRad(state.transform.rotation[1]),
      THREE.MathUtils.degToRad(state.transform.rotation[2])
    )
    grp.scale.set(...state.transform.scale)
  }, [state.transform])

  const handlePointerDownCharacter = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (state.activeTool === 'measure') {
      onAddMeasurePoint([
        Number(e.point.x.toFixed(4)),
        Number(e.point.y.toFixed(4)),
        Number(e.point.z.toFixed(4)),
      ])
      return
    }
    onSelectCharacter(true)
  }

  const handleFloorClick = (e: ThreeEvent<PointerEvent>) => {
    if (state.activeTool === 'measure') {
      e.stopPropagation()
      onAddMeasurePoint([
        Number(e.point.x.toFixed(4)),
        Number(e.point.y.toFixed(4)),
        Number(e.point.z.toFixed(4)),
      ])
      return
    }
    if (state.activeTool === 'select') {
      onSelectCharacter(false)
    }
  }

  const handleGizmoObjectChange = () => {
    const grp = transformGroupRef.current
    if (!grp) return

    if (state.activeTool === 'move') {
      onUpdateTransform({
        position: [
          Number(grp.position.x.toFixed(3)),
          Number(Math.max(0, grp.position.y).toFixed(3)),
          Number(grp.position.z.toFixed(3)),
        ],
      })
    } else if (state.activeTool === 'rotate') {
      onUpdateTransform({
        rotation: [
          Number(THREE.MathUtils.radToDeg(grp.rotation.x).toFixed(1)),
          Number(THREE.MathUtils.radToDeg(grp.rotation.y).toFixed(1)),
          Number(THREE.MathUtils.radToDeg(grp.rotation.z).toFixed(1)),
        ],
      })
    } else if (state.activeTool === 'scale') {
      if (state.transform.uniformScale) {
        const avg = Number(
          Math.max(0.2, (grp.scale.x + grp.scale.y + grp.scale.z) / 3).toFixed(2)
        )
        grp.scale.set(avg, avg, avg)
        onUpdateTransform({ scale: [avg, avg, avg] })
      } else {
        onUpdateTransform({
          scale: [
            Number(Math.max(0.2, grp.scale.x).toFixed(2)),
            Number(Math.max(0.2, grp.scale.y).toFixed(2)),
            Number(Math.max(0.2, grp.scale.z).toFixed(2)),
          ],
        })
      }
    }
  }

  return (
    <main
      className={`viewport ${
        state.activeTool === 'measure' ? 'viewport--crosshair' : ''
      }`}
      aria-label="Viewport 3D"
    >
      {/* Top Camera Angles Bar */}
      <div className="viewport__cam-bar" role="toolbar" aria-label="Ângulos de câmera">
        {(Object.keys(CAMERA_LABELS) as CameraPreset[]).map((presetKey) => (
          <button
            key={presetKey}
            className={`viewport__cam-pill ${
              state.cameraPreset === presetKey ? 'viewport__cam-pill--active' : ''
            }`}
            onClick={() => onSelectCameraPreset(presetKey)}
          >
            {CAMERA_LABELS[presetKey]}
          </button>
        ))}
      </div>

      {/* Active Tool Banner when using Measure or Transform */}
      {state.activeTool === 'measure' && (
        <div className="viewport__tool-banner">
          <span>
            📏 <strong>Modo Medição:</strong> Clique em dois pontos do personagem para medir a
            distância real.
          </span>
          {(state.measurement.pointA || state.measurement.pointB) && (
            <button className="viewport__banner-btn" onClick={onClearMeasurement}>
              Limpar Medição
            </button>
          )}
        </div>
      )}

      <Canvas
        className="viewport__canvas"
        shadows
        dpr={[1, 2]}
        camera={{ position: [1.4, 1.25, 2.65], fov: 40, near: 0.01, far: 100 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.12,
        }}
        onCreated={({ gl }) => {
          gl.setClearColor('#0f0f1a')
          gl.shadowMap.enabled = true
          gl.shadowMap.type = THREE.PCFSoftShadowMap
        }}
      >
        {/* 3-Point Studio Lighting + Hemisphere Fill */}
        <hemisphereLight args={['#e2e8f0', '#231f33', 0.68]} />
        <ambientLight intensity={0.22} />

        {/* Key Light */}
        <directionalLight
          position={[3.5, 5.5, 4.5]}
          intensity={1.6}
          color="#fff8f0"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={16}
          shadow-camera-left={-2.5}
          shadow-camera-right={2.5}
          shadow-camera-top={2.8}
          shadow-camera-bottom={-0.5}
          shadow-bias={-0.0003}
        />

        {/* Cool Fill Light */}
        <directionalLight position={[-3.8, 3.2, 1.5]} intensity={0.62} color="#93c5fd" />

        {/* Rim / Back Light */}
        <directionalLight position={[0, 3.5, -4]} intensity={0.75} color="#c4b5fd" />

        {/* Floor Grid */}
        <FloorGrid visible={state.showGrid} onFloorClick={handleFloorClick} />

        {/* Selection Ring */}
        <SelectionIndicator
          visible={state.isSelected}
          position={state.transform.position}
        />

        {/* Contact Shadow on the Floor */}
        <ContactShadows
          position={[
            state.transform.position[0],
            0.001,
            state.transform.position[2],
          ]}
          opacity={0.52}
          scale={4.5}
          blur={2.0}
          far={2.5}
          color="#05050a"
        />

        {/* Transformable Character Root Group */}
        <group ref={transformGroupRef}>
          <Suspense fallback={<LoadingFallback />}>
            <CharacterMesh
              state={state}
              onModelLoaded={onModelLoaded}
              onPointerDownCharacter={handlePointerDownCharacter}
            />
          </Suspense>
        </group>

        {/* Interactive 3D Gizmo for Move / Rotate / Scale */}
        {isTransformTool && state.isSelected && transformGroupRef.current && (
          <TransformControls
            object={transformGroupRef.current}
            mode={transformMode}
            size={0.75}
            onObjectChange={handleGizmoObjectChange}
          />
        )}

        {/* 3D Measurement Ruler */}
        <MeasurementOverlay
          pointA={state.measurement.pointA}
          pointB={state.measurement.pointB}
        />

        {/* Orbital Camera Controls */}
        <CameraRig
          preset={state.cameraPreset}
          trigger={state.cameraTrigger}
          autoRotate={state.autoRotate}
          characterHeight={state.metrics.height}
        />
      </Canvas>

      {/* Bottom Controls Hint Overlay */}
      <div className="viewport__overlay">
        <span className="viewport__hint">
          <span className="viewport__hint-key">Arrastar</span> Girar Câmera
        </span>
        <span className="viewport__hint">
          <span className="viewport__hint-key">Botão Direito</span> Mover Vista
        </span>
        <span className="viewport__hint">
          <span className="viewport__hint-key">Scroll</span> Zoom
        </span>
      </div>
    </main>
  )
}

useGLTF.preload('/models/personagem_humano_realista.glb')
useGLTF.preload('/models/personagem_humano_anime.glb')
useGLTF.preload('/models/personagem_base_humano.glb')
