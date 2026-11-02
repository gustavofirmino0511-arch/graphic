import * as THREE from 'three'
import {
  applyJointArticulationToPositionPoint,
  isPoseNeutral,
  type AnatomicalJoint,
  type JointPoseState,
} from './skeletonSystem'
import type { ExtendedBodyProportions, FacialProportions } from './bodyEditorSystem'

export type SkeletonDisplayMode = 'auto' | 'xray' | 'solid' | 'hidden'
export type PerformanceQuality = 'high' | 'balanced' | 'low'

export interface AnatomicalSkeletonCache {
  geometry: THREE.BufferGeometry
  restPositions: Float32Array
  restNormals: Float32Array
  /** Per-vertex bone region ID: 0=body/limb, 1=skull/jaw, 2=ribcage/sternum/clavicle, 3=spine/pelvis */
  boneRegionTag: Uint8Array
  /** For the character's skin mesh: per-vertex subcutaneous bone prominence (0..1) */
  skinBoneProminence: Float32Array
  /** For the character's skin mesh: per-vertex soft-tissue hollow recess weight (0..1, e.g. intercostal spaces, sub-malar hollow, supraclavicular fossa) */
  skinHollowRecess: Float32Array
  /** For the character's skin mesh: minimum anatomical X/Z bone floor per vertex so extreme deflation wraps onto bone instead of inverting */
  skinBoneFloorPos: Float32Array
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function gaussian(x: number, mu: number, sigma: number): number {
  const d = (x - mu) / sigma
  return Math.exp(-0.5 * d * d)
}

/**
 * Helper class that accumulates 3D bone sub-meshes into a single merged BufferGeometry
 * with vertex colors for subtle anatomical bone shading (ivory highlights + articular occlusion).
 */
class BoneMeshBuilder {
  positions: number[] = []
  normals: number[] = []
  colors: number[] = []
  indices: number[] = []
  regionTags: number[] = []

  addTubeAlongPath(
    points: [number, number, number][],
    radii: [number, number][], // [rx, rz] at each point
    radialSegments: number,
    regionTag: number,
    baseTint: [number, number, number] = [0.94, 0.91, 0.83],
    capEnds = true
  ) {
    if (points.length < 2) return
    const nPts = points.length
    const baseVertex = this.positions.length / 3

    const tangents: THREE.Vector3[] = []
    for (let i = 0; i < nPts; i++) {
      const pPrev = points[Math.max(0, i - 1)]
      const pNext = points[Math.min(nPts - 1, i + 1)]
      const t = new THREE.Vector3(
        pNext[0] - pPrev[0],
        pNext[1] - pPrev[1],
        pNext[2] - pPrev[2]
      )
      if (t.lengthSq() < 1e-10) t.set(0, 1, 0)
      else t.normalize()
      tangents.push(t)
    }

    const upRef = new THREE.Vector3(0, 0, 1)
    const altRef = new THREE.Vector3(1, 0, 0)

    for (let i = 0; i < nPts; i++) {
      const t = tangents[i]
      let ref = Math.abs(t.dot(upRef)) < 0.88 ? upRef : altRef
      const binormal = new THREE.Vector3().crossVectors(t, ref).normalize()
      const normal = new THREE.Vector3().crossVectors(binormal, t).normalize()

      const [px, py, pz] = points[i]
      const [rx, rz] = radii[i]
      const u = i / Math.max(1, nPts - 1)
      // Subtle articular darkening near joint ends and brighter shaft diaphysis
      const shaftShade = 0.92 + 0.08 * Math.sin(u * Math.PI)

      for (let s = 0; s <= radialSegments; s++) {
        const theta = (s / radialSegments) * Math.PI * 2
        const cosT = Math.cos(theta)
        const sinT = Math.sin(theta)

        const lx = cosT * rx
        const lz = sinT * rz
        const vx = px + binormal.x * lx + normal.x * lz
        const vy = py + binormal.y * lx + normal.y * lz
        const vz = pz + binormal.z * lx + normal.z * lz

        const nx = binormal.x * (cosT / Math.max(1e-4, rx)) + normal.x * (sinT / Math.max(1e-4, rz))
        const ny = binormal.y * (cosT / Math.max(1e-4, rx)) + normal.y * (sinT / Math.max(1e-4, rz))
        const nz = binormal.z * (cosT / Math.max(1e-4, rx)) + normal.z * (sinT / Math.max(1e-4, rz))
        const nLen = Math.hypot(nx, ny, nz) || 1

        this.positions.push(vx, vy, vz)
        this.normals.push(nx / nLen, ny / nLen, nz / nLen)
        this.colors.push(
          baseTint[0] * shaftShade,
          baseTint[1] * shaftShade,
          baseTint[2] * shaftShade
        )
        this.regionTags.push(regionTag)
      }
    }

    const ringStride = radialSegments + 1
    for (let i = 0; i < nPts - 1; i++) {
      const r0 = baseVertex + i * ringStride
      const r1 = baseVertex + (i + 1) * ringStride
      for (let s = 0; s < radialSegments; s++) {
        const a = r0 + s
        const b = r0 + s + 1
        const c = r1 + s
        const d = r1 + s + 1
        this.indices.push(a, c, b, b, c, d)
      }
    }

    if (capEnds) {
      // Start cap
      const startCenterIdx = this.positions.length / 3
      const p0 = points[0]
      const t0 = tangents[0]
      this.positions.push(p0[0], p0[1], p0[2])
      this.normals.push(-t0.x, -t0.y, -t0.z)
      this.colors.push(baseTint[0] * 0.9, baseTint[1] * 0.9, baseTint[2] * 0.9)
      this.regionTags.push(regionTag)
      for (let s = 0; s < radialSegments; s++) {
        this.indices.push(startCenterIdx, baseVertex + s + 1, baseVertex + s)
      }

      // End cap
      const endCenterIdx = this.positions.length / 3
      const pEnd = points[nPts - 1]
      const tEnd = tangents[nPts - 1]
      const lastRing = baseVertex + (nPts - 1) * ringStride
      this.positions.push(pEnd[0], pEnd[1], pEnd[2])
      this.normals.push(tEnd.x, tEnd.y, tEnd.z)
      this.colors.push(baseTint[0] * 0.9, baseTint[1] * 0.9, baseTint[2] * 0.9)
      this.regionTags.push(regionTag)
      for (let s = 0; s < radialSegments; s++) {
        this.indices.push(endCenterIdx, lastRing + s, lastRing + s + 1)
      }
    }
  }

  addEllipsoid(
    center: [number, number, number],
    radii: [number, number, number],
    latSegments: number,
    lonSegments: number,
    regionTag: number,
    baseTint: [number, number, number] = [0.95, 0.92, 0.84],
    deformFn?: (x: number, y: number, z: number, u: number, v: number) => [number, number, number]
  ) {
    const baseVertex = this.positions.length / 3
    const [cx, cy, cz] = center
    const [rx, ry, rz] = radii

    for (let lat = 0; lat <= latSegments; lat++) {
      const v = lat / latSegments
      const phi = v * Math.PI
      const sinPhi = Math.sin(phi)
      const cosPhi = Math.cos(phi)

      for (let lon = 0; lon <= lonSegments; lon++) {
        const u = lon / lonSegments
        const theta = u * Math.PI * 2
        const cosT = Math.cos(theta)
        const sinT = Math.sin(theta)

        let lx = rx * sinPhi * cosT
        let ly = ry * cosPhi
        let lz = rz * sinPhi * sinT

        if (deformFn) {
          ;[lx, ly, lz] = deformFn(lx, ly, lz, u, v)
        }

        const nx = sinPhi * cosT
        const ny = cosPhi
        const nz = sinPhi * sinT
        const nLen = Math.hypot(nx, ny, nz) || 1

        const shade = 0.9 + 0.1 * Math.max(0, ny * 0.5 + nz * 0.5)
        this.positions.push(cx + lx, cy + ly, cz + lz)
        this.normals.push(nx / nLen, ny / nLen, nz / nLen)
        this.colors.push(baseTint[0] * shade, baseTint[1] * shade, baseTint[2] * shade)
        this.regionTags.push(regionTag)
      }
    }

    const stride = lonSegments + 1
    for (let lat = 0; lat < latSegments; lat++) {
      for (let lon = 0; lon < lonSegments; lon++) {
        const a = baseVertex + lat * stride + lon
        const b = a + 1
        const c = baseVertex + (lat + 1) * stride + lon
        const d = c + 1
        this.indices.push(a, c, b, b, c, d)
      }
    }
  }
}

/**
 * Samples the character's rest skin envelope at a given vertical band [yMin, yMax]
 * to ensure ribs, sternum, spine, pelvis, and cranium sit accurately underneath the skin.
 */
function sampleTorsoSkinSlice(
  skinPositions: Float32Array,
  yCenter: number,
  yHalfBand: number,
  xMaxLimit = 0.22
): {
  maxX: number
  frontZ: number
  backZ: number
  centerZ: number
} {
  let maxX = 0.08
  let frontZ = 0.06
  let backZ = -0.06
  let found = 0

  for (let i = 0; i < skinPositions.length; i += 3) {
    const y = skinPositions[i + 1]
    if (Math.abs(y - yCenter) > yHalfBand) continue
    const ax = Math.abs(skinPositions[i])
    if (ax > xMaxLimit) continue
    const z = skinPositions[i + 2]
    if (ax > maxX) maxX = ax
    if (ax < 0.085) {
      if (z > frontZ) frontZ = z
      if (z < backZ) backZ = z
    }
    found++
  }

  if (found < 6) {
    return { maxX: 0.13, frontZ: 0.09, backZ: -0.08, centerZ: 0.005 }
  }
  return {
    maxX,
    frontZ,
    backZ,
    centerZ: (frontZ + backZ) * 0.5,
  }
}

/**
 * Builds the complete 3D Anatomical Human Skeleton Mesh fitted underneath the character's skin
 * AND precomputes the skin-to-bone prominence, hollow recess, and bone floor maps.
 *
 * Includes:
 * 1. Crânio e Mandíbula (Cranial vault, orbital rims, zygomatic arches, nasal aperture, maxilla, teeth, mandible)
 * 2. Coluna Vertebral (24 sculpted vertebrae C1-C7, T1-T12, L1-L5 with spinous & transverse processes + Sacrum)
 * 3. Caixa Torácica e Costelas (Sternum + 12 pairs of curved 3D ribs + costal arch)
 * 4. Clavículas e Escápulas (S-curved collarbones + triangular shoulder blades with scapular spine)
 * 5. Úmero, Rádio e Ulna (Upper arm bone + dual parallel forearm bones)
 * 6. Ossos das Mãos e Dedos (Carpals, 5 Metacarpals & segmented Phalanges for all 10 fingers)
 * 7. Pelve (Sculpted iliac wings, iliac crests/ASIS, pubic symphysis, ischial rings & hip sockets)
 * 8. Fêmur, Patela, Tíbia e Fíbula (Femur with head/neck/trochanter, kneecap, shin tibia & lateral fibula)
 * 9. Ossos dos Pés (Talus, Calcaneus heel, tarsals, 5 Metatarsals & Toe Phalanges for all 10 toes)
 */
export function buildAnatomicalSkeletonSystem(
  skinBasePositions: Float32Array,
  modelHeight: number,
  anatomicalJoints: AnatomicalJoint[],
  fullLandmarks?: Record<string, [number, number, number]>,
  eyeCenters?: { left: [number, number, number]; right: [number, number, number] },
  quality: PerformanceQuality = 'balanced'
): AnatomicalSkeletonCache {
  const builder = new BoneMeshBuilder()
  const h = Math.max(1.2, modelHeight || 1.795)
  const s = h / 1.795
  const isLowLOD = quality === 'low'
  const segTube = isLowLOD ? 6 : 10
  const segRib = isLowLOD ? 6 : 8

  const jointMap = new Map<string, [number, number, number]>()
  for (const j of anatomicalJoints) {
    jointMap.set(j.id, j.position)
  }
  const getLM = (
    groupKey: string,
    fallbackJointId: string | null,
    defaultPos: [number, number, number]
  ): [number, number, number] => {
    if (fullLandmarks && fullLandmarks[groupKey]) {
      return fullLandmarks[groupKey]
    }
    if (fallbackJointId && jointMap.has(fallbackJointId)) {
      return jointMap.get(fallbackJointId)!
    }
    return defaultPos
  }

  // Key axial & appendicular landmarks
  const pPelvis = getLM('joint-pelvis', 'pelvis', [0, 0.53 * h, 0.005])
  const pSpine4 = getLM('joint-spine-4', null, [0, 0.56 * h, -0.01])
  const pSpine3 = getLM('joint-spine-3', 'spine3', [0, 0.595 * h, 0.005])
  const pSpine2 = getLM('joint-spine-2', 'spine2', [0, 0.65 * h, 0.012])
  const pSpine1 = getLM('joint-spine-1', 'spine1', [0, 0.74 * h, -0.006])
  const pNeck = getLM('joint-neck', 'neck', [0, 0.835 * h, 0.002])
  const pHead = getLM('joint-head', 'head', [0, 0.9 * h, 0.008])
  const pHeadTop = getLM('joint-head-2', null, [0, 0.985 * h, 0.002])
  const pJaw = getLM('joint-jaw', null, [0, 0.852 * h, 0.072])

  const lEye = eyeCenters?.left ?? getLM('joint-l-eye', null, [0.031 * s, 0.935 * h, -0.004])
  const rEye = eyeCenters?.right ?? getLM('joint-r-eye', null, [-0.031 * s, 0.935 * h, -0.004])
  const eyeY = (lEye[1] + rEye[1]) * 0.5
  const eyeZ = (lEye[2] + rEye[2]) * 0.5
  const eyeX = Math.abs(lEye[0] - rEye[0]) * 0.5

  // ============================================================================
  // 1. CRÂNIO E MANDÍBULA (SKULL, ORBITS, ZYGOMATIC ARCHES, MAXILLA & MANDIBLE)
  // ============================================================================
  // Measure actual head skin envelope around cranium
  const headMidY = eyeY + 0.022 * s
  const headSlice = sampleTorsoSkinSlice(skinBasePositions, headMidY, 0.025 * s, 0.14 * s)
  const craniumRx = Math.max(0.058 * s, headSlice.maxX - 0.0045 * s)
  const craniumRy = Math.max(0.068 * s, (pHeadTop[1] - eyeY) * 0.92)
  const craniumRz = Math.max(0.074 * s, (headSlice.frontZ - headSlice.backZ) * 0.47)
  const craniumCz = (headSlice.frontZ + headSlice.backZ) * 0.5 - 0.004 * s

  // 1A. Cranial Vault (Calvaria: Frontal, Parietal, Occipital, Temporal Fossa)
  builder.addEllipsoid(
    [0, eyeY + 0.018 * s, craniumCz],
    [craniumRx, craniumRy, craniumRz],
    isLowLOD ? 10 : 16,
    isLowLOD ? 12 : 20,
    1,
    [0.95, 0.92, 0.84],
    (lx, ly, lz) => {
      let x = lx
      let y = ly
      let z = lz
      // Indent temporal fossae on the sides behind the orbits
      if (y < 0.01 * s && z > -0.01 * s) {
        const tempIndent = gaussian(y, -0.015 * s, 0.022 * s) * gaussian(z, 0.02 * s, 0.025 * s)
        x *= 1 - 0.18 * tempIndent
      }
      // Taper lower occipital base toward foramen magnum
      if (y < -0.02 * s && z < 0) {
        const occTaper = smoothstep(-0.02 * s, -craniumRy, y)
        x *= 1 - 0.35 * occTaper
        z *= 1 - 0.22 * occTaper
      }
      // Flatten anterior facial plane below brow ridge
      if (y < -0.01 * s && z > 0.02 * s) {
        y *= 0.72
      }
      return [x, y, z]
    }
  )

  // 1B. Left & Right Bony Orbital Rims (Cavidades Orbitais) + Supraorbital Brow Ridge
  for (const side of [1, -1]) {
    const ox = side * eyeX
    const oy = eyeY
    const oz = eyeZ + 0.006 * s
    const orbRingPts: [number, number, number][] = []
    const orbRadii: [number, number][] = []
    const nOrb = isLowLOD ? 12 : 18
    const orx = eyeX * 0.62
    const ory = eyeX * 0.52
    for (let i = 0; i <= nOrb; i++) {
      const a = (i / nOrb) * Math.PI * 2
      const px = ox + Math.cos(a) * orx
      const py = oy + Math.sin(a) * ory
      const pz = oz - 0.003 * s * Math.abs(Math.cos(a)) + 0.003 * s * Math.sin(a)
      orbRingPts.push([px, py, pz])
      orbRadii.push([0.0042 * s, 0.0052 * s])
    }
    builder.addTubeAlongPath(orbRingPts, orbRadii, 6, 1, [0.94, 0.9, 0.81], false)

    // 1C. Zygomatic Arch (Maçã do Rosto / Arco Zigomático) sweeping from infraorbital rim to temporal bone
    const zygPts: [number, number, number][] = [
      [side * (eyeX * 0.85), eyeY - 0.015 * s, oz + 0.002 * s],
      [side * (craniumRx * 0.92), eyeY - 0.019 * s, oz - 0.006 * s],
      [side * (craniumRx * 0.99), eyeY - 0.016 * s, oz - 0.024 * s],
      [side * (craniumRx * 0.95), eyeY - 0.01 * s, oz - 0.048 * s],
    ]
    const zygRadii: [number, number][] = [
      [0.0055 * s, 0.0075 * s],
      [0.0068 * s, 0.009 * s],
      [0.0052 * s, 0.0075 * s],
      [0.004 * s, 0.0055 * s],
    ]
    builder.addTubeAlongPath(zygPts, zygRadii, segRib, 1, [0.96, 0.93, 0.85])
  }

  // 1D. Nasal Bone Bridge, Piriform Nasal Margins & Maxilla + Upper Dental Arch
  const noseBridgePts: [number, number, number][] = [
    [0, eyeY + 0.008 * s, eyeZ + 0.012 * s],
    [0, eyeY - 0.008 * s, eyeZ + 0.019 * s],
    [0, eyeY - 0.022 * s, eyeZ + 0.023 * s],
  ]
  builder.addTubeAlongPath(
    noseBridgePts,
    [
      [0.007 * s, 0.005 * s],
      [0.006 * s, 0.005 * s],
      [0.005 * s, 0.004 * s],
    ],
    6,
    1,
    [0.95, 0.91, 0.82]
  )

  // Maxillary alveolar arch & Upper Teeth
  const upperTeethY = eyeY - 0.064 * s
  const upperTeethZ = eyeZ + 0.014 * s
  const upperArchPts: [number, number, number][] = []
  const upperArchRadii: [number, number][] = []
  for (let i = 0; i <= 10; i++) {
    const u = i / 10 - 0.5 // -0.5 to +0.5
    const angle = u * Math.PI * 0.88
    const ax = Math.sin(angle) * 0.024 * s
    const az = upperTeethZ - (1 - Math.cos(angle)) * 0.026 * s
    upperArchPts.push([ax, upperTeethY, az])
    upperArchRadii.push([0.0055 * s, 0.0085 * s])
  }
  builder.addTubeAlongPath(upperArchPts, upperArchRadii, 6, 1, [0.97, 0.95, 0.88])

  // 1E. Mandible (Mandíbula: Condyles, Ascending Rami, Gonial Angles, Body & Chin Symphysis)
  const chinY = eyeY - 0.102 * s
  const chinZ = eyeZ + 0.013 * s
  const gonionY = eyeY - 0.078 * s
  const gonionX = Math.max(0.042 * s, craniumRx * 0.72)
  const gonionZ = eyeZ - 0.022 * s
  const tmjY = eyeY - 0.024 * s
  const tmjX = craniumRx * 0.88
  const tmjZ = eyeZ - 0.036 * s

  const mandiblePts: [number, number, number][] = [
    [-tmjX, tmjY, tmjZ],
    [-gonionX * 1.03, (tmjY + gonionY) * 0.5, (tmjZ + gonionZ) * 0.5],
    [-gonionX, gonionY, gonionZ],
    [-gonionX * 0.68, (gonionY + chinY) * 0.5, (gonionZ + chinZ) * 0.5 + 0.006 * s],
    [-0.016 * s, chinY + 0.002 * s, chinZ - 0.002 * s],
    [0, chinY, chinZ + 0.002 * s],
    [0.016 * s, chinY + 0.002 * s, chinZ - 0.002 * s],
    [gonionX * 0.68, (gonionY + chinY) * 0.5, (gonionZ + chinZ) * 0.5 + 0.006 * s],
    [gonionX, gonionY, gonionZ],
    [gonionX * 1.03, (tmjY + gonionY) * 0.5, (tmjZ + gonionZ) * 0.5],
    [tmjX, tmjY, tmjZ],
  ]
  const mandibleRadii: [number, number][] = [
    [0.0045 * s, 0.006 * s],
    [0.0055 * s, 0.011 * s],
    [0.0065 * s, 0.012 * s],
    [0.006 * s, 0.0105 * s],
    [0.0065 * s, 0.011 * s],
    [0.0075 * s, 0.0125 * s],
    [0.0065 * s, 0.011 * s],
    [0.006 * s, 0.0105 * s],
    [0.0065 * s, 0.012 * s],
    [0.0055 * s, 0.011 * s],
    [0.0045 * s, 0.006 * s],
  ]
  builder.addTubeAlongPath(mandiblePts, mandibleRadii, segTube, 1, [0.95, 0.92, 0.83])

  // Lower Dental Arch sitting on the superior border of the mandible
  const lowerTeethY = eyeY - 0.075 * s
  const lowerArchPts: [number, number, number][] = []
  const lowerArchRadii: [number, number][] = []
  for (let i = 0; i <= 10; i++) {
    const u = i / 10 - 0.5
    const angle = u * Math.PI * 0.88
    const ax = Math.sin(angle) * 0.022 * s
    const az = upperTeethZ - 0.002 * s - (1 - Math.cos(angle)) * 0.024 * s
    lowerArchPts.push([ax, lowerTeethY, az])
    lowerArchRadii.push([0.005 * s, 0.0075 * s])
  }
  builder.addTubeAlongPath(lowerArchPts, lowerArchRadii, 6, 1, [0.97, 0.95, 0.88])

  // ============================================================================
  // 2. COLUNA VERTEBRAL (24 VERTEBRAE C1-C7, T1-T12, L1-L5 + SACRUM)
  // ============================================================================
  const spineKeyPts: [number, number, number][] = [
    [0, pPelvis[1] - 0.02 * s, pPelvis[2] - 0.045 * s], // Sacrum tip
    [0, pPelvis[1] + 0.015 * s, pPelvis[2] - 0.038 * s], // L5/S1
    [0, pSpine4[1], pSpine4[2] - 0.018 * s], // L3
    [0, pSpine3[1], pSpine3[2] - 0.024 * s], // L1 / T12
    [0, pSpine2[1], pSpine2[2] - 0.036 * s], // T7 (mid-thoracic kyphosis)
    [0, pSpine1[1], pSpine1[2] - 0.022 * s], // T2
    [0, pNeck[1], pNeck[2] - 0.012 * s], // C5
    [0, pHead[1] - 0.015 * s, pHead[2] - 0.016 * s], // C1 Atlas
  ]
  const spineCurve = new THREE.CatmullRomCurve3(
    spineKeyPts.map((p) => new THREE.Vector3(p[0], p[1], p[2]))
  )

  const totalVertebrae = 24
  const thoracicVertebraCenters: THREE.Vector3[] = []
  for (let vIdx = 0; vIdx < totalVertebrae; vIdx++) {
    const t = 0.08 + (vIdx / (totalVertebrae - 1)) * 0.9
    const pos = spineCurve.getPoint(t)
    // Sample dorsal skin at this height so spinous processes sit just 3mm inside the back skin!
    const slice = sampleTorsoSkinSlice(skinBasePositions, pos.y, 0.015 * s, 0.16 * s)
    const dorsalSkinZ = slice.backZ
    const vertZ = Math.max(dorsalSkinZ + 0.018 * s, pos.z)
    pos.z = vertZ

    // vIdx 0..4 = Lumbar L5..L1, vIdx 5..16 = Thoracic T12..T1, vIdx 17..23 = Cervical C7..C1
    const isLumbar = vIdx < 5
    const isThoracic = vIdx >= 5 && vIdx < 17
    if (isThoracic) {
      thoracicVertebraCenters.push(pos.clone())
    }

    const bodyRx = (isLumbar ? 0.021 : isThoracic ? 0.0165 : 0.0125) * s
    const bodyRz = (isLumbar ? 0.0175 : isThoracic ? 0.015 : 0.0115) * s
    const halfH = (isLumbar ? 0.0105 : isThoracic ? 0.0082 : 0.0062) * s

    // Vertebral Body (Corpo Vertebral)
    builder.addTubeAlongPath(
      [
        [0, pos.y - halfH, pos.z],
        [0, pos.y + halfH, pos.z],
      ],
      [
        [bodyRx * 1.04, bodyRz * 1.04],
        [bodyRx, bodyRz],
      ],
      segRib,
      3,
      [0.93, 0.89, 0.8]
    )

    // Posterior Spinous Process (Processo Espinhoso — reaches toward dorsal skin)
    const spinousTipZ = Math.max(dorsalSkinZ + 0.003 * s, pos.z - bodyRz - 0.014 * s)
    builder.addTubeAlongPath(
      [
        [0, pos.y + halfH * 0.2, pos.z - bodyRz * 0.6],
        [0, pos.y - halfH * 0.45, spinousTipZ],
      ],
      [
        [0.0042 * s, 0.005 * s],
        [0.0026 * s, 0.0038 * s],
      ],
      6,
      3,
      [0.96, 0.93, 0.85]
    )

    // Left & Right Transverse Processes (Processos Transversos)
    if (!isLowLOD || vIdx % 2 === 0) {
      const transSpan = (isLumbar ? 0.032 : isThoracic ? 0.026 : 0.018) * s
      builder.addTubeAlongPath(
        [
          [-transSpan, pos.y, pos.z - bodyRz * 0.45],
          [0, pos.y, pos.z - bodyRz * 0.55],
          [transSpan, pos.y, pos.z - bodyRz * 0.45],
        ],
        [
          [0.003 * s, 0.0035 * s],
          [0.0045 * s, 0.0045 * s],
          [0.003 * s, 0.0035 * s],
        ],
        6,
        3,
        [0.92, 0.88, 0.79]
      )
    }
  }

  // Sacrum & Coccyx wedge (Sacro e Cóccix)
  const sacrumTopY = pPelvis[1] + 0.025 * s
  const sacrumBotY = pPelvis[1] - 0.055 * s
  const sacrumSlice = sampleTorsoSkinSlice(skinBasePositions, pPelvis[1], 0.025 * s, 0.18 * s)
  const sacrumZ = Math.max(sacrumSlice.backZ + 0.012 * s, pPelvis[2] - 0.038 * s)
  builder.addTubeAlongPath(
    [
      [0, sacrumTopY, sacrumZ + 0.005 * s],
      [0, (sacrumTopY + sacrumBotY) * 0.5, sacrumZ - 0.004 * s],
      [0, sacrumBotY, sacrumZ + 0.008 * s],
    ],
    [
      [0.038 * s, 0.012 * s],
      [0.028 * s, 0.01 * s],
      [0.008 * s, 0.005 * s],
    ],
    segRib,
    3,
    [0.93, 0.89, 0.8]
  )

  // ============================================================================
  // 3. CAIXA TORÁCICA E COSTELAS (STERNUM + 12 PAIRS OF RIBS + COSTAL ARCH)
  // ============================================================================
  // Thoracic vertebrae are ordered T12 (index 0) up to T1 (index 11)
  const t1Pos = thoracicVertebraCenters[thoracicVertebraCenters.length - 1]
  const t12Pos = thoracicVertebraCenters[0]
  const sternumTopY = t1Pos.y - 0.018 * s
  const sternumBotY = t12Pos.y + 0.055 * s
  const sternumMidY = (sternumTopY + sternumBotY) * 0.5

  const topChestSlice = sampleTorsoSkinSlice(skinBasePositions, sternumTopY, 0.015 * s, 0.16 * s)
  const midChestSlice = sampleTorsoSkinSlice(skinBasePositions, sternumMidY, 0.015 * s, 0.16 * s)
  const botChestSlice = sampleTorsoSkinSlice(skinBasePositions, sternumBotY, 0.015 * s, 0.16 * s)

  const sternumTopZ = topChestSlice.frontZ - 0.005 * s
  const sternumMidZ = midChestSlice.frontZ - 0.0055 * s
  const sternumBotZ = botChestSlice.frontZ - 0.007 * s

  // Sternum: Manubrium, Body (Gladiolus), and Xiphoid Process
  builder.addTubeAlongPath(
    [
      [0, sternumTopY, sternumTopZ],
      [0, sternumTopY - 0.028 * s, (sternumTopZ + sternumMidZ) * 0.5 + 0.002 * s],
      [0, sternumMidY, sternumMidZ],
      [0, sternumBotY + 0.018 * s, sternumBotZ + 0.002 * s],
      [0, sternumBotY - 0.008 * s, sternumBotZ - 0.003 * s],
    ],
    [
      [0.022 * s, 0.006 * s], // Manubrium
      [0.015 * s, 0.0055 * s], // Sternal angle (Angle of Louis)
      [0.016 * s, 0.0055 * s], // Gladiolus
      [0.012 * s, 0.005 * s],
      [0.005 * s, 0.0035 * s], // Xiphoid tip
    ],
    segRib,
    2,
    [0.95, 0.92, 0.84]
  )

  // 12 Pairs of Curved 3D Ribs (Pairs 1..7 True Ribs, Pairs 8..10 False/Costal Arch, Pairs 11..12 Floating)
  for (let rIdx = 0; rIdx < 12; rIdx++) {
    // rIdx = 0 is Rib 1 (top, at T1), rIdx = 11 is Rib 12 (bottom, at T12)
    const vPos =
      thoracicVertebraCenters[Math.max(0, thoracicVertebraCenters.length - 1 - rIdx)]
    const ribY = vPos.y - 0.012 * s
    const slice = sampleTorsoSkinSlice(skinBasePositions, ribY, 0.016 * s, 0.19 * s)

    // Inset rib 3.8mm inside the skin envelope so it sits subcutaneouly and emerges cleanly when thin
    const latWidth = Math.max(0.085 * s, slice.maxX - 0.0042 * s)
    const frontZ = slice.frontZ - 0.0045 * s
    const backZ = Math.max(slice.backZ + 0.006 * s, vPos.z - 0.006 * s)
    const dropY = (0.018 + 0.016 * Math.sin((rIdx / 11) * Math.PI)) * s

    const isTrueRib = rIdx < 7
    const isFalseRib = rIdx >= 7 && rIdx < 10
    const sternalAttachU = Math.min(1, rIdx / 6.5)
    const attachY =
      sternumTopY * (1 - sternalAttachU) + (sternumBotY + 0.012 * s) * sternalAttachU
    const attachZ =
      sternumTopZ * (1 - sternalAttachU) + sternumBotZ * sternalAttachU

    for (const side of [1, -1]) {
      const ribPts: [number, number, number][] = []
      const ribRadii: [number, number][] = []
      const nSteps = isLowLOD ? 8 : 12
      const maxArc = isTrueRib ? 1.0 : isFalseRib ? 0.88 : 0.56

      for (let k = 0; k <= nSteps; k++) {
        const u = (k / nSteps) * maxArc
        const angle = u * Math.PI
        // Parametric anatomical rib curve from dorsal spine -> posterior angle -> lateral wall -> anterior costal cartilage
        const sinA = Math.sin(angle)
        const cosA = Math.cos(angle)

        let rx = side * latWidth * Math.pow(sinA, 0.82)
        let rz = backZ + (frontZ - backZ) * (0.5 - 0.5 * cosA)
        let ry = vPos.y - dropY * Math.sin(u * Math.PI * 0.85)

        if (isTrueRib && u > 0.72) {
          const blend = smoothstep(0.72, 1.0, u)
          rx = rx * (1 - blend) + side * 0.012 * s * blend
          ry = ry * (1 - blend) + attachY * blend
          rz = rz * (1 - blend) + attachZ * blend
        } else if (isFalseRib && u > 0.62) {
          // Sweep upward into the costal arch (arco costal) merging toward the 7th costal cartilage
          const blend = smoothstep(0.62, maxArc, u)
          const archTargetX = side * (0.022 + (rIdx - 7) * 0.016) * s
          const archTargetY = sternumBotY + 0.008 * s - (rIdx - 7) * 0.014 * s
          const archTargetZ = sternumBotZ - (rIdx - 7) * 0.006 * s
          rx = rx * (1 - blend) + archTargetX * blend
          ry = ry * (1 - blend) + archTargetY * blend
          rz = rz * (1 - blend) + archTargetZ * blend
        }

        ribPts.push([rx, ry, rz])
        // Flat ribbon-like rib cross section
        const ribThick = (rIdx === 0 ? 0.0055 : 0.0046) * s
        ribRadii.push([ribThick * 0.72, ribThick * 1.25])
      }

      builder.addTubeAlongPath(ribPts, ribRadii, segRib, 2, [0.95, 0.92, 0.84])
    }
  }

  // ============================================================================
  // 4. CLAVÍCULAS E ESCÁPULAS (CLAVICLES & SCAPULAE)
  // ============================================================================
  for (const side of [1, -1]) {
    const tag = side > 0 ? 'l' : 'r'
    const pClav = getLM(`joint-${tag}-clavicle`, `clavicle_${tag}`, [
      side * 0.028 * s,
      sternumTopY + 0.005 * s,
      sternumTopZ,
    ])
    const pScap = getLM(`joint-${tag}-scapula`, null, [
      side * 0.11 * s,
      sternumTopY + 0.015 * s,
      topChestSlice.backZ + 0.018 * s,
    ])
    const pShoulder = getLM(`joint-${tag}-shoulder`, `shoulder_${tag}`, [
      side * 0.175 * s,
      sternumTopY + 0.005 * s,
      0.01 * s,
    ])

    // S-curved 3D Clavicle (Clavícula)
    const clavMidX = (pClav[0] + pShoulder[0]) * 0.5
    const clavMidY = (pClav[1] + pShoulder[1]) * 0.5 + 0.006 * s
    const clavSlice = sampleTorsoSkinSlice(skinBasePositions, clavMidY, 0.015 * s, 0.18 * s)
    const clavFrontZ = Math.max(sternumTopZ, clavSlice.frontZ - 0.004 * s)

    const clavPts: [number, number, number][] = [
      [side * 0.016 * s, sternumTopY + 0.004 * s, sternumTopZ + 0.002 * s],
      [clavMidX * 0.65, clavMidY, clavFrontZ + 0.004 * s], // Medial anterior convexity
      [clavMidX * 1.35, clavMidY + 0.003 * s, (clavFrontZ + pShoulder[2]) * 0.5 - 0.006 * s], // Lateral posterior curve
      [pShoulder[0] - side * 0.008 * s, pShoulder[1] + 0.014 * s, pShoulder[2] + 0.004 * s], // Acromioclavicular joint
    ]
    builder.addTubeAlongPath(
      clavPts,
      [
        [0.0075 * s, 0.0075 * s],
        [0.006 * s, 0.0065 * s],
        [0.0058 * s, 0.0065 * s],
        [0.0075 * s, 0.0055 * s],
      ],
      segRib,
      2,
      [0.96, 0.93, 0.85]
    )

    // Scapula (Escápula: Triangular Blade + Posterior Scapular Spine + Acromion)
    const scapBackZ = topChestSlice.backZ + 0.006 * s
    const medX = side * 0.055 * s
    const latX = pShoulder[0] - side * 0.014 * s
    const supY = pShoulder[1] + 0.012 * s
    const infY = pShoulder[1] - 0.115 * s

    // Scapular Spine (Espinha da Escápula sweeping into Acromion)
    builder.addTubeAlongPath(
      [
        [medX, supY - 0.022 * s, scapBackZ - 0.002 * s],
        [(medX + latX) * 0.55, supY - 0.01 * s, scapBackZ - 0.005 * s],
        [pShoulder[0] - side * 0.006 * s, pShoulder[1] + 0.014 * s, pShoulder[2] - 0.004 * s],
      ],
      [
        [0.005 * s, 0.006 * s],
        [0.0075 * s, 0.009 * s],
        [0.0085 * s, 0.006 * s],
      ],
      segRib,
      2,
      [0.94, 0.9, 0.82]
    )

    // Scapular Medial/Lateral Borders & Glenoid Cavity
    builder.addTubeAlongPath(
      [
        [medX, supY, scapBackZ + 0.004 * s],
        [medX + side * 0.008 * s, infY, scapBackZ + 0.005 * s],
        [latX, pShoulder[1] - 0.008 * s, pShoulder[2]],
      ],
      [
        [0.0055 * s, 0.004 * s],
        [0.007 * s, 0.0045 * s],
        [0.012 * s, 0.011 * s], // Glenoid fossa
      ],
      segRib,
      2,
      [0.92, 0.88, 0.79]
    )
  }

  // ============================================================================
  // 5 & 6. ÚMERO, RÁDIO, ULNA E OSSOS DAS MÃOS E DEDOS (UPPER LIMBS & HANDS)
  // ============================================================================
  for (const side of [1, -1]) {
    const tag = side > 0 ? 'l' : 'r'
    const pShoulder = getLM(`joint-${tag}-shoulder`, `shoulder_${tag}`, [
      side * 0.175 * s,
      0.79 * h,
      0.01 * s,
    ])
    const pElbow = getLM(`joint-${tag}-elbow`, `elbow_${tag}`, [
      side * 0.33 * s,
      0.69 * h,
      0.01 * s,
    ])
    const pWrist = getLM(`joint-${tag}-hand`, `hand_${tag}`, [
      side * 0.455 * s,
      0.63 * h,
      0.095 * s,
    ])

    // 5A. Humerus (Úmero: Head, Surgical Neck, Deltoid Tuberosity Shaft, Epicondyles)
    const humMid: [number, number, number] = [
      (pShoulder[0] + pElbow[0]) * 0.5,
      (pShoulder[1] + pElbow[1]) * 0.5,
      (pShoulder[2] + pElbow[2]) * 0.5,
    ]
    builder.addTubeAlongPath(
      [
        pShoulder,
        [
          pShoulder[0] * 0.75 + pElbow[0] * 0.25,
          pShoulder[1] * 0.75 + pElbow[1] * 0.25,
          pShoulder[2] * 0.75 + pElbow[2] * 0.25,
        ],
        humMid,
        [
          pShoulder[0] * 0.18 + pElbow[0] * 0.82,
          pShoulder[1] * 0.18 + pElbow[1] * 0.82,
          pShoulder[2] * 0.18 + pElbow[2] * 0.82,
        ],
        pElbow,
      ],
      [
        [0.019 * s, 0.019 * s], // Humeral head
        [0.0125 * s, 0.0125 * s],
        [0.0115 * s, 0.0115 * s], // Diaphysis
        [0.011 * s, 0.011 * s],
        [0.0185 * s, 0.013 * s], // Distal epicondyles & trochlea
      ],
      segTube,
      0,
      [0.95, 0.92, 0.84]
    )

    // 5B. Radius & Ulna (Rádio e Ulna — Dual Forearm Bones!)
    const forearmDir = new THREE.Vector3(
      pWrist[0] - pElbow[0],
      pWrist[1] - pElbow[1],
      pWrist[2] - pElbow[2]
    ).normalize()
    const sepVec = new THREE.Vector3()
      .crossVectors(forearmDir, new THREE.Vector3(0, 0, 1))
      .normalize()
    const sepDist = 0.0072 * s

    // Radius (lateral/thumb side)
    const radStart: [number, number, number] = [
      pElbow[0] + sepVec.x * sepDist * 0.7,
      pElbow[1] + sepVec.y * sepDist * 0.7,
      pElbow[2] + sepVec.z * sepDist * 0.7,
    ]
    const radEnd: [number, number, number] = [
      pWrist[0] + sepVec.x * sepDist * 1.05,
      pWrist[1] + sepVec.y * sepDist * 1.05,
      pWrist[2] + sepVec.z * sepDist * 1.05,
    ]
    builder.addTubeAlongPath(
      [
        radStart,
        [
          (radStart[0] + radEnd[0]) * 0.5 + sepVec.x * 0.002 * s,
          (radStart[1] + radEnd[1]) * 0.5 + sepVec.y * 0.002 * s,
          (radStart[2] + radEnd[2]) * 0.5 + sepVec.z * 0.002 * s,
        ],
        radEnd,
      ],
      [
        [0.0075 * s, 0.0075 * s], // Radial head
        [0.0065 * s, 0.0065 * s], // Radial shaft
        [0.0105 * s, 0.008 * s], // Distal radius at wrist
      ],
      segRib,
      0,
      [0.95, 0.92, 0.84]
    )

    // Ulna (medial/pinky side, with Olecranon process at elbow tip)
    const ulnaStart: [number, number, number] = [
      pElbow[0] - sepVec.x * sepDist * 0.7 - forearmDir.x * 0.008 * s,
      pElbow[1] - sepVec.y * sepDist * 0.7 - forearmDir.y * 0.008 * s,
      pElbow[2] - sepVec.z * sepDist * 0.7 - 0.005 * s,
    ]
    const ulnaEnd: [number, number, number] = [
      pWrist[0] - sepVec.x * sepDist * 1.05,
      pWrist[1] - sepVec.y * sepDist * 1.05,
      pWrist[2] - sepVec.z * sepDist * 1.05,
    ]
    builder.addTubeAlongPath(
      [
        ulnaStart,
        [
          (ulnaStart[0] + ulnaEnd[0]) * 0.5 - sepVec.x * 0.002 * s,
          (ulnaStart[1] + ulnaEnd[1]) * 0.5 - sepVec.y * 0.002 * s,
          (ulnaStart[2] + ulnaEnd[2]) * 0.5 - sepVec.z * 0.002 * s,
        ],
        ulnaEnd,
      ],
      [
        [0.0105 * s, 0.011 * s], // Olecranon process
        [0.0062 * s, 0.0062 * s], // Ulnar shaft
        [0.0065 * s, 0.0065 * s], // Ulnar head at wrist
      ],
      segRib,
      0,
      [0.94, 0.91, 0.83]
    )

    // 6. Hand & Finger Bones (Carpals, 5 Metacarpals & Segmented Phalanges)
    builder.addEllipsoid(pWrist, [0.013 * s, 0.008 * s, 0.011 * s], 6, 8, 0, [0.93, 0.89, 0.8])

    for (let f = 1; f <= 5; f++) {
      const f1 = fullLandmarks?.[`joint-${tag}-finger-${f}-1`]
      const f2 = fullLandmarks?.[`joint-${tag}-finger-${f}-2`]
      const f3 = fullLandmarks?.[`joint-${tag}-finger-${f}-3`]
      const f4 = fullLandmarks?.[`joint-${tag}-finger-${f}-4`]

      if (f1 && f2 && f3 && f4) {
        // Metacarpal + Proximal, Middle, Distal Phalanges along exact MakeHuman finger landmarks
        const fTip: [number, number, number] = [
          f4[0] + (f4[0] - f3[0]) * 0.65,
          f4[1] + (f4[1] - f3[1]) * 0.65,
          f4[2] + (f4[2] - f3[2]) * 0.65,
        ]
        builder.addTubeAlongPath(
          [pWrist, f1, f2, f3, f4, fTip],
          [
            [0.0038 * s, 0.0038 * s],
            [0.0044 * s, 0.0044 * s], // Knuckle (MCP joint)
            [0.0036 * s, 0.0036 * s], // PIP joint
            [0.003 * s, 0.003 * s], // DIP joint
            [0.0025 * s, 0.0025 * s],
            [0.0018 * s, 0.0018 * s], // Distal phalanx tip
          ],
          isLowLOD ? 5 : 6,
          0,
          [0.95, 0.92, 0.84]
        )
      } else {
        // Fallback fan if landmarks absent (e.g. prototype model)
        const spread = (f - 3) * 0.009 * s
        const mcp: [number, number, number] = [
          pWrist[0] + side * 0.042 * s,
          pWrist[1] - 0.025 * s + spread * 0.3,
          pWrist[2] + spread,
        ]
        const tip: [number, number, number] = [
          pWrist[0] + side * 0.085 * s,
          pWrist[1] - 0.052 * s + spread * 0.4,
          pWrist[2] + spread * 1.2,
        ]
        builder.addTubeAlongPath(
          [pWrist, mcp, tip],
          [
            [0.004 * s, 0.004 * s],
            [0.0042 * s, 0.0042 * s],
            [0.002 * s, 0.002 * s],
          ],
          5,
          0
        )
      }
    }
  }

  // ============================================================================
  // 7. PELVE (PELVIC GIRDLE: ILIAC CRESTS, ILIUM, PUBIC SYMPHYSIS & ISCHIUM)
  // ============================================================================
  const lHip = getLM('joint-l-upper-leg', 'thigh_l', [0.095 * s, 0.515 * h, 0.005 * s])
  const rHip = getLM('joint-r-upper-leg', 'thigh_r', [-0.095 * s, 0.515 * h, 0.005 * s])
  const pelvisSlice = sampleTorsoSkinSlice(
    skinBasePositions,
    pPelvis[1] + 0.02 * s,
    0.025 * s,
    0.22 * s
  )
  const iliacWidth = Math.max(Math.abs(lHip[0]) * 1.22, pelvisSlice.maxX - 0.006 * s)
  const asisZ = Math.max(lHip[2] + 0.035 * s, pelvisSlice.frontZ - 0.006 * s)
  const psisZ = Math.min(lHip[2] - 0.035 * s, pelvisSlice.backZ + 0.012 * s)
  const crestY = pPelvis[1] + 0.048 * s

  for (const side of [1, -1]) {
    const hip = side > 0 ? lHip : rHip
    // Iliac Crest & Wing (Crista Ilíaca + Asa do Ílio from Sacrum to ASIS to Acetabulum)
    const iliacPts: [number, number, number][] = [
      [side * 0.032 * s, pPelvis[1] + 0.024 * s, psisZ], // Sacroiliac joint (PSIS)
      [side * iliacWidth * 0.86, crestY + 0.008 * s, (psisZ + asisZ) * 0.45], // Superior iliac crest
      [side * iliacWidth, crestY - 0.008 * s, asisZ - 0.006 * s], // ASIS (Anterior Superior Iliac Spine)
      [hip[0], hip[1] + 0.008 * s, hip[2] + 0.012 * s], // Acetabular roof
      [side * 0.012 * s, hip[1] - 0.028 * s, asisZ - 0.012 * s], // Pubic symphysis
    ]
    builder.addTubeAlongPath(
      iliacPts,
      [
        [0.012 * s, 0.016 * s],
        [0.011 * s, 0.022 * s],
        [0.012 * s, 0.018 * s],
        [0.018 * s, 0.022 * s], // Acetabulum hip socket
        [0.011 * s, 0.012 * s], // Pubic symphysis
      ],
      segTube,
      3,
      [0.94, 0.91, 0.82]
    )

    // Ischial Ring (Ísquio inferior)
    builder.addTubeAlongPath(
      [
        [hip[0], hip[1] - 0.005 * s, hip[2] - 0.005 * s],
        [hip[0] * 0.72, hip[1] - 0.048 * s, hip[2] - 0.018 * s], // Ischial tuberosity
        [side * 0.012 * s, hip[1] - 0.028 * s, asisZ - 0.012 * s],
      ],
      [
        [0.012 * s, 0.012 * s],
        [0.011 * s, 0.013 * s],
        [0.008 * s, 0.009 * s],
      ],
      segRib,
      3,
      [0.92, 0.88, 0.79]
    )
  }

  // ============================================================================
  // 8 & 9. FÊMUR, PATELA, TÍBIA, FÍBULA E OSSOS DOS PÉS (LOWER LIMBS & FEET)
  // ============================================================================
  for (const side of [1, -1]) {
    const tag = side > 0 ? 'l' : 'r'
    const pHip = side > 0 ? lHip : rHip
    const pKnee = getLM(`joint-${tag}-knee`, `knee_${tag}`, [
      side * 0.105 * s,
      0.285 * h,
      0.01 * s,
    ])
    const pAnkle = getLM(`joint-${tag}-ankle`, `ankle_${tag}`, [
      side * 0.115 * s,
      0.062 * h,
      -0.01 * s,
    ])
    const pFoot1 = getLM(`joint-${tag}-foot-1`, null, [
      pAnkle[0],
      0.022 * h,
      pAnkle[2] + 0.075 * s,
    ])
    const pFoot2 = getLM(`joint-${tag}-foot-2`, null, [
      pAnkle[0],
      0.016 * h,
      pAnkle[2] + 0.135 * s,
    ])

    // 8A. Femur (Fêmur: Femoral Head, Neck, Greater Trochanter, Diaphysis, Condyles)
    const trochanter: [number, number, number] = [
      pHip[0] + side * 0.028 * s,
      pHip[1] - 0.018 * s,
      pHip[2] - 0.004 * s,
    ]
    const femMid: [number, number, number] = [
      (trochanter[0] + pKnee[0]) * 0.5,
      (trochanter[1] + pKnee[1]) * 0.5,
      (trochanter[2] + pKnee[2]) * 0.5 + 0.006 * s, // Subtle anterior femoral bow
    ]
    builder.addTubeAlongPath(
      [
        pHip,
        trochanter,
        [
          trochanter[0] * 0.75 + pKnee[0] * 0.25,
          trochanter[1] * 0.75 + pKnee[1] * 0.25,
          trochanter[2] * 0.75 + pKnee[2] * 0.25 + 0.004 * s,
        ],
        femMid,
        [
          trochanter[0] * 0.15 + pKnee[0] * 0.85,
          trochanter[1] * 0.15 + pKnee[1] * 0.85,
          trochanter[2] * 0.15 + pKnee[2] * 0.85,
        ],
        pKnee,
      ],
      [
        [0.021 * s, 0.021 * s], // Femoral head
        [0.022 * s, 0.019 * s], // Greater trochanter
        [0.016 * s, 0.016 * s],
        [0.015 * s, 0.0155 * s], // Femoral shaft
        [0.018 * s, 0.017 * s],
        [0.028 * s, 0.023 * s], // Medial & lateral femoral condyles
      ],
      segTube,
      0,
      [0.95, 0.92, 0.84]
    )

    // 8B. Patella (Patela / Kneecap)
    builder.addEllipsoid(
      [pKnee[0], pKnee[1] + 0.008 * s, pKnee[2] + 0.026 * s],
      [0.016 * s, 0.019 * s, 0.0085 * s],
      6,
      8,
      0,
      [0.96, 0.93, 0.85]
    )

    // 8C. Tibia (Tíbia — Thick Medial/Anterior Shin Bone)
    const tibTop: [number, number, number] = [
      pKnee[0] - side * 0.004 * s,
      pKnee[1] - 0.012 * s,
      pKnee[2] + 0.002 * s,
    ]
    const tibBot: [number, number, number] = [
      pAnkle[0] - side * 0.006 * s,
      pAnkle[1],
      pAnkle[2] + 0.002 * s,
    ]
    builder.addTubeAlongPath(
      [
        tibTop,
        [
          tibTop[0] * 0.8 + tibBot[0] * 0.2,
          tibTop[1] * 0.8 + tibBot[1] * 0.2,
          tibTop[2] * 0.8 + tibBot[2] * 0.2 + 0.005 * s, // Tibial tuberosity
        ],
        [
          (tibTop[0] + tibBot[0]) * 0.5,
          (tibTop[1] + tibBot[1]) * 0.5,
          (tibTop[2] + tibBot[2]) * 0.5 + 0.003 * s,
        ],
        tibBot,
      ],
      [
        [0.025 * s, 0.021 * s], // Tibial plateau
        [0.016 * s, 0.018 * s],
        [0.0135 * s, 0.0155 * s], // Anterior shin crest
        [0.018 * s, 0.016 * s], // Medial malleolus at ankle
      ],
      segTube,
      0,
      [0.95, 0.92, 0.84]
    )

    // 8D. Fibula (Fíbula — Slender Lateral Lower-Leg Bone)
    const fibTop: [number, number, number] = [
      pKnee[0] + side * 0.019 * s,
      pKnee[1] - 0.024 * s,
      pKnee[2] - 0.008 * s,
    ]
    const fibBot: [number, number, number] = [
      pAnkle[0] + side * 0.015 * s,
      pAnkle[1] - 0.006 * s,
      pAnkle[2] - 0.006 * s,
    ]
    builder.addTubeAlongPath(
      [
        fibTop,
        [(fibTop[0] + fibBot[0]) * 0.5, (fibTop[1] + fibBot[1]) * 0.5, (fibTop[2] + fibBot[2]) * 0.5],
        fibBot,
      ],
      [
        [0.0085 * s, 0.0085 * s], // Fibular head
        [0.0062 * s, 0.0065 * s], // Fibular shaft
        [0.0095 * s, 0.009 * s], // Lateral malleolus
      ],
      segRib,
      0,
      [0.94, 0.9, 0.82]
    )

    // 9. Foot & Toe Bones (Calcaneus Heel, Talus, Tarsals, 5 Metatarsals & Toe Phalanges)
    const calcaneusBack: [number, number, number] = [
      pAnkle[0],
      Math.max(0.014 * s, pFoot1[1]),
      pAnkle[2] - 0.036 * s,
    ]
    builder.addTubeAlongPath(
      [calcaneusBack, [pAnkle[0], pAnkle[1] * 0.65, pAnkle[2]], pFoot1],
      [
        [0.015 * s, 0.018 * s], // Calcaneal tuberosity (heel)
        [0.017 * s, 0.016 * s], // Talus
        [0.02 * s, 0.012 * s], // Mid-tarsal arch
      ],
      segRib,
      0,
      [0.94, 0.91, 0.82]
    )

    // 5 Metatarsals & Segmented Toe Phalanges
    for (let tIdx = 1; tIdx <= 5; tIdx++) {
      const t1 = fullLandmarks?.[`joint-${tag}-toe-${tIdx}-1`]
      const t2 = fullLandmarks?.[`joint-${tag}-toe-${tIdx}-2`]
      const t3 = fullLandmarks?.[`joint-${tag}-toe-${tIdx}-3`]
      const t4 = fullLandmarks?.[`joint-${tag}-toe-${tIdx}-4`] || t3

      if (t1 && t2 && t3) {
        const tarsalOrigin: [number, number, number] = [
          pFoot1[0] * 0.5 + t1[0] * 0.5,
          pFoot1[1],
          pFoot1[2] * 0.7 + t1[2] * 0.3,
        ]
        const toePts: [number, number, number][] = [tarsalOrigin, t1, t2, t3]
        const toeRad: [number, number][] = [
          [0.0048 * s, 0.0048 * s],
          [0.0052 * s, 0.0048 * s],
          [0.004 * s, 0.0038 * s],
          [0.0032 * s, 0.003 * s],
        ]
        if (t4 && t4 !== t3) {
          toePts.push(t4)
          toeRad.push([0.0026 * s, 0.0025 * s])
        }
        builder.addTubeAlongPath(toePts, toeRad, 5, 0, [0.95, 0.92, 0.84])
      } else {
        const offsetX = side * (tIdx - 2.5) * 0.0095 * s
        builder.addTubeAlongPath(
          [
            [pFoot1[0] + offsetX * 0.5, pFoot1[1], pFoot1[2]],
            [pFoot2[0] + offsetX, pFoot2[1], pFoot2[2]],
            [pFoot2[0] + offsetX, pFoot2[1] * 0.8, pFoot2[2] + 0.032 * s],
          ],
          [
            [0.0045 * s, 0.0045 * s],
            [0.0048 * s, 0.0045 * s],
            [0.0028 * s, 0.0028 * s],
          ],
          5,
          0
        )
      }
    }
  }

  // Compile merged BufferGeometry
  const geometry = new THREE.BufferGeometry()
  const restPositions = new Float32Array(builder.positions)
  const restNormals = new Float32Array(builder.normals)
  const colors = new Float32Array(builder.colors)
  const boneRegionTag = new Uint8Array(builder.regionTags)

  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(restPositions), 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(restNormals), 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(builder.indices)
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  // ============================================================================
  // PRECOMPUTE SUBCUTANEOUS BONE PROMINENCE, HOLLOW RECESS & BONE FLOOR ON SKIN
  // ============================================================================
  const skinVertCount = skinBasePositions.length / 3
  const skinBoneProminence = new Float32Array(skinVertCount)
  const skinHollowRecess = new Float32Array(skinVertCount)
  const skinBoneFloorPos = new Float32Array(skinBasePositions.length)

  // Downsample skeleton vertices (~every 3rd vertex) for fast spatial proximity queries
  const sampleStep = 3
  const skelSamples: { x: number; y: number; z: number; tag: number }[] = []
  for (let i = 0; i < restPositions.length / 3; i += sampleStep) {
    skelSamples.push({
      x: restPositions[i * 3],
      y: restPositions[i * 3 + 1],
      z: restPositions[i * 3 + 2],
      tag: boneRegionTag[i],
    })
  }

  for (let i = 0; i < skinVertCount; i++) {
    const sx = skinBasePositions[i * 3]
    const sy = skinBasePositions[i * 3 + 1]
    const sz = skinBasePositions[i * 3 + 2]
    const ax = Math.abs(sx)
    const signX = Math.sign(sx) || 1

    // Find nearest 3D bone sample in local vertical band
    let minDistSq = Infinity
    let nearestBx = sx * 0.65
    let nearestBy = sy
    let nearestBz = sz * 0.65

    for (let k = 0; k < skelSamples.length; k++) {
      const b = skelSamples[k]
      const dy = sy - b.y
      if (Math.abs(dy) > 0.085 * s) continue
      const dx = sx - b.x
      const dz = sz - b.z
      const dSq = dx * dx + dy * dy + dz * dz
      if (dSq < minDistSq) {
        minDistSq = dSq
        nearestBx = b.x
        nearestBy = b.y
        nearestBz = b.z
      }
    }

    const distToBone = Math.sqrt(minDistSq)
    // Subcutaneous bone prominence: high (near 1.0) where bone lies within 4-16mm of the skin
    // (ribs, clavicles, sternum, spinous processes, iliac crest, zygoma, jaw, knuckles, shin)
    const prominence = 1.0 - smoothstep(0.004 * s, 0.022 * s, distToBone)
    skinBoneProminence[i] = prominence

    // Anatomical soft-tissue hollows that sink inward in extreme emaciation:
    // 1. Sub-malar / buccal hollow on the face
    const isFace = sy > eyeY - 0.115 * s
    let hollow = 0
    if (isFace) {
      const dEye = Math.hypot(
        (ax - eyeX) / 1.28,
        (sy - eyeY) / 1.02,
        (sz - eyeZ) / 1.38
      )
      const orbGuard = smoothstep(0.022 * s, 0.034 * s, dEye)
      const buccalWeight =
        smoothstep(0.024 * s, 0.036 * s, ax) *
        gaussian(sy, eyeY - 0.048 * s, 0.018 * s) *
        smoothstep(eyeZ - 0.022 * s, eyeZ + 0.006 * s, sz) *
        orbGuard
      const templeWeight =
        smoothstep(0.046 * s, 0.058 * s, ax) *
        gaussian(sy, eyeY + 0.008 * s, 0.015 * s) *
        gaussian(sz, eyeZ - 0.018 * s, 0.018 * s) *
        orbGuard
      hollow = Math.max(buccalWeight, templeWeight * 0.75)
    } else if (sy > pPelvis[1] - 0.05 * s && sy < pNeck[1] + 0.02 * s) {
      // 2. Intercostal grooves, supraclavicular fossa, and epigastric/abdominal cavity
      const abdomenHollow =
        gaussian(sy, (pSpine3[1] + pPelvis[1]) * 0.5, 0.065 * s) *
        smoothstep(0.0, 0.045 * s, sz) *
        (1.0 - prominence * 0.85)
      const intercostalHollow =
        gaussian(sy, (pSpine1[1] + pSpine3[1]) * 0.5, 0.095 * s) *
        (1.0 - prominence) *
        0.75
      hollow = Math.max(abdomenHollow, intercostalHollow)
    } else {
      // 3. Limb muscle bellies away from bony joints
      hollow = (1.0 - prominence) * 0.45
    }
    skinHollowRecess[i] = Math.min(1, Math.max(0, hollow))

    // Compute anatomical bone floor position so extreme reduction wraps onto the skeleton without inverting
    if (isFace) {
      // On the face, protect orbital rim (floor = rest pos) and set buccal floor at maxillary/dental arch (~25mm)
      const dEye = Math.hypot(
        (ax - eyeX) / 1.28,
        (sy - eyeY) / 1.02,
        (sz - eyeZ) / 1.38
      )
      const orbLock = 1.0 - smoothstep(0.021 * s, 0.033 * s, dEye)
      const minCheekX = Math.max(0.0245 * s, ax * 0.58)
      const floorX = signX * (ax * orbLock + minCheekX * (1 - orbLock))
      const floorZ = sz - (1 - orbLock) * 0.006 * s
      skinBoneFloorPos[i * 3] = floorX
      skinBoneFloorPos[i * 3 + 1] = sy
      skinBoneFloorPos[i * 3 + 2] = floorZ
    } else {
      const blendToBone = 0.78
      skinBoneFloorPos[i * 3] = sx * (1 - blendToBone) + nearestBx * blendToBone
      skinBoneFloorPos[i * 3 + 1] = sy * (1 - blendToBone * 0.2) + nearestBy * (blendToBone * 0.2)
      skinBoneFloorPos[i * 3 + 2] = sz * (1 - blendToBone) + nearestBz * blendToBone
    }
  }

  return {
    geometry,
    restPositions,
    restNormals,
    boneRegionTag,
    skinBoneProminence,
    skinHollowRecess,
    skinBoneFloorPos,
  }
}

/**
 * Updates the 3D Anatomical Skeleton vertex positions in real time to match:
 * - Structural body proportions (shoulderWidth, torsoWidth, armLength, legLength)
 * - Structural skull/jaw proportions (faceWidth, jawWidth, chinShape, headScale)
 * - Hierarchical 3D joint articulation (headYaw, headPitch, shoulder pitch, elbow flex)
 * - Grounding offset (sharedBodyMinY)
 */
export function syncAnatomicalSkeletonGeometry(
  cache: AnatomicalSkeletonCache,
  proportions: ExtendedBodyProportions,
  faceProportions: FacialProportions,
  jointPose: JointPoseState,
  anatomicalJoints: AnatomicalJoint[],
  baseHeight: number,
  sharedBodyMinY: number,
  recomputeNormals: boolean
) {
  const posAttr = cache.geometry.attributes.position as THREE.BufferAttribute
  if (!posAttr) return
  const arr = posAttr.array as Float32Array
  const rest = cache.restPositions
  const tags = cache.boneRegionTag
  const h = Math.max(1.2, baseHeight || 1.795)

  const { shoulderWidth, torsoWidth, armLength, legLength } = proportions
  const { faceWidth, jawWidth, chinShape, headScale, cheekbones } = faceProportions

  const poseActive = !isPoseNeutral(jointPose) && anatomicalJoints.length > 0
  const jointsMap = new Map<string, [number, number, number]>()
  if (poseActive) {
    for (const j of anatomicalJoints) {
      jointsMap.set(j.id, j.position)
    }
  }

  const headQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(jointPose.headPitch),
      THREE.MathUtils.degToRad(jointPose.headYaw),
      0,
      'YXZ'
    )
  )
  const lShoulderQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, 0, THREE.MathUtils.degToRad(jointPose.leftShoulderPitch))
  )
  const lElbowQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(-jointPose.leftElbowFlex * 0.65),
      THREE.MathUtils.degToRad(jointPose.leftElbowFlex * 0.75),
      0
    )
  )
  const rShoulderQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, 0, THREE.MathUtils.degToRad(-jointPose.rightShoulderPitch))
  )
  const rElbowQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(-jointPose.rightElbowFlex * 0.65),
      THREE.MathUtils.degToRad(-jointPose.rightElbowFlex * 0.75),
      0
    )
  )
  const tempVec = new THREE.Vector3()

  for (let i = 0; i < arr.length; i += 3) {
    const vIdx = i / 3
    const tag = tags[vIdx]
    let x = rest[i]
    let y = rest[i + 1]
    let z = rest[i + 2]
    const yNorm = y / h

    // 1. Structural Skull & Mandible Adaptation (tag === 1)
    if (tag === 1) {
      const headCenterY = 0.91 * h
      x *= 1 + headScale * 0.075 + faceWidth * 0.065
      y = headCenterY + (y - headCenterY) * (1 + headScale * 0.075)
      z *= 1 + headScale * 0.065
      // Zygomatic prominence
      if (yNorm > 0.89 && yNorm < 0.935 && Math.abs(x) > 0.035) {
        x += Math.sign(x) * cheekbones * 0.0035
        z += cheekbones * 0.002
      }
      // Mandible & Chin adaptation
      if (yNorm < 0.895) {
        x *= 1 + jawWidth * 0.085
        if (z > 0.01) {
          z += chinShape * 0.006
          y -= chinShape * 0.003
        }
      }
    } else {
      // 2. Axial & Appendicular Skeletal Proportions
      if (yNorm < 0.52) {
        y *= 1 + legLength * 0.065 * (1 - yNorm / 0.52)
      }
      if (tag === 2 && yNorm > 0.55 && yNorm < 0.84) {
        // Ribcage & Clavicle structural frame
        x *= 1 + torsoWidth * 0.075 + shoulderWidth * 0.045 * smoothstep(0.68, 0.82, yNorm)
        z *= 1 + torsoWidth * 0.055
      }
      if (Math.abs(x) > 0.14 && yNorm > 0.56 && yNorm < 0.86) {
        const sign = Math.sign(x)
        x += sign * shoulderWidth * 0.016 * smoothstep(0.12, 0.2, Math.abs(x))
        if (Math.abs(x) > 0.2) {
          const span = Math.abs(x) - 0.2
          x = sign * (0.2 + span * (1 + armLength * 0.12))
        }
      }
    }

    // 3. Joint Articulation
    if (poseActive) {
      const [ax, ay, az] = applyJointArticulationToPositionPoint(
        x,
        y,
        z,
        jointsMap,
        jointPose,
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
    arr[i + 1] = y - (Number.isFinite(sharedBodyMinY) ? sharedBodyMinY : 0)
    arr[i + 2] = z
  }

  posAttr.needsUpdate = true
  if (recomputeNormals) {
    cache.geometry.computeVertexNormals()
  }
}

/**
 * Computes the overall anatomical emaciation level (0 = normal/full, 1 = extreme skeletal leanness)
 * from the current body & facial proportions + manual sculpting deflation.
 */
export function computeCharacterEmaciationLevel(
  proportions: ExtendedBodyProportions,
  faceProportions: FacialProportions
): {
  bodyEmaciation: number
  faceEmaciation: number
  overallEmaciation: number
} {
  const bodyNeg =
    Math.max(0, -proportions.torsoWidth) * 0.32 +
    Math.max(0, -proportions.abdomenVolume) * 0.28 +
    Math.max(0, -proportions.chestVolume) * 0.2 +
    Math.max(0, -proportions.armThickness) * 0.1 +
    Math.max(0, -proportions.thighVolume) * 0.1

  const faceNeg =
    Math.max(0, -faceProportions.cheekVolume) * 0.35 +
    Math.max(0, -faceProportions.cheekDepth) * 0.35 +
    Math.max(0, -faceProportions.facialFat) * 0.3

  const bodyEmaciation = smoothstep(0.32, 0.92, bodyNeg)
  const faceEmaciation = smoothstep(0.32, 0.92, faceNeg)
  const overallEmaciation = Math.max(bodyEmaciation, faceEmaciation * 0.85)

  return { bodyEmaciation, faceEmaciation, overallEmaciation }
}
