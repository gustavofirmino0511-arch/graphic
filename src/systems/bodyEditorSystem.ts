import * as THREE from 'three'

export type BrushMode = 'inflate' | 'deflate' | 'smooth' | 'grab'

export type GeneralPresetId = 'padrao' | 'magro' | 'gordo'

export interface BrushSettings {
  enabled: boolean
  mode: BrushMode
  radius: number // in meters (0.01m to 0.28m)
  strength: number // 0.05 to 1.0
  symmetryX: boolean
  protectFacialStructures: boolean // protects eyes, eyelids, nose, lips, and ears with smooth transitions while allowing cheek/jaw sculpting
  protectExtremities: boolean // protects fingers/hands and foot soles
  facialFineMode: boolean // automatically refines brush step & falloff on the head/face
}

export type BodyPresetId = 'default' | 'slim' | 'athletic' | 'robust'

export type FacePresetId =
  | 'default'
  | 'slightly_lean'
  | 'lean'
  | 'very_lean'
  | 'extremely_lean'
  | 'full'
  | 'sculpted'
  | 'narrow_jaw'
  | 'wide_jaw'

export interface FacialProportions {
  cheekVolume: number // -1 (lean mid-cheeks) to +1 (full/convex mid-cheeks)
  cheekDepth: number // -1 (deeply hollow/sunken sub-malar cheeks) to +1 (filled sub-malar transition)
  facialFat: number // -1 (dry/zero lower facial fat) to +1 (rounded/chubby lower cheeks & submental)
  cheekbones: number // -1 (soft/flat malar arch) to +1 (prominent/high sculpted cheekbones)
  faceWidth: number // -1 (narrow facial framework) to +1 (wide facial framework)
  jawWidth: number // -1 (narrow lower face/mandible) to +1 (broad lower face/mandible)
  jawDefinition: number // -1 (soft/rounded jawline) to +1 (sharp/angular gonial & mandibular ridge)
  chinShape: number // -1 (tapered/delicate chin) to +1 (prominent/strong chin)
  headScale: number // -1 to +1 (overall head proportions)
}

export const DEFAULT_FACIAL_PROPORTIONS: FacialProportions = {
  cheekVolume: 0,
  cheekDepth: 0,
  facialFat: 0,
  cheekbones: 0,
  faceWidth: 0,
  jawWidth: 0,
  jawDefinition: 0,
  chinShape: 0,
  headScale: 0,
}

export const FACE_PRESETS: Record<
  FacePresetId,
  { label: string; values: FacialProportions }
> = {
  default: {
    label: 'Equilibrado',
    values: { ...DEFAULT_FACIAL_PROPORTIONS },
  },
  slightly_lean: {
    label: 'Levemente Magro',
    values: {
      cheekVolume: -0.35,
      cheekDepth: -0.3,
      facialFat: -0.25,
      cheekbones: 0.2,
      faceWidth: -0.08,
      jawWidth: -0.12,
      jawDefinition: 0.25,
      chinShape: -0.05,
      headScale: 0,
    },
  },
  lean: {
    label: 'Rosto Magro',
    values: {
      cheekVolume: -0.65,
      cheekDepth: -0.6,
      facialFat: -0.55,
      cheekbones: 0.45,
      faceWidth: -0.18,
      jawWidth: -0.28,
      jawDefinition: 0.5,
      chinShape: -0.12,
      headScale: 0,
    },
  },
  very_lean: {
    label: 'Muito Magro',
    values: {
      cheekVolume: -0.88,
      cheekDepth: -0.85,
      facialFat: -0.8,
      cheekbones: 0.68,
      faceWidth: -0.28,
      jawWidth: -0.42,
      jawDefinition: 0.75,
      chinShape: -0.18,
      headScale: 0,
    },
  },
  extremely_lean: {
    label: 'Extremamente Magro',
    values: {
      cheekVolume: -1.0,
      cheekDepth: -1.0,
      facialFat: -1.0,
      cheekbones: 0.85,
      faceWidth: -0.38,
      jawWidth: -0.52,
      jawDefinition: 0.92,
      chinShape: -0.22,
      headScale: 0,
    },
  },
  full: {
    label: 'Rosto Cheio',
    values: {
      cheekVolume: 0.85,
      cheekDepth: 0.75,
      facialFat: 0.85,
      cheekbones: -0.25,
      faceWidth: 0.35,
      jawWidth: 0.48,
      jawDefinition: -0.45,
      chinShape: 0.1,
      headScale: 0,
    },
  },
  sculpted: {
    label: 'Maçãs Definidas',
    values: {
      cheekVolume: -0.5,
      cheekDepth: -0.75,
      facialFat: -0.4,
      cheekbones: 1.0,
      faceWidth: 0.05,
      jawWidth: 0.25,
      jawDefinition: 0.85,
      chinShape: 0.45,
      headScale: 0,
    },
  },
  narrow_jaw: {
    label: 'Mandíbula Estreita',
    values: {
      cheekVolume: -0.25,
      cheekDepth: -0.3,
      facialFat: -0.35,
      cheekbones: 0.35,
      faceWidth: -0.15,
      jawWidth: -0.85,
      jawDefinition: 0.45,
      chinShape: -0.45,
      headScale: 0,
    },
  },
  wide_jaw: {
    label: 'Mandíbula Larga',
    values: {
      cheekVolume: 0.1,
      cheekDepth: -0.2,
      facialFat: 0.1,
      cheekbones: 0.3,
      faceWidth: 0.25,
      jawWidth: 0.9,
      jawDefinition: 0.75,
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

/**
 * Simplified General Starting-Point Presets (Corpo Padrão, Corpo Magro, Corpo Gordo)
 * as requested for direct viewport sculpting workflow.
 */
export const GENERAL_CHARACTER_PRESETS: Record<
  GeneralPresetId,
  {
    label: string
    subtitle: string
    bodyMass: number
    body: Omit<ExtendedBodyProportions, 'heightMeters'>
    face: FacialProportions
  }
> = {
  padrao: {
    label: 'Corpo Padrão',
    subtitle: 'Equilibrado',
    bodyMass: 0,
    body: { ...BODY_PRESETS.default.values },
    face: { ...DEFAULT_FACIAL_PROPORTIONS },
  },
  magro: {
    label: 'Corpo Magro',
    subtitle: 'Esguio & Definido',
    bodyMass: -0.68,
    body: {
      shoulderWidth: -0.38,
      torsoWidth: -0.62,
      chestVolume: -0.52,
      abdomenVolume: -0.68,
      armThickness: -0.65,
      legThickness: -0.58,
      thighVolume: -0.62,
      armLength: 0.06,
      legLength: 0.08,
      muscleTone: 0.14,
    },
    face: {
      ...FACE_PRESETS.very_lean.values,
    },
  },
  gordo: {
    label: 'Corpo Gordo',
    subtitle: 'Volumoso',
    bodyMass: 0.78,
    body: {
      shoulderWidth: 0.32,
      torsoWidth: 0.85,
      chestVolume: 0.68,
      abdomenVolume: 0.92,
      armThickness: 0.72,
      legThickness: 0.68,
      thighVolume: 0.82,
      armLength: 0,
      legLength: -0.04,
      muscleTone: 0.08,
    },
    face: {
      ...FACE_PRESETS.full.values,
    },
  },
}

/**
 * Computes coherent body & facial proportions from a continuous master Body Mass value
 * (-1.0 = Extreme Skeletal Emaciation / Revelação Óssea, 0.0 = Corpo Padrão, +1.0 = Corpo Gordo).
 */
export function computeProportionsFromBodyMass(
  mass: number,
  currentHeightMeters = 1.75
): {
  body: ExtendedBodyProportions
  face: FacialProportions
} {
  const m = Math.max(-1, Math.min(1, mass))
  if (m < 0) {
    const t = -m // 0 to 1 (thin to extreme skeletal emaciated)
    return {
      body: {
        heightMeters: currentHeightMeters,
        shoulderWidth: -0.55 * t,
        torsoWidth: -0.95 * t,
        chestVolume: -0.88 * t,
        abdomenVolume: -0.98 * t,
        armThickness: -0.95 * t,
        legThickness: -0.9 * t,
        thighVolume: -0.94 * t,
        armLength: 0.06 * t,
        legLength: 0.08 * t,
        muscleTone: Math.max(0.05, 0.25 * (1 - t * 0.7)),
      },
      face: {
        cheekVolume: -1.0 * t,
        cheekDepth: -1.0 * t,
        facialFat: -1.0 * t,
        cheekbones: 0.92 * t,
        faceWidth: -0.42 * t,
        jawWidth: -0.56 * t,
        jawDefinition: 0.95 * t,
        chinShape: -0.22 * t,
        headScale: 0,
      },
    }
  } else {
    const t = m // 0 to 1 (balanced to heavy/fat)
    return {
      body: {
        heightMeters: currentHeightMeters,
        shoulderWidth: 0.36 * t,
        torsoWidth: 0.92 * t,
        chestVolume: 0.78 * t,
        abdomenVolume: 1.0 * t,
        armThickness: 0.82 * t,
        legThickness: 0.76 * t,
        thighVolume: 0.9 * t,
        armLength: 0,
        legLength: -0.04 * t,
        muscleTone: Math.max(0.05, 0.25 * (1 - t * 0.75)),
      },
      face: {
        cheekVolume: 0.92 * t,
        cheekDepth: 0.85 * t,
        facialFat: 0.95 * t,
        cheekbones: -0.35 * t,
        faceWidth: 0.42 * t,
        jawWidth: 0.56 * t,
        jawDefinition: -0.55 * t,
        chinShape: 0.14 * t,
        headScale: 0,
      },
    }
  }
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
  eyeY: number
  eyeZ: number
  noseCenterY: number
  noseCenterZ: number
  mouthCenterY: number
  mouthCenterZ: number
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
  /** Strict orbital & eyelid shield (0 = eyeballs/eyelids/canthus, 1 = outside orbit) */
  clusterOrbitalShield: Float32Array
  /** Smooth protection mask for nose (0 = nasal tip/nostrils, 1 = outside nose) */
  clusterNoseMask: Float32Array
  /** Smooth protection mask for lips/mouth rima (0 = lips, 1 = outside mouth) */
  clusterLipMask: Float32Array
  /** Smooth protection mask for ear pinna (0 = ear, 1 = outside ear) */
  clusterEarMask: Float32Array
  /** Combined facial feature mask (min of orbital, nose, lip, ear) */
  clusterFacialFeatureMask: Float32Array
  /** Smooth protection mask for hands/fingers and foot soles (0 = protected, 1 = editable) */
  clusterExtremityMask: Float32Array
  /** True for clusters belonging to the internal oral cavity bag */
  clusterIsInnerOral: Uint8Array
  /** Pairs each inner oral cavity cluster with its nearest outer cheek skin clusters so manual deflation never self-intersects */
  innerOralToOuterClusters: Map<number, number[]>
}

/**
 * Builds a welded spatial topology from a BufferGeometry so brush strokes never split UV seams,
 * precomputes smooth anatomical protection masks for eyes, eyelids, nose, lips, ears, hands, and feet,
 * and maps internal oral cavity clusters to outer cheek clusters to prevent self-intersection.
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
  const clusterOrbitalShield = new Float32Array(clusterCount)
  const clusterNoseMask = new Float32Array(clusterCount)
  const clusterLipMask = new Float32Array(clusterCount)
  const clusterEarMask = new Float32Array(clusterCount)
  const clusterFacialFeatureMask = new Float32Array(clusterCount)
  const clusterExtremityMask = new Float32Array(clusterCount)
  const clusterIsInnerOral = new Uint8Array(clusterCount)

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
  const scaleRef = h / 1.795

  // Default or provided eye centers in rest space
  const lEye = eyeCenters?.left ?? [0.0309 * scaleRef, 0.936 * h, -0.0047]
  const rEye = eyeCenters?.right ?? [-0.0309 * scaleRef, 0.936 * h, -0.0047]
  const eyeY = (lEye[1] + rEye[1]) * 0.5
  const eyeZ = (lEye[2] + rEye[2]) * 0.5

  // Anatomical nose & mouth centers relative to actual eye centers
  const noseCenterY = eyeY - 0.038 * scaleRef
  const noseCenterZ = eyeZ + 0.034 * scaleRef
  const mouthCenterY = eyeY - 0.072 * scaleRef
  const mouthCenterZ = eyeZ + 0.025 * scaleRef

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
      extMask = Math.min(extMask, 1.0 - smoothstep(0.22, 0.26, absXNorm))
    }
    clusterExtremityMask[c] = extMask

    // 2. Facial Sensitive Structures Masks (Orbital/Eyelids, Nose, Mouth/Lips, Ears)
    let eyeProtection = 1.0
    let noseProtection = 1.0
    let mouthProtection = 1.0
    let earProtection = 1.0

    if (py > eyeY - 0.14 * scaleRef) {
      // Ellipsoidal distance to left & right eye sockets (protects upper/lower eyelids, tear duct, and orbital rim)
      // Uses generous Z scale (1.55) so anterior eyelid rims at eyeZ + 12mm are 100% locked against eyeball intersection
      const dLEye = Math.hypot(
        (px - lEye[0]) / 1.28,
        (py - lEye[1]) / 1.02,
        (pz - lEye[2]) / 1.55
      )
      const dREye = Math.hypot(
        (px - rEye[0]) / 1.28,
        (py - rEye[1]) / 1.02,
        (pz - rEye[2]) / 1.55
      )
      const dEye = Math.min(dLEye, dREye)
      eyeProtection = smoothstep(0.022 * scaleRef, 0.036 * scaleRef, dEye)

      // Distance to Nose bridge, tip & nostrils
      const dNose = Math.hypot(
        px / 0.85,
        (py - noseCenterY) / 1.25,
        Math.max(0, noseCenterZ - pz) / 1.15
      )
      noseProtection =
        pz > eyeZ - 0.005 * scaleRef
          ? smoothstep(0.017 * scaleRef, 0.03 * scaleRef, dNose)
          : 1.0

      // Distance to Mouth & Lips
      const dMouth = Math.hypot(
        px / 1.28,
        (py - mouthCenterY) / 0.68,
        Math.max(0, mouthCenterZ - pz) / 1.15
      )
      mouthProtection =
        pz > eyeZ - 0.008 * scaleRef
          ? smoothstep(0.016 * scaleRef, 0.028 * scaleRef, dMouth)
          : 1.0

      // Ears protection
      earProtection =
        pz < eyeZ - 0.018 * scaleRef
          ? 1.0 - smoothstep(0.062 * scaleRef, 0.074 * scaleRef, absX)
          : 1.0
    }

    clusterOrbitalShield[c] = eyeProtection
    clusterNoseMask[c] = noseProtection
    clusterLipMask[c] = mouthProtection
    clusterEarMask[c] = earProtection
    clusterFacialFeatureMask[c] = Math.min(
      eyeProtection,
      noseProtection,
      mouthProtection,
      earProtection
    )
  }

  // Identify internal oral cavity clusters (strictly inside outer cheek skin at the same Y, Z)
  const headClusters: number[] = []
  for (let c = 0; c < clusterCount; c++) {
    const py = clusterRestPositions[c * 3 + 1]
    if (py > eyeY - 0.118 * scaleRef && py < eyeY - 0.022 * scaleRef) {
      headClusters.push(c)
    }
  }

  const innerOralToOuterClusters = new Map<number, number[]>()
  for (const ic of headClusters) {
    const ix = clusterRestPositions[ic * 3]
    const iy = clusterRestPositions[ic * 3 + 1]
    const iz = clusterRestPositions[ic * 3 + 2]
    if (Math.abs(ix) > 0.044 * scaleRef || iz < eyeZ - 0.022 * scaleRef) continue

    const outerMatches: number[] = []
    for (const oc of headClusters) {
      if (oc === ic) continue
      const ox = clusterRestPositions[oc * 3]
      const oy = clusterRestPositions[oc * 3 + 1]
      const oz = clusterRestPositions[oc * 3 + 2]
      if (
        Math.sign(ox) === Math.sign(ix || 1) &&
        Math.abs(oy - iy) < 0.006 * scaleRef &&
        Math.abs(oz - iz) < 0.006 * scaleRef &&
        Math.abs(ox) > Math.abs(ix) + 0.007 * scaleRef
      ) {
        outerMatches.push(oc)
      }
    }
    if (outerMatches.length > 0) {
      clusterIsInnerOral[ic] = 1
      innerOralToOuterClusters.set(ic, outerMatches)
    }
  }

  return {
    vertexCount,
    modelHeight: h,
    eyeY,
    eyeZ,
    noseCenterY,
    noseCenterZ,
    mouthCenterY,
    mouthCenterZ,
    vertexToCluster,
    clusters,
    clusterNeighbors,
    clusterRestPositions,
    clusterRestNormals,
    clusterOrbitalShield,
    clusterNoseMask,
    clusterLipMask,
    clusterEarMask,
    clusterFacialFeatureMask,
    clusterExtremityMask,
    clusterIsInnerOral,
    innerOralToOuterClusters,
  }
}

/**
 * Applies a single localized brush dab in local mesh coordinates onto the sculptOffsets array.
 * Features:
 * - C2 Quartic smooth falloff ((1 - (d/r)^2)^2)
 * - Surface normal orientation filter (prevents back-side or cavity bleed-through)
 * - Strict orbital shield + region-aware facial masking (protects eyes, eyelids, nose, and lips when sculpting cheeks, while allowing direct nose/chin/forehead sculpting when clicked directly)
 * - Anatomical buccal hollow vector in 'deflate' mode (prevents pulling infraorbital cheek backward in -Z behind the eyeballs and prevents midline self-intersection)
 * - Interactive 'grab' mode for pulling/shaping regions directly in 3D
 * - True Laplacian surface neighbor relaxation in 'smooth' mode + automatic 1-ring boundary relaxation on facial dabs
 */
export function applyBrushDab({
  topology,
  currentPositions,
  sculptOffsets,
  localHitPoint,
  localHitNormal,
  localRadius,
  settings,
  grabDelta,
  skinBoneFloorPos,
}: {
  topology: WeldedTopology
  currentPositions: Float32Array
  sculptOffsets: Float32Array
  localHitPoint: THREE.Vector3
  localHitNormal?: THREE.Vector3
  localRadius: number
  settings: BrushSettings
  grabDelta?: THREE.Vector3
  skinBoneFloorPos?: Float32Array
}): boolean {
  const clusterCount = topology.clusters.length
  const hitX = localHitPoint.x
  const hitY = localHitPoint.y
  const hitZ = localHitPoint.z

  const scaleRef = topology.modelHeight / 1.795
  // Check if user is sculpting on the head/face region
  const isFaceRegion = hitY > topology.modelHeight * 0.855
  const effectiveRadius =
    isFaceRegion && settings.facialFineMode
      ? Math.min(localRadius, 0.048)
      : localRadius
  const rSq = effectiveRadius * effectiveRadius

  // Detect if user intentionally clicked directly on the Nose so they can sculpt the nose when desired,
  // whereas clicking on the cheeks/jaw shields the nose and lips from spillover.
  const isClickingNose =
    isFaceRegion &&
    Math.abs(hitX) < 0.017 * scaleRef &&
    Math.abs(hitY - topology.noseCenterY) < 0.022 * scaleRef &&
    hitZ > topology.eyeZ + 0.008 * scaleRef

  const maxDisp = isFaceRegion ? 0.022 : 0.075 // 2.2cm max on face, 7.5cm max on body
  const sign = settings.mode === 'inflate' ? 1 : settings.mode === 'deflate' ? -1 : 0
  const baseStep = isFaceRegion && settings.facialFineMode ? 0.0016 : 0.0045
  const stepAmount = baseStep * settings.strength

  let modified = false
  const visitedClusters = new Uint8Array(clusterCount)
  const modifiedClusterIndices: number[] = []

  // Snapshot current sculptOffsets when using Laplacian smooth so neighbor reads are order-independent
  const prevOffsets =
    settings.mode === 'smooth' ? new Float32Array(sculptOffsets) : null

  const applyToCluster = (
    c: number,
    distSq: number,
    refNormalX: number,
    refNormalY: number,
    refNormalZ: number,
    mirrored: boolean
  ) => {
    if (visitedClusters[c] || topology.clusterIsInnerOral[c]) return
    visitedClusters[c] = 1

    // Eyelids and orbital rim are ALWAYS protected on the face so eyeballs never pop out or intersect eyelids
    let protection = isFaceRegion ? topology.clusterOrbitalShield[c] : 1.0
    if (settings.protectExtremities) {
      protection = Math.min(protection, topology.clusterExtremityMask[c])
    }
    if (settings.protectFacialStructures && isFaceRegion) {
      protection = Math.min(
        protection,
        topology.clusterLipMask[c],
        topology.clusterEarMask[c]
      )
      if (!isClickingNose) {
        protection = Math.min(protection, topology.clusterNoseMask[c])
      }
    }
    if (protection <= 0.001) return

    const nx = topology.clusterRestNormals[c * 3]
    const ny = topology.clusterRestNormals[c * 3 + 1]
    const nz = topology.clusterRestNormals[c * 3 + 2]

    // Normal orientation alignment filter: prevents sculpting front cheek from pulling back-facing or perpendicular eye/mouth cavity walls
    const dot = nx * refNormalX + ny * refNormalY + nz * refNormalZ
    const normalWeight =
      settings.mode === 'grab' ? smoothstep(-0.15, 0.25, dot) : smoothstep(0.08, 0.38, dot)
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
      const targetX = avgX * 0.88
      const targetY = avgY * 0.88
      const targetZ = avgZ * 0.88
      const relax = Math.min(0.48, 0.32 * settings.strength * falloff)

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

    let nextX = sculptOffsets[first]
    let nextY = sculptOffsets[first + 1]
    let nextZ = sculptOffsets[first + 2]

    if (settings.mode === 'grab' && grabDelta) {
      const gScale = falloff * (0.45 + 0.55 * settings.strength)
      const gx = (mirrored ? -grabDelta.x : grabDelta.x) * gScale
      const gy = grabDelta.y * gScale
      const gz = grabDelta.z * gScale
      nextX += gx
      nextY += gy
      nextZ += gz
    } else {
      const delta = sign * stepAmount * falloff
      const restX = topology.clusterRestPositions[c * 3]
      const restY = topology.clusterRestPositions[c * 3 + 1]
      const restZ = topology.clusterRestPositions[c * 3 + 2]

      if (isFaceRegion && settings.mode === 'deflate') {
        // Anatomical facial deflation: hollow cheeks medially toward the buccal recess (-sign(X))
        // and guard the infraorbital region below the eyes from collapsing backward in -Z
        const sideSign = Math.sign(restX) || 1
        const absX = Math.abs(restX)
        const lateralCheekWeight = smoothstep(0.015 * scaleRef, 0.036 * scaleRef, absX)
        const infraOrbitalGuard =
          restY > topology.noseCenterY && restZ > topology.eyeZ - 0.008 * scaleRef
            ? smoothstep(topology.eyeY - 0.005 * scaleRef, topology.noseCenterY - 0.008 * scaleRef, restY)
            : 1.0

        // Blend surface normal with inward medial vector so anterior cheek hollows inward rather than flat-pushing -Z
        const dirX = nx * (1 - 0.55 * lateralCheekWeight) + sideSign * 0.65 * lateralCheekWeight
        const dirY = ny * 0.16
        const dirZ = nz * infraOrbitalGuard * (1 - 0.45 * lateralCheekWeight)

        nextX += dirX * delta
        nextY += dirY * delta
        nextZ += dirZ * delta
      } else {
        nextX += nx * delta
        nextY += ny * delta * (isFaceRegion ? 0.22 : 0.35)
        nextZ += nz * delta
      }
    }

    // Clamp against anatomical bone floor on the face so extreme deflation wraps onto the zygoma/maxilla/mandible without crossing X=0
    if (isFaceRegion && skinBoneFloorPos) {
      const restX = topology.clusterRestPositions[c * 3]
      const sideSign = Math.sign(restX)
      const floorX = skinBoneFloorPos[first]
      const floorZ = skinBoneFloorPos[first + 2]
      const curBaseX = currentPositions[first] - sculptOffsets[first]
      const curBaseZ = currentPositions[first + 2] - sculptOffsets[first + 2]
      const proposedX = curBaseX + nextX
      const proposedZ = curBaseZ + nextZ

      if (sideSign > 0 && proposedX < floorX) {
        nextX = floorX - curBaseX
      } else if (sideSign < 0 && proposedX > floorX) {
        nextX = floorX - curBaseX
      }
      if (proposedZ < floorZ && restX * restX < 0.0025) {
        nextZ = Math.max(nextZ, floorZ - curBaseZ)
      }
    }

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
    if (isFaceRegion) {
      modifiedClusterIndices.push(c)
    }
  }

  const refNX = localHitNormal ? localHitNormal.x : 0
  const refNY = localHitNormal ? localHitNormal.y : 0
  const refNZ = localHitNormal ? localHitNormal.z : 1

  for (let c = 0; c < clusterCount; c++) {
    if (topology.clusterIsInnerOral[c]) continue
    const repVert = topology.clusters[c][0] * 3
    const vx = currentPositions[repVert]
    const vy = currentPositions[repVert + 1]
    const vz = currentPositions[repVert + 2]

    const dx = vx - hitX
    const dy = vy - hitY
    const dz = vz - hitZ
    const dSq = dx * dx + dy * dy + dz * dz

    if (dSq < rSq) {
      applyToCluster(c, dSq, refNX, refNY, refNZ, false)
    }

    if (settings.symmetryX && Math.abs(hitX) > 0.003) {
      const mdx = vx - -hitX
      const mdSq = mdx * mdx + dy * dy + dz * dz
      if (mdSq < rSq) {
        applyToCluster(c, mdSq, -refNX, refNY, refNZ, true)
      }
    }
  }

  // Fast 1-ring boundary relaxation on modified facial clusters for organic transitions between cheek, zygoma, jaw, and orbit
  if (modified && isFaceRegion && settings.mode !== 'smooth' && modifiedClusterIndices.length > 0) {
    for (const c of modifiedClusterIndices) {
      const shield = topology.clusterOrbitalShield[c]
      if (shield <= 0.02) continue
      const neighbors = topology.clusterNeighbors[c]
      if (neighbors.length === 0) continue
      let avgX = 0,
        avgY = 0,
        avgZ = 0
      for (const nc of neighbors) {
        const nf = topology.clusters[nc][0] * 3
        avgX += sculptOffsets[nf]
        avgY += sculptOffsets[nf + 1]
        avgZ += sculptOffsets[nf + 2]
      }
      avgX /= neighbors.length
      avgY /= neighbors.length
      avgZ /= neighbors.length

      const first = topology.clusters[c][0] * 3
      const blend = 0.14 * shield
      const smX = sculptOffsets[first] + (avgX - sculptOffsets[first]) * blend
      const smY = sculptOffsets[first + 1] + (avgY - sculptOffsets[first + 1]) * blend
      const smZ = sculptOffsets[first + 2] + (avgZ - sculptOffsets[first + 2]) * blend
      for (const vIdx of topology.clusters[c]) {
        const b = vIdx * 3
        sculptOffsets[b] = smX
        sculptOffsets[b + 1] = smY
        sculptOffsets[b + 2] = smZ
      }
    }
  }

  // If sculpting on the face modified outer cheek clusters, keep inner oral cavity clusters retracted inside
  if (modified && isFaceRegion && topology.innerOralToOuterClusters.size > 0) {
    for (const [ic, outerList] of topology.innerOralToOuterClusters.entries()) {
      let sumOx = 0,
        sumOy = 0,
        sumOz = 0
      for (const oc of outerList) {
        const oFirst = topology.clusters[oc][0] * 3
        sumOx += sculptOffsets[oFirst]
        sumOy += sculptOffsets[oFirst + 1]
        sumOz += sculptOffsets[oFirst + 2]
      }
      const n = outerList.length
      const avgOx = sumOx / n
      const avgOy = sumOy / n
      const avgOz = sumOz / n
      const sideSign = Math.sign(topology.clusterRestPositions[ic * 3]) || 1
      if (sideSign * avgOx < 0) {
        for (const vIdx of topology.clusters[ic]) {
          sculptOffsets[vIdx * 3] = avgOx * 0.92
          sculptOffsets[vIdx * 3 + 1] = avgOy * 0.85
          sculptOffsets[vIdx * 3 + 2] = avgOz * 0.85
        }
      }
    }
  }

  return modified
}
