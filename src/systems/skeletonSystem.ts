import * as THREE from 'three'

export interface AnatomicalJoint {
  id: string
  parent: string | null
  label: string
  position: [number, number, number]
}

export interface JointPoseState {
  showSkeleton: boolean
  headYaw: number // -45 to +45 deg (turn head left/right)
  headPitch: number // -30 to +30 deg (nod head up/down)
  leftShoulderPitch: number // -45 to +60 deg (lower/raise left arm)
  leftElbowFlex: number // 0 to 85 deg (bend left elbow forward)
  rightShoulderPitch: number // -45 to +60 deg (lower/raise right arm)
  rightElbowFlex: number // 0 to 85 deg (bend right elbow forward)
}

export const DEFAULT_JOINT_POSE: JointPoseState = {
  showSkeleton: false,
  headYaw: 0,
  headPitch: 0,
  leftShoulderPitch: 0,
  leftElbowFlex: 0,
  rightShoulderPitch: 0,
  rightElbowFlex: 0,
}

export function isPoseNeutral(pose: JointPoseState): boolean {
  return (
    Math.abs(pose.headYaw) < 0.1 &&
    Math.abs(pose.headPitch) < 0.1 &&
    Math.abs(pose.leftShoulderPitch) < 0.1 &&
    Math.abs(pose.leftElbowFlex) < 0.1 &&
    Math.abs(pose.rightShoulderPitch) < 0.1 &&
    Math.abs(pose.rightElbowFlex) < 0.1
  )
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function rotatePointAroundPivot(
  px: number,
  py: number,
  pz: number,
  pivot: [number, number, number],
  quat: THREE.Quaternion,
  weight: number,
  outVec: THREE.Vector3
) {
  if (weight <= 0.0001) {
    outVec.set(px, py, pz)
    return
  }
  const dx = px - pivot[0]
  const dy = py - pivot[1]
  const dz = pz - pivot[2]
  outVec.set(dx, dy, dz).applyQuaternion(quat)
  const rx = pivot[0] + outVec.x
  const ry = pivot[1] + outVec.y
  const rz = pivot[2] + outVec.z
  outVec.set(
    px + (rx - px) * weight,
    py + (ry - py) * weight,
    pz + (rz - pz) * weight
  )
}

/**
 * Applies smooth hierarchical joint articulation (Head/Neck, Shoulders, Elbows)
 * on top of rest positions + manual sculpting offsets so sculpting, Shape Keys, and joint posing coexist seamlessly.
 */
export function applyJointArticulationToPositionPoint(
  x: number,
  y: number,
  z: number,
  jointsMap: Map<string, [number, number, number]>,
  pose: JointPoseState,
  tempVec: THREE.Vector3,
  headQuat: THREE.Quaternion,
  lShoulderQuat: THREE.Quaternion,
  lElbowQuat: THREE.Quaternion,
  rShoulderQuat: THREE.Quaternion,
  rElbowQuat: THREE.Quaternion
): [number, number, number] {
  let cx = x
  let cy = y
  let cz = z

  // 1. Head & Neck articulation
  const neckPivot = jointsMap.get('neck')
  if (neckPivot && (Math.abs(pose.headYaw) > 0.1 || Math.abs(pose.headPitch) > 0.1)) {
    const wHead = smoothstep(neckPivot[1] - 0.03, neckPivot[1] + 0.07, cy)
    if (wHead > 0) {
      rotatePointAroundPivot(cx, cy, cz, neckPivot, headQuat, wHead, tempVec)
      cx = tempVec.x
      cy = tempVec.y
      cz = tempVec.z
    }
  }

  // 2. Left Arm articulation (+X side, anatomical left arm in MakeHuman A-pose)
  const lShoulder = jointsMap.get('shoulder_l')
  const lElbow = jointsMap.get('elbow_l')
  if (lShoulder && lElbow && cx > lShoulder[0] - 0.04 && cy > 0.92 && cy < 1.56) {
    // Project vertex along upper-arm axis (shoulder -> elbow) to get clean bone weight
    const abx = lElbow[0] - lShoulder[0]
    const aby = lElbow[1] - lShoulder[1]
    const abLenSq = abx * abx + aby * aby || 1
    const proj = ((cx - lShoulder[0]) * abx + (cy - lShoulder[1]) * aby) / abLenSq

    if (proj > -0.15) {
      // Forearm bend around elbow first (in rest space before shoulder rotation)
      if (Math.abs(pose.leftElbowFlex) > 0.1 && proj > 0.75) {
        const wElbow = smoothstep(0.82, 1.18, proj)
        rotatePointAroundPivot(cx, cy, cz, lElbow, lElbowQuat, wElbow, tempVec)
        cx = tempVec.x
        cy = tempVec.y
        cz = tempVec.z
      }
      // Whole left arm rotation around shoulder pivot
      if (Math.abs(pose.leftShoulderPitch) > 0.1) {
        const wShoulder = smoothstep(-0.1, 0.32, proj)
        rotatePointAroundPivot(cx, cy, cz, lShoulder, lShoulderQuat, wShoulder, tempVec)
        cx = tempVec.x
        cy = tempVec.y
        cz = tempVec.z
      }
    }
  }

  // 3. Right Arm articulation (-X side, anatomical right arm)
  const rShoulder = jointsMap.get('shoulder_r')
  const rElbow = jointsMap.get('elbow_r')
  if (rShoulder && rElbow && cx < rShoulder[0] + 0.04 && cy > 0.92 && cy < 1.56) {
    const abx = rElbow[0] - rShoulder[0]
    const aby = rElbow[1] - rShoulder[1]
    const abLenSq = abx * abx + aby * aby || 1
    const proj = ((cx - rShoulder[0]) * abx + (cy - rShoulder[1]) * aby) / abLenSq

    if (proj > -0.15) {
      if (Math.abs(pose.rightElbowFlex) > 0.1 && proj > 0.75) {
        const wElbow = smoothstep(0.82, 1.18, proj)
        rotatePointAroundPivot(cx, cy, cz, rElbow, rElbowQuat, wElbow, tempVec)
        cx = tempVec.x
        cy = tempVec.y
        cz = tempVec.z
      }
      if (Math.abs(pose.rightShoulderPitch) > 0.1) {
        const wShoulder = smoothstep(-0.1, 0.32, proj)
        rotatePointAroundPivot(cx, cy, cz, rShoulder, rShoulderQuat, wShoulder, tempVec)
        cx = tempVec.x
        cy = tempVec.y
        cz = tempVec.z
      }
    }
  }

  return [cx, cy, cz]
}

/**
 * Computes articulated 3D joint positions for rendering the interactive 3D skeleton overlay
 */
export function computeArticulatedJointPositions(
  joints: AnatomicalJoint[],
  pose: JointPoseState,
  heightScale: number
): AnatomicalJoint[] {
  const jointsMap = new Map<string, [number, number, number]>()
  for (const j of joints) {
    jointsMap.set(j.id, [
      j.position[0] * heightScale,
      j.position[1] * heightScale,
      j.position[2] * heightScale,
    ])
  }

  const headQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(pose.headPitch),
      THREE.MathUtils.degToRad(pose.headYaw),
      0,
      'YXZ'
    )
  )
  const lShoulderQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, 0, THREE.MathUtils.degToRad(pose.leftShoulderPitch))
  )
  const lElbowQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(-pose.leftElbowFlex * 0.65),
      THREE.MathUtils.degToRad(pose.leftElbowFlex * 0.75),
      0
    )
  )
  const rShoulderQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, 0, THREE.MathUtils.degToRad(-pose.rightShoulderPitch))
  )
  const rElbowQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(-pose.rightElbowFlex * 0.65),
      THREE.MathUtils.degToRad(-pose.rightElbowFlex * 0.75),
      0
    )
  )

  const tempVec = new THREE.Vector3()
  const scaledJointsMap = new Map<string, [number, number, number]>()
  for (const j of joints) {
    scaledJointsMap.set(j.id, [...j.position])
  }

  return joints.map((j) => {
    const [ax, ay, az] = applyJointArticulationToPositionPoint(
      j.position[0],
      j.position[1],
      j.position[2],
      scaledJointsMap,
      pose,
      tempVec,
      headQuat,
      lShoulderQuat,
      lElbowQuat,
      rShoulderQuat,
      rElbowQuat
    )
    return {
      ...j,
      position: [ax * heightScale, ay * heightScale, az * heightScale],
    }
  })
}
