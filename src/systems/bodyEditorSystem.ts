import * as THREE from 'three'

export type BrushMode = 'inflate' | 'deflate' | 'smooth'

export interface BrushSettings {
  enabled: boolean
  mode: BrushMode
  radius: number // in meters (0.02m to 0.28m)
  strength: number // 0.05 to 1.0
  symmetryX: boolean
  protectFacialStructures: boolean // protects eyes, eyelids, nose, lips, and ears with smooth transitions while allowing cheek/jaw sculpting
  protectExtremities: boolean // protects fingers/hands and foot soles
  facialFineMode: boolean // automatically refines brush step & falloff on the head/face
}

export type BodyPresetId = 'default' | 'slim' | 'athletic' | 'robust'
export type FacePresetId = 'default' | 'lean' | 'full' | 'sculpted'

export interface FacialProportions {
  cheekVolume: number // -1 (hollow/lean cheeks) to +1 (full/rounded cheeks)
  cheekbones: number // -1 to +1 (cheekbone prominence & cheek-jaw transition)
  faceWidth: number // -1 (narrow face) to +1 (wide face)
  jawWidth: number // -1 (slender jaw/lower face) to +1 (broad jaw/lower face)
  chinShape: number // -1 (tapered/delicate chin) to +1 (prominent/strong chin)
  headScale: number // -1 to +1 (overall head proportions)
}

export const DEFAULT_FACIAL_PROPORTIONS: FacialProportions = {
  cheekVolume: 0,
  cheekbones: 0,
  faceWidth: 0,
  jawWidth: 0,
  chinShape: 0,
  headScale: 0,
}

export const FACE_PRESETS: Record<
  FacePresetId,
  { label: string; values: FacialProportions }
> = {
  default: {
    label: 'Padrão',
    values: { ...DEFAULT_FACIAL_PROPORTIONS },
  },
  lean: {
    label: 'Rosto Magro',
    values: {
      cheekVolume: -0.65,
      cheekbones: 0.45,
      faceWidth: -0.25,
      jawWidth: -0.35,
      chinShape: -0.15,
      headScale: 0,
    },
  },
  full: {
    label: 'Rosto Cheio',
    values: {
      cheekVolume: 0.65,
      cheekbones: -0.15,
      faceWidth: 0.3,
      jawWidth: 0.45,
      chinShape: 0.1,
      headScale: 0,
    },
  },
  sculpted: {
    label: 'Angular / Marcado',
    values: {
      cheekVolume: -0.4,
      cheekbones: 0.7,
      faceWidth: 0.05,
      jawWidth: 0.55,
      chinShape: 0.55,
      headScale: 0,
    },
  },
}

export interface ExtendedBodyProportions {
  heightMeters: number
  shoulderWidth: number // -1 to 1
  torsoWidth: number // -1 to 1
  chestVolume: number // -1 to 1
  abdomenVolume: number // -1 to 1
  armThickness: number // -1 to 1
  legThickness: number // -1 to 1
  thighVolume: number // -1 to 1
  armLength: number // -1 to 1
  legLength: number // -1 to 1
  muscleTone: number // 0 to 1
}

export const BODY_PRESETS: Record<
  BodyPresetId,
  { label: string; values: Omit<ExtendedBodyProportions, 'heightMeters'> }
> = {
  default: {
    label: 'Equilibrado',
    values: {
      shoulderWidth: 0,
      torsoWidth: 0,
      chestVolume: 0,
      abdomenVolume: 0,
      armThickness: 0,
      legThickness: 0,
      thighVolume: 0,
      armLength: 0,
      legLength: 0,
      muscleTone: 0.25,
    },
  },
  slim: {
    label: 'Magro / Esguio',
    values: {
      shoulderWidth: -0.32,
      torsoWidth: -0.45,
      chestVolume: -0.35,
      abdomenVolume: -0.5,
      armThickness: -0.48,
      legThickness: -0.42,
      thighVolume: -0.45,
      armLength: 0.08,
      legLength: 0.12,
      muscleTone: 0.12,
    },
  },
  athletic: {
    label: 'Atlético / Musculoso',
    values: {
      shoulderWidth: 0.58,
      torsoWidth: 0.15,
      chestVolume: 0.65,
      abdomenVolume: -0.38,
      armThickness: 0.58,
      legThickness: 0.45,
      thighVolume: 0.52,
      armLength: 0.04,
      legLength: 0.05,
      muscleTone: 0.92,
    },
  },
  robust: {
    label: 'Robusto / Forte',
    values: {
      shoulderWidth: 0.48,
      torsoWidth: 0.72,
      chestVolume: 0.55,
      abdomenVolume: 0.72,
      armThickness: 0.62,
      legThickness: 0.58,
      thighVolume: 0.7,
      armLength: 0,
      legLength: -0.04,
      muscleTone: 0.35,
    },
  },
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Welded vertex topology cache for seamless surface sculpting without opening UV seams.
 */
export interface WeldedTopology {
  vertexCount: number
  modelHeight: number
  /** Maps each buffer vertex index -> cluster index */
  vertexToCluster: Int32Array
  /** List of buffer vertex indices belonging to each unique 3D spatial vertex */
  clusters: number[][]
  /** Adjacency list of connected neighbor cluster indices for true Laplacian smoothing */
  clusterNeighbors: number[][]
  /** Representative XYZ position per cluster in rest pose */
  clusterRestPositions: Float32Array
  /** Unified smooth normal per cluster in rest pose */
  clusterRestNormals: Float32Array
  /** Smooth protection mask for sensitive facial structures (0 = eyes/eyelids/nose/lips/ears, 1 = editable cheeks/jaw/forehead/body) */
  clusterFacialFeatureMask: Float32Array
  /** Smooth protection mask for hands/fingers and foot soles (0 = protected, 1 = editable) */
  clusterExtremityMask: Float32Array
}

/**
 * Builds a welded spatial topology from a BufferGeometry so brush strokes never split UV seams,
 * and precomputes smooth anatomical protection masks for eyes, eyelids, nose, lips, ears, hands, and feet.
 */
export function buildWeldedTopology(
  geometry: THREE.BufferGeometry,
  basePositions: Float32Array,
  modelHeight: number,
  eyeCenters?: { left: [number, number, number]; right: [number, number, number] }
): WeldedTopology {
  const vertexCount = basePositions.length / 3
  const vertexToCluster = new Int32Array(vertexCount)
  const clusters: number[][] = []
  const spatialMap = new Map<string, number>()

  for (let i = 0; i < vertexCount; i++) {
    const x = basePositions[i * 3]
    const y = basePositions[i * 3 + 1]
    const z = basePositions[i * 3 + 2]
    const key = `${Math.round(x * 2000)}_${Math.round(y * 2000)}_${Math.round(z * 2000)}`
    let cIdx = spatialMap.get(key)
    if (cIdx === undefined) {
      cIdx = clusters.length
      spatialMap.set(key, cIdx)
      clusters.push([i])
    } else {
      clusters[cIdx].push(i)
    }
    vertexToCluster[i] = cIdx
  }

  const clusterCount = clusters.length
  const clusterRestPositions = new Float32Array(clusterCount * 3)
  const clusterRestNormals = new Float32Array(clusterCount * 3)
  const clusterFacialFeatureMask = new Float32Array(clusterCount)
  const clusterExtremityMask = new Float32Array(clusterCount)

  // Build neighbor graph for Laplacian smoothing
  const neighborSets: Set<number>[] = Array.from({ length: clusterCount }, () => new Set<number>())
  const idxAttr = geometry.index
  if (idxAttr) {
    const idxArr = idxAttr.array
    for (let i = 0; i < idxArr.length; i += 3) {
      const c0 = vertexToCluster[idxArr[i]]
      const c1 = vertexToCluster[idxArr[i + 1]]
      const c2 = vertexToCluster[idxArr[i + 2]]
      if (c0 !== c1) {
        neighborSets[c0].add(c1)
        neighborSets[c1].add(c0)
      }
      if (c1 !== c2) {
        neighborSets[c1].add(c2)
        neighborSets[c2].add(c1)
      }
      if (c2 !== c0) {
        neighborSets[c2].add(c0)
        neighborSets[c0].add(c2)
      }
    }
  }
  const clusterNeighbors = neighborSets.map((s) => Array.from(s))

  const normAttr = geometry.attributes.normal
  const h = Math.max(1.0, modelHeight)

  // Default or provided eye centers in rest space
  const lEye = eyeCenters?.left ?? [0.0309 * (h / 1.795), 0.936 * h, -0.0047]
  const rEye = eyeCenters?.right ?? [-0.0309 * (h / 1.795), 0.936 * h, -0.0047]
  const noseCenterY = 0.916 * h
  const noseCenterZ = 0.022 * (h / 1.795)
  const mouthCenterY = 0.894 * h
  const mouthCenterZ = 0.015 * (h / 1.795)

  for (let c = 0; c < clusterCount; c++) {
    const members = clusters[c]
    const first = members[0]
    const px = basePositions[first * 3]
    const py = basePositions[first * 3 + 1]
    const pz = basePositions[first * 3 + 2]

    clusterRestPositions[c * 3] = px
    clusterRestPositions[c * 3 + 1] = py
    clusterRestPositions[c * 3 + 2] = pz

    let nx = 0,
      ny = 0,
      nz = 0
    if (normAttr) {
      for (const m of members) {
        nx += normAttr.getX(m)
        ny += normAttr.getY(m)
        nz += normAttr.getZ(m)
      }
    }
    const len = Math.hypot(nx, ny, nz) || 1
    clusterRestNormals[c * 3] = nx / len
    clusterRestNormals[c * 3 + 1] = ny / len
    clusterRestNormals[c * 3 + 2] = nz / len

    const yNorm = py / h
    const absX = Math.abs(px)

    // 1. Extremity Mask (Hands/Fingers & Foot Soles)
    let extMask = 1.0
    if (yNorm < 0.065) {
      extMask = 0.0
    } else if (yNorm < 0.11) {
      extMask = smoothstep(0.065, 0.11, yNorm)
    }
    const absXNorm = absX / h
    if (absXNorm > 0.24 && yNorm > 0.56 && yNorm < 0.72) {
      // Hand and fingers region in A-pose
      extMask = Math.min(extMask, 1.0 - smoothstep(0.22, 0.26, absXNorm))
    }
    clusterExtremityMask[c] = extMask

    // 2. Facial Sensitive Structures Mask (Eyes, Eyelids, Nose, Mouth, Ears)
    // Allows smooth sculpting on cheeks, cheekbones, jawline, chin, and forehead while protecting delicate features!
    let faceMask = 1.0
    if (yNorm > 0.85) {
      // Distance to left & right eye sockets (ellipsoidal metric wider horizontally for eyelids)
      const dLEye = Math.hypot(
        (px - lEye[0]) / 1.15,
        (py - lEye[1]) / 0.85,
        (pz - lEye[2]) / 1.25
      )
      const dREye = Math.hypot(
        (px - rEye[0]) / 1.15,
        (py - rEye[1]) / 0.85,
        (pz - rEye[2]) / 1.25
      )
      const dEye = Math.min(dLEye, dREye)
      const eyeProtection = smoothstep(0.019 * (h / 1.795), 0.033 * (h / 1.795), dEye)

      // Distance to Nose bridge, tip & nostrils
      const dNose = Math.hypot(
        px / 0.75,
        (py - noseCenterY) / 1.15,
        Math.max(0, noseCenterZ - pz) / 1.1
      )
      const noseProtection =
        pz > -0.005
          ? smoothstep(0.017 * (h / 1.795), 0.029 * (h / 1.795), dNose)
          : 1.0

      // Distance to Mouth & Lips
      const dMouth = Math.hypot(
        px / 1.25,
        (py - mouthCenterY) / 0.65,
        Math.max(0, mouthCenterZ - pz) / 1.1
      )
      const mouthProtection =
        pz > -0.008
          ? smoothstep(0.016 * (h / 1.795), 0.027 * (h / 1.795), dMouth)
          : 1.0

      // Ears protection (outer lateral head |x| > 0.068m)
      const earProtection =
        pz < -0.015
          ? 1.0 - smoothstep(0.064 * (h / 1.795), 0.076 * (h / 1.795), absX)
          : 1.0

      faceMask = Math.min(eyeProtection, noseProtection, mouthProtection, earProtection)
    }
    clusterFacialFeatureMask[c] = faceMask
  }

  return {
    vertexCount,
    modelHeight: h,
    vertexToCluster,
    clusters,
    clusterNeighbors,
    clusterRestPositions,
    clusterRestNormals,
    clusterFacialFeatureMask,
    clusterExtremityMask,
  }
}

/**
 * Applies a single localized brush dab in local mesh coordinates onto the sculptOffsets array.
 * Features:
 * - C2 Quartic smooth falloff ((1 - (d/r)^2)^2)
 * - Surface normal orientation filter (prevents back-side or cavity bleed-through)
 * - Smooth anatomical protection for eyes, eyelids, nose, mouth, and ears
 * - True Laplacian surface neighbor relaxation in 'smooth' mode
 * - Automatic facial precision scaling when sculpting on the head
 */
export function applyBrushDab({
  topology,
  currentPositions,
  sculptOffsets,
  localHitPoint,
  localHitNormal,
  localRadius,
  settings,
}: {
  topology: WeldedTopology
  currentPositions: Float32Array
  sculptOffsets: Float32Array
  localHitPoint: THREE.Vector3
  localHitNormal?: THREE.Vector3
  localRadius: number
  settings: BrushSettings
}): boolean {
  const clusterCount = topology.clusters.length
  const hitX = localHitPoint.x
  const hitY = localHitPoint.y
  const hitZ = localHitPoint.z

  // Check if user is sculpting on the head/face region
  const isFaceRegion = hitY > topology.modelHeight * 0.855
  const effectiveRadius =
    isFaceRegion && settings.facialFineMode
      ? Math.min(localRadius, 0.055)
      : localRadius
  const rSq = effectiveRadius * effectiveRadius

  const maxDisp = isFaceRegion ? 0.018 : 0.065 // 1.8cm max on face, 6.5cm max on body
  const sign = settings.mode === 'inflate' ? 1 : settings.mode === 'deflate' ? -1 : 0
  const baseStep = isFaceRegion && settings.facialFineMode ? 0.0018 : 0.0042
  const stepAmount = baseStep * settings.strength

  let modified = false
  const visitedClusters = new Uint8Array(clusterCount)

  // Snapshot current sculptOffsets when using Laplacian smooth so neighbor reads are order-independent
  const prevOffsets =
    settings.mode === 'smooth' ? new Float32Array(sculptOffsets) : null

  const applyToCluster = (
    c: number,
    distSq: number,
    refNormalX: number,
    refNormalY: number,
    refNormalZ: number
  ) => {
    if (visitedClusters[c]) return
    visitedClusters[c] = 1

    let protection = 1.0
    if (settings.protectExtremities) {
      protection = Math.min(protection, topology.clusterExtremityMask[c])
    }
    if (settings.protectFacialStructures) {
      protection = Math.min(protection, topology.clusterFacialFeatureMask[c])
    }
    if (protection <= 0.001) return

    const nx = topology.clusterRestNormals[c * 3]
    const ny = topology.clusterRestNormals[c * 3 + 1]
    const nz = topology.clusterRestNormals[c * 3 + 2]

    // Normal orientation alignment filter: prevents sculpting front cheek from pulling back-facing or perpendicular eye/mouth cavity walls
    const dot = nx * refNormalX + ny * refNormalY + nz * refNormalZ
    const normalWeight = smoothstep(0.05, 0.35, dot)
    if (normalWeight <= 0.001) return

    // Quartic C2 smooth falloff: (1 - (d/r)^2)^2
    const u = Math.min(1, distSq / rSq)
    const falloff = (1 - u) * (1 - u) * protection * normalWeight
    if (falloff <= 0.0005) return

    const members = topology.clusters[c]
    const first = members[0] * 3

    if (settings.mode === 'smooth' && prevOffsets) {
      const neighbors = topology.clusterNeighbors[c]
      let avgX = 0,
        avgY = 0,
        avgZ = 0
      if (neighbors.length > 0) {
        for (const nCluster of neighbors) {
          const nFirst = topology.clusters[nCluster][0] * 3
          avgX += prevOffsets[nFirst]
          avgY += prevOffsets[nFirst + 1]
          avgZ += prevOffsets[nFirst + 2]
        }
        avgX /= neighbors.length
        avgY /= neighbors.length
        avgZ /= neighbors.length
      }
      // Blend toward neighbor average (Laplacian smoothing) + slight decay toward zero
      const targetX = avgX * 0.85
      const targetY = avgY * 0.85
      const targetZ = avgZ * 0.85
      const relax = Math.min(0.45, 0.28 * settings.strength * falloff)

      const ox = prevOffsets[first] + (targetX - prevOffsets[first]) * relax
      const oy = prevOffsets[first + 1] + (targetY - prevOffsets[first + 1]) * relax
      const oz = prevOffsets[first + 2] + (targetZ - prevOffsets[first + 2]) * relax

      for (const vIdx of members) {
        const b = vIdx * 3
        sculptOffsets[b] = ox
        sculptOffsets[b + 1] = oy
        sculptOffsets[b + 2] = oz
      }
      modified = true
      return
    }

    const delta = sign * stepAmount * falloff

    let nextX = sculptOffsets[first] + nx * delta
    let nextY = sculptOffsets[first + 1] + ny * delta * (isFaceRegion ? 0.25 : 0.35)
    let nextZ = sculptOffsets[first + 2] + nz * delta

    const mag = Math.hypot(nextX, nextY, nextZ)
    if (mag > maxDisp) {
      const s = maxDisp / mag
      nextX *= s
      nextY *= s
      nextZ *= s
    }

    for (const vIdx of members) {
      const b = vIdx * 3
      sculptOffsets[b] = nextX
      sculptOffsets[b + 1] = nextY
      sculptOffsets[b + 2] = nextZ
    }
    modified = true
  }

  const refNX = localHitNormal ? localHitNormal.x : 0
  const refNY = localHitNormal ? localHitNormal.y : 0
  const refNZ = localHitNormal ? localHitNormal.z : 1

  for (let c = 0; c < clusterCount; c++) {
    const repVert = topology.clusters[c][0] * 3
    const vx = currentPositions[repVert]
    const vy = currentPositions[repVert + 1]
    const vz = currentPositions[repVert + 2]

    const dx = vx - hitX
    const dy = vy - hitY
    const dz = vz - hitZ
    const dSq = dx * dx + dy * dy + dz * dz

    if (dSq < rSq) {
      applyToCluster(c, dSq, refNX, refNY, refNZ)
    }

    if (settings.symmetryX && Math.abs(hitX) > 0.004) {
      const mdx = vx - -hitX
      const mdSq = mdx * mdx + dy * dy + dz * dz
      if (mdSq < rSq) {
        applyToCluster(c, mdSq, -refNX, refNY, refNZ)
      }
    }
  }

  return modified
}
