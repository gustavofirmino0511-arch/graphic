import * as THREE from 'three'

export type CharacterStyleId = 'realistic' | 'anime' | 'prototype'

export interface CharacterStyleConfig {
  id: CharacterStyleId
  name: string
  badge: string
  description: string
  modelUrl: string
  license: string
  defaultHeightMeters: number
  defaultSkinColor: string
  eyeIrisColor: string
  skinRoughness: number
  skinMetalness: number
  skinClearcoat: number
  skinSheen: number
  supportsMorphTargets: boolean
  useToonShading: boolean
  swatches: { color: string; label: string }[]
}

export const CHARACTER_STYLES: Record<CharacterStyleId, CharacterStyleConfig> = {
  realistic: {
    id: 'realistic',
    name: 'Realista (Anatômico HD)',
    badge: 'MakeHuman CC0',
    description:
      'Malha anatômica completa com rosto esculpido, olhos, mãos com dedos individualizados, pés anatômicos e morph targets de proporções.',
    modelUrl: '/models/personagem_humano_realista.glb',
    license: 'CC0 1.0 Universal (Domínio Público — MakeHuman hm08)',
    defaultHeightMeters: 1.8,
    defaultSkinColor: '#d4a383',
    eyeIrisColor: '#5c4033',
    skinRoughness: 0.44,
    skinMetalness: 0.02,
    skinClearcoat: 0.14,
    skinSheen: 0.35,
    supportsMorphTargets: true,
    useToonShading: false,
    swatches: [
      { color: '#f2ccb7', label: 'Pele Muito Clara' },
      { color: '#e3b497', label: 'Pele Clara Natural' },
      { color: '#d4a383', label: 'Pele Média Quente' },
      { color: '#b57c56', label: 'Pele Morena' },
      { color: '#845234', label: 'Pele Escura' },
      { color: '#543320', label: 'Pele Retinta' },
      { color: '#9ca3af', label: 'Escultura Cinza Estúdio' },
    ],
  },
  anime: {
    id: 'anime',
    name: 'Anime (Estilizado HD)',
    badge: 'Anime CC0',
    description:
      'Proporções estilizadas de anime com olhos grandes expressivos, rosto afilado em V, sombreamento Cel/Toon suave e morph targets.',
    modelUrl: '/models/personagem_humano_anime.glb',
    license: 'CC0 1.0 Universal (MakeHuman hm08 + Anime Stylization)',
    defaultHeightMeters: 1.62,
    defaultSkinColor: '#fbe0d0',
    eyeIrisColor: '#4f46e5',
    skinRoughness: 0.68,
    skinMetalness: 0.0,
    skinClearcoat: 0.04,
    skinSheen: 0.15,
    supportsMorphTargets: true,
    useToonShading: true,
    swatches: [
      { color: '#fff0e6', label: 'Anime Porcelana' },
      { color: '#fbe0d0', label: 'Anime Pêssego Padrão' },
      { color: '#f0c4a8', label: 'Anime Bronzeado Leve' },
      { color: '#c98e6b', label: 'Anime Moreno Quente' },
      { color: '#8f5b3e', label: 'Anime Escuro' },
      { color: '#c4b5fd', label: 'Fantasia Lavanda' },
    ],
  },
  prototype: {
    id: 'prototype',
    name: 'Protótipo Original',
    badge: 'GLB Inicial',
    description:
      'Malha procedural inicial (personagem_base_humano.glb) com orientação vertical corrigida para referência e comparação.',
    modelUrl: '/models/personagem_base_humano.glb',
    license: 'Arquivo original do projeto (personagem_base_humano.glb)',
    defaultHeightMeters: 1.95,
    defaultSkinColor: '#c8a98e',
    eyeIrisColor: '#4b5563',
    skinRoughness: 0.5,
    skinMetalness: 0.05,
    skinClearcoat: 0.08,
    skinSheen: 0.2,
    supportsMorphTargets: false,
    useToonShading: false,
    swatches: [
      { color: '#c8a98e', label: 'Argila Original' },
      { color: '#e0b899', label: 'Pele Clara' },
      { color: '#a67856', label: 'Pele Média' },
      { color: '#69452f', label: 'Pele Escura' },
      { color: '#9ca3af', label: 'Cinza Estúdio' },
    ],
  },
}

/**
 * Generates a high-resolution procedural eye texture (sclera, limbal ring, radial iris fibers, pupil, and corneal catchlights)
 */
export function createEyeTexture(irisColorHex: string, isAnime: boolean): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const cx = size / 2
  const cy = size / 2

  // 1. Sclera base with subtle vascular radial shading at periphery
  const scleraGrad = ctx.createRadialGradient(cx, cy, size * 0.18, cx, cy, size * 0.5)
  scleraGrad.addColorStop(0, '#fcfcfa')
  scleraGrad.addColorStop(0.75, '#f5f2f0')
  scleraGrad.addColorStop(1, '#e6d8d5')
  ctx.fillStyle = scleraGrad
  ctx.fillRect(0, 0, size, size)

  const irisRadius = isAnime ? size * 0.29 : size * 0.22
  const pupilRadius = isAnime ? irisRadius * 0.44 : irisRadius * 0.36

  // 2. Outer limbal ring (dark ring around iris)
  ctx.beginPath()
  ctx.arc(cx, cy, irisRadius * 1.04, 0, Math.PI * 2)
  ctx.fillStyle = '#1e1918'
  ctx.fill()

  // 3. Iris gradient
  const irisGrad = ctx.createRadialGradient(cx, cy, pupilRadius * 0.8, cx, cy, irisRadius)
  irisGrad.addColorStop(0, '#2b1d14')
  irisGrad.addColorStop(0.35, irisColorHex)
  irisGrad.addColorStop(0.85, irisColorHex)
  irisGrad.addColorStop(1, '#1c1614')
  ctx.beginPath()
  ctx.arc(cx, cy, irisRadius, 0, Math.PI * 2)
  ctx.fillStyle = irisGrad
  ctx.fill()

  // 4. Radial iris fibers
  ctx.save()
  ctx.translate(cx, cy)
  const fiberCount = isAnime ? 48 : 90
  for (let i = 0; i < fiberCount; i++) {
    const angle = (i / fiberCount) * Math.PI * 2
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.moveTo(pupilRadius * 1.02, 0)
    ctx.lineTo(irisRadius * 0.94, 0)
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.18)'
    ctx.lineWidth = isAnime ? 2.2 : 1.4
    ctx.stroke()
    ctx.rotate(-angle)
  }
  ctx.restore()

  // 5. Pupil
  ctx.beginPath()
  ctx.arc(cx, cy, pupilRadius, 0, Math.PI * 2)
  ctx.fillStyle = '#09090d'
  ctx.fill()

  // 6. Corneal catchlights (dual studio highlights for anime, subtle single highlight for realistic)
  ctx.beginPath()
  ctx.arc(
    cx - irisRadius * 0.32,
    cy - irisRadius * 0.32,
    isAnime ? irisRadius * 0.22 : irisRadius * 0.12,
    0,
    Math.PI * 2
  )
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
  ctx.fill()

  if (isAnime) {
    ctx.beginPath()
    ctx.arc(cx + irisRadius * 0.28, cy + irisRadius * 0.28, irisRadius * 0.1, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)'
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

/**
 * Generates a 4-step gradient map for Anime Cel/Toon shading
 */
export function createAnimeToonGradientMap(): THREE.DataTexture {
  const colors = new Uint8Array([
    145, 132, 138, 255,
    198, 186, 190, 255,
    238, 232, 235, 255,
    255, 255, 255, 255,
  ])
  const texture = new THREE.DataTexture(colors, 4, 1, THREE.RGBAFormat)
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.needsUpdate = true
  return texture
}
