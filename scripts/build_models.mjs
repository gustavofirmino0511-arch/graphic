import fs from 'node:fs'
import path from 'node:path'

const tempDir = process.env.TEMP || 'C:/Users/gusta/AppData/Local/Temp'
const objPath = path.join(tempDir, 'mh_base.obj')
const targetsDir = path.join(tempDir, 'mh_targets')
const outDir = path.resolve('public/models')

fs.mkdirSync(outDir, { recursive: true })

console.log('[build_models] Reading MakeHuman CC0 base mesh...')
const objText = fs.readFileSync(objPath, 'utf8')
const lines = objText.split('\n')

const rawPositions = [] // [x, y, z]
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
        delta[base + 1] += dy * weight * weightYScale(weight) * scaleFactor
        delta[base + 2] += dz * weight * scaleFactor
      }
    }
  }
  return delta
}

function weightYScale(_w) {
  return 1.0
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

// Facial Targets (Cheeks, Cheekbones, Jaw, Chin, Face Width, Head Scale)
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

  // Extract anatomical joint positions in final aligned meter space
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

  // Eye vertex sets for planar UV mapping and rigid eye-socket tracking
  const leftEyeVerts = new Set()
  const rightEyeVerts = new Set()
  for (const face of eyeFaces) {
    for (const [vIdx] of face) {
      if (posFlat[vIdx * 3] >= 0) leftEyeVerts.add(vIdx)
      else rightEyeVerts.add(vIdx)
    }
  }

  // Zero out any accidental eye vertex offsets in facial morph targets that shouldn't deform eyeballs
  function zeroEyeOffsets(deltaArray) {
    for (const vIdx of leftEyeVerts) {
      deltaArray[vIdx * 3] = 0
      deltaArray[vIdx * 3 + 1] = 0
      deltaArray[vIdx * 3 + 2] = 0
    }
    for (const vIdx of rightEyeVerts) {
      deltaArray[vIdx * 3] = 0
      deltaArray[vIdx * 3 + 1] = 0
      deltaArray[vIdx * 3 + 2] = 0
    }
    return deltaArray
  }

  // Rigidly translate eye vertices by the average translation of each eye center so eyeballs never distort or pop out
  function rigidifyEyeOffsets(deltaArray) {
    for (const eyeSet of [leftEyeVerts, rightEyeVerts]) {
      let dx = 0,
        dy = 0,
        dz = 0
      for (const vIdx of eyeSet) {
        dx += deltaArray[vIdx * 3]
        dy += deltaArray[vIdx * 3 + 1]
        dz += deltaArray[vIdx * 3 + 2]
      }
      const n = eyeSet.size || 1
      dx /= n
      dy /= n
      dz /= n
      for (const vIdx of eyeSet) {
        deltaArray[vIdx * 3] = dx
        deltaArray[vIdx * 3 + 1] = dy
        deltaArray[vIdx * 3 + 2] = dz
      }
    }
    return deltaArray
  }

  const morphDefs = [
    // --- BODY MORPH TARGETS ---
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
      name: 'torsoWidthPlus',
      delta: combineTargets(
        [
          { target: tChestIncr, weight: 1.35 },
          { target: tWaistIncr, weight: 1.35 },
        ],
        scaleFactor
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
      name: 'chestVolumePlus',
      delta: combineTargets(
        [
          { target: tPectoralIncr, weight: 1.35 },
          { target: tBustIncr, weight: 1.1 },
          { target: tChestIncr, weight: 0.6 },
        ],
        scaleFactor
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
      name: 'abdomenVolumePlus',
      delta: combineTargets(
        [
          { target: tStomachIncr, weight: 0.95 },
          { target: tStomachToneDecr, weight: 0.7 },
          { target: tWaistIncr, weight: 0.9 },
        ],
        scaleFactor
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
      name: 'armThicknessPlus',
      delta: combineTargets(
        [
          { target: tUpperArmCircIncr, weight: 1.65 },
          { target: tWristCircIncr, weight: 1.35 },
        ],
        scaleFactor
      ),
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
      name: 'legThicknessPlus',
      delta: combineTargets(
        [
          { target: tCalfCircIncr, weight: 1.75 },
          { target: tAnkleCircIncr, weight: 1.25 },
        ],
        scaleFactor
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
      name: 'thighVolumePlus',
      delta: combineTargets(
        [
          { target: tThighCircIncr, weight: 1.75 },
          { target: tHipsCircIncr, weight: 1.1 },
        ],
        scaleFactor
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

    // --- FACIAL PROPORTION MORPH TARGETS (Item 3 — Eye-Safe!) ---
    {
      name: 'cheekVolumePlus',
      delta: zeroEyeOffsets(
        combineTargets(
          [
            { target: tLCheekVolIncr, weight: 1.5 },
            { target: tRCheekVolIncr, weight: 1.5 },
            { target: tLCheekInnerIncr, weight: 1.1 },
            { target: tRCheekInnerIncr, weight: 1.1 },
          ],
          scaleFactor
        )
      ),
    },
    {
      name: 'cheekVolumeMinus',
      delta: zeroEyeOffsets(
        combineTargets(
          [
            { target: tLCheekVolDecr, weight: 1.5 },
            { target: tRCheekVolDecr, weight: 1.5 },
            { target: tLCheekInnerDecr, weight: 1.1 },
            { target: tRCheekInnerDecr, weight: 1.1 },
          ],
          scaleFactor
        )
      ),
    },
    {
      name: 'cheekbonesPlus',
      delta: zeroEyeOffsets(
        combineTargets(
          [
            { target: tLCheekBonesIncr, weight: 1.5 },
            { target: tRCheekBonesIncr, weight: 1.5 },
          ],
          scaleFactor
        )
      ),
    },
    {
      name: 'cheekbonesMinus',
      delta: zeroEyeOffsets(
        combineTargets(
          [
            { target: tLCheekBonesDecr, weight: 1.5 },
            { target: tRCheekBonesDecr, weight: 1.5 },
          ],
          scaleFactor
        )
      ),
    },
    {
      name: 'jawWidthPlus',
      delta: zeroEyeOffsets(
        combineTargets(
          [
            { target: tChinWidthIncr, weight: 1.45 },
            { target: tChinBonesIncr, weight: 1.15 },
            { target: tHeadFatIncr, weight: 0.55 },
          ],
          scaleFactor
        )
      ),
    },
    {
      name: 'jawWidthMinus',
      delta: zeroEyeOffsets(
        combineTargets(
          [
            { target: tChinWidthDecr, weight: 1.45 },
            { target: tChinBonesDecr, weight: 1.15 },
            { target: tHeadFatDecr, weight: 0.45 },
          ],
          scaleFactor
        )
      ),
    },
    {
      name: 'chinShapePlus',
      delta: zeroEyeOffsets(
        combineTargets(
          [
            { target: tChinProminentIncr, weight: 1.35 },
            { target: tChinHeightIncr, weight: 0.9 },
          ],
          scaleFactor
        )
      ),
    },
    {
      name: 'chinShapeMinus',
      delta: zeroEyeOffsets(
        combineTargets(
          [
            { target: tChinProminentDecr, weight: 1.2 },
            { target: tChinHeightDecr, weight: 0.95 },
            { target: tChinTri, weight: 0.7 },
          ],
          scaleFactor
        )
      ),
    },
    {
      name: 'faceWidthPlus',
      delta: rigidifyEyeOffsets(
        combineTargets(
          [
            { target: tHeadScaleHorizIncr, weight: 1.15 },
            { target: tHeadOval, weight: 0.35 },
          ],
          scaleFactor
        )
      ),
    },
    {
      name: 'faceWidthMinus',
      delta: rigidifyEyeOffsets(
        combineTargets(
          [
            { target: tHeadScaleHorizDecr, weight: 1.15 },
            { target: tHeadInvTri, weight: 0.45 },
          ],
          scaleFactor
        )
      ),
    },
    {
      name: 'headScalePlus',
      delta: rigidifyEyeOffsets(
        combineTargets(
          [
            { target: tHeadScaleHorizIncr, weight: 0.9 },
            { target: tHeadScaleVertIncr, weight: 0.9 },
          ],
          scaleFactor
        )
      ),
    },
    {
      name: 'headScaleMinus',
      delta: rigidifyEyeOffsets(
        combineTargets(
          [
            { target: tHeadScaleHorizDecr, weight: 0.9 },
            { target: tHeadScaleVertDecr, weight: 0.9 },
          ],
          scaleFactor
        )
      ),
    },
  ]

  function getEyeBounds(vertSet) {
    let exMin = Infinity,
      exMax = -Infinity,
      eyMin = Infinity,
      eyMax = -Infinity,
      ezMin = Infinity,
      ezMax = -Infinity
    for (const vIdx of vertSet) {
      const x = posFlat[vIdx * 3],
        y = posFlat[vIdx * 3 + 1],
        z = posFlat[vIdx * 3 + 2]
      if (x < exMin) exMin = x
      if (x > exMax) exMax = x
      if (y < eyMin) eyMin = y
      if (y > eyMax) eyMax = y
      if (z < ezMin) ezMin = z
      if (z > ezMax) ezMax = z
    }
    return {
      cx: (exMin + exMax) * 0.5,
      cy: (eyMin + eyMax) * 0.5,
      cz: (ezMin + ezMax) * 0.5,
      rx: Math.max(0.001, (exMax - exMin) * 0.5),
      ry: Math.max(0.001, (eyMax - eyMin) * 0.5),
    }
  }
  const lEyeBounds = getEyeBounds(leftEyeVerts)
  const rEyeBounds = getEyeBounds(rightEyeVerts)

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
        const u = 0.5 + ((px - b.cx) / b.rx) * 0.48
        const v = 0.5 + ((py - b.cy) / b.ry) * 0.48
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
      Number(lEyeBounds.cx.toFixed(4)),
      Number(lEyeBounds.cy.toFixed(4)),
      Number(lEyeBounds.cz.toFixed(4)),
    ],
    right: [
      Number(rEyeBounds.cx.toFixed(4)),
      Number(rEyeBounds.cy.toFixed(4)),
      Number(rEyeBounds.cz.toFixed(4)),
    ],
  }

  const gltfJson = {
    asset: {
      version: '2.0',
      generator: 'Character Forge Anatomical Builder (MakeHuman CC0 hm08)',
      copyright: 'CC0 1.0 Universal (Public Domain) - MakeHuman Community Base Mesh',
    },
    scene: 0,
    scenes: [
      {
        name: 'CharacterScene',
        nodes: [0],
        extras: {
          anatomicalJoints,
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
        extras: { targetNames, anatomicalJoints, eyeCenters },
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

buildGLB({
  outputFilename: 'personagem_humano_anime.glb',
  baseWeights: [
    { target: tAsianFemaleYoung, weight: 0.75 },
    { target: tFemaleMinWeight, weight: 0.35 },
    { target: tHeadInvTri, weight: 0.65 },
    { target: tHeadOval, weight: 0.45 },
    { target: tHeadScaleHorizIncr, weight: 0.5 },
    { target: tHeadScaleVertIncr, weight: 0.4 },
    { target: tChinTri, weight: 0.9 },
    { target: tChinWidthDecr, weight: 0.85 },
    { target: tChinHeightDecr, weight: 0.55 },
    { target: tNoseWidthDecr, weight: 0.85 },
    { target: tNoseFlareDecr, weight: 0.75 },
    { target: tLEyeScaleIncr, weight: 2.2 },
    { target: tREyeScaleIncr, weight: 2.2 },
    { target: tLEyeH1Incr, weight: 1.8 },
    { target: tREyeH1Incr, weight: 1.8 },
    { target: tLEyeH2Incr, weight: 1.6 },
    { target: tREyeH2Incr, weight: 1.6 },
  ],
  isAnime: true,
  scaleFactor: 0.102,
})
