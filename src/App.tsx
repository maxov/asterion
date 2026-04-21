import { useState, useEffect, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { Leva } from 'leva'
import { ACESFilmicToneMapping, SRGBColorSpace } from 'three'
import { Scene } from './Scene/Scene.tsx'
import {
  DEFAULT_EXPOSURE,
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_FAR,
  CAMERA_DEFAULT_POSITION_KM,
} from './lib/constants.ts'
import { kmVecToUnits } from './lib/units.ts'

const DEFAULT_CAM_POS = kmVecToUnits(CAMERA_DEFAULT_POSITION_KM)

function useWebGPUSupport() {
  const [state, setState] = useState<'checking' | 'supported' | 'unsupported'>('checking')

  useEffect(() => {
    async function check(): Promise<'supported' | 'unsupported'> {
      if (!navigator.gpu) return 'unsupported'
      const adapter = await navigator.gpu.requestAdapter()
      return adapter ? 'supported' : 'unsupported'
    }
    check().then(setState)
  }, [])

  return state
}

// R3F v9 passes DefaultGLProps (includes canvas + WebGLRenderer params), not
// a bare HTMLCanvasElement. We destructure the canvas from the props.
async function createRenderer(props: { canvas: HTMLCanvasElement | OffscreenCanvas }) {
  const { WebGPURenderer } = await import('three/webgpu')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderer = new (WebGPURenderer as any)({ canvas: props.canvas, antialias: true })
  await renderer.init()

  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = DEFAULT_EXPOSURE
  renderer.outputColorSpace = SRGBColorSpace

  return renderer
}

function WebGPUError() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        color: '#e0e0e0',
        fontFamily: 'system-ui, sans-serif',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>
        WebGPU Required
      </h1>
      <p style={{ maxWidth: '32rem', lineHeight: 1.6, color: '#999' }}>
        This application requires a browser with WebGPU support.
        Please use a recent version of Chrome, Edge, or Safari&nbsp;26+.
      </p>
      <a
        href="https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API#browser_compatibility"
        target="_blank"
        rel="noopener noreferrer"
        style={{ marginTop: '1.5rem', color: '#6ea8fe' }}
      >
        Check browser compatibility &rarr;
      </a>
    </div>
  )
}

// Toggle Leva panel with 'H' key
function useLevaToggle() {
  const [hidden, setHidden] = useState(true)

  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'h' || e.key === 'H') setHidden((v) => !v)
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  return hidden
}

export function App() {
  const gpu = useWebGPUSupport()
  const levaHidden = useLevaToggle()

  if (gpu === 'checking') return null
  if (gpu === 'unsupported') return <WebGPUError />

  return (
    <>
      <Leva hidden={levaHidden} collapsed />
      <Canvas
        // R3F v9 accepts an async renderer factory. The cast is needed because
        // the published types still default to WebGLRenderer signatures.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        gl={createRenderer as any}
        camera={{
          position: DEFAULT_CAM_POS,
          fov: CAMERA_FOV,
          near: CAMERA_NEAR,
          far: CAMERA_FAR,
        }}
        style={{ position: 'fixed', inset: 0 }}
      >
        <Scene />
      </Canvas>
    </>
  )
}
