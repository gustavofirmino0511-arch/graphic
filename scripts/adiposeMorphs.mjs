// Procedural anatomical adipose (subcutaneous fat) distribution for the Character Forge body morphs.
//
// Why this exists:
//   The original "Plus" body morphs were built by stacking MakeHuman measurement targets
//   (bust circ., pregnant stomach, waist circ. twice, wrist circ. at ~80% of the upper arm, ankle circ.
//   at ~70% of the calf...). Stacked together by the "Corpo Gordo" preset they produced a conical bust,
//   a pregnant-like belly bulb, sausage forearms, balloon ankles and colliding inner thighs.
//
//   Here every vertex of the body receives a smooth, anatomically weighted fat thickness per channel
//   (torso/flanks, chest, belly, arms, thighs/hips, calves), which is then displaced along the welded
//   vertex normal. Fat tapers to almost zero at wrists, hands, ankles and feet, the joints (elbow, knee)
//   stay slimmer than the bellies of the limbs, and medial thigh growth is clamped so both legs never
//   intersect across X = 0.
//
// All landmark coordinates are MakeHuman canonical decimeters (left side, mirrored via |x|).

const LM = {
  pelvis: [0, 0.727, 0.144],
  neck: [0, 5.89, 0.068],
  shoulder: [1.677, 5.246, 0.146],
  elbow: [3.129, 3.493, 0.132],
  wrist: [4.312, 2.452, 1.757],
  handTip: [4.784, 1.303, 3.015],
  hip: [1.104, 0.486, 0.123],
  knee: [1.581, -3.695, 0.32],
  ankle: [2.196, -7.448, -0.009],
  toe: [2.31, -8.0, 1.82],
}

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

function gauss(x, mu, sigma) {
  const d = (x - mu) / sigma
  return Math.exp(-0.5 * d * d)
}

function segment(p, a, b) {
  const abx = b[0] - a[0],
    aby = b[1] - a[1],
    abz = b[2] - a[2]
  const apx = p[0] - a[0],
    apy = p[1] - a[1],
    apz = p[2] - a[2]
  const len2 = abx * abx + aby * aby + abz * abz
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / len2))
  const dx = apx - abx * t,
    dy = apy - aby * t,
    dz = apz - abz * t
  return { d: Math.hypot(dx, dy, dz), t }
}

function laplacianSmoothScalar(values, verts, neighbors, iterations, lambda = 0.6) {
  const tmp = new Float32Array(values.length)
  for (let it = 0; it < iterations; it++) {
    tmp.set(values)
    for (const v of verts) {
      const nb = neighbors[v]
      if (!nb || nb.length === 0) continue
      let sum = 0
      let n = 0
      for (const u of nb) {
        sum += tmp[u]
        n++
      }
      values[v] = tmp[v] + (sum / n - tmp[v]) * lambda
    }
  }
}

function laplacianSmoothVec3(delta, verts, neighbors, iterations, lambda = 0.5) {
  const tmp = new Float32Array(delta.length)
  for (let it = 0; it < iterations; it++) {
    tmp.set(delta)
    for (const v of verts) {
      const nb = neighbors[v]
      if (!nb || nb.length === 0) continue
      let sx = 0,
        sy = 0,
        sz = 0
      for (const u of nb) {
        sx += tmp[u * 3]
        sy += tmp[u * 3 + 1]
        sz += tmp[u * 3 + 2]
      }
      const n = nb.length
      delta[v * 3] = tmp[v * 3] + (sx / n - tmp[v * 3]) * lambda
      delta[v * 3 + 1] = tmp[v * 3 + 1] + (sy / n - tmp[v * 3 + 1]) * lambda
      delta[v * 3 + 2] = tmp[v * 3 + 2] + (sz / n - tmp[v * 3 + 2]) * lambda
    }
  }
}

/**
 * Builds the per-vertex adipose channels and returns helper functions to produce
 * proportional fat morph deltas (scaled scene units).
 */
export function buildAdiposeSystem({ rawPositions, bodyVerts, rawNeighbors, normals, scaleFactor }) {
  const n = rawPositions.length
  // Soft body-part membership: arm, leg, torso, head
  const wArm = new Float32Array(n)
  const wLeg = new Float32Array(n)
  const wTorso = new Float32Array(n)
  const tUpperArm = new Float32Array(n).fill(-1)
  const tForearm = new Float32Array(n).fill(-1)
  const tThigh = new Float32Array(n).fill(-1)
  const tShin = new Float32Array(n).fill(-1)
  const armSeg = new Uint8Array(n) // 1 upper arm, 2 forearm, 3 hand
  const legSeg = new Uint8Array(n) // 1 thigh, 2 shin, 3 foot

  for (const v of bodyVerts) {
    const [x, y, z] = rawPositions[v]
    const p = [Math.abs(x), y, z]

    const ua = segment(p, LM.shoulder, LM.elbow)
    const fa = segment(p, LM.elbow, LM.wrist)
    const hd = segment(p, LM.wrist, LM.handTip)
    const th = segment(p, LM.hip, LM.knee)
    const sh = segment(p, LM.knee, LM.ankle)
    const ft = segment(p, LM.ankle, LM.toe)

    let dArm = ua.d
    armSeg[v] = 1
    if (fa.d < dArm) {
      dArm = fa.d
      armSeg[v] = 2
    }
    if (hd.d < dArm) {
      dArm = hd.d
      armSeg[v] = 3
    }
    let dLeg = th.d
    legSeg[v] = 1
    if (sh.d < dLeg) {
      dLeg = sh.d
      legSeg[v] = 2
    }
    if (ft.d < dLeg) {
      dLeg = ft.d
      legSeg[v] = 3
    }
    tUpperArm[v] = ua.t
    tForearm[v] = fa.t
    tThigh[v] = th.t
    tShin[v] = sh.t

    // Torso: elliptical distance to the trunk axis (pelvis -> neck)
    const tc = segment([p[0] * 0.62, y, (z - 0.2) * 0.9], [0, -0.1, 0], [0, 5.7, 0])
    const sArm = dArm / 0.5
    const sLeg = dLeg / 0.85
    const sTorso = tc.d / 0.95 + (y > 5.95 ? 4 : 0) + (y < -0.6 ? 4 : 0)

    // Soft-min membership
    const k = 7
    const eA = Math.exp(-k * sArm)
    const eL = Math.exp(-k * sLeg)
    const eT = Math.exp(-k * sTorso)
    const sum = eA + eL + eT + 1e-12
    wArm[v] = eA / sum
    wLeg[v] = eL / sum
    wTorso[v] = eT / sum
    if (y > 6.05) {
      // Head: no body fat (face fat is handled by the facial morph suite)
      wArm[v] = 0
      wLeg[v] = 0
      wTorso[v] = 0
    }
  }

  laplacianSmoothScalar(wArm, bodyVerts, rawNeighbors, 6)
  laplacianSmoothScalar(wLeg, bodyVerts, rawNeighbors, 6)
  laplacianSmoothScalar(wTorso, bodyVerts, rawNeighbors, 6)

  // Per-channel fat thickness in raw decimeters (at morph weight 1.0)
  const ch = {
    torso: new Float32Array(n),
    chest: new Float32Array(n),
    belly: new Float32Array(n),
    arms: new Float32Array(n),
    thighs: new Float32Array(n),
    calves: new Float32Array(n),
  }

  for (const v of bodyVerts) {
    const [x, y, z] = rawPositions[v]
    const ax = Math.abs(x)
    const nx = normals[v * 3] * (Math.sign(x) || 1) // + = lateral, - = medial
    const nz = normals[v * 3 + 2]
    const front = smoothstep(-0.15, 0.75, nz)
    const back = smoothstep(-0.15, 0.75, -nz)
    const side = smoothstep(0.25, 0.9, Math.abs(nx))

    // ---------- TORSO (neck, flanks/love handles, upper back) ----------
    const wt = wTorso[v]
    if (wt > 0.001) {
      const flank = 0.3 * gauss(y, 1.55, 0.7) * (0.35 + 0.65 * side)
      const waistRing = 0.12 * gauss(y, 2.0, 1.1)
      const upperBack = 0.15 * gauss(y, 4.0, 0.75) * back
      const nape = 0.08 * gauss(y, 5.4, 0.35) * back // dorsocervical pad
      const neck = 0.07 * gauss(y, 5.75, 0.3)
      const submental = 0.1 * gauss(y, 6.0, 0.16) * front * gauss(ax, 0, 0.45)
      const shoulderCap = 0.06 * gauss(y, 5.0, 0.4) * smoothstep(0.8, 1.4, ax)
      ch.torso[v] = wt * (flank + waistRing + upperBack + nape + neck + submental + shoulderCap)

      // ---------- CHEST (pectoral fat pad, lower pectoral fold, axilla) ----------
      const pecPad = 0.2 * gauss(y, 3.7, 0.5) * front * gauss(ax, 0.75, 0.55)
      const pecUpper = 0.06 * gauss(y, 4.4, 0.4) * front
      const axilla = 0.09 * gauss(y, 4.15, 0.45) * side
      // Lower pectoral fold: slight downward sag of the pad
      ch.chest[v] = wt * (pecPad + pecUpper + axilla)

      // ---------- BELLY (anterior abdominal panniculus, wraps gently to the flanks) ----------
      const lowerBelly = 0.5 * gauss(y, 1.75, 0.75)
      const upperBelly = 0.22 * gauss(y, 2.85, 0.6)
      const wrap = 0.18 + 0.82 * front
      const midline = 0.75 + 0.25 * gauss(ax, 0, 0.9)
      const pubicFade = smoothstep(0.35, 1.0, y)
      ch.belly[v] = wt * (lowerBelly + upperBelly) * wrap * midline * pubicFade
    }

    // ---------- ARMS (upper arm / triceps pad heavier, elbow + wrist taper, hands nearly unchanged) ----------
    const wa = wArm[v]
    if (wa > 0.001) {
      let a = 0
      if (armSeg[v] === 1) {
        const t = tUpperArm[v]
        a = (0.17 + 0.17 * gauss(t, 0.45, 0.3)) * (1 - 0.35 * gauss(t, 1.0, 0.13))
        // Posterior (triceps) fat is fuller than the biceps side
        a *= 0.85 + 0.3 * back
      } else if (armSeg[v] === 2) {
        const t = tForearm[v]
        a = 0.035 + 0.11 * Math.pow(1 - t, 1.3) * (1 - 0.35 * gauss(t, 0.0, 0.1))
      } else {
        a = 0.008
      }
      ch.arms[v] = wa * a
    }

    // ---------- THIGHS & HIPS (saddlebags, glutes, medial clearance, knee taper) ----------
    const wl = wLeg[v]
    const hipBlend = wt * gauss(y, 0.35, 0.65) // gluteal/hip region still classified as torso
    if (wl > 0.001 || hipBlend > 0.001) {
      let a = 0
      if (legSeg[v] === 1) {
        const t = tThigh[v]
        a = (0.15 + 0.15 * gauss(t, 0.2, 0.3)) * (1 - 0.45 * gauss(t, 1.0, 0.12))
        // Lateral saddlebags fuller, medial (inner thigh) reduced to keep clearance
        a *= 1 + 0.25 * smoothstep(0.1, 0.8, nx) * gauss(t, 0.25, 0.2)
        a *= 1 - 0.45 * smoothstep(0.05, 0.75, -nx)
      } else if (legSeg[v] === 2) {
        a = 0.04 * (1 - smoothstep(0.0, 0.25, tShin[v]))
      }
      const glute = 0.2 * (0.45 + 0.55 * back + 0.35 * side)
      ch.thighs[v] = wl * a + hipBlend * glute
    }

    // ---------- CALVES (gastrocnemius pad, ankle taper, feet nearly unchanged) ----------
    if (wl > 0.001) {
      let a = 0
      if (legSeg[v] === 2) {
        const t = tShin[v]
        a = (0.045 + 0.09 * gauss(t, 0.3, 0.22)) * (1 - 0.7 * smoothstep(0.65, 1.0, t))
        a *= 0.85 + 0.35 * back // calf is posterior
        a *= 1 - 0.25 * smoothstep(0.1, 0.8, -nx)
      } else if (legSeg[v] === 1) {
        a = 0.03 * smoothstep(0.75, 1.0, tThigh[v])
      } else {
        a = 0.006
      }
      ch.calves[v] = wl * a
    }
  }

  for (const key of Object.keys(ch)) {
    laplacianSmoothScalar(ch[key], bodyVerts, rawNeighbors, 8, 0.55)
  }

  /**
   * Converts a weighted mix of channels into a normal-direction displacement delta (scene units),
   * smoothed and with medial thigh clearance enforced.
   */
  function channelDelta(mix, basePosFlat) {
    const delta = new Float32Array(n * 3)
    for (const v of bodyVerts) {
      let a = 0
      for (const [key, w] of Object.entries(mix)) a += ch[key][v] * w
      if (a <= 0) continue
      const amt = a * scaleFactor
      delta[v * 3] = normals[v * 3] * amt
      delta[v * 3 + 1] = normals[v * 3 + 1] * amt * 0.35 // fat mostly expands horizontally
      delta[v * 3 + 2] = normals[v * 3 + 2] * amt
    }
    laplacianSmoothVec3(delta, bodyVerts, rawNeighbors, 3, 0.5)
    enforceMedialClearance(delta, basePosFlat)
    return delta
  }

  /**
   * Prevents the inner thighs (and inner arms against the torso flank) from crossing the midline:
   * medial X-motion of leg vertices is limited so |x| never drops below 72% of its rest value.
   */
  function enforceMedialClearance(delta, basePosFlat) {
    for (const v of bodyVerts) {
      if (wLeg[v] < 0.2) continue
      const bx = basePosFlat ? basePosFlat[v * 3] : rawPositions[v][0] * scaleFactor
      const sign = Math.sign(bx) || 1
      const ax = Math.abs(bx)
      if (ax < 0.004) continue
      const dxMedial = -delta[v * 3] * sign // positive = moving toward midline
      const maxMedial = ax * 0.28
      if (dxMedial > maxMedial) delta[v * 3] = -sign * maxMedial
    }
  }

  return { channels: ch, channelDelta, enforceMedialClearance, wArm, wLeg, wTorso }
}

/** Adds MakeHuman target deltas (already scaled) on top of a procedural delta, in place. */
export function addDelta(target, source, weight = 1) {
  for (let i = 0; i < target.length; i++) target[i] += source[i] * weight
}

/**
 * Tapers MakeHuman-target deltas near joints/extremities using the membership weights,
 * so wrist/ankle circumference targets never balloon hands and feet.
 */
export function maskDelta(delta, weightFn, verts) {
  for (const v of verts) {
    const w = weightFn(v)
    delta[v * 3] *= w
    delta[v * 3 + 1] *= w
    delta[v * 3 + 2] *= w
  }
  return delta
}
