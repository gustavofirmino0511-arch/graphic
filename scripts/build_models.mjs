import fs from 'node:fs'
import path from 'node:path'
import { buildAdiposeSystem, addDelta } from './adiposeMorphs.mjs'

const tempDir = process.env.TEMP || 'C:/Users/gusta/AppData/Local/Temp'
const objPath = path.join(tempDir, 'mh_base.obj')
const targetsDir = path.join(tempDir, 'mh_targets')
const outDir = path.resolve(import.meta.dirname, '../public/models')

fs.mkdirSync(outDir, { recursive: true })

console.log('[build_models] Reading MakeHuman CC0 base mesh...')
const objText = fs.readFileSync(objPath, 'utf8')
const lines = objText.split('\n')

const rawPositions = [] // [x, y, z] in MakeHuman decimeters
const rawUVs = [] // [u, v]
const bodyFaces = [] // array of [[vIdx, vtIdx], ...]
const eyeFaces = [] // array of [[vIdx, vtIdx], ...]
const jointVertexGroups = new Map() // groupName -> Set<vIdx>

let currentGroup = ''
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim()
  if (!line || line.startsWith('#')) continue
  if (line.startsWith('v ')) {
    const parts = line.split(/\s+/)
    rawPositions.push([Number(parts[1]), Number(parts[2]), Number(parts[3])])
  } else if (line.startsWith('vt ')) {
    const parts = line.split(/\s+/)
    rawUVs.push([Number(parts[1]), 1.0 - Number(parts[2])])
  } else if (line.startsWith('g ')) {
    currentGroup = line.slice(2).trim()
  } else if (line.startsWith('f ')) {
    const parts = line.split(/\s+/).slice(1)
    if (currentGroup.startsWith('joint-')) {
      if (!jointVertexGroups.has(currentGroup)) {
        jointVertexGroups.set(currentGroup, new Set())
      }
      const jSet = jointVertexGroups.get(currentGroup)
      for (const p of parts) {
        jSet.add(parseInt(p.split('/')[0], 10) - 1)
      }
      continue
    }
    if (
      currentGroup !== 'body' &&
      currentGroup !== 'helper-l-eye' &&
      currentGroup !== 'helper-r-eye'
    ) {
      continue
    }
    const face = parts.map((p) => {
      const [vStr, vtStr] = p.split('/')
      return [parseInt(vStr, 10) - 1, vtStr ? parseInt(vtStr, 10) - 1 : 0]
    })
    if (currentGroup === 'body') {
      bodyFaces.push(face)
    } else {
      eyeFaces.push(face)
    }
  }
}

// Build topological adjacency graph, body/eye vertex sets, and exact X-symmetry mirror map on rawPositions
const bodyVerts = new Set()
const rawNeighbors = Array.from({ length: rawPositions.length }, () => [])
const neighborSets = Array.from({ length: rawPositions.length }, () => new Set())

for (const face of bodyFaces) {
  for (let i = 0; i < face.length; i++) {
    const a = face[i][0]
    const b = face[(i + 1) % face.length][0]
    bodyVerts.add(a)
    if (a !== b) {
      neighborSets[a].add(b)
      neighborSets[b].add(a)
    }
  }
}
for (let i = 0; i < rawPositions.length; i++) {
  rawNeighbors[i] = Array.from(neighborSets[i])
}

const spatialHash = new Map()
for (const v of bodyVerts) {
  const [x, y, z] = rawPositions[v]
  spatialHash.set(`${Math.round(x * 5000)}_${Math.round(y * 5000)}_${Math.round(z * 5000)}`, v)
}
const mirrorMap = new Int32Array(rawPositions.length).fill(-1)
for (const v of bodyVerts) {
  const [x, y, z] = rawPositions[v]
  const mv = spatialHash.get(
    `${Math.round(-x * 5000)}_${Math.round(y * 5000)}_${Math.round(z * 5000)}`
  )
  if (mv !== undefined) mirrorMap[v] = mv
}

const leftEyeVerts = new Set()
const rightEyeVerts = new Set()
for (const face of eyeFaces) {
  for (const [vIdx] of face) {
    if (rawPositions[vIdx][0] >= 0) leftEyeVerts.add(vIdx)
    else rightEyeVerts.add(vIdx)
  }
}

// Identify the exact eyelid rim vertices (body vertices within 2.5mm of the eyeball surface in raw mesh)
const leftLidRim = []
const rightLidRim = []
for (const bv of bodyVerts) {
  const [bx, by, bz] = rawPositions[bv]
  if (by < 6.8 || by > 7.7) continue
  const eyeSet = bx >= 0 ? leftEyeVerts : rightEyeVerts
  let minD = Infinity
  for (const ev of eyeSet) {
    const [ex, ey, ez] = rawPositions[ev]
    const d = Math.hypot(bx - ex, by - ey, bz - ez) * 0.106
    if (d < minD) minD = d
  }
  if (minD < 0.0025) {
    if (bx >= 0) leftLidRim.push(bv)
    else rightLidRim.push(bv)
  }
}

function getVertSetBounds(verts, posArray) {
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity
  let cx = 0,
    cy = 0,
    cz = 0
  for (const v of verts) {
    const x = posArray[v * 3],
      y = posArray[v * 3 + 1],
      z = posArray[v * 3 + 2]
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
    if (z < z0) z0 = z
    if (z > z1) z1 = z
    cx += x
    cy += y
    cz += z
  }
  const n = verts.size || verts.length || 1
  return {
    cx: cx / n,
    cy: cy / n,
    cz: cz / n,
    bx: (x0 + x1) * 0.5,
    by: (y0 + y1) * 0.5,
    bz: (z0 + z1) * 0.5,
    rx: Math.max(0.0005, (x1 - x0) * 0.5),
    ry: Math.max(0.0005, (y1 - y0) * 0.5),
    rz: Math.max(0.0005, (z1 - z0) * 0.5),
    z1,
  }
}

const rawFlat = new Float32Array(rawPositions.length * 3)
for (let i = 0; i < rawPositions.length; i++) {
  rawFlat[i * 3] = rawPositions[i][0]
  rawFlat[i * 3 + 1] = rawPositions[i][1]
  rawFlat[i * 3 + 2] = rawPositions[i][2]
}
const rawLLidBounds = getVertSetBounds(leftLidRim, rawFlat)
const rawRLidBounds = getVertSetBounds(rightLidRim, rawFlat)
const rawLEyeBounds = getVertSetBounds(leftEyeVerts, rawFlat)
const rawREyeBounds = getVertSetBounds(rightEyeVerts, rawFlat)

// Identify true inner oral cavity bag vertices (strictly inside outer cheek skin at the same Y, Z)
const innerMouthBagVerts = []
const innerMouthBagSet = new Set()
for (const v of bodyVerts) {
  const [x, y, z] = rawPositions[v]
  if (y > 6.36 && y < 6.98 && z > 1.02 && z < 1.53 && Math.abs(x) < 0.39) {
    let hasOuterSkinOutside = false
    for (const ov of bodyVerts) {
      const [ox, oy, oz] = rawPositions[ov]
      if (
        Math.sign(ox) === Math.sign(x) &&
        Math.abs(oy - y) < 0.035 &&
        Math.abs(oz - z) < 0.035
      ) {
        if (Math.abs(ox) > Math.abs(x) + 0.075) {
          hasOuterSkinOutside = true
          break
        }
      }
    }
    if (hasOuterSkinOutside) {
      innerMouthBagVerts.push(v)
      innerMouthBagSet.add(v)
    }
  }
}

// Pair each inner mouth bag vertex with its corresponding outer cheek skin vertices at the same (Y, Z)
const innerBagToOuterCheek = new Map()
for (const iv of innerMouthBagVerts) {
  const [ix, iy, iz] = rawPositions[iv]
  const sign = Math.sign(ix) || 1
  const pairs = []
  for (const ov of bodyVerts) {
    if (innerMouthBagSet.has(ov)) continue
    const [ox, oy, oz] = rawPositions[ov]
    if (Math.sign(ox) !== sign || Math.abs(ox) <= Math.abs(ix) + 0.06) continue
    const dyz = Math.hypot(oy - iy, oz - iz)
    if (dyz < 0.06) {
      pairs.push({ ov, weight: 1 / (0.005 + dyz) })
    }
  }
  if (pairs.length > 0) innerBagToOuterCheek.set(iv, pairs)
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function gaussian(x, mu, sigma) {
  const d = (x - mu) / sigma
  return Math.exp(-0.5 * d * d)
}

// Precompute smooth anatomical protection masks in canonical MakeHuman decimeter coordinates:
// - orbitalProtect[v]: 0 on eyelids & eye socket rim, 1 outside orbital boundary
// - noseLipEarProtect[v]: 0 on nose tip/bridge/nostrils, lips, and ears, 1 elsewhere
const orbitalProtect = new Float32Array(rawPositions.length).fill(1.0)
const noseLipEarProtect = new Float32Array(rawPositions.length).fill(1.0)

for (const v of bodyVerts) {
  const [x, y, z] = rawPositions[v]
  if (y < 5.5) continue
  const ax = Math.abs(x)

  // Distance to eye center (ax=0.308, y=7.285, z=1.246) in decimeters
  // Strict zero-displacement shield across eyelids, canthi, tear trough, and orbital margin
  const dEye = Math.hypot((ax - 0.308) / 1.28, (y - 7.285) / 1.02, (z - 1.246) / 1.38)
  orbitalProtect[v] = smoothstep(0.21, 0.33, dEye)

  // Nose bridge, tip & nostrils protection
  const dNose = Math.hypot(ax / 0.88, (y - 6.95) / 1.38, Math.max(0, 1.52 - z) / 1.15)
  const pNose = z > 1.26 ? smoothstep(0.16, 0.27, dNose) : 1.0

  // Outer lips & mouth vermilion protection (inner mouth bag excluded so it can retract freely)
  const dLips = Math.hypot(ax / 1.32, (y - 6.605) / 0.66, Math.max(0, 1.48 - z) / 1.15)
  const pLips =
    z > 1.26 && !innerMouthBagSet.has(v) ? smoothstep(0.165, 0.275, dLips) : 1.0

  // Ears protection (outer lateral head |x| > 0.56, z < 0.98)
  const pEar =
    z < 0.98 && y > 6.55 && y < 7.48 ? 1.0 - smoothstep(0.56, 0.65, ax) : 1.0

  noseLipEarProtect[v] = Math.min(pNose, pLips, pEar)
}

function loadTarget(filename) {
  const fullPath = path.join(targetsDir, filename)
  const map = new Map()
  if (!fs.existsSync(fullPath)) {
    console.warn(`[build_models] Warning: target not found: ${filename}`)
    return map
  }
  const content = fs.readFileSync(fullPath, 'utf8').split('\n')
  for (let i = 0; i < content.length; i++) {
    const l = content[i].trim()
    if (!l || l.startsWith('#')) continue
    const parts = l.split(/\s+/)
    if (parts.length >= 4) {
      const idx = parseInt(parts[0], 10)
      map.set(idx, [Number(parts[1]), Number(parts[2]), Number(parts[3])])
    }
  }
  return map
}

function combineTargets(weightedTargets, scaleFactor = 0.106) {
  const delta = new Float32Array(rawPositions.length * 3)
  for (const { target, weight } of weightedTargets) {
    for (const [idx, [dx, dy, dz]] of target.entries()) {
      if (idx < rawPositions.length) {
        const base = idx * 3
        delta[base] += dx * weight * scaleFactor
        delta[base + 1] += dy * weight * scaleFactor
        delta[base + 2] += dz * weight * scaleFactor
      }
    }
  }
  return delta
}

// Base & Macro Targets
const tMaleYoung = loadTarget('caucasian-male-young.target')
const tFemaleYoung = loadTarget('caucasian-female-young.target')
const tAsianFemaleYoung = loadTarget('asian-female-young.target')
const tMaleMaxMuscle = loadTarget('universal-male-young-maxmuscle-averageweight.target')
const tFemaleMinWeight = loadTarget('universal-female-young-minmuscle-minweight.target')

// Body Proportions & Volume Targets
const tShoulderIncr = loadTarget('measure-shoulder-dist-incr.target')
const tShoulderDecr = loadTarget('measure-shoulder-dist-decr.target')
const tVShapeIncr = loadTarget('torso-vshape-incr.target')
const tVShapeDecr = loadTarget('torso-vshape-decr.target')
const tChestIncr = loadTarget('measure-frontchest-dist-incr.target')
const tChestDecr = loadTarget('measure-frontchest-dist-decr.target')
const tPectoralIncr = loadTarget('torso-muscle-pectoral-incr.target')
const tPectoralDecr = loadTarget('torso-muscle-pectoral-decr.target')
const tBustIncr = loadTarget('measure-bust-circ-incr.target')
const tBustDecr = loadTarget('measure-bust-circ-decr.target')
const tWaistIncr = loadTarget('measure-waist-circ-incr.target')
const tWaistDecr = loadTarget('measure-waist-circ-decr.target')
const tUpperArmIncr = loadTarget('measure-upperarm-length-incr.target')
const tUpperArmDecr = loadTarget('measure-upperarm-length-decr.target')
const tLowerArmIncr = loadTarget('measure-lowerarm-length-incr.target')
const tLowerArmDecr = loadTarget('measure-lowerarm-length-decr.target')
const tUpperLegIncr = loadTarget('measure-upperleg-height-incr.target')
const tUpperLegDecr = loadTarget('measure-upperleg-height-decr.target')
const tLowerLegIncr = loadTarget('measure-lowerleg-height-incr.target')
const tLowerLegDecr = loadTarget('measure-lowerleg-height-decr.target')

const tStomachIncr = loadTarget('stomach-pregnant-incr.target')
const tStomachDecr = loadTarget('stomach-pregnant-decr.target')
const tStomachToneIncr = loadTarget('stomach-tone-incr.target')
const tStomachToneDecr = loadTarget('stomach-tone-decr.target')
const tUpperArmCircIncr = loadTarget('measure-upperarm-circ-incr.target')
const tUpperArmCircDecr = loadTarget('measure-upperarm-circ-decr.target')
const tWristCircIncr = loadTarget('measure-wrist-circ-incr.target')
const tWristCircDecr = loadTarget('measure-wrist-circ-decr.target')
const tThighCircIncr = loadTarget('measure-thigh-circ-incr.target')
const tThighCircDecr = loadTarget('measure-thigh-circ-decr.target')
const tCalfCircIncr = loadTarget('measure-calf-circ-incr.target')
const tCalfCircDecr = loadTarget('measure-calf-circ-decr.target')
const tAnkleCircIncr = loadTarget('measure-ankle-circ-incr.target')
const tAnkleCircDecr = loadTarget('measure-ankle-circ-decr.target')
const tHipsCircIncr = loadTarget('measure-hips-circ-incr.target')
const tHipsCircDecr = loadTarget('measure-hips-circ-decr.target')

// Facial Targets
const tLCheekVolIncr = loadTarget('l-cheek-volume-incr.target')
const tLCheekVolDecr = loadTarget('l-cheek-volume-decr.target')
const tRCheekVolIncr = loadTarget('r-cheek-volume-incr.target')
const tRCheekVolDecr = loadTarget('r-cheek-volume-decr.target')
const tLCheekInnerIncr = loadTarget('l-cheek-inner-incr.target')
const tLCheekInnerDecr = loadTarget('l-cheek-inner-decr.target')
const tRCheekInnerIncr = loadTarget('r-cheek-inner-incr.target')
const tRCheekInnerDecr = loadTarget('r-cheek-inner-decr.target')
const tLCheekBonesIncr = loadTarget('l-cheek-bones-incr.target')
const tLCheekBonesDecr = loadTarget('l-cheek-bones-decr.target')
const tRCheekBonesIncr = loadTarget('r-cheek-bones-incr.target')
const tRCheekBonesDecr = loadTarget('r-cheek-bones-decr.target')

const tHeadInvTri = loadTarget('head-invertedtriangular.target')
const tHeadOval = loadTarget('head-oval.target')
const tHeadScaleHorizIncr = loadTarget('head-scale-horiz-incr.target')
const tHeadScaleHorizDecr = loadTarget('head-scale-horiz-decr.target')
const tHeadScaleVertIncr = loadTarget('head-scale-vert-incr.target')
const tHeadScaleVertDecr = loadTarget('head-scale-vert-decr.target')
const tHeadFatIncr = loadTarget('head-fat-incr.target')
const tHeadFatDecr = loadTarget('head-fat-decr.target')

const tChinTri = loadTarget('chin-triangle.target')
const tChinWidthIncr = loadTarget('chin-width-incr.target')
const tChinWidthDecr = loadTarget('chin-width-decr.target')
const tChinBonesIncr = loadTarget('chin-bones-incr.target')
const tChinBonesDecr = loadTarget('chin-bones-decr.target')
const tChinHeightIncr = loadTarget('chin-height-incr.target')
const tChinHeightDecr = loadTarget('chin-height-decr.target')
const tChinProminentIncr = loadTarget('chin-prominent-incr.target')
const tChinProminentDecr = loadTarget('chin-prominent-decr.target')

const tNoseWidthDecr = loadTarget('nose-point-width-decr.target')
const tNoseFlareDecr = loadTarget('nose-flaring-decr.target')
const tLEyeScaleIncr = loadTarget('l-eye-scale-incr.target')
const tREyeScaleIncr = loadTarget('r-eye-scale-incr.target')
const tLEyeH1Incr = loadTarget('l-eye-height1-incr.target')
const tREyeH1Incr = loadTarget('r-eye-height1-incr.target')
const tLEyeH2Incr = loadTarget('l-eye-height2-incr.target')
const tREyeH2Incr = loadTarget('r-eye-height2-incr.target')

function computeRawSmoothNormals(positionsFlat, facesList) {
  const normals = new Float32Array(rawPositions.length * 3)
  for (const faces of facesList) {
    for (const face of faces) {
      const tris =
        face.length === 4
          ? [
              [face[0][0], face[1][0], face[2][0]],
              [face[0][0], face[2][0], face[3][0]],
            ]
          : [[face[0][0], face[1][0], face[2][0]]]
      for (const [i0, i1, i2] of tris) {
        const ax = positionsFlat[i0 * 3],
          ay = positionsFlat[i0 * 3 + 1],
          az = positionsFlat[i0 * 3 + 2]
        const bx = positionsFlat[i1 * 3],
          by = positionsFlat[i1 * 3 + 1],
          bz = positionsFlat[i1 * 3 + 2]
        const cx = positionsFlat[i2 * 3],
          cy = positionsFlat[i2 * 3 + 1],
          cz = positionsFlat[i2 * 3 + 2]
        const ux = bx - ax,
          uy = by - ay,
          uz = bz - az
        const vx = cx - ax,
          vy = cy - ay,
          vz = cz - az
        const nx = uy * vz - uz * vy
        const ny = uz * vx - ux * vz
        const nz = ux * vy - uy * vx
        for (const idx of [i0, i1, i2]) {
          normals[idx * 3] += nx
          normals[idx * 3 + 1] += ny
          normals[idx * 3 + 2] += nz
        }
      }
    }
  }
  for (let i = 0; i < rawPositions.length; i++) {
    const nx = normals[i * 3],
      ny = normals[i * 3 + 1],
      nz = normals[i * 3 + 2]
    const len = Math.hypot(nx, ny, nz) || 1
    normals[i * 3] = nx / len
    normals[i * 3 + 1] = ny / len
    normals[i * 3 + 2] = nz / len
  }
  return normals
}

const SKELETON_JOINTS_DEF = [
  { id: 'pelvis', group: 'joint-pelvis', parent: null, label: 'Pelve (Raiz)' },
  { id: 'spine3', group: 'joint-spine-3', parent: 'pelvis', label: 'Coluna Lombar' },
  { id: 'spine2', group: 'joint-spine-2', parent: 'spine3', label: 'Coluna Torácica' },
  { id: 'spine1', group: 'joint-spine-1', parent: 'spine2', label: 'Peito / Tórax Superior' },
  { id: 'neck', group: 'joint-neck', parent: 'spine1', label: 'Pescoço' },
  { id: 'head', group: 'joint-head', parent: 'neck', label: 'Cabeça' },
  { id: 'clavicle_l', group: 'joint-l-clavicle', parent: 'spine1', label: 'Clavícula Esq.' },
  { id: 'shoulder_l', group: 'joint-l-shoulder', parent: 'clavicle_l', label: 'Ombro Esq.' },
  { id: 'elbow_l', group: 'joint-l-elbow', parent: 'shoulder_l', label: 'Cotovelo Esq.' },
  { id: 'hand_l', group: 'joint-l-hand', parent: 'elbow_l', label: 'Punho / Mão Esq.' },
  { id: 'clavicle_r', group: 'joint-r-clavicle', parent: 'spine1', label: 'Clavícula Dir.' },
  { id: 'shoulder_r', group: 'joint-r-shoulder', parent: 'clavicle_r', label: 'Ombro Dir.' },
  { id: 'elbow_r', group: 'joint-r-elbow', parent: 'shoulder_r', label: 'Cotovelo Dir.' },
  { id: 'hand_r', group: 'joint-r-hand', parent: 'elbow_r', label: 'Punho / Mão Dir.' },
  { id: 'thigh_l', group: 'joint-l-upper-leg', parent: 'pelvis', label: 'Quadril / Coxa Esq.' },
  { id: 'knee_l', group: 'joint-l-knee', parent: 'thigh_l', label: 'Joelho Esq.' },
  { id: 'ankle_l', group: 'joint-l-ankle', parent: 'knee_l', label: 'Tornozelo Esq.' },
  { id: 'thigh_r', group: 'joint-r-upper-leg', parent: 'pelvis', label: 'Quadril / Coxa Dir.' },
  { id: 'knee_r', group: 'joint-r-knee', parent: 'thigh_r', label: 'Joelho Dir.' },
  { id: 'ankle_r', group: 'joint-r-ankle', parent: 'knee_r', label: 'Tornozelo Dir.' },
]

/**
 * Locks the base eyeball vertices (leftEyeVerts, rightEyeVerts) to the exact 3D position and scale
 * of the surrounding eyelid rim (leftLidRim, rightLidRim) relative to the reference MakeHuman mesh,
 * preventing any eyeball protrusion, vertical offset, or socket gap in both Realistic and Anime models.
 */
function lockBaseEyeballsToLidRim(posFlat, scaleFactor) {
  const cornealOffsetRatio =
    (rawLLidBounds.z1 - rawLEyeBounds.z1) / Math.max(0.001, rawLLidBounds.rx)

  for (const [eyeSet, lidRim, rawLid, rawEye] of [
    [leftEyeVerts, leftLidRim, rawLLidBounds, rawLEyeBounds],
    [rightEyeVerts, rightLidRim, rawRLidBounds, rawREyeBounds],
  ]) {
    const curLid = getVertSetBounds(lidRim, posFlat)
    const sx = curLid.rx / (rawLid.rx * scaleFactor)
    const sy = curLid.ry / (rawLid.ry * scaleFactor)
    const sz = sx // Keep horizontal spherical curvature in depth so cornea doesn't over-bulge when eyelids open vertically

    const targetCorneaZ1 = curLid.z1 - cornealOffsetRatio * curLid.rx
    const rawEyeFrontOffset = (rawEye.z1 - rawLid.bz) * scaleFactor * sz
    const targetBz = targetCorneaZ1 - rawEyeFrontOffset

    for (const v of eyeSet) {
      const rx = rawFlat[v * 3] * scaleFactor
      const ry = rawFlat[v * 3 + 1] * scaleFactor
      const rz = rawFlat[v * 3 + 2] * scaleFactor
      const lbx = rawLid.bx * scaleFactor
      const lby = rawLid.by * scaleFactor
      const lbz = rawLid.bz * scaleFactor
      posFlat[v * 3] = curLid.bx + (rx - lbx) * sx
      posFlat[v * 3 + 1] = curLid.by + (ry - lby) * sy
      posFlat[v * 3 + 2] = targetBz + (rz - lbz) * sz
    }
  }
}

/**
 * Ensures the base mesh's inner oral cavity bag maintains at least 3.8mm of lateral tissue clearance
 * inside the outer cheek and jaw skin at rest (especially important for Anime where base targets narrow the lower jaw).
 */
function enforceBaseOralWallClearance(posFlat) {
  const minClearance = 0.0038
  for (const [iv, pairs] of innerBagToOuterCheek.entries()) {
    const ix = posFlat[iv * 3]
    const sign = Math.sign(ix) || 1
    let minOuterAbsX = Infinity
    for (const { ov } of pairs) {
      const ox = Math.abs(posFlat[ov * 3])
      if (ox < minOuterAbsX) minOuterAbsX = ox
    }
    if (minOuterAbsX < Infinity && Math.abs(ix) > minOuterAbsX - minClearance) {
      posFlat[iv * 3] = sign * Math.max(0.001, minOuterAbsX - minClearance)
    }
  }
}

/**
 * Retracts the true inner oral cavity bag vertices whenever the outer cheek skin moves inward,
 * guaranteeing that the inner mouth wall never pokes through hollow cheeks or narrow jaws.
 */
function syncInnerMouthBag(delta) {
  for (const [iv, pairs] of innerBagToOuterCheek.entries()) {
    let sumDx = 0,
      sumDy = 0,
      sumDz = 0,
      sumW = 0,
      maxInwardDx = 0
    const sign = Math.sign(rawPositions[iv][0]) || 1
    for (const { ov, weight } of pairs) {
      const odx = delta[ov * 3]
      sumDx += odx * weight
      sumDy += delta[ov * 3 + 1] * weight
      sumDz += delta[ov * 3 + 2] * weight
      sumW += weight
      if (sign * odx < sign * maxInwardDx) {
        maxInwardDx = odx
      }
    }
    if (sumW > 0) {
      const avgDx = sumDx / sumW
      const avgDy = sumDy / sumW
      const avgDz = sumDz / sumW
      // Whenever the outer cheek moves inward, retract the inner mouth bag by the stronger of average or peak inward shift
      if (sign * avgDx < 0 || sign * maxInwardDx < 0) {
        const inwardDx = sign * (0.65 * avgDx + 0.35 * maxInwardDx) < sign * avgDx
          ? 0.65 * avgDx + 0.35 * maxInwardDx
          : avgDx
        delta[iv * 3] = inwardDx * 0.98
        delta[iv * 3 + 1] = avgDy * 0.85
        delta[iv * 3 + 2] = avgDz * 0.85
      }
    }
  }
  return delta
}

/**
 * Enforces exact bilateral X-symmetry across the head mesh, applies topological Laplacian smoothing
 * while respecting orbital protection, retracts the inner oral cavity bag when needed, and zeroes eyeball offsets.
 */
function finalizeFacialMorphDelta(delta, iterations = 2, alpha = 0.42) {
  for (const v of bodyVerts) {
    const [x] = rawPositions[v]
    if (x >= 0) {
      const mv = mirrorMap[v]
      if (mv >= 0 && mv !== v) {
        const dx = 0.5 * (delta[v * 3] - delta[mv * 3])
        const dy = 0.5 * (delta[v * 3 + 1] + delta[mv * 3 + 1])
        const dz = 0.5 * (delta[v * 3 + 2] + delta[mv * 3 + 2])
        delta[v * 3] = dx
        delta[v * 3 + 1] = dy
        delta[v * 3 + 2] = dz
        delta[mv * 3] = -dx
        delta[mv * 3 + 1] = dy
        delta[mv * 3 + 2] = dz
      } else if (mv === v) {
        delta[v * 3] = 0
      }
    }
  }

  let curr = new Float32Array(delta)
  for (let it = 0; it < iterations; it++) {
    const next = new Float32Array(curr)
    for (const v of bodyVerts) {
      if (rawPositions[v][1] < 5.5 || innerMouthBagSet.has(v)) continue
      const nbs = rawNeighbors[v]
      if (!nbs.length) continue
      let ax = 0,
        ay = 0,
        az = 0
      for (const nb of nbs) {
        ax += curr[nb * 3]
        ay += curr[nb * 3 + 1]
        az += curr[nb * 3 + 2]
      }
      ax /= nbs.length
      ay /= nbs.length
      az /= nbs.length
      const w = alpha * orbitalProtect[v]
      next[v * 3] = curr[v * 3] * (1 - w) + ax * w
      next[v * 3 + 1] = curr[v * 3 + 1] * (1 - w) + ay * w
      next[v * 3 + 2] = curr[v * 3 + 2] * (1 - w) + az * w
    }
    curr = next
  }

  syncInnerMouthBag(curr)

  // Zero eyeball deltas for local cheek/jaw/chin targets (or lock to eyelid rim for global head/face targets)
  for (const vIdx of leftEyeVerts) {
    curr[vIdx * 3] = 0
    curr[vIdx * 3 + 1] = 0
    curr[vIdx * 3 + 2] = 0
  }
  for (const vIdx of rightEyeVerts) {
    curr[vIdx * 3] = 0
    curr[vIdx * 3 + 1] = 0
    curr[vIdx * 3 + 2] = 0
  }
  return curr
}

/**
 * For global cranial/facial targets (faceWidth, headScale) that translate or scale the eye sockets,
 * locks the eyeball vertex deltas directly to the eyelid rim's translation and scale so eyeballs and eyelids
 * move as a single locked anatomical unit with 0.00mm relative drift.
 */
function lockMorphEyeballsToLidRim(delta, basePosFlat) {
  const morphedFlat = new Float32Array(basePosFlat.length)
  for (let i = 0; i < basePosFlat.length; i++) {
    morphedFlat[i] = basePosFlat[i] + delta[i]
  }
  for (const [eyeSet, lidRim] of [
    [leftEyeVerts, leftLidRim],
    [rightEyeVerts, rightLidRim],
  ]) {
    const baseLid = getVertSetBounds(lidRim, basePosFlat)
    const morphLid = getVertSetBounds(lidRim, morphedFlat)
    const sx = morphLid.rx / baseLid.rx
    const sy = morphLid.ry / baseLid.ry
    const sz = (sx + sy) * 0.5
    const shiftX = morphLid.bx - baseLid.bx
    const shiftY = morphLid.by - baseLid.by
    const shiftZ = morphLid.z1 - baseLid.z1

    for (const v of eyeSet) {
      const bx = basePosFlat[v * 3]
      const by = basePosFlat[v * 3 + 1]
      const bz = basePosFlat[v * 3 + 2]
      const newX = baseLid.bx + shiftX + (bx - baseLid.bx) * sx
      const newY = baseLid.by + shiftY + (by - baseLid.by) * sy
      const newZ = baseLid.bz + shiftZ + (bz - baseLid.bz) * sz
      delta[v * 3] = newX - bx
      delta[v * 3 + 1] = newY - by
      delta[v * 3 + 2] = newZ - bz
    }
  }
  return delta
}

function buildFacialMorphSuite(posFlat, scaleFactor, isAnime = false) {
  const s = (scaleFactor / 0.106) * (isAnime ? 1.26 : 1.0)

  // 1. cheekVolumePlus / cheekVolumeMinus ("Volume das Bochechas")
  // Controls mid-cheek convex fullness vs lean mid-cheek pad independently of jaw/cranium width
  const cheekVolumePlus = combineTargets(
    [
      { target: tLCheekVolIncr, weight: 1.05 },
      { target: tRCheekVolIncr, weight: 1.05 },
      { target: tLCheekInnerIncr, weight: 0.9 },
      { target: tRCheekInnerIncr, weight: 0.9 },
    ],
    scaleFactor
  )
  const cheekVolumeMinus = combineTargets(
    [
      { target: tLCheekVolDecr, weight: 1.15 },
      { target: tRCheekVolDecr, weight: 1.15 },
      { target: tLCheekInnerDecr, weight: 1.05 },
      { target: tRCheekInnerDecr, weight: 1.05 },
    ],
    scaleFactor
  )

  for (const v of bodyVerts) {
    if (innerMouthBagSet.has(v)) continue
    const [x, y, z] = rawPositions[v]
    const prot = orbitalProtect[v] * noseLipEarProtect[v]
    if (y < 6.15 || y > 7.12) {
      cheekVolumePlus[v * 3] *= prot * smoothstep(7.18, 7.02, y)
      cheekVolumePlus[v * 3 + 1] *= prot * smoothstep(7.18, 7.02, y)
      cheekVolumePlus[v * 3 + 2] *= prot * smoothstep(7.18, 7.02, y)
      cheekVolumeMinus[v * 3] *= prot * smoothstep(7.18, 7.02, y)
      cheekVolumeMinus[v * 3 + 1] *= prot * smoothstep(7.18, 7.02, y)
      cheekVolumeMinus[v * 3 + 2] *= prot * smoothstep(7.18, 7.02, y)
      continue
    }
    const ax = Math.abs(x)
    const sign = Math.sign(x) || 1
    // Fade out Z-retraction near the infraorbital margin so eyes never appear protruding
    const infraOrbitalZGuard = 1.0 - smoothstep(6.78, 7.02, y)
    const wPad =
      smoothstep(0.25, 0.35, ax) *
      gaussian(ax, 0.45, 0.125) *
      gaussian(y, 6.72, 0.16) *
      smoothstep(0.9, 1.14, z) *
      prot

    cheekVolumePlus[v * 3] = cheekVolumePlus[v * 3] * prot + sign * 0.003 * wPad * s
    cheekVolumePlus[v * 3 + 1] = cheekVolumePlus[v * 3 + 1] * prot - 0.0005 * wPad * s
    cheekVolumePlus[v * 3 + 2] =
      (cheekVolumePlus[v * 3 + 2] * prot + 0.0022 * wPad * s) * infraOrbitalZGuard

    cheekVolumeMinus[v * 3] = cheekVolumeMinus[v * 3] * prot - sign * 0.0038 * wPad * s
    cheekVolumeMinus[v * 3 + 1] = cheekVolumeMinus[v * 3 + 1] * prot + 0.0007 * wPad * s
    cheekVolumeMinus[v * 3 + 2] =
      (cheekVolumeMinus[v * 3 + 2] * prot - 0.0018 * wPad * s) * infraOrbitalZGuard
  }

  // 2. cheekDepthPlus / cheekDepthMinus ("Profundidade das Bochechas / Encovamento")
  // Excavates or fills the anatomical sub-malar triangle beneath the zygomatic arch
  const cheekDepthPlus = new Float32Array(rawPositions.length * 3)
  const cheekDepthMinus = new Float32Array(rawPositions.length * 3)
  for (const v of bodyVerts) {
    if (innerMouthBagSet.has(v)) continue
    const [x, y, z] = rawPositions[v]
    if (y < 6.25 || y > 7.05) continue
    const ax = Math.abs(x)
    const sign = Math.sign(x) || 1
    const prot = orbitalProtect[v] * noseLipEarProtect[v]
    const infraOrbitalZGuard = 1.0 - smoothstep(6.76, 6.98, y)
    const subMalarRidgeY = 6.63 + (ax - 0.36) * 0.95
    const wSubMalar =
      smoothstep(0.26, 0.36, ax) *
      (1.0 - smoothstep(0.54, 0.63, ax)) *
      gaussian(y, subMalarRidgeY, 0.135) *
      smoothstep(0.94, 1.12, z) *
      (1.0 - smoothstep(1.38, 1.5, z)) *
      prot

    cheekDepthMinus[v * 3] = -sign * 0.0045 * wSubMalar * s
    cheekDepthMinus[v * 3 + 1] = 0.001 * wSubMalar * s
    cheekDepthMinus[v * 3 + 2] = -0.002 * wSubMalar * infraOrbitalZGuard * s

    cheekDepthPlus[v * 3] = sign * 0.0035 * wSubMalar * s
    cheekDepthPlus[v * 3 + 1] = -0.0007 * wSubMalar * s
    cheekDepthPlus[v * 3 + 2] = 0.0018 * wSubMalar * infraOrbitalZGuard * s
  }

  // 3. facialFatPlus / facialFatMinus ("Gordura Facial / Arredondamento")
  // Controls lower cheek / buccal-mandibular jowl fullness & submental roundness
  const facialFatPlus = combineTargets([{ target: tHeadFatIncr, weight: 0.72 }], scaleFactor)
  const facialFatMinus = combineTargets([{ target: tHeadFatDecr, weight: 0.8 }], scaleFactor)
  for (const v of bodyVerts) {
    if (innerMouthBagSet.has(v)) continue
    const [x, y, z] = rawPositions[v]
    if (y < 5.8 || y > 7.02) {
      facialFatPlus[v * 3] = 0
      facialFatPlus[v * 3 + 1] = 0
      facialFatPlus[v * 3 + 2] = 0
      facialFatMinus[v * 3] = 0
      facialFatMinus[v * 3 + 1] = 0
      facialFatMinus[v * 3 + 2] = 0
      continue
    }
    const ax = Math.abs(x)
    const sign = Math.sign(x) || 1
    const prot = orbitalProtect[v] * noseLipEarProtect[v]
    const neckFade = smoothstep(5.88, 6.22, y)
    const upperFade = 1.0 - smoothstep(6.78, 7.0, y)
    const mask = prot * neckFade * upperFade

    const wJowl =
      smoothstep(0.22, 0.34, ax) *
      gaussian(ax, 0.45, 0.13) *
      gaussian(y, 6.49, 0.15) *
      smoothstep(0.84, 1.06, z) *
      mask

    facialFatPlus[v * 3] = facialFatPlus[v * 3] * mask + sign * 0.0032 * wJowl * s
    facialFatPlus[v * 3 + 1] = facialFatPlus[v * 3 + 1] * mask - 0.0014 * wJowl * s
    facialFatPlus[v * 3 + 2] = facialFatPlus[v * 3 + 2] * mask + 0.0016 * wJowl * s

    facialFatMinus[v * 3] = facialFatMinus[v * 3] * mask - sign * 0.0036 * wJowl * s
    facialFatMinus[v * 3 + 1] = facialFatMinus[v * 3 + 1] * mask + 0.0012 * wJowl * s
    facialFatMinus[v * 3 + 2] = facialFatMinus[v * 3 + 2] * mask - 0.0014 * wJowl * s
  }

  // 4. cheekbonesPlus / cheekbonesMinus ("Definição das Maçãs do Rosto")
  // Broad anatomical zygomatic arch & malar eminence with strict orbital rim protection
  const cheekbonesPlus = combineTargets(
    [
      { target: tLCheekBonesIncr, weight: 0.7 },
      { target: tRCheekBonesIncr, weight: 0.7 },
    ],
    scaleFactor
  )
  const cheekbonesMinus = combineTargets(
    [
      { target: tLCheekBonesDecr, weight: 0.85 },
      { target: tRCheekBonesDecr, weight: 0.85 },
    ],
    scaleFactor
  )
  for (const v of bodyVerts) {
    if (innerMouthBagSet.has(v)) continue
    const [x, y, z] = rawPositions[v]
    const ax = Math.abs(x)
    const sign = Math.sign(x) || 1
    const dEye = Math.hypot((ax - 0.308) / 1.32, (y - 7.285) / 1.08, (z - 1.246) / 1.42)
    const strictOrbital = smoothstep(0.24, 0.36, dEye)
    const prot = strictOrbital * noseLipEarProtect[v]
    if (y < 6.4 || y > 7.22) {
      cheekbonesPlus[v * 3] *= prot * smoothstep(7.24, 7.1, y)
      cheekbonesPlus[v * 3 + 1] *= prot * smoothstep(7.24, 7.1, y)
      cheekbonesPlus[v * 3 + 2] *= prot * smoothstep(7.24, 7.1, y)
      cheekbonesMinus[v * 3] *= prot * smoothstep(7.24, 7.1, y)
      cheekbonesMinus[v * 3 + 1] *= prot * smoothstep(7.24, 7.1, y)
      cheekbonesMinus[v * 3 + 2] *= prot * smoothstep(7.24, 7.1, y)
      continue
    }

    const wZygoma =
      smoothstep(0.32, 0.43, ax) *
      gaussian(ax, 0.51, 0.11) *
      gaussian(y, 6.98, 0.1) *
      smoothstep(0.92, 1.12, z) *
      prot
    const wSubZygoma =
      smoothstep(0.32, 0.42, ax) *
      gaussian(ax, 0.49, 0.105) *
      gaussian(y, 6.79, 0.085) *
      smoothstep(0.95, 1.15, z) *
      prot

    cheekbonesPlus[v * 3] =
      cheekbonesPlus[v * 3] * prot + sign * (0.0036 * wZygoma - 0.0015 * wSubZygoma) * s
    cheekbonesPlus[v * 3 + 1] = cheekbonesPlus[v * 3 + 1] * prot + 0.0008 * wZygoma * s
    cheekbonesPlus[v * 3 + 2] =
      cheekbonesPlus[v * 3 + 2] * prot + (0.0024 * wZygoma - 0.0008 * wSubZygoma) * s

    cheekbonesMinus[v * 3] = cheekbonesMinus[v * 3] * prot - sign * 0.003 * wZygoma * s
    cheekbonesMinus[v * 3 + 1] = cheekbonesMinus[v * 3 + 1] * prot - 0.0006 * wZygoma * s
    cheekbonesMinus[v * 3 + 2] = cheekbonesMinus[v * 3 + 2] * prot - 0.0018 * wZygoma * s
  }

  // 5. jawWidthPlus / jawWidthMinus ("Largura Inferior da Face / Mandíbula")
  const jawWidthPlus = combineTargets(
    [
      { target: tChinWidthIncr, weight: 1.15 },
      { target: tChinBonesIncr, weight: 0.45 },
    ],
    scaleFactor
  )
  const jawWidthMinus = combineTargets(
    [
      { target: tChinWidthDecr, weight: 1.25 },
      { target: tChinBonesDecr, weight: 0.85 },
    ],
    scaleFactor
  )
  for (const v of bodyVerts) {
    if (innerMouthBagSet.has(v)) continue
    const [x, y, z] = rawPositions[v]
    const prot = orbitalProtect[v] * noseLipEarProtect[v]
    if (y < 5.95 || y > 6.95) {
      jawWidthPlus[v * 3] = 0
      jawWidthPlus[v * 3 + 1] = 0
      jawWidthPlus[v * 3 + 2] = 0
      jawWidthMinus[v * 3] = 0
      jawWidthMinus[v * 3 + 1] = 0
      jawWidthMinus[v * 3 + 2] = 0
      continue
    }
    const ax = Math.abs(x)
    const sign = Math.sign(x) || 1
    jawWidthPlus[v * 3 + 1] *= 0.2
    jawWidthMinus[v * 3 + 1] *= 0.2

    const wMandible =
      smoothstep(0.16, 0.28, ax) *
      gaussian(y, 6.46, 0.17) *
      smoothstep(0.68, 0.88, z) *
      (1.0 - smoothstep(1.32, 1.48, z)) *
      prot

    jawWidthPlus[v * 3] = jawWidthPlus[v * 3] * prot + sign * 0.0038 * wMandible * s
    jawWidthPlus[v * 3 + 2] *= prot
    jawWidthMinus[v * 3] = jawWidthMinus[v * 3] * prot - sign * 0.004 * wMandible * s
    jawWidthMinus[v * 3 + 2] *= prot
  }

  // 6. jawDefinitionPlus / jawDefinitionMinus ("Definição da Mandíbula")
  const jawDefinitionPlus = new Float32Array(rawPositions.length * 3)
  const jawDefinitionMinus = new Float32Array(rawPositions.length * 3)
  for (const v of bodyVerts) {
    if (innerMouthBagSet.has(v)) continue
    const [x, y, z] = rawPositions[v]
    if (y < 5.95 || y > 7.05) continue
    const ax = Math.abs(x)
    const sign = Math.sign(x) || 1
    const prot = orbitalProtect[v] * noseLipEarProtect[v]
    if (prot <= 0.001) continue

    const jawLineY = 6.18 + Math.min(1, Math.max(0, (ax - 0.14) / 0.38)) * 0.32
    const wJawRidge =
      smoothstep(0.14, 0.24, ax) *
      (1.0 - smoothstep(0.55, 0.64, ax)) *
      gaussian(y, jawLineY, 0.08) *
      smoothstep(0.72, 0.88, z) *
      prot
    const wSubMandible =
      smoothstep(0.08, 0.22, ax) *
      (1.0 - smoothstep(0.48, 0.58, ax)) *
      gaussian(y, jawLineY - 0.1, 0.075) *
      smoothstep(0.75, 0.95, z) *
      prot
    const wCheekJawTrans =
      smoothstep(0.26, 0.38, ax) *
      (1.0 - smoothstep(0.54, 0.62, ax)) *
      gaussian(y, jawLineY + 0.15, 0.085) *
      smoothstep(0.88, 1.08, z) *
      prot

    jawDefinitionPlus[v * 3] =
      sign * (0.0028 * wJawRidge - 0.002 * wSubMandible - 0.0016 * wCheekJawTrans) * s
    jawDefinitionPlus[v * 3 + 1] = (-0.0012 * wJawRidge + 0.0022 * wSubMandible) * s
    jawDefinitionPlus[v * 3 + 2] = (0.0016 * wJawRidge - 0.0014 * wSubMandible) * s

    jawDefinitionMinus[v * 3] =
      sign * (-0.0024 * wJawRidge + 0.0018 * wSubMandible + 0.0014 * wCheekJawTrans) * s
    jawDefinitionMinus[v * 3 + 1] = (0.001 * wJawRidge - 0.0016 * wSubMandible) * s
    jawDefinitionMinus[v * 3 + 2] = (-0.0014 * wJawRidge + 0.001 * wSubMandible) * s
  }

  // 7. chinShapePlus / chinShapeMinus ("Formato do Queixo")
  const chinShapePlus = combineTargets(
    [
      { target: tChinProminentIncr, weight: 1.35 },
      { target: tChinHeightIncr, weight: 0.85 },
    ],
    scaleFactor
  )
  const chinShapeMinus = combineTargets(
    [
      { target: tChinProminentDecr, weight: 1.2 },
      { target: tChinHeightDecr, weight: 0.9 },
      { target: tChinTri, weight: 0.7 },
    ],
    scaleFactor
  )
  for (const v of bodyVerts) {
    if (innerMouthBagSet.has(v)) continue
    const [, y] = rawPositions[v]
    const prot = orbitalProtect[v] * noseLipEarProtect[v] * (1.0 - smoothstep(6.58, 6.72, y))
    chinShapePlus[v * 3] *= prot
    chinShapePlus[v * 3 + 1] *= prot
    chinShapePlus[v * 3 + 2] *= prot
    chinShapeMinus[v * 3] *= prot
    chinShapeMinus[v * 3 + 1] *= prot
    chinShapeMinus[v * 3 + 2] *= prot
  }

  // 8. faceWidthPlus / faceWidthMinus ("Largura da Face", orbital-slit safe + locked eyeballs)
  const faceWidthPlus = combineTargets(
    [
      { target: tHeadScaleHorizIncr, weight: 0.78 },
      { target: tHeadOval, weight: 0.18 },
    ],
    scaleFactor
  )
  const faceWidthMinus = combineTargets(
    [
      { target: tHeadScaleHorizDecr, weight: 0.78 },
      { target: tHeadInvTri, weight: 0.18 },
    ],
    scaleFactor
  )

  let lEyeShiftPlusX = 0,
    lEyeShiftMinusX = 0
  for (const lv of leftLidRim) {
    lEyeShiftPlusX += faceWidthPlus[lv * 3]
    lEyeShiftMinusX += faceWidthMinus[lv * 3]
  }
  lEyeShiftPlusX /= leftLidRim.length
  lEyeShiftMinusX /= leftLidRim.length

  for (const v of bodyVerts) {
    const [x, y, z] = rawPositions[v]
    if (y < 5.5) continue
    const ax = Math.abs(x)
    const sign = Math.sign(x) || 1
    const dEye = Math.hypot((ax - 0.308) / 1.2, (y - 7.285) / 0.9, (z - 1.246) / 1.25)
    const orbBlend = 1.0 - smoothstep(0.13, 0.25, dEye)
    if (orbBlend > 0.001) {
      faceWidthPlus[v * 3] =
        faceWidthPlus[v * 3] * (1 - orbBlend) + sign * lEyeShiftPlusX * 0.6 * orbBlend
      faceWidthPlus[v * 3 + 1] *= 1 - orbBlend
      faceWidthPlus[v * 3 + 2] *= 1 - orbBlend

      faceWidthMinus[v * 3] =
        faceWidthMinus[v * 3] * (1 - orbBlend) + sign * lEyeShiftMinusX * 0.6 * orbBlend
      faceWidthMinus[v * 3 + 1] *= 1 - orbBlend
      faceWidthMinus[v * 3 + 2] *= 1 - orbBlend
    }
  }

  // 9. headScalePlus / headScaleMinus ("Proporções da Cabeça", locked eyeballs)
  const headScalePlus = combineTargets(
    [
      { target: tHeadScaleHorizIncr, weight: 0.85 },
      { target: tHeadScaleVertIncr, weight: 0.85 },
    ],
    scaleFactor
  )
  const headScaleMinus = combineTargets(
    [
      { target: tHeadScaleHorizDecr, weight: 0.85 },
      { target: tHeadScaleVertDecr, weight: 0.85 },
    ],
    scaleFactor
  )

  return [
    { name: 'cheekVolumePlus', delta: finalizeFacialMorphDelta(cheekVolumePlus, 2, 0.42) },
    { name: 'cheekVolumeMinus', delta: finalizeFacialMorphDelta(cheekVolumeMinus, 2, 0.42) },
    { name: 'cheekDepthPlus', delta: finalizeFacialMorphDelta(cheekDepthPlus, 2, 0.45) },
    { name: 'cheekDepthMinus', delta: finalizeFacialMorphDelta(cheekDepthMinus, 2, 0.45) },
    { name: 'facialFatPlus', delta: finalizeFacialMorphDelta(facialFatPlus, 2, 0.42) },
    { name: 'facialFatMinus', delta: finalizeFacialMorphDelta(facialFatMinus, 2, 0.42) },
    { name: 'cheekbonesPlus', delta: finalizeFacialMorphDelta(cheekbonesPlus, 3, 0.48) },
    { name: 'cheekbonesMinus', delta: finalizeFacialMorphDelta(cheekbonesMinus, 3, 0.48) },
    { name: 'jawWidthPlus', delta: finalizeFacialMorphDelta(jawWidthPlus, 2, 0.42) },
    { name: 'jawWidthMinus', delta: finalizeFacialMorphDelta(jawWidthMinus, 2, 0.42) },
    { name: 'jawDefinitionPlus', delta: finalizeFacialMorphDelta(jawDefinitionPlus, 2, 0.42) },
    { name: 'jawDefinitionMinus', delta: finalizeFacialMorphDelta(jawDefinitionMinus, 2, 0.42) },
    { name: 'chinShapePlus', delta: finalizeFacialMorphDelta(chinShapePlus, 1, 0.35) },
    { name: 'chinShapeMinus', delta: finalizeFacialMorphDelta(chinShapeMinus, 1, 0.35) },
    {
      name: 'faceWidthPlus',
      delta: lockMorphEyeballsToLidRim(finalizeFacialMorphDelta(faceWidthPlus, 1, 0.35), posFlat),
    },
    {
      name: 'faceWidthMinus',
      delta: lockMorphEyeballsToLidRim(finalizeFacialMorphDelta(faceWidthMinus, 1, 0.35), posFlat),
    },
    {
      name: 'headScalePlus',
      delta: lockMorphEyeballsToLidRim(
        
          (() => {
            syncInnerMouthBag(headScalePlus)
            return headScalePlus
          })(),
        posFlat
      ),
    },
    {
      name: 'headScaleMinus',
      delta: lockMorphEyeballsToLidRim(
        (() => {
          syncInnerMouthBag(headScaleMinus)
          return headScaleMinus
        })(),
        posFlat
      ),
    },
  ]
}

function buildGLB({ outputFilename, baseWeights, isAnime = false, scaleFactor = 0.106 }) {
  const posFlat = new Float32Array(rawPositions.length * 3)
  const baseDelta = combineTargets(baseWeights, scaleFactor)

  for (let i = 0; i < rawPositions.length; i++) {
    let x = rawPositions[i][0] * scaleFactor + baseDelta[i * 3]
    let y = rawPositions[i][1] * scaleFactor + baseDelta[i * 3 + 1]
    let z = rawPositions[i][2] * scaleFactor + baseDelta[i * 3 + 2]

    if (isAnime) {
      const neckY = 5.4 * scaleFactor
      if (y > neckY) {
        const t = Math.min(1, (y - neckY) / (1.2 * scaleFactor))
        const headScale = 1 + 0.14 * t
        x *= headScale
        y = neckY + (y - neckY) * (1 + 0.11 * t)
        z *= headScale
      }
    }

    posFlat[i * 3] = x
    posFlat[i * 3 + 1] = y
    posFlat[i * 3 + 2] = z
  }

  // Lock base eyeballs to the deformed eyelid rim and enforce oral cavity wall clearance before centering!
  lockBaseEyeballsToLidRim(posFlat, scaleFactor)
  enforceBaseOralWallClearance(posFlat)

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity
  for (const face of bodyFaces) {
    for (const [vIdx] of face) {
      const x = posFlat[vIdx * 3],
        y = posFlat[vIdx * 3 + 1],
        z = posFlat[vIdx * 3 + 2]
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
  }

  const centerX = (minX + maxX) * 0.5
  const centerZ = (minZ + maxZ) * 0.5
  const offsetY = -minY

  for (let i = 0; i < rawPositions.length; i++) {
    posFlat[i * 3] -= centerX
    posFlat[i * 3 + 1] += offsetY
    posFlat[i * 3 + 2] -= centerZ
  }

  const rawNormals = computeRawSmoothNormals(posFlat, [bodyFaces, eyeFaces])

  const anatomicalJoints = SKELETON_JOINTS_DEF.map((jDef) => {
    const vSet = jointVertexGroups.get(jDef.group)
    let cx = 0,
      cy = 0,
      cz = 0
    if (vSet && vSet.size > 0) {
      for (const vi of vSet) {
        cx += posFlat[vi * 3]
        cy += posFlat[vi * 3 + 1]
        cz += posFlat[vi * 3 + 2]
      }
      cx /= vSet.size
      cy /= vSet.size
      cz /= vSet.size
    }
    return {
      id: jDef.id,
      parent: jDef.parent,
      label: jDef.label,
      position: [Number(cx.toFixed(4)), Number(cy.toFixed(4)), Number(cz.toFixed(4))],
    }
  })

  // Export all 114 MakeHuman anatomical joint landmarks (skull, jaw, spine, ribs/scapula/clavicle, arms, all finger phalanges, pelvis, legs, all toe phalanges)
  const fullSkeletonLandmarks = {}
  for (const [grpName, vSet] of jointVertexGroups.entries()) {
    if (!vSet || vSet.size === 0) continue
    let cx = 0,
      cy = 0,
      cz = 0
    for (const vi of vSet) {
      cx += posFlat[vi * 3]
      cy += posFlat[vi * 3 + 1]
      cz += posFlat[vi * 3 + 2]
    }
    cx /= vSet.size
    cy /= vSet.size
    cz /= vSet.size
    fullSkeletonLandmarks[grpName] = [
      Number(cx.toFixed(4)),
      Number(cy.toFixed(4)),
      Number(cz.toFixed(4)),
    ]
  }

  const facialMorphDefs = buildFacialMorphSuite(posFlat, scaleFactor, isAnime)

  // Anatomical adipose distribution (proportional fat for the "Plus" body morphs / Corpo Gordo)
  const adipose = buildAdiposeSystem({
    rawPositions,
    bodyVerts,
    rawNeighbors,
    normals: rawNormals,
    scaleFactor,
  })
  const fatMorph = (mhTargets, channelMix) => {
    const d = combineTargets(mhTargets, scaleFactor)
    addDelta(d, adipose.channelDelta(channelMix, posFlat))
    adipose.enforceMedialClearance(d, posFlat)
    return d
  }

  const morphDefs = [
    // --- 19 BODY MORPH TARGETS ---
    {
      name: 'shoulderWidthPlus',
      delta: combineTargets(
        [
          { target: tShoulderIncr, weight: 1.45 },
          { target: tVShapeIncr, weight: 0.45 },
        ],
        scaleFactor
      ),
    },
    {
      name: 'shoulderWidthMinus',
      delta: combineTargets(
        [
          { target: tShoulderDecr, weight: 1.45 },
          { target: tVShapeDecr, weight: 0.35 },
        ],
        scaleFactor
      ),
    },
    {
      // Flanks / love handles, waist ring, upper back, nape & neck fat (no double-counted waist)
      name: 'torsoWidthPlus',
      delta: fatMorph(
        [
          { target: tChestIncr, weight: 0.45 },
          { target: tWaistIncr, weight: 0.55 },
        ],
        { torso: 1.0 }
      ),
    },
    {
      name: 'torsoWidthMinus',
      delta: combineTargets(
        [
          { target: tChestDecr, weight: 1.35 },
          { target: tWaistDecr, weight: 1.35 },
        ],
        scaleFactor
      ),
    },
    {
      // Pectoral fat pad + axilla, without the conical female bust target
      name: 'chestVolumePlus',
      delta: fatMorph(
        [
          { target: tPectoralIncr, weight: 0.55 },
          { target: tChestIncr, weight: 0.2 },
        ],
        { chest: 1.0 }
      ),
    },
    {
      name: 'chestVolumeMinus',
      delta: combineTargets(
        [
          { target: tPectoralDecr, weight: 1.1 },
          { target: tBustDecr, weight: 1.1 },
          { target: tChestDecr, weight: 0.6 },
        ],
        scaleFactor
      ),
    },
    {
      // Soft abdominal panniculus (lower belly heavier) wrapping into the flanks, no pregnant bulb
      name: 'abdomenVolumePlus',
      delta: fatMorph(
        [
          { target: tStomachIncr, weight: 0.3 },
          { target: tStomachToneDecr, weight: 0.5 },
        ],
        { belly: 1.0 }
      ),
    },
    {
      name: 'abdomenVolumeMinus',
      delta: combineTargets(
        [
          { target: tStomachDecr, weight: 0.7 },
          { target: tStomachToneIncr, weight: 0.95 },
          { target: tWaistDecr, weight: 1.1 },
        ],
        scaleFactor
      ),
    },
    {
      // Upper arm / triceps fat with elbow and wrist taper (hands stay proportional)
      name: 'armThicknessPlus',
      delta: fatMorph([{ target: tUpperArmCircIncr, weight: 0.7 }], { arms: 1.0 }),
    },
    {
      name: 'armThicknessMinus',
      delta: combineTargets(
        [
          { target: tUpperArmCircDecr, weight: 1.65 },
          { target: tWristCircDecr, weight: 1.35 },
        ],
        scaleFactor
      ),
    },
    {
      // Calf fat with ankle taper (feet stay proportional)
      name: 'legThicknessPlus',
      delta: fatMorph(
        [
          { target: tCalfCircIncr, weight: 0.8 },
          { target: tAnkleCircIncr, weight: 0.15 },
        ],
        { calves: 1.0 }
      ),
    },
    {
      name: 'legThicknessMinus',
      delta: combineTargets(
        [
          { target: tCalfCircDecr, weight: 1.75 },
          { target: tAnkleCircDecr, weight: 1.25 },
        ],
        scaleFactor
      ),
    },
    {
      // Hips, glutes, saddlebags and thighs with knee taper + inner-thigh clearance
      name: 'thighVolumePlus',
      delta: fatMorph(
        [
          { target: tThighCircIncr, weight: 0.7 },
          { target: tHipsCircIncr, weight: 0.45 },
        ],
        { thighs: 1.0 }
      ),
    },
    {
      name: 'thighVolumeMinus',
      delta: combineTargets(
        [
          { target: tThighCircDecr, weight: 1.75 },
          { target: tHipsCircDecr, weight: 1.1 },
        ],
        scaleFactor
      ),
    },
    {
      name: 'armLengthPlus',
      delta: combineTargets(
        [
          { target: tUpperArmIncr, weight: 1.5 },
          { target: tLowerArmIncr, weight: 1.5 },
        ],
        scaleFactor
      ),
    },
    {
      name: 'armLengthMinus',
      delta: combineTargets(
        [
          { target: tUpperArmDecr, weight: 1.5 },
          { target: tLowerArmDecr, weight: 1.5 },
        ],
        scaleFactor
      ),
    },
    {
      name: 'legLengthPlus',
      delta: combineTargets(
        [
          { target: tUpperLegIncr, weight: 1.5 },
          { target: tLowerLegIncr, weight: 1.5 },
        ],
        scaleFactor
      ),
    },
    {
      name: 'legLengthMinus',
      delta: combineTargets(
        [
          { target: tUpperLegDecr, weight: 1.5 },
          { target: tLowerLegDecr, weight: 1.5 },
        ],
        scaleFactor
      ),
    },
    {
      name: 'muscleTone',
      delta: combineTargets([{ target: tMaleMaxMuscle, weight: 0.9 }], scaleFactor),
    },

    // --- 18 ANATOMICAL & EYE-SAFE FACIAL MORPH TARGETS ---
    ...facialMorphDefs,
  ]

  const lEyeBounds = getVertSetBounds(leftEyeVerts, posFlat)
  const rEyeBounds = getVertSetBounds(rightEyeVerts, posFlat)

  function compileSubmesh(faces, isEyeMesh = false) {
    const vertexMap = new Map()
    const outPositions = []
    const outNormals = []
    const outUVs = []
    const outRawIndices = []
    const indices = []

    function getVertexIndex(vIdx, vtIdx) {
      const key = `${vIdx}_${vtIdx}`
      let existing = vertexMap.get(key)
      if (existing !== undefined) return existing
      const newIdx = outRawIndices.length
      vertexMap.set(key, newIdx)
      outRawIndices.push(vIdx)
      const px = posFlat[vIdx * 3],
        py = posFlat[vIdx * 3 + 1],
        pz = posFlat[vIdx * 3 + 2]
      outPositions.push(px, py, pz)
      outNormals.push(rawNormals[vIdx * 3], rawNormals[vIdx * 3 + 1], rawNormals[vIdx * 3 + 2])
      if (isEyeMesh) {
        const b = px >= 0 ? lEyeBounds : rEyeBounds
        const u = 0.5 + ((px - b.bx) / b.rx) * 0.48
        const v = 0.5 + ((py - b.by) / b.ry) * 0.48
        outUVs.push(u, v)
      } else {
        const uv = rawUVs[vtIdx] || [0, 0]
        outUVs.push(uv[0], uv[1])
      }
      return newIdx
    }

    for (const face of faces) {
      if (face.length === 4) {
        const i0 = getVertexIndex(face[0][0], face[0][1])
        const i1 = getVertexIndex(face[1][0], face[1][1])
        const i2 = getVertexIndex(face[2][0], face[2][1])
        const i3 = getVertexIndex(face[3][0], face[3][1])
        indices.push(i0, i1, i2, i0, i2, i3)
      } else if (face.length === 3) {
        const i0 = getVertexIndex(face[0][0], face[0][1])
        const i1 = getVertexIndex(face[1][0], face[1][1])
        const i2 = getVertexIndex(face[2][0], face[2][1])
        indices.push(i0, i1, i2)
      }
    }

    const morphTargets = morphDefs.map((m) => {
      const arr = new Float32Array(outRawIndices.length * 3)
      for (let i = 0; i < outRawIndices.length; i++) {
        const rIdx = outRawIndices[i]
        arr[i * 3] = m.delta[rIdx * 3]
        arr[i * 3 + 1] = m.delta[rIdx * 3 + 1]
        arr[i * 3 + 2] = m.delta[rIdx * 3 + 2]
      }
      return { name: m.name, data: arr }
    })

    return {
      positions: new Float32Array(outPositions),
      normals: new Float32Array(outNormals),
      uvs: new Float32Array(outUVs),
      indices: new Uint32Array(indices),
      morphTargets,
    }
  }

  const bodyMesh = compileSubmesh(bodyFaces, false)
  const eyeMesh = compileSubmesh(eyeFaces, true)

  const bufferChunks = []
  const bufferViews = []
  const accessors = []
  let byteOffset = 0

  function appendBuffer(typedArray, target) {
    const buf = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength)
    const pad = (4 - (buf.length % 4)) % 4
    const viewIndex = bufferViews.length
    bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: buf.length,
      ...(target ? { target } : {}),
    })
    bufferChunks.push(buf)
    if (pad > 0) bufferChunks.push(Buffer.alloc(pad))
    byteOffset += buf.length + pad
    return viewIndex
  }

  function addVec3Accessor(float32Array, target = 34962) {
    let min = [Infinity, Infinity, Infinity]
    let max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < float32Array.length; i += 3) {
      const x = float32Array[i],
        y = float32Array[i + 1],
        z = float32Array[i + 2]
      if (x < min[0]) min[0] = x
      if (y < min[1]) min[1] = y
      if (z < min[2]) min[2] = z
      if (x > max[0]) max[0] = x
      if (y > max[1]) max[1] = y
      if (z > max[2]) max[2] = z
    }
    const bv = appendBuffer(float32Array, target)
    const accIdx = accessors.length
    accessors.push({
      bufferView: bv,
      byteOffset: 0,
      componentType: 5126,
      count: float32Array.length / 3,
      type: 'VEC3',
      min,
      max,
    })
    return accIdx
  }

  function addVec2Accessor(float32Array) {
    const bv = appendBuffer(float32Array, 34962)
    const accIdx = accessors.length
    accessors.push({
      bufferView: bv,
      byteOffset: 0,
      componentType: 5126,
      count: float32Array.length / 2,
      type: 'VEC2',
    })
    return accIdx
  }

  function addIndexAccessor(uint32Array) {
    const bv = appendBuffer(uint32Array, 34963)
    const accIdx = accessors.length
    accessors.push({
      bufferView: bv,
      byteOffset: 0,
      componentType: 5125,
      count: uint32Array.length,
      type: 'SCALAR',
    })
    return accIdx
  }

  function buildPrimitive(compiled, materialIndex) {
    const posAcc = addVec3Accessor(compiled.positions)
    const normAcc = addVec3Accessor(compiled.normals)
    const uvAcc = addVec2Accessor(compiled.uvs)
    const idxAcc = addIndexAccessor(compiled.indices)
    const targets = compiled.morphTargets.map((m) => ({
      POSITION: addVec3Accessor(m.data, 34962),
    }))
    return {
      attributes: {
        POSITION: posAcc,
        NORMAL: normAcc,
        TEXCOORD_0: uvAcc,
      },
      indices: idxAcc,
      material: materialIndex,
      mode: 4,
      targets,
    }
  }

  const bodyPrim = buildPrimitive(bodyMesh, 0)
  const eyePrim = buildPrimitive(eyeMesh, 1)
  const targetNames = morphDefs.map((m) => m.name)

  const eyeCenters = {
    left: [
      Number(lEyeBounds.bx.toFixed(4)),
      Number(lEyeBounds.by.toFixed(4)),
      Number(lEyeBounds.bz.toFixed(4)),
    ],
    right: [
      Number(rEyeBounds.bx.toFixed(4)),
      Number(rEyeBounds.by.toFixed(4)),
      Number(rEyeBounds.bz.toFixed(4)),
    ],
  }

  const gltfJson = {
    asset: {
      version: '2.0',
      generator: 'Character Forge Anatomical Builder v2 (MakeHuman CC0 hm08)',
      copyright: 'CC0 1.0 Universal (Public Domain) - MakeHuman Community Base Mesh',
    },
    scene: 0,
    scenes: [
      {
        name: 'CharacterScene',
        nodes: [0],
        extras: {
          anatomicalJoints,
          fullSkeletonLandmarks,
          eyeCenters,
        },
      },
    ],
    nodes: [
      {
        name: 'CharacterRoot',
        children: [1, 2],
        extras: {
          anatomicalJoints,
          fullSkeletonLandmarks,
          eyeCenters,
        },
      },
      {
        name: 'HumanBody',
        mesh: 0,
      },
      {
        name: 'HumanEyes',
        mesh: 1,
      },
    ],
    materials: [
      {
        name: 'SkinMaterial',
        pbrMetallicRoughness: {
          baseColorFactor: isAnime ? [0.95, 0.82, 0.74, 1.0] : [0.82, 0.65, 0.54, 1.0],
          metallicFactor: 0.02,
          roughnessFactor: isAnime ? 0.65 : 0.42,
        },
        doubleSided: true,
      },
      {
        name: 'EyeMaterial',
        pbrMetallicRoughness: {
          baseColorFactor: [0.98, 0.98, 1.0, 1.0],
          metallicFactor: 0.0,
          roughnessFactor: 0.05,
        },
        doubleSided: true,
      },
    ],
    meshes: [
      {
        name: 'HumanBodyMesh',
        primitives: [bodyPrim],
        weights: new Array(targetNames.length).fill(0),
        extras: { targetNames, anatomicalJoints, fullSkeletonLandmarks, eyeCenters },
      },
      {
        name: 'HumanEyesMesh',
        primitives: [eyePrim],
        weights: new Array(targetNames.length).fill(0),
        extras: { targetNames },
      },
    ],
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
  }

  const jsonBuffer = Buffer.from(JSON.stringify(gltfJson), 'utf8')
  const jsonPad = (4 - (jsonBuffer.length % 4)) % 4
  const jsonChunkLen = jsonBuffer.length + jsonPad
  const binBuffer = Buffer.concat(bufferChunks)
  const totalLength = 12 + 8 + jsonChunkLen + 8 + binBuffer.length

  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(totalLength, 8)

  const jsonHeader = Buffer.alloc(8)
  jsonHeader.writeUInt32LE(jsonChunkLen, 0)
  jsonHeader.writeUInt32LE(0x4e4f534a, 4)

  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(binBuffer.length, 0)
  binHeader.writeUInt32LE(0x004e4942, 4)

  const glbBuffer = Buffer.concat([
    header,
    jsonHeader,
    jsonBuffer,
    Buffer.alloc(jsonPad, 0x20),
    binHeader,
    binBuffer,
  ])

  const outPath = path.join(outDir, outputFilename)
  fs.writeFileSync(outPath, glbBuffer)
  console.log(
    `[build_models] Wrote ${outputFilename} (${(glbBuffer.length / 1024 / 1024).toFixed(
      2
    )} MB) — MorphTargets: ${targetNames.length} | AnatomicalJoints: ${
      anatomicalJoints.length
    }`
  )
}

buildGLB({
  outputFilename: 'personagem_humano_realista.glb',
  baseWeights: [
    { target: tMaleYoung, weight: 0.62 },
    { target: tFemaleYoung, weight: 0.38 },
    { target: tMaleMaxMuscle, weight: 0.32 },
  ],
  isAnime: false,
  scaleFactor: 0.106,
})

// For Anime base weights, protect orbital rim on head-oval & head-invertedtriangular so eyelids stay clean
const tHeadInvTriEyeSafe = new Map()
for (const [v, d] of tHeadInvTri.entries()) {
  const p = orbitalProtect[v] ?? 1
  tHeadInvTriEyeSafe.set(v, [d[0] * p, d[1] * p, d[2] * p])
}
const tHeadOvalEyeSafe = new Map()
for (const [v, d] of tHeadOval.entries()) {
  const p = orbitalProtect[v] ?? 1
  tHeadOvalEyeSafe.set(v, [d[0] * p, d[1] * p, d[2] * p])
}

buildGLB({
  outputFilename: 'personagem_humano_anime.glb',
  baseWeights: [
    { target: tAsianFemaleYoung, weight: 0.78 },
    { target: tFemaleMinWeight, weight: 0.35 },
    { target: tHeadInvTriEyeSafe, weight: 0.58 },
    { target: tHeadOvalEyeSafe, weight: 0.38 },
    { target: tHeadScaleHorizIncr, weight: 0.45 },
    { target: tHeadScaleVertIncr, weight: 0.35 },
    { target: tChinTri, weight: 0.85 },
    { target: tChinWidthDecr, weight: 0.8 },
    { target: tChinHeightDecr, weight: 0.5 },
    { target: tNoseWidthDecr, weight: 0.85 },
    { target: tNoseFlareDecr, weight: 0.75 },
    { target: tLEyeScaleIncr, weight: 1.45 },
    { target: tREyeScaleIncr, weight: 1.45 },
    { target: tLEyeH1Incr, weight: 1.25 },
    { target: tREyeH1Incr, weight: 1.25 },
    { target: tLEyeH2Incr, weight: 1.15 },
    { target: tREyeH2Incr, weight: 1.15 },
  ],
  isAnime: true,
  scaleFactor: 0.102,
})
