import { Suspense, useRef, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, ContactShadows, useGLTF } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import type { CameraPreset, ModelMetrics } from '../App'

interface ViewportProps {
  wireframe: boolean
  showGrid: boolean
  autoRotate: boolean
  materialColor: string
  cameraPreset: CameraPreset
  cameraTrigger: number
  onSelectCameraPreset: (preset: CameraPreset) => void
  onModelLoaded: (metrics: ModelMetrics) => void
}

const CAMERA_PRESETS: Record<
  CameraPreset,
  { position: [number, number, number]; target: [number, number, number]; label: string }
> = {
  perspective: {
    position: [1.5, 1.4, 2.6],
    target: [0, 0.95, 0],
    label: '3/4 Perspectiva',
  },
  front: {
    position: [0, 1.0, 2.8],
    target: [0, 0.95, 0],
    label: 'Frente',
  },
  side: {
    position: [2.8, 1.0, 0],
    target: [0, 0.95, 0],
    label: 'Perfil',
  },
  back: {
    position: [0, 1.0, -2.8],
    target: [0, 0.95, 0],
    label: 'Costas',
  },
  head: {
    position: [0, 1.72, 0.75],
    target: [0, 1.68, 0],
    label: 'Rosto',
  },
  top: {
    position: [0, 3.6, 0.4],
    target: [0, 0.95, 0],
    label: 'Topo',
  },
}

/** Real 3D human character model loaded from personagem_base_humano.glb */
function CharacterModel({
  wireframe,
  materialColor,
  onModelLoaded,
}: {
  wireframe: boolean
  materialColor: string
  onModelLoaded: (metrics: ModelMetrics) => void
}) {
  const { scene } = useGLTF('/models/personagem_base_humano.glb')
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!scene || initializedRef.current) return

    let totalVertices = 0
    let totalFaces = 0
    let totalMeshes = 0

    // Reset transforms before measuring bounding box
    scene.position.set(0, 0, 0)
    scene.rotation.set(0, 0, 0)
    scene.scale.set(1, 1, 1)
    scene.updateMatrixWorld(true)

    const box = new THREE.Box3().setFromObject(scene)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())

    // Center horizontally on X/Z and place feet precisely at Y = 0
    scene.position.set(-center.x, -box.min.y, -center.z)

    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        totalMeshes += 1
        const geo = child.geometry
        if (!geo.attributes.normal) {
          geo.computeVertexNormals()
        }
        if (geo.attributes.position) {
          totalVertices += geo.attributes.position.count
        }
        if (geo.index) {
          totalFaces += Math.round(geo.index.count / 3)
        } else if (geo.attributes.position) {
          totalFaces += Math.round(geo.attributes.position.count / 3)
        }

        child.material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(materialColor),
          roughness: 0.48,
          metalness: 0.06,
          wireframe,
          side: THREE.DoubleSide,
        })
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    initializedRef.current = true
    onModelLoaded({
      vertices: totalVertices,
      faces: totalFaces,
      meshes: totalMeshes,
      height: Number(size.y.toFixed(2)),
      width: Number(size.x.toFixed(2)),
      depth: Number(size.z.toFixed(2)),
    })
  }, [scene, materialColor, wireframe, onModelLoaded])

  // Update material properties dynamically
  useEffect(() => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        child.material.wireframe = wireframe
        child.material.color.set(materialColor)
        child.material.needsUpdate = true
      }
    })
  }, [wireframe, materialColor, scene])

  return <primitive object={scene} />
}

/** Camera controller that responds to preset changes */
function CameraRig({
  preset,
  trigger,
  autoRotate,
}: {
  preset: CameraPreset
  trigger: number
  autoRotate: boolean
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const { camera } = useThree()

  useEffect(() => {
    const config = CAMERA_PRESETS[preset]
    camera.position.set(...config.position)
    if (controlsRef.current) {
      controlsRef.current.target.set(...config.target)
      controlsRef.current.update()
    }
  }, [preset, trigger, camera])

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      target={[0, 0.95, 0]}
      minDistance={0.35}
      maxDistance={12}
      minPolarAngle={0.05}
      maxPolarAngle={Math.PI - 0.05}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.75}
      zoomSpeed={1.0}
      panSpeed={0.6}
      autoRotate={autoRotate}
      autoRotateSpeed={1.8}
    />
  )
}

/** Studio floor grid and axes indicator */
function FloorGrid({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <group>
      <gridHelper args={[10, 20, '#343452', '#1e1e32']} position={[0, 0.001, 0]} />
      <gridHelper args={[10, 5, '#4b4b72', '#4b4b72']} position={[0, 0.002, 0]} />
    </group>
  )
}

/** Loading indicator inside 3D scene while GLB parses */
function LoadingFallback() {
  return (
    <mesh position={[0, 0.95, 0]}>
      <octahedronGeometry args={[0.25, 1]} />
      <meshStandardMaterial color="#6c63ff" wireframe />
    </mesh>
  )
}

export default function Viewport({
  wireframe,
  showGrid,
  autoRotate,
  materialColor,
  cameraPreset,
  cameraTrigger,
  onSelectCameraPreset,
  onModelLoaded,
}: ViewportProps) {
  return (
    <main className="viewport" aria-label="Viewport 3D">
      {/* Quick Camera Angles Bar */}
      <div className="viewport__cam-bar" role="toolbar" aria-label="Ângulos de câmera">
        {(Object.keys(CAMERA_PRESETS) as CameraPreset[]).map((presetKey) => (
          <button
            key={presetKey}
            className={`viewport__cam-pill ${cameraPreset === presetKey ? 'viewport__cam-pill--active' : ''}`}
            onClick={() => onSelectCameraPreset(presetKey)}
          >
            {CAMERA_PRESETS[presetKey].label}
          </button>
        ))}
      </div>

      <Canvas
        className="viewport__canvas"
        shadows
        dpr={[1, 2]}
        camera={{ position: [1.5, 1.4, 2.6], fov: 42, near: 0.01, far: 100 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.15,
        }}
        onCreated={({ gl }) => {
          gl.setClearColor('#0f0f1a')
          gl.shadowMap.enabled = true
          gl.shadowMap.type = THREE.PCFSoftShadowMap
        }}
      >
        {/* 3-Point Studio Lighting + Hemisphere Fill (works 100% offline) */}
        <hemisphereLight args={['#d8e2ff', '#2a2438', 0.65]} />
        <ambientLight intensity={0.25} />

        {/* Key Light */}
        <directionalLight
          position={[4, 6, 5]}
          intensity={1.55}
          color="#fff7ed"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={18}
          shadow-camera-left={-3}
          shadow-camera-right={3}
          shadow-camera-top={3}
          shadow-camera-bottom={-3}
        />

        {/* Cool Fill Light */}
        <directionalLight position={[-4, 3.5, -2]} intensity={0.65} color="#93c5fd" />

        {/* Warm Rim / Back Light */}
        <pointLight position={[0, 2.8, -3]} intensity={0.9} color="#c4b5fd" />

        {/* Studio Floor Grid */}
        <FloorGrid visible={showGrid} />

        {/* Soft Contact Shadow under character feet */}
        <ContactShadows
          position={[0, 0, 0]}
          opacity={0.5}
          scale={5}
          blur={2.2}
          far={2.5}
          color="#05050a"
        />

        {/* Real Human Base Mesh */}
        <Suspense fallback={<LoadingFallback />}>
          <CharacterModel
            wireframe={wireframe}
            materialColor={materialColor}
            onModelLoaded={onModelLoaded}
          />
        </Suspense>

        {/* Orbital Camera Controls */}
        <CameraRig preset={cameraPreset} trigger={cameraTrigger} autoRotate={autoRotate} />
      </Canvas>

      {/* Bottom Controls Hint Overlay */}
      <div className="viewport__overlay">
        <span className="viewport__hint">
          <span className="viewport__hint-key">Arrastar / 1 Dedo</span> Girar
        </span>
        <span className="viewport__hint">
          <span className="viewport__hint-key">Botão Direito / 2 Dedos</span> Mover
        </span>
        <span className="viewport__hint">
          <span className="viewport__hint-key">Scroll / Pinça</span> Zoom
        </span>
      </div>
    </main>
  )
}

useGLTF.preload('/models/personagem_base_humano.glb')
