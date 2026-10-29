import * as THREE from 'three'

export type BrushMode = 'inflate' | 'deflate' | 'smooth'

export interface BrushSettings {
  enabled: boolean
  mode: BrushMode
  radius: number // in meters (0.04m to 0.28m)
  strength: number // 0.05 to 1.0
  symmetryX: boolean
  protectExtremities: boolean // protects face/eyes, fingers, and foot soles during body sculpting
}

export type BodyPresetId = 'default' | 'slim' | 'athletic' | 'robust'

export interface ExtendedBodyProportions {
  heightMeters: number
  shoulderWidth: number // -1 to 1
  torsoWidth: number // -1 to 1
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
      shoulderWidth: -0.35,
      torsoWidth: -0.45,
      abdomenVolume: -0.45,
      armThickness: -0.5,
      legThickness: -0.45,
      thighVolume: -0.45,
      armLength: 0.1,
      legLength: 0.15,
      muscleTone: 0.15,
    },
  },
  athletic: {
    label: 'Atlético / Musculoso',
    values: {
      shoulderWidth: 0.55,
      torsoWidth: 0.25,
      abdomenVolume: -0.3,
      armThickness: 0.55,
      legThickness: 0.45,
      thighVolume: 0.5,
      armLength: 0.05,
      legLength: 0.05,
      muscleTone: 0.9,
    },
  },
  robust: {
    label: 'Robusto / Forte',
    values: {
      shoulderWidth: 0.45,
      torsoWidth: 0.75,
      abdomenVolume: 0.7,
      armThickness: 0.65,
      legThickness: 0.6,
      thighVolume: 0.75,
      armLength: 0,
      legLength: -0.05,
      muscleTone: 0.35,
    },
  },
}

/**
 * Welded vertex topology cache for seamless surface sculpting without opening UV seams.
 */
export interface WeldedTopology {
  vertexCount: number
  /** Maps each buffer vertex index -> cluster index */
  vertexToCluster: Int32Array
  /** List of buffer vertex indices belonging to each unique 3D spatial vertex */
  clusters: number[][]
  /** Representative XYZ position per cluster in rest pose */
  clusterRestPositions: Float32Array
  /** Unified smooth normal per cluster in rest pose */
  clusterRestNormals: Float32Array
  /** For each cluster, precomputed protection weight (0 = protected head/hands/soles, 1 = editable body) */
  clusterBodyMask: Float32Array
  /** Mirror cluster index across X axis (-x, y, z) for fast X-symmetry */
  clusterMirrorIndex: Int32Array
}

/**
 * Builds a welded spatial topology from a BufferGeometry so brush strokes never split UV seams.
 */
export function buildWeldedTopology(
  geometry: THREE.BufferGeometry,
  basePositions: Float32Array,
  modelHeight: number
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
  const clusterBodyMask = new Float32Array(clusterCount)

  const normAttr = geometry.attributes.normal
  const h = Math.max(1.0, modelHeight)

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

    // Compute smooth anatomical protection mask:
    // - Foot soles & ankles (y < 0.08 * h): protected so feet stay flat on floor
    // - Head & neck above collar (y > 0.835 * h): protected in body-only mode
    // - Hands & fingers (|x| > 0.34 * h): protected in body-only mode
    const yNorm = py / h
    let mask = 1.0
    if (yNorm < 0.07) {
      mask = 0.0
    } else if (yNorm < 0.12) {
      mask = (yNorm - 0.07) / 0.05
    }
    if (yNorm > 0.85) {
      mask = 0.0
    } else if (yNorm > 0.81) {
      mask = Math.min(mask, 1.0 - (yNorm - 0.81) / 0.04)
    }
    const absXNorm = Math.abs(px) / h
    if (absXNorm > 0.36) {
      mask = 0.0
    } else if (absXNorm > 0.31) {
      mask = Math.min(mask, 1.0 - (absXNorm - 0.31) / 0.05)
    }
    clusterBodyMask[c] = mask
  }

  // Precompute mirror cluster across X = 0 for fast bilateral symmetry
  const clusterMirrorIndex = new Int32Array(clusterCount)
  for (let c = 0; c < clusterCount; c++) {
    const px = clusterRestPositions[c * 3]
    const py = clusterRestPositions[c * 3 + 1]
    const pz = clusterRestPositions[c * 3 + 2]
    const mirrorKey = `${Math.round(-px * 2000)}_${Math.round(py * 2000)}_${Math.round(pz * 2000)}`
    const mIdx = spatialMap.get(mirrorKey)
    clusterMirrorIndex[c] = mIdx !== undefined ? mIdx : -1
  }

  return {
    vertexCount,
    vertexToCluster,
    clusters,
    clusterRestPositions,
    clusterRestNormals,
    clusterBodyMask,
    clusterMirrorIndex,
  }
}

/**
 * Applies a single localized brush dab in local mesh coordinates onto the sculptOffsets array.
 * Returns true if any vertex was modified.
 */
export function applyBrushDab({
  topology,
  currentPositions,
  sculptOffsets,
  localHitPoint,
  localRadius,
  settings,
}: {
  topology: WeldedTopology
  currentPositions: Float32Array
  sculptOffsets: Float32Array
  localHitPoint: THREE.Vector3
  localRadius: number
  settings: BrushSettings
}): boolean {
  const clusterCount = topology.clusters.length
  const rSq = localRadius * localRadius
  const hitX = localHitPoint.x
  const hitY = localHitPoint.y
  const hitZ = localHitPoint.z

  const maxDisp = 0.065 // 6.5 cm safety clamp to keep geometry stable and manifold
  const sign = settings.mode === 'inflate' ? 1 : settings.mode === 'deflate' ? -1 : 0
  const stepAmount = 0.0045 * settings.strength

  let modified = false
  const visitedClusters = new Uint8Array(clusterCount)

  const applyToCluster = (c: number, distSq: number) => {
    if (visitedClusters[c]) return
    visitedClusters[c] = 1

    const mask = settings.protectExtremities ? topology.clusterBodyMask[c] : 1.0
    if (mask <= 0.001) return

    const dist = Math.sqrt(distSq)
    // Smooth cosine falloff (1 at center, 0 at boundary, C1 continuous)
    const falloff = 0.5 * (1 + Math.cos((Math.PI * dist) / localRadius)) * mask

    const members = topology.clusters[c]
    const first = members[0] * 3

    if (settings.mode === 'smooth') {
      // Smoothly relax sculpt offsets toward zero (rest smooth surface)
      const relax = Math.min(0.35, 0.18 * settings.strength * falloff)
      const ox = sculptOffsets[first] * (1 - relax)
      const oy = sculptOffsets[first + 1] * (1 - relax)
      const oz = sculptOffsets[first + 2] * (1 - relax)
      for (const vIdx of members) {
        const b = vIdx * 3
        sculptOffsets[b] = ox
        sculptOffsets[b + 1] = oy
        sculptOffsets[b + 2] = oz
      }
      modified = true
      return
    }

    const nx = topology.clusterRestNormals[c * 3]
    const ny = topology.clusterRestNormals[c * 3 + 1]
    const nz = topology.clusterRestNormals[c * 3 + 2]
    const delta = sign * stepAmount * falloff

    let nextX = sculptOffsets[first] + nx * delta
    let nextY = sculptOffsets[first + 1] + ny * delta * 0.35 // dampen vertical drift to preserve anatomical landmarks
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
      applyToCluster(c, dSq)
    }

    if (settings.symmetryX && Math.abs(hitX) > 0.005) {
      const mdx = vx - -hitX
      const mdSq = mdx * mdx + dy * dy + dz * dz
      if (mdSq < rSq) {
        applyToCluster(c, mdSq)
      }
    }
  }

  return modified
}

/**
 * Future Editing Domains Architecture Registry (Item 4)
 * Prepared for future modules without adding non-functional UI buttons.
 */
export interface EditorCapabilityModule {
  id: string
  title: string
  status: 'active' | 'planned'
  requires: ('morphTargets' | 'sculptTopology' | 'skeletonRig' | 'modularAssets')[]
}

export const EDITOR_ARCHITECTURE_MODULES: EditorCapabilityModule[] = [
  {
    id: 'body-proportions',
    title: 'Personalização e Proporções Corporais',
    status: 'active',
    requires: ['morphTargets'],
  },
  {
    id: 'body-sculpt-brush',
    title: 'Pincel de Deformação Localizada (Mouse)',
    status: 'active',
    requires: ['sculptTopology'],
  },
  {
    id: 'face-sculpting',
    title: 'Escultura Facial Direta (Nariz, Queixo, Bochechas, Orelhas)',
    status: 'planned',
    requires: ['morphTargets', 'sculptTopology'],
  },
  {
    id: 'facial-expressions',
    title: 'Expressões Faciais e Detalhes (Rugas/Cicatrizes)',
    status: 'planned',
    requires: ['morphTargets'],
  },
  {
    id: 'hair-and-beard',
    title: 'Sistema Modular de Cabelo e Barba',
    status: 'planned',
    requires: ['modularAssets'],
  },
  {
    id: 'hand-finger-posing',
    title: 'Articulação de Mãos, Dedos e Esqueleto',
    status: 'planned',
    requires: ['skeletonRig'],
  },
]
