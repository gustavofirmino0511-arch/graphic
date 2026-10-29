import { Suspense, useRef, useEffect, useMemo, useState, useCallback } from 'react'
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
import {
  buildWeldedTopology,
  applyBrushDab,
  type WeldedTopology,
} from '../systems/bodyEditorSystem'
import {
  isPoseNeutral,
  applyJointArticulationToPositionPoint,
  computeArticulatedJointPositions,
  type AnatomicalJoint,
} from '../systems/skeletonSystem'

interface ViewportProps {
  state: AppState
  onSelectCameraPreset: (preset: CameraPreset) => void
  onModelLoaded: (metrics: ModelMetrics) => void
  onSelectCharacter: (selected: boolean) => void
  onUpdateTransform: (partial: Partial<TransformState>) => void
  onSculptHistoryChange: (undoSteps: number, redoSteps: number) => void
  onUndoSculpt: () => void
  onRedoSculpt: () => void
  onResetSculpt: () => void
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
      return {
        position: [dist, midY, 0],
        target: [0, midY, 0],
      }
    case 'right':
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

export interface BrushHoverState {
  visible: boolean
  point: THREE.Vector3
  normal: THREE.Vector3
}

/**
 * Loads, normalizes orientation, applies realistic/anime materials, drives 17 morph targets,
 * and handles direct mouse sculpting with welded UV-seam-safe topology and Undo/Redo history.
 */
function CharacterMesh({
  state,
  onModelLoaded,
  onSculptHistoryChange,
  onBrushStrokeStateChange,
  onBrushHoverChange,
  onPointerDownCharacter,
}: {
  state: AppState
  onModelLoaded: (metrics: ModelMetrics) => void
  onSculptHistoryChange: (undoSteps: number, redoSteps: number) => void
  onBrushStrokeStateChange: (active: boolean) => void
  onBrushHoverChange: (hover: BrushHoverState | null) => void
  onPointerDownCharacter: (e: ThreeEvent<PointerEvent>) => void
}) {
  const styleCfg = CHARACTER_STYLES[state.styleId]
  const { scene: gltfScene } = useGLTF(styleCfg.modelUrl)
  const baseMetricsRef = useRef<{
    vertices: number
    faces: number
    meshes: number
    morphTargetCount: number
    skeletonJointCount: number
    baseHeight: number
    baseWidth: number
    baseDepth: number
  } | null>(null)

  const isStrokeActiveRef = useRef(false)
  const strokeModifiedRef = useRef(false)
  const dabCounterRef = useRef(0)
  const undoStackRef = useRef<Float32Array[]>([])
  const redoStackRef = useRef<Float32Array[]>([])

  const eyeTexture = useMemo(
    () => createEyeTexture(state.eyeColor, styleCfg.useToonShading),
    [state.eyeColor, styleCfg.useToonShading]
  )

  const toonGradient = useMemo(() => createAnimeToonGradientMap(), [])

  // Clone scene, normalize orientation, extract embedded joints & eyeCenters, and build welded sculpting topology
  const { clonedScene, bodyMeshes, eyeMeshes, anatomicalJoints } = useMemo(() => {
    const root = gltfScene.clone(true)
    const bodies: THREE.Mesh[] = []
    const eyes: THREE.Mesh[] = []

    root.position.set(0, 0, 0)
    root.rotation.set(0, 0, 0)
    root.scale.set(1, 1, 1)
    root.updateMatrixWorld(true)

    const rawBox = new THREE.Box3().setFromObject(root)
    const rawSize = rawBox.getSize(new THREE.Vector3())
    const isZUp = rawSize.z > rawSize.y * 1.4

    let extractedJoints: AnatomicalJoint[] =
      (gltfScene.userData?.anatomicalJoints as AnatomicalJoint[] | undefined) ?? []
    let extractedEyeCenters:
      | { left: [number, number, number]; right: [number, number, number] }
      | undefined = gltfScene.userData?.eyeCenters

    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (!extractedJoints.length && child.userData?.anatomicalJoints) {
          extractedJoints = child.userData.anatomicalJoints as AnatomicalJoint[]
        }
        if (!extractedEyeCenters && child.userData?.eyeCenters) {
          extractedEyeCenters = child.userData.eyeCenters
        }
        child.geometry = child.geometry.clone()
        if (isZUp) {
          child.geometry.rotateX(-Math.PI / 2)
        }
        if (!child.geometry.attributes.normal) {
          child.geometry.computeVertexNormals()
        }
        if (child.name.toLowerCase().includes('eye')) {
          eyes.push(child)
        } else {
          bodies.push(child)
        }
      }
    })

    const uprightBox = new THREE.Box3().setFromObject(root)
    const center = uprightBox.getCenter(new THREE.Vector3())
    const minY = uprightBox.min.y
    const uprightHeight = Math.max(0.1, uprightBox.max.y - uprightBox.min.y)

    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (
          Math.abs(center.x) > 0.0005 ||
          Math.abs(minY) > 0.0005 ||
          Math.abs(center.z) > 0.0005
        ) {
          child.geometry.translate(-center.x, -minY, -center.z)
        }
        if (child.geometry.attributes.position) {
          const basePos = new Float32Array(child.geometry.attributes.position.array)
          child.userData.basePositions = basePos
          child.userData.sculptOffsets = new Float32Array(basePos.length)
          if (!child.name.toLowerCase().includes('eye')) {
            child.userData.weldedTopology = buildWeldedTopology(
              child.geometry,
              basePos,
              uprightHeight,
              extractedEyeCenters
            )
          }
        }
      }
    })

    undoStackRef.current = []
    redoStackRef.current = []

    return {
      clonedScene: root,
      bodyMeshes: bodies,
      eyeMeshes: eyes,
      anatomicalJoints: extractedJoints,
    }
  }, [gltfScene])

  // Sync vertex positions from basePositions + sculptOffsets + joint articulation (and fallback parametric proportions if mesh has no morph targets)
  const syncMeshGeometry = useCallback(
    (recomputeNormals: boolean) => {
      const baseInfo = baseMetricsRef.current
      if (!baseInfo) return

      const {
        shoulderWidth,
        torsoWidth,
        chestVolume,
        abdomenVolume,
        armThickness,
        legThickness,
        thighVolume,
        armLength,
        legLength,
      } = state.proportions

      const {
        cheekVolume,
        cheekbones,
        faceWidth,
        jawWidth,
        chinShape,
        headScale,
      } = state.faceProportions

      const poseActive = !isPoseNeutral(state.jointPose) && anatomicalJoints.length > 0
      const jointsMap = new Map<string, [number, number, number]>()
      if (poseActive) {
        for (const j of anatomicalJoints) {
          jointsMap.set(j.id, j.position)
        }
      }

      const headQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          THREE.MathUtils.degToRad(state.jointPose.headPitch),
          THREE.MathUtils.degToRad(state.jointPose.headYaw),
          0,
          'YXZ'
        )
      )
      const lShoulderQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, 0, THREE.MathUtils.degToRad(state.jointPose.leftShoulderPitch))
      )
      const lElbowQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          THREE.MathUtils.degToRad(-state.jointPose.leftElbowFlex * 0.65),
          THREE.MathUtils.degToRad(state.jointPose.leftElbowFlex * 0.75),
          0
        )
      )
      const rShoulderQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, 0, THREE.MathUtils.degToRad(-state.jointPose.rightShoulderPitch))
      )
      const rElbowQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          THREE.MathUtils.degToRad(-state.jointPose.rightElbowFlex * 0.65),
          THREE.MathUtils.degToRad(-state.jointPose.rightElbowFlex * 0.75),
          0
        )
      )
      const tempVec = new THREE.Vector3()

      const allMeshes = [...bodyMeshes, ...eyeMeshes]
      for (const mesh of allMeshes) {
        const basePos: Float32Array | undefined = mesh.userData.basePositions
        const sculptOffsets: Float32Array | undefined = mesh.userData.sculptOffsets
        const posAttr = mesh.geometry.attributes.position as THREE.BufferAttribute
        if (!basePos || !sculptOffsets || !posAttr) continue

        const isEyeMesh = mesh.name.toLowerCase().includes('eye')
        const hasMorphs = Boolean(
          mesh.morphTargetDictionary &&
            mesh.morphTargetInfluences &&
            mesh.morphTargetInfluences.length > 0
        )

        const arr = posAttr.array as Float32Array
        const h = baseInfo.baseHeight
        let minDeformedY = Infinity

        for (let i = 0; i < arr.length; i += 3) {
          let x = basePos[i] + sculptOffsets[i]
          let y = basePos[i + 1] + sculptOffsets[i + 1]
          let z = basePos[i + 2] + sculptOffsets[i + 2]

          if (!hasMorphs && !isEyeMesh) {
            const yNorm = y / h
            // Leg length (< 0.52)
            if (yNorm < 0.52) {
              y *= 1 + legLength * 0.14 * (1 - yNorm / 0.52)
            }
            // Calf / leg thickness (0.08 < yNorm < 0.28)
            if (yNorm > 0.08 && yNorm < 0.3 && Math.abs(x) < 0.22) {
              const s = 1 - Math.abs(yNorm - 0.19) / 0.11
              const signX = Math.sign(x) || 1
              const legCenter = signX * 0.095
              x = legCenter + (x - legCenter) * (1 + legThickness * 0.28 * Math.max(0, s))
              z *= 1 + legThickness * 0.28 * Math.max(0, s)
            }
            // Thigh volume (0.28 < yNorm < 0.52)
            if (yNorm >= 0.28 && yNorm < 0.52 && Math.abs(x) < 0.25) {
              const s = 1 - Math.abs(yNorm - 0.4) / 0.12
              const signX = Math.sign(x) || 1
              const thighCenter = signX * 0.095
              x =
                thighCenter +
                (x - thighCenter) * (1 + thighVolume * 0.3 * Math.max(0, s))
              z *= 1 + thighVolume * 0.3 * Math.max(0, s)
            }
            // Abdomen volume (0.50 < yNorm < 0.68)
            if (yNorm > 0.5 && yNorm < 0.68 && Math.abs(x) < 0.22) {
              const s = 1 - Math.abs(yNorm - 0.59) / 0.09
              if (z > 0) {
                z *= 1 + abdomenVolume * 0.42 * Math.max(0, s)
              }
              x *= 1 + abdomenVolume * 0.18 * Math.max(0, s)
            }
            // Chest volume (0.68 < yNorm < 0.82)
            if (yNorm > 0.68 && yNorm < 0.82 && Math.abs(x) < 0.24) {
              const s = 1 - Math.abs(yNorm - 0.75) / 0.07
              if (z > 0) {
                z *= 1 + chestVolume * 0.35 * Math.max(0, s)
              }
              x *= 1 + chestVolume * 0.14 * Math.max(0, s)
            }
            // Torso width (0.48 < yNorm < 0.80)
            if (yNorm > 0.48 && yNorm < 0.8 && Math.abs(x) < 0.25) {
              const w = 1 - Math.abs(yNorm - 0.65) / 0.16
              x *= 1 + torsoWidth * 0.22 * Math.max(0, w)
              z *= 1 + torsoWidth * 0.16 * Math.max(0, w)
            }
            // Shoulder width (0.72 < yNorm < 0.86)
            if (yNorm > 0.72 && yNorm < 0.86 && Math.abs(x) < 0.35) {
              const s = 1 - Math.abs(yNorm - 0.79) / 0.08
              x *= 1 + shoulderWidth * 0.2 * Math.max(0, s)
            }
            // Arm length & thickness (|x| > 0.21 in T-pose)
            if (Math.abs(x) > 0.21 && yNorm > 0.65 && yNorm < 0.88) {
              const sign = Math.sign(x)
              const armSpan = Math.abs(x) - 0.21
              x = sign * (0.21 + armSpan * (1 + armLength * 0.22))
              const armMidY = 0.785 * h
              y = armMidY + (y - armMidY) * (1 + armThickness * 0.32)
              z *= 1 + armThickness * 0.32
            }
            // Head & Facial fallback (yNorm > 0.86)
            if (yNorm > 0.86) {
              const headCenterY = 0.93 * h
              x *= 1 + headScale * 0.1 + faceWidth * 0.1
              y = headCenterY + (y - headCenterY) * (1 + headScale * 0.1)
              z *= 1 + headScale * 0.08
              if (yNorm > 0.87 && yNorm < 0.94 && z > 0) {
                x *= 1 + (cheekVolume * 0.12 + cheekbones * 0.08 + jawWidth * 0.1)
                z += (cheekVolume * 0.008 + chinShape * 0.006)
              }
            }
          }

          if (poseActive) {
            const [ax, ay, az] = applyJointArticulationToPositionPoint(
              x,
              y,
              z,
              jointsMap,
              state.jointPose,
              tempVec,
              headQuat,
              lShoulderQuat,
              lElbowQuat,
              rShoulderQuat,
              rElbowQuat
            )
            x = ax
            y = ay
            z = az
          }

          arr[i] = x
          arr[i + 1] = y
          arr[i + 2] = z
          if (y < minDeformedY) minDeformedY = y
        }

        if (
          !hasMorphs &&
          !isEyeMesh &&
          Number.isFinite(minDeformedY) &&
          Math.abs(minDeformedY) > 0.0001
        ) {
          for (let i = 1; i < arr.length; i += 3) {
            arr[i] -= minDeformedY
          }
        }

        posAttr.needsUpdate = true
        if (recomputeNormals) {
          mesh.geometry.computeVertexNormals()
        }
      }
    },
    [bodyMeshes, eyeMeshes, anatomicalJoints, state.proportions, state.faceProportions, state.jointPose]
  )

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
      skeletonJointCount: anatomicalJoints.length,
      baseHeight,
      baseWidth,
      baseDepth,
    }

    onModelLoaded({
      vertices: totalVertices,
      faces: totalFaces,
      meshes: bodyMeshes.length + eyeMeshes.length,
      morphTargetCount,
      skeletonJointCount: anatomicalJoints.length,
      height: Number(state.proportions.heightMeters.toFixed(2)),
      width: Number(baseWidth.toFixed(2)),
      depth: Number(baseDepth.toFixed(2)),
    })
  }, [clonedScene, bodyMeshes, eyeMeshes, anatomicalJoints, onModelLoaded, state.proportions.heightMeters])

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

  // Apply body & facial proportions (31 Morph Targets when present + fallback parametric shaping)
  useEffect(() => {
    const {
      heightMeters,
      shoulderWidth,
      torsoWidth,
      chestVolume,
      abdomenVolume,
      armThickness,
      legThickness,
      thighVolume,
      armLength,
      legLength,
      muscleTone,
    } = state.proportions

    const {
      cheekVolume,
      cheekbones,
      faceWidth,
      jawWidth,
      chinShape,
      headScale,
    } = state.faceProportions

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
        // 19 Body Morph Targets
        setMorph('shoulderWidthPlus', shoulderWidth > 0 ? shoulderWidth : 0)
        setMorph('shoulderWidthMinus', shoulderWidth < 0 ? -shoulderWidth : 0)
        setMorph('torsoWidthPlus', torsoWidth > 0 ? torsoWidth : 0)
        setMorph('torsoWidthMinus', torsoWidth < 0 ? -torsoWidth : 0)
        setMorph('chestVolumePlus', chestVolume > 0 ? chestVolume : 0)
        setMorph('chestVolumeMinus', chestVolume < 0 ? -chestVolume : 0)
        setMorph('abdomenVolumePlus', abdomenVolume > 0 ? abdomenVolume : 0)
        setMorph('abdomenVolumeMinus', abdomenVolume < 0 ? -abdomenVolume : 0)
        setMorph('armThicknessPlus', armThickness > 0 ? armThickness : 0)
        setMorph('armThicknessMinus', armThickness < 0 ? -armThickness : 0)
        setMorph('legThicknessPlus', legThickness > 0 ? legThickness : 0)
        setMorph('legThicknessMinus', legThickness < 0 ? -legThickness : 0)
        setMorph('thighVolumePlus', thighVolume > 0 ? thighVolume : 0)
        setMorph('thighVolumeMinus', thighVolume < 0 ? -thighVolume : 0)
        setMorph('armLengthPlus', armLength > 0 ? armLength : 0)
        setMorph('armLengthMinus', armLength < 0 ? -armLength : 0)
        setMorph('legLengthPlus', legLength > 0 ? legLength : 0)
        setMorph('legLengthMinus', legLength < 0 ? -legLength : 0)
        setMorph('muscleTone', muscleTone)

        // 12 Eye-Safe Facial Morph Targets
        setMorph('cheekVolumePlus', cheekVolume > 0 ? cheekVolume : 0)
        setMorph('cheekVolumeMinus', cheekVolume < 0 ? -cheekVolume : 0)
        setMorph('cheekbonesPlus', cheekbones > 0 ? cheekbones : 0)
        setMorph('cheekbonesMinus', cheekbones < 0 ? -cheekbones : 0)
        setMorph('jawWidthPlus', jawWidth > 0 ? jawWidth : 0)
        setMorph('jawWidthMinus', jawWidth < 0 ? -jawWidth : 0)
        setMorph('chinShapePlus', chinShape > 0 ? chinShape : 0)
        setMorph('chinShapeMinus', chinShape < 0 ? -chinShape : 0)
        setMorph('faceWidthPlus', faceWidth > 0 ? faceWidth : 0)
        setMorph('faceWidthMinus', faceWidth < 0 ? -faceWidth : 0)
        setMorph('headScalePlus', headScale > 0 ? headScale : 0)
        setMorph('headScaleMinus', headScale < 0 ? -headScale : 0)
      }
    }

    if (!hasMorphs) {
      syncMeshGeometry(true)
    }

    const heightScale = heightMeters / baseInfo.baseHeight
    const morphFootShift = hasMorphs ? legLength * 0.056 : 0

    clonedScene.scale.set(heightScale, heightScale, heightScale)
    clonedScene.position.set(0, morphFootShift * heightScale, 0)

    const effectiveWidth =
      baseInfo.baseWidth *
      heightScale *
      (1 + shoulderWidth * 0.06 + armLength * 0.08 + armThickness * 0.03)
    const effectiveDepth =
      baseInfo.baseDepth *
      heightScale *
      (1 +
        torsoWidth * 0.08 +
        Math.max(0, chestVolume) * 0.06 +
        Math.max(0, abdomenVolume) * 0.12 +
        thighVolume * 0.05)

    onModelLoaded({
      vertices: baseInfo.vertices,
      faces: baseInfo.faces,
      meshes: baseInfo.meshes,
      morphTargetCount: baseInfo.morphTargetCount,
      skeletonJointCount: baseInfo.skeletonJointCount,
      height: Number(heightMeters.toFixed(2)),
      width: Number(effectiveWidth.toFixed(2)),
      depth: Number(effectiveDepth.toFixed(2)),
    })
  }, [
    state.proportions,
    state.faceProportions,
    bodyMeshes,
    eyeMeshes,
    clonedScene,
    onModelLoaded,
    syncMeshGeometry,
  ])

  // Apply 3D Joint Articulation whenever jointPose changes
  useEffect(() => {
    syncMeshGeometry(true)
  }, [state.jointPose, syncMeshGeometry])

  // Handle Undo Sculpt Trigger
  useEffect(() => {
    if (state.sculptHistory.undoTrigger === 0) return
    const mainMesh = bodyMeshes[0]
    if (!mainMesh || undoStackRef.current.length === 0) return

    const currentOffsets: Float32Array = mainMesh.userData.sculptOffsets
    redoStackRef.current.push(new Float32Array(currentOffsets))
    const prev = undoStackRef.current.pop()!
    currentOffsets.set(prev)
    syncMeshGeometry(true)
    onSculptHistoryChange(undoStackRef.current.length, redoStackRef.current.length)
  }, [state.sculptHistory.undoTrigger, bodyMeshes, syncMeshGeometry, onSculptHistoryChange])

  // Handle Redo Sculpt Trigger
  useEffect(() => {
    if (state.sculptHistory.redoTrigger === 0) return
    const mainMesh = bodyMeshes[0]
    if (!mainMesh || redoStackRef.current.length === 0) return

    const currentOffsets: Float32Array = mainMesh.userData.sculptOffsets
    undoStackRef.current.push(new Float32Array(currentOffsets))
    const next = redoStackRef.current.pop()!
    currentOffsets.set(next)
    syncMeshGeometry(true)
    onSculptHistoryChange(undoStackRef.current.length, redoStackRef.current.length)
  }, [state.sculptHistory.redoTrigger, bodyMeshes, syncMeshGeometry, onSculptHistoryChange])

  // Handle Reset Sculpt Trigger
  useEffect(() => {
    if (state.sculptHistory.resetSculptTrigger === 0) return
    const mainMesh = bodyMeshes[0]
    if (!mainMesh) return

    const currentOffsets: Float32Array | undefined = mainMesh.userData.sculptOffsets
    if (!currentOffsets) return
    currentOffsets.fill(0)
    undoStackRef.current = []
    redoStackRef.current = []
    syncMeshGeometry(true)
    onSculptHistoryChange(0, 0)
  }, [state.sculptHistory.resetSculptTrigger, bodyMeshes, syncMeshGeometry, onSculptHistoryChange])

  // Release active stroke on global pointerup
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (isStrokeActiveRef.current) {
        isStrokeActiveRef.current = false
        onBrushStrokeStateChange(false)
        if (strokeModifiedRef.current) {
          syncMeshGeometry(true)
          strokeModifiedRef.current = false
          onSculptHistoryChange(undoStackRef.current.length, redoStackRef.current.length)
        }
      }
    }
    window.addEventListener('pointerup', handleGlobalPointerUp)
    return () => window.removeEventListener('pointerup', handleGlobalPointerUp)
  }, [onBrushStrokeStateChange, onSculptHistoryChange, syncMeshGeometry])

  const performBrushAtIntersection = (e: ThreeEvent<PointerEvent>) => {
    const hitMesh = e.object as THREE.Mesh
    const topology: WeldedTopology | undefined = hitMesh.userData.weldedTopology
    const sculptOffsets: Float32Array | undefined = hitMesh.userData.sculptOffsets
    const posAttr = hitMesh.geometry?.attributes?.position as THREE.BufferAttribute | undefined
    if (!topology || !sculptOffsets || !posAttr) return

    const localPoint = hitMesh.worldToLocal(e.point.clone())
    const worldScale = hitMesh.getWorldScale(new THREE.Vector3()).x || 1
    const localRadius = state.brush.radius / worldScale
    const localHitNormal = e.face
      ? e.face.normal.clone().normalize()
      : new THREE.Vector3(0, 0, 1)

    const changed = applyBrushDab({
      topology,
      currentPositions: posAttr.array as Float32Array,
      sculptOffsets,
      localHitPoint: localPoint,
      localHitNormal,
      localRadius,
      settings: state.brush,
    })

    if (changed) {
      strokeModifiedRef.current = true
      dabCounterRef.current += 1
      // Recompute normals every 4th dab during drag for responsive shading without frame drops
      syncMeshGeometry(dabCounterRef.current % 4 === 0)
    }
  }

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (
      state.activeTool === 'sculpt' &&
      state.brush.enabled &&
      e.button === 0
    ) {
      e.stopPropagation()
      const mainMesh = bodyMeshes[0]
      if (mainMesh && mainMesh.userData.sculptOffsets) {
        undoStackRef.current.push(
          new Float32Array(mainMesh.userData.sculptOffsets)
        )
        if (undoStackRef.current.length > 30) {
          undoStackRef.current.shift()
        }
        redoStackRef.current = []
      }
      isStrokeActiveRef.current = true
      strokeModifiedRef.current = false
      dabCounterRef.current = 0
      onBrushStrokeStateChange(true)
      performBrushAtIntersection(e)
      return
    }
    onPointerDownCharacter(e)
  }

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (state.activeTool !== 'sculpt' || !state.brush.enabled) return
    e.stopPropagation()

    if (e.face) {
      const worldNormal = e.face.normal
        .clone()
        .transformDirection(e.object.matrixWorld)
        .normalize()
      onBrushHoverChange({
        visible: true,
        point: e.point.clone(),
        normal: worldNormal,
      })
    }

    if (isStrokeActiveRef.current) {
      performBrushAtIntersection(e)
    }
  }

  const handlePointerLeave = () => {
    if (state.activeTool === 'sculpt') {
      onBrushHoverChange(null)
    }
  }

  const baseHeight = baseMetricsRef.current?.baseHeight ?? 1.795
  const heightScale = state.proportions.heightMeters / baseHeight
  const articulatedJoints = useMemo(() => {
    if (!state.jointPose.showSkeleton || anatomicalJoints.length === 0) return []
    return computeArticulatedJointPositions(anatomicalJoints, state.jointPose, heightScale)
  }, [anatomicalJoints, state.jointPose, heightScale])

  const jointMap = useMemo(() => {
    const m = new Map<string, AnatomicalJoint>()
    for (const j of articulatedJoints) m.set(j.id, j)
    return m
  }, [articulatedJoints])

  return (
    <group>
      <primitive
        object={clonedScene}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerLeave}
      />

      {/* 3D Skeleton & Joint Hierarchy Overlay */}
      {state.jointPose.showSkeleton && articulatedJoints.length > 0 && (
        <group position={[0, clonedScene.position.y, 0]}>
          {articulatedJoints.map((joint) => {
            const parentJoint = joint.parent ? jointMap.get(joint.parent) : undefined
            const isPrimaryPivot =
              joint.id === 'neck' ||
              joint.id === 'head' ||
              joint.id.startsWith('shoulder_') ||
              joint.id.startsWith('elbow_')
            return (
              <group key={joint.id}>
                <mesh position={joint.position}>
                  <sphereGeometry args={[isPrimaryPivot ? 0.018 : 0.013, 16, 16]} />
                  <meshBasicMaterial
                    color={isPrimaryPivot ? '#facc15' : '#38bdf8'}
                    depthTest={false}
                  />
                </mesh>
                {parentJoint && (
                  <Line
                    points={[parentJoint.position, joint.position]}
                    color="#38bdf8"
                    lineWidth={2.5}
                    depthTest={false}
                  />
                )}
              </group>
            )
          })}
        </group>
      )}
    </group>
  )
}

/** 3D Brush Ring Cursor aligned to the character surface normal */
function BrushCursorIndicator({
  hover,
  radius,
  mode,
  symmetryX,
}: {
  hover: BrushHoverState | null
  radius: number
  mode: AppState['brush']['mode']
  symmetryX: boolean
}) {
  if (!hover || !hover.visible) return null

  const color =
    mode === 'inflate' ? '#4ade80' : mode === 'deflate' ? '#fb923c' : '#38bdf8'

  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    hover.normal
  )
  const pos = hover.point.clone().addScaledVector(hover.normal, 0.003)

  const mirrorNormal = new THREE.Vector3(
    -hover.normal.x,
    hover.normal.y,
    hover.normal.z
  ).normalize()
  const mirrorQuat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    mirrorNormal
  )
  const mirrorPos = new THREE.Vector3(
    -hover.point.x,
    hover.point.y,
    hover.point.z
  ).addScaledVector(mirrorNormal, 0.003)

  return (
    <group>
      <mesh position={pos} quaternion={quat}>
        <ringGeometry args={[radius * 0.86, radius, 48]} />
        <meshBasicMaterial
          color={color}
          side={THREE.DoubleSide}
          transparent
          opacity={0.9}
          depthTest={false}
        />
      </mesh>
      <mesh position={pos} quaternion={quat}>
        <ringGeometry args={[0.003, 0.01, 24]} />
        <meshBasicMaterial
          color={color}
          side={THREE.DoubleSide}
          transparent
          opacity={0.95}
          depthTest={false}
        />
      </mesh>

      {symmetryX && Math.abs(hover.point.x) > 0.015 && (
        <mesh position={mirrorPos} quaternion={mirrorQuat}>
          <ringGeometry args={[radius * 0.88, radius, 48]} />
          <meshBasicMaterial
            color={color}
            side={THREE.DoubleSide}
            transparent
            opacity={0.45}
            depthTest={false}
          />
        </mesh>
      )}
    </group>
  )
}

/** Camera controller that frames the character cleanly for every preset */
function CameraRig({
  preset,
  trigger,
  autoRotate,
  characterHeight,
  disabled,
}: {
  preset: CameraPreset
  trigger: number
  autoRotate: boolean
  characterHeight: number
  disabled: boolean
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
      enabled={!disabled}
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
      autoRotate={autoRotate && !disabled}
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
      <mesh position={pointA}>
        <sphereGeometry args={[0.018, 20, 20]} />
        <meshBasicMaterial color="#4ade80" depthTest={false} />
      </mesh>

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
  onSculptHistoryChange,
  onUndoSculpt,
  onRedoSculpt,
  onResetSculpt,
  onAddMeasurePoint,
  onClearMeasurement,
}: ViewportProps) {
  const transformGroupRef = useRef<THREE.Group>(null)
  const [isBrushStrokeActive, setIsBrushStrokeActive] = useState(false)
  const [brushHover, setBrushHover] = useState<BrushHoverState | null>(null)

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

  useEffect(() => {
    if (state.activeTool !== 'sculpt') {
      setBrushHover(null)
      setIsBrushStrokeActive(false)
    }
  }, [state.activeTool])

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

  const brushModeLabel =
    state.brush.mode === 'inflate'
      ? 'Aumentar Volume (+)'
      : state.brush.mode === 'deflate'
      ? 'Reduzir Volume (−)'
      : 'Suavizar Superfície'

  return (
    <main
      className={`viewport ${
        state.activeTool === 'measure' ||
        (state.activeTool === 'sculpt' && state.brush.enabled)
          ? 'viewport--crosshair'
          : ''
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

      {/* Active Tool Banner for Body Sculpting Mode */}
      {state.activeTool === 'sculpt' && (
        <div className="viewport__tool-banner">
          <span>
            🖌 <strong>Modo de Edição Corporal:</strong>{' '}
            {state.brush.enabled
              ? `Arraste sobre o corpo para ${brushModeLabel}`
              : 'Use os controles deslizantes laterais'}
          </span>
          <button
            className="viewport__banner-btn"
            onClick={onUndoSculpt}
            disabled={state.sculptHistory.undoSteps === 0}
            title="Desfazer traço do pincel (Ctrl+Z)"
          >
            ↶ Desfazer ({state.sculptHistory.undoSteps})
          </button>
          <button
            className="viewport__banner-btn"
            onClick={onRedoSculpt}
            disabled={state.sculptHistory.redoSteps === 0}
            title="Refazer traço do pincel (Ctrl+Y)"
          >
            ↷ Refazer ({state.sculptHistory.redoSteps})
          </button>
          {state.sculptHistory.undoSteps > 0 && (
            <button
              className="viewport__banner-btn viewport__banner-btn--secondary"
              onClick={onResetSculpt}
              title="Limpar todas as deformações feitas com o pincel"
            >
              Limpar Pincel
            </button>
          )}
        </div>
      )}

      {/* Active Tool Banner for Measurement Mode */}
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
              onSculptHistoryChange={onSculptHistoryChange}
              onBrushStrokeStateChange={setIsBrushStrokeActive}
              onBrushHoverChange={setBrushHover}
              onPointerDownCharacter={handlePointerDownCharacter}
            />
          </Suspense>
        </group>

        {/* 3D Surface Brush Ring Indicator */}
        {state.activeTool === 'sculpt' && state.brush.enabled && (
          <BrushCursorIndicator
            hover={brushHover}
            radius={
              state.brush.facialFineMode &&
              brushHover &&
              brushHover.point.y > state.metrics.height * 0.855
                ? Math.min(state.brush.radius, 0.055)
                : state.brush.radius
            }
            mode={state.brush.mode}
            symmetryX={state.brush.symmetryX}
          />
        )}

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
          disabled={isBrushStrokeActive}
        />
      </Canvas>

      {/* Bottom Controls Hint Overlay */}
      <div className="viewport__overlay">
        {state.activeTool === 'sculpt' && state.brush.enabled ? (
          <>
            <span className="viewport__hint">
              <span className="viewport__hint-key">Arrastar no Corpo</span> Esculpir Região
            </span>
            <span className="viewport__hint">
              <span className="viewport__hint-key">Arrastar no Fundo</span> Girar Câmera
            </span>
            <span className="viewport__hint">
              <span className="viewport__hint-key">Ctrl+Z</span> Desfazer
            </span>
          </>
        ) : (
          <>
            <span className="viewport__hint">
              <span className="viewport__hint-key">Arrastar</span> Girar Câmera
            </span>
            <span className="viewport__hint">
              <span className="viewport__hint-key">Botão Direito</span> Mover Vista
            </span>
            <span className="viewport__hint">
              <span className="viewport__hint-key">Scroll</span> Zoom
            </span>
          </>
        )}
      </div>
    </main>
  )
}

useGLTF.preload('/models/personagem_humano_realista.glb')
useGLTF.preload('/models/personagem_humano_anime.glb')
useGLTF.preload('/models/personagem_base_humano.glb')
