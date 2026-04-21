import { useState, useEffect, useCallback, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { Leva } from "leva";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { Scene } from "./Scene/Scene.tsx";
import { BODY_DEFINITIONS, DEFAULT_FOCUS_BODY_ID } from "./lib/bodies.ts";
import {
  DEFAULT_EXPOSURE,
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_FAR,
  CAMERA_DEFAULT_POSITION_KM,
} from "./lib/constants.ts";
import { kmVecToUnits } from "./lib/units.ts";

const DEFAULT_CAMERA_DISTANCE_SCALE =
  BODY_DEFINITIONS[DEFAULT_FOCUS_BODY_ID].defaultFocusDistanceKm /
  Math.hypot(...CAMERA_DEFAULT_POSITION_KM);
const DEFAULT_CAM_POS = kmVecToUnits([
  CAMERA_DEFAULT_POSITION_KM[0] * DEFAULT_CAMERA_DISTANCE_SCALE,
  CAMERA_DEFAULT_POSITION_KM[1] * DEFAULT_CAMERA_DISTANCE_SCALE,
  CAMERA_DEFAULT_POSITION_KM[2] * DEFAULT_CAMERA_DISTANCE_SCALE,
]);
const HUD_IDLE_MS = 1_200;
const LEVA_PANEL_WIDTH = "20rem";
const HUD_HOT_CORNER_WIDTH = 128;
const HUD_HOT_CORNER_HEIGHT = 96;

function useWebGPUSupport() {
  const [state, setState] = useState<"checking" | "supported" | "unsupported">(
    "checking",
  );

  useEffect(() => {
    async function check(): Promise<"supported" | "unsupported"> {
      if (!navigator.gpu) return "unsupported";
      const adapter = await navigator.gpu.requestAdapter();
      return adapter ? "supported" : "unsupported";
    }
    check().then(setState);
  }, []);

  return state;
}

// R3F v9 passes DefaultGLProps (includes canvas + WebGLRenderer params), not
// a bare HTMLCanvasElement. We destructure the canvas from the props.
async function createRenderer(props: {
  canvas: HTMLCanvasElement | OffscreenCanvas;
}) {
  const { WebGPURenderer } = await import("three/webgpu");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderer = new (WebGPURenderer as any)({
    canvas: props.canvas,
    antialias: true,
  });
  await renderer.init();

  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = DEFAULT_EXPOSURE;
  renderer.outputColorSpace = SRGBColorSpace;

  return renderer;
}

function WebGPUError() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0a",
        color: "#e0e0e0",
        fontFamily: "system-ui, sans-serif",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: "1.8rem", marginBottom: "1rem" }}>
        WebGPU Required
      </h1>
      <p style={{ maxWidth: "32rem", lineHeight: 1.6, color: "#999" }}>
        This application requires a browser with WebGPU support. Please use a
        recent version of Chrome, Edge, or Safari&nbsp;26+.
      </p>
      <a
        href="https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API#browser_compatibility"
        target="_blank"
        rel="noopener noreferrer"
        style={{ marginTop: "1.5rem", color: "#6ea8fe" }}
      >
        Check browser compatibility &rarr;
      </a>
    </div>
  );
}

function SettingsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.2 1.2 0 0 1 0 1.7l-1.6 1.6a1.2 1.2 0 0 1-1.7 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1.2 1.2 0 0 1-1.2 1.2h-2.3A1.2 1.2 0 0 1 10 20v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1.2 1.2 0 0 1-1.7 0l-1.6-1.6a1.2 1.2 0 0 1 0-1.7l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4A1.2 1.2 0 0 1 2.8 12v-2.3A1.2 1.2 0 0 1 4 8.5h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1.2 1.2 0 0 1 0-1.7l1.6-1.6a1.2 1.2 0 0 1 1.7 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4A1.2 1.2 0 0 1 11.1 2.8h2.3A1.2 1.2 0 0 1 14.6 4v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.2 1.2 0 0 1 1.7 0l1.6 1.6a1.2 1.2 0 0 1 0 1.7l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.2A1.2 1.2 0 0 1 21.2 9.7V12A1.2 1.2 0 0 1 20 13.2h-.2a1 1 0 0 0-.4 1.8" />
    </svg>
  );
}

function FullscreenIcon({ active = false }: { active?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {active ? (
        <>
          <path d="M4 4 9 9" />
          <path d="M9 5v4H5" />
          <path d="M20 4 15 9" />
          <path d="M15 5v4h4" />
          <path d="M20 20 15 15" />
          <path d="M15 19v-4h4" />
          <path d="M4 20 9 15" />
          <path d="M9 19v-4H5" />
        </>
      ) : (
        <>
          <path d="M8 3H3v5" />
          <path d="M16 3h5v5" />
          <path d="M21 16v5h-5" />
          <path d="M8 21H3v-5" />
        </>
      )}
    </svg>
  );
}

// Toggle Leva panel with 'H' key and via the HUD settings button.
function useLevaVisibility() {
  const [hidden, setHidden] = useState(true);

  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "h" || e.key === "H") setHidden((v) => !v);
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  const toggle = useCallback(() => {
    setHidden((value) => !value);
  }, []);

  return { hidden, toggle };
}

function useAmbientHud(persist = false) {
  const [visible, setVisible] = useState(true);
  const visibleRef = useRef(true);
  const timeoutRef = useRef<number | null>(null);

  const clearHideTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const setVisibleState = useCallback((next: boolean) => {
    visibleRef.current = next;
    setVisible(next);
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimeout();

    if (persist) {
      if (!visibleRef.current) setVisibleState(true);
      return;
    }

    timeoutRef.current = window.setTimeout(() => {
      setVisibleState(false);
    }, HUD_IDLE_MS);
  }, [clearHideTimeout, persist, setVisibleState]);

  const showHud = useCallback(() => {
    if (!visibleRef.current) setVisibleState(true);
    scheduleHide();
  }, [scheduleHide, setVisibleState]);

  useEffect(() => {
    const onActivity = () => {
      showHud();
    };

    const isInHudHotCorner = (event: PointerEvent) => {
      return (
        event.clientX >= window.innerWidth - HUD_HOT_CORNER_WIDTH &&
        event.clientY <= HUD_HOT_CORNER_HEIGHT
      );
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.buttons !== 0 || isInHudHotCorner(event)) showHud();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("touchstart", onActivity);
    window.addEventListener("wheel", onActivity, { passive: true });

    showHud();

    return () => {
      clearHideTimeout();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("touchstart", onActivity);
      window.removeEventListener("wheel", onActivity);
    };
  }, [clearHideTimeout, showHud]);

  useEffect(() => {
    scheduleHide();
  }, [scheduleHide]);

  return visible;
}

export function App() {
  const gpu = useWebGPUSupport();
  const { hidden: levaHidden, toggle: toggleLeva } = useLevaVisibility();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isHudHovered, setIsHudHovered] = useState(false);
  const fullscreenSupported = document.fullscreenEnabled;
  const hudVisible = useAmbientHud(!levaHidden || isHudHovered);

  const toggleFullscreen = useCallback(async () => {
    if (!fullscreenSupported) return;

    if (document.fullscreenElement === viewportRef.current) {
      await document.exitFullscreen();
      return;
    }

    await viewportRef.current?.requestFullscreen();
  }, [fullscreenSupported]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(
        viewportRef.current !== null &&
          document.fullscreenElement === viewportRef.current,
      );
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    onFullscreenChange();

    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  if (gpu === "checking") return null;
  if (gpu === "unsupported") return <WebGPUError />;

  return (
    <div
      ref={viewportRef}
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
      }}
    >
      <div
        style={{
          position: "fixed",
          top: "10px",
          left: "10px",
          zIndex: 1000,
          width: LEVA_PANEL_WIDTH,
        }}
      >
        <Leva fill hidden={levaHidden} collapsed />
      </div>
      <div
        style={{
          position: "absolute",
          top: "1rem",
          right: "1rem",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: "0.6rem",
          opacity: hudVisible ? 1 : 0,
          transform: hudVisible ? "translateY(0)" : "translateY(-0.5rem)",
          transition: "opacity 280ms ease, transform 280ms ease",
          pointerEvents: hudVisible ? "auto" : "none",
        }}
        onMouseEnter={() => {
          setIsHudHovered(true);
        }}
        onMouseLeave={() => {
          setIsHudHovered(false);
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
            padding: "0.35rem",
            borderRadius: "999px",
            background: "rgba(14, 18, 24, 0.82)",
            boxShadow: "0 14px 36px rgba(0, 0, 0, 0.2)",
            backdropFilter: "blur(6px) saturate(150%)",
            WebkitBackdropFilter: "blur(6px) saturate(150%)",
          }}
        >
          <button
            type="button"
            onClick={toggleLeva}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "2.65rem",
              height: "2.65rem",
              border: "none",
              borderRadius: "999px",
              background: "transparent",
              color: levaHidden
                ? "rgba(245, 247, 250, 0.72)"
                : "rgba(245, 247, 250, 0.98)",
              cursor: "pointer",
              transition: "background 180ms ease, color 180ms ease",
            }}
            aria-pressed={!levaHidden}
            aria-label={levaHidden ? "Open settings" : "Close settings"}
            title={levaHidden ? "Open settings" : "Close settings"}
          >
            <SettingsIcon />
          </button>
          {fullscreenSupported ? (
            <button
              type="button"
              onClick={() => {
                void toggleFullscreen();
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "2.65rem",
                height: "2.65rem",
                border: "none",
                borderRadius: "999px",
                background: "transparent",
                color: isFullscreen
                  ? "rgba(245, 247, 250, 0.98)"
                  : "rgba(245, 247, 250, 0.72)",
                cursor: "pointer",
                transition: "background 180ms ease, color 180ms ease",
              }}
              aria-pressed={isFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              <FullscreenIcon active={isFullscreen} />
            </button>
          ) : null}
        </div>
      </div>
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
        style={{ position: "fixed", inset: 0 }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
