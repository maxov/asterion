import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Canvas, type CanvasProps } from "@react-three/fiber";
import { Leva } from "leva";
import { ACESFilmicToneMapping, SRGBColorSpace, WebGLRenderer } from "three";
import { Scene } from "./Scene/Scene.tsx";
import {
  BODY_DEFINITIONS,
  DEFAULT_FOCUS_BODY_ID,
  type BodyId,
} from "./lib/bodies.ts";
import { MISSION_REGISTRY, type MissionRegistryEntry } from "./lib/missions.ts";
import {
  DEFAULT_EXPOSURE,
  CAMERA_FOV,
  CAMERA_NEAR,
  CAMERA_FAR,
  CAMERA_DEFAULT_POSITION_KM,
} from "./lib/constants.ts";
import {
  createSimulationTimeline,
  currentSimulationDateMs,
  REALTIME_DAYS_PER_SECOND,
  rebaseSimulationTimeline,
  timelineSystemMs,
  type SimulationTimeline,
} from "./lib/simulationTimeline.ts";
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
const HUD_HOT_LEFT_EDGE_WIDTH = 48;
const HUD_HOT_LEFT_EDGE_HEIGHT = 300;
const HUD_FONT_FAMILY =
  '"JetBrains Mono", "SF Mono", "Fira Code", monospace';
const HUD_MONO_FAMILY =
  '"JetBrains Mono", "SF Mono", "Fira Code", monospace';
const HUD_TEXT_MUTED = "rgba(245, 247, 250, 0.6)";
const HUD_TEXT_ACTIVE = "rgba(245, 247, 250, 0.95)";
const HUD_TEXT_SUBTLE = "rgba(208, 216, 227, 0.5)";
const MISSION_BODY_IDS = new Set(MISSION_REGISTRY.map((m) => m.id));
const FOCUS_BODY_OPTIONS = Object.values(BODY_DEFINITIONS).filter(
  (b) => !MISSION_BODY_IDS.has(b.id),
);
// Tick marks shown on the strip (decorative only, no snapping).
const STRIP_TICKS = [
  { label: "-1mo/s", daysPerSecond: -30 },
  { label: "-1w/s", daysPerSecond: -7 },
  { label: "-1d/s", daysPerSecond: -1 },
  { label: "-1h/s", daysPerSecond: -1 / 24 },
  { label: "-1min/s", daysPerSecond: -1 / 1440 },
  { label: "-1s/s", daysPerSecond: -REALTIME_DAYS_PER_SECOND },
  { label: "0/s", daysPerSecond: 0 },
  { label: "1s/s", daysPerSecond: REALTIME_DAYS_PER_SECOND },
  { label: "1min/s", daysPerSecond: 1 / 1440 },
  { label: "1h/s", daysPerSecond: 1 / 24 },
  { label: "1d/s", daysPerSecond: 1 },
  { label: "1w/s", daysPerSecond: 7 },
  { label: "1mo/s", daysPerSecond: 30 },
] as const;
const STRIP_PAUSE_TICK = 6;

// Exponential mapping: position ↔ speed.
// Position [0, 1] maps to speed [-MAX_DPS, +MAX_DPS] with a dead zone
// around center for pause. Each half uses a log scale so every order of
// magnitude gets roughly equal space on the strip.
const STRIP_MIN_DPS = REALTIME_DAYS_PER_SECOND; // 1s/s
const STRIP_MAX_DPS = 30; // 1mo/s
const STRIP_LOG_RANGE = Math.log(STRIP_MAX_DPS / STRIP_MIN_DPS);
const STRIP_DEAD_ZONE = 0.03; // ±3% of track around center = pause

function speedToPosition(dps: number, isPlaying: boolean): number {
  if (!isPlaying) return 0.5;
  const abs = Math.abs(dps);
  if (abs < STRIP_MIN_DPS) return 0.5;
  const t = Math.min(1, Math.log(abs / STRIP_MIN_DPS) / STRIP_LOG_RANGE);
  const half = STRIP_DEAD_ZONE + t * (0.5 - STRIP_DEAD_ZONE);
  return dps > 0 ? 0.5 + half : 0.5 - half;
}

function positionToSpeed(pos: number): { daysPerSecond: number; isPlaying: boolean } {
  const offset = pos - 0.5;
  if (Math.abs(offset) <= STRIP_DEAD_ZONE) return { daysPerSecond: 0, isPlaying: false };
  const sign = offset > 0 ? 1 : -1;
  const t = (Math.abs(offset) - STRIP_DEAD_ZONE) / (0.5 - STRIP_DEAD_ZONE);
  const dps = STRIP_MIN_DPS * Math.exp(t * STRIP_LOG_RANGE);
  return { daysPerSecond: sign * dps, isPlaying: true };
}

function formatSpeed(dps: number, isPlaying: boolean): string {
  if (!isPlaying) return "0/s";
  const abs = Math.abs(dps);
  const sign = dps < 0 ? "-" : "";
  if (abs >= 7) {
    const mo = abs / 30;
    if (mo >= 0.95) return `${sign}${mo < 10 ? mo.toFixed(1) : Math.round(mo)}mo/s`;
    const w = abs / 7;
    return `${sign}${w < 10 ? w.toFixed(1) : Math.round(w)}w/s`;
  }
  if (abs >= 1) return `${sign}${abs < 10 ? abs.toFixed(1) : Math.round(abs)}d/s`;
  if (abs >= 1 / 24) {
    const h = abs * 24;
    return `${sign}${h < 10 ? h.toFixed(1) : Math.round(h)}h/s`;
  }
  if (abs >= 1 / 1440) {
    const m = abs * 1440;
    return `${sign}${m < 10 ? m.toFixed(1) : Math.round(m)}min/s`;
  }
  const s = abs * 86400;
  return `${sign}${s < 10 ? s.toFixed(1) : Math.round(s)}s/s`;
}

type TimeHudControlProps = {
  timeline: SimulationTimeline;
  setTimeline: Dispatch<SetStateAction<SimulationTimeline>>;
};

type FocusHudControlProps = {
  focusBodyId: BodyId;
  activeMissionId: string | null;
  onFocusBodyChange: (focusBodyId: BodyId) => void;
  onOpenChange?: (open: boolean) => void;
};

function hudSurfaceStyle(
  borderRadius: string,
  visible: boolean,
): CSSProperties {
  return {
    position: "relative",
    border: "none",
    borderRadius,
    background: visible ? "rgba(28, 30, 36, 0.5)" : "transparent",
    backdropFilter: visible ? "blur(12px) saturate(160%)" : "none",
    WebkitBackdropFilter: visible ? "blur(12px) saturate(160%)" : "none",
    transition: `background ${HUD_FADE_MS}ms ease, backdrop-filter ${HUD_FADE_MS}ms ease, -webkit-backdrop-filter ${HUD_FADE_MS}ms ease`,
  };
}

function hudIconButtonStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "2.6rem",
    height: "2.6rem",
    border: "none",
    borderRadius: "999px",
    background: active ? "rgba(255, 255, 255, 0.12)" : "transparent",
    color: active ? HUD_TEXT_ACTIVE : HUD_TEXT_MUTED,
    cursor: "pointer",
    transition: "background 180ms ease, color 180ms ease",
  };
}


function formatHudClockTime(dateMs: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(dateMs));
}

function formatHudCalendarDate(dateMs: number) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(dateMs));
}



const HUD_FADE_MS = 400;

/** Keep children mounted during fade-out so opacity can transition. */
function useDeferredOpen(open: boolean) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
    } else {
      const id = setTimeout(() => setMounted(false), HUD_FADE_MS);
      return () => clearTimeout(id);
    }
  }, [open]);
  return { mounted: mounted || open, visible: open };
}

function FocusHudControl({
  focusBodyId,
  activeMissionId,
  onFocusBodyChange,
  onOpenChange,
}: FocusHudControlProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  const { mounted, visible } = useDeferredOpen(open);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const activeMission = activeMissionId
    ? MISSION_REGISTRY.find((m) => m.id === activeMissionId)
    : null;

  const currentLabel =
    FOCUS_BODY_OPTIONS.find((b) => b.id === focusBodyId)?.label
    ?? activeMission?.label
    ?? focusBodyId;

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      aria-label="Select focused object"
      aria-expanded={open}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        padding: "0.3rem 0.1rem",
        border: "none",
        borderRadius: "0.4rem",
        background: "transparent",
        color: HUD_TEXT_ACTIVE,
        cursor: "pointer",
        fontFamily: HUD_FONT_FAMILY,
        fontSize: "0.78rem",
        letterSpacing: "0.02em",
      }}
    >
      {currentLabel}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "1.1rem",
          height: "1.1rem",
          color: HUD_TEXT_SUBTLE,
          fontSize: "1.1rem",
          lineHeight: 1,
          transition: "transform 200ms ease",
          transform: open ? "rotate(90deg)" : "none",
        }}
      >
        ▸
      </span>
    </button>
  );

  return (
    <div
      ref={containerRef}
      style={{ position: "relative" }}
    >
      <div
        style={{
          ...hudSurfaceStyle("0.6rem", true),
          fontFamily: HUD_FONT_FAMILY,
          color: HUD_TEXT_ACTIVE,
        }}
      >
        {trigger}
      </div>
      {mounted && (
        <div
          style={{
            ...hudSurfaceStyle("0.6rem", true),
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "0.35rem",
            fontFamily: HUD_FONT_FAMILY,
            color: HUD_TEXT_ACTIVE,
            minWidth: "10rem",
            display: "grid",
            gap: "0.1rem",
            padding: "0.3rem",
            opacity: visible ? 1 : 0,
            transition: `opacity ${HUD_FADE_MS}ms ease`,
          }}
        >
          {activeMission && (() => {
            const selected = activeMission.id === focusBodyId;
            return (
              <button
                key={activeMission.id}
                role="option"
                aria-selected={selected}
                type="button"
                onClick={() => {
                  onFocusBodyChange(activeMission.id);
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "0.4rem 0.6rem",
                  border: "none",
                  borderRadius: "0.35rem",
                  background: selected
                    ? "rgba(255, 255, 255, 0.1)"
                    : "transparent",
                  color: activeMission.color,
                  cursor: "pointer",
                  fontFamily: HUD_FONT_FAMILY,
                  fontSize: "0.72rem",
                  letterSpacing: "0.02em",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  if (!selected)
                    e.currentTarget.style.background =
                      "rgba(255, 255, 255, 0.06)";
                }}
                onMouseLeave={(e) => {
                  if (!selected)
                    e.currentTarget.style.background = "transparent";
                }}
              >
                {activeMission.label}
              </button>
            );
          })()}
          {FOCUS_BODY_OPTIONS.map((body) => {
            const selected = body.id === focusBodyId;
            const isMoon = body.parentId != null;
            return (
              <button
                key={body.id}
                role="option"
                aria-selected={selected}
                type="button"
                onClick={() => {
                  onFocusBodyChange(body.id);
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "0.4rem 0.6rem",
                  paddingLeft: isMoon ? "1.4rem" : "0.6rem",
                  border: "none",
                  borderRadius: "0.35rem",
                  background: selected
                    ? "rgba(255, 255, 255, 0.1)"
                    : "transparent",
                  color: selected ? HUD_TEXT_ACTIVE : HUD_TEXT_MUTED,
                  cursor: "pointer",
                  fontFamily: HUD_FONT_FAMILY,
                  fontSize: "0.72rem",
                  letterSpacing: "0.02em",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  if (!selected)
                    e.currentTarget.style.background =
                      "rgba(255, 255, 255, 0.06)";
                }}
                onMouseLeave={(e) => {
                  if (!selected)
                    e.currentTarget.style.background = "transparent";
                }}
              >
                {body.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

type SearchResult =
  | { type: "body"; body: (typeof FOCUS_BODY_OPTIONS)[number] }
  | { type: "mission"; mission: MissionRegistryEntry };

const ALL_SEARCH_ITEMS: SearchResult[] = [
  ...FOCUS_BODY_OPTIONS.map(
    (body) => ({ type: "body", body }) as SearchResult,
  ),
  ...MISSION_REGISTRY.map(
    (mission) => ({ type: "mission", mission }) as SearchResult,
  ),
];

function searchLabel(item: SearchResult) {
  return item.type === "body" ? item.body.label : item.mission.label;
}

type SearchHudControlProps = {
  onSelectBody: (bodyId: BodyId) => void;
  onSelectMission: (mission: MissionRegistryEntry) => void;
  onOpenChange?: (open: boolean) => void;
};

function SearchHudControl({
  onSelectBody,
  onSelectMission,
  onOpenChange,
}: SearchHudControlProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  const [query, setQuery] = useState("");
  const { mounted, visible } = useDeferredOpen(open);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = query.trim()
    ? ALL_SEARCH_ITEMS.filter((item) =>
        searchLabel(item).toLowerCase().includes(query.trim().toLowerCase()),
      )
    : ALL_SEARCH_ITEMS;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={hudIconButtonStyle(open)}
        aria-label="Search"
        title="Search"
      >
        <SearchIcon />
      </button>
      {mounted && (
        <div
          style={{
            ...hudSurfaceStyle("0.6rem", true),
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "0.35rem",
            fontFamily: HUD_FONT_FAMILY,
            color: HUD_TEXT_ACTIVE,
            minWidth: "12rem",
            display: "grid",
            gap: "0.1rem",
            padding: "0.3rem",
            opacity: visible ? 1 : 0,
            transition: `opacity ${HUD_FADE_MS}ms ease`,
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            style={{
              width: "100%",
              padding: "0.35rem 0.5rem",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "0.35rem",
              background: "rgba(255, 255, 255, 0.05)",
              color: HUD_TEXT_ACTIVE,
              fontFamily: HUD_FONT_FAMILY,
              fontSize: "0.72rem",
              letterSpacing: "0.02em",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <div
            style={{
              display: "grid",
              gap: "0.1rem",
              maxHeight: "14rem",
              overflowY: "auto",
            }}
          >
            {filtered.map((item) => (
              <button
                key={
                  item.type === "body"
                    ? `body:${item.body.id}`
                    : `mission:${item.mission.id}`
                }
                type="button"
                onClick={() => {
                  if (item.type === "body") {
                    onSelectBody(item.body.id);
                  } else {
                    onSelectMission(item.mission);
                  }
                  setOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  width: "100%",
                  padding: "0.4rem 0.5rem",
                  border: "none",
                  borderRadius: "0.35rem",
                  background: "transparent",
                  color: HUD_TEXT_MUTED,
                  cursor: "pointer",
                  fontFamily: HUD_FONT_FAMILY,
                  fontSize: "0.72rem",
                  letterSpacing: "0.02em",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "rgba(255, 255, 255, 0.06)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {searchLabel(item)}
                {item.type === "mission" && (
                  <span
                    style={{
                      fontSize: "0.6rem",
                      color: HUD_TEXT_SUBTLE,
                      marginLeft: "auto",
                    }}
                  >
                    mission
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function createRenderer(
  props: {
    canvas: HTMLCanvasElement | OffscreenCanvas;
  },
) {
  const renderer = new WebGLRenderer({
    canvas: props.canvas as HTMLCanvasElement,
    antialias: true,
  });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = DEFAULT_EXPOSURE;
  renderer.outputColorSpace = SRGBColorSpace;

  const debugRenderer = renderer as WebGLRenderer & {
    debug?: {
      checkShaderErrors?: boolean;
      onShaderError?: (
        gl: WebGLRenderingContext | WebGL2RenderingContext,
        program: WebGLProgram,
        glVertexShader: WebGLShader,
        glFragmentShader: WebGLShader,
      ) => void;
    };
  };

  if (debugRenderer.debug) {
    debugRenderer.debug.checkShaderErrors = true;
    debugRenderer.debug.onShaderError = (
      gl,
      program,
      glVertexShader,
      glFragmentShader,
    ) => {
      console.groupCollapsed("WebGL shader compile error");
      console.error("Program info:", gl.getProgramInfoLog(program));
      console.error("Vertex info:", gl.getShaderInfoLog(glVertexShader));
      console.error("Fragment info:", gl.getShaderInfoLog(glFragmentShader));
      console.log("Vertex shader source:\n", gl.getShaderSource(glVertexShader));
      console.log(
        "Fragment shader source:\n",
        gl.getShaderSource(glFragmentShader),
      );
      console.groupEnd();
    };
  }

  return renderer;
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

function SearchIcon() {
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
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function TimeHudControl({
  timeline,
  setTimeline,
}: TimeHudControlProps) {
  const [displaySystemMs, setDisplaySystemMs] = useState(() => timelineSystemMs());
  const currentDateMs = currentSimulationDateMs(timeline, displaySystemMs);
  const heroTime = formatHudClockTime(currentDateMs);
  const heroDate = formatHudCalendarDate(currentDateMs);
  const speedLabel = formatSpeed(timeline.daysPerSecond, timeline.isPlaying);

  const onSpeedChange = useCallback(
    (speed: { daysPerSecond: number; isPlaying: boolean }) => {
      setTimeline((current) => {
        const systemMs = timelineSystemMs();
        return rebaseSimulationTimeline(
          current,
          { daysPerSecond: speed.daysPerSecond, isPlaying: speed.isPlaying },
          systemMs,
        );
      });
    },
    [setTimeline],
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      setDisplaySystemMs(timelineSystemMs());
    }, 250);
    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const thumbPos = speedToPosition(timeline.daysPerSecond, timeline.isPlaying);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.55rem",
        color: HUD_TEXT_ACTIVE,
        fontFamily: HUD_FONT_FAMILY,
      }}
    >
      <span
        style={{
          color: HUD_TEXT_MUTED,
          fontFamily: HUD_MONO_FAMILY,
          fontSize: "0.85rem",
          fontWeight: 400,
          letterSpacing: "0.03em",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          minWidth: "4.5rem",
          textAlign: "right",
        }}
      >
        {speedLabel}
      </span>
      <SpeedStrip thumbPos={thumbPos} onSpeedChange={onSpeedChange} />
      <div style={{ display: "grid", gap: "0.05rem" }}>
        <span
          style={{
            color: HUD_TEXT_ACTIVE,
            fontFamily: HUD_MONO_FAMILY,
            fontSize: "1.0rem",
            fontWeight: 400,
            letterSpacing: "0.06em",
            fontVariantNumeric: "tabular-nums",
            textAlign: "right",
          }}
        >
          {heroTime}
        </span>
        <span
          style={{
            color: HUD_TEXT_SUBTLE,
            fontSize: "0.62rem",
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
            textAlign: "right",
          }}
        >
          {heroDate}
        </span>
      </div>
    </div>
  );
}

const STRIP_TRACK_HEIGHT = 3;
const STRIP_THUMB_SIZE = 14;
const STRIP_TICK_HEIGHT = 16;
const STRIP_CENTER_TICK_HEIGHT = 24;
const STRIP_HIT_HEIGHT = 32;

function SpeedStrip({
  thumbPos,
  onSpeedChange,
}: {
  thumbPos: number;
  onSpeedChange: (speed: { daysPerSecond: number; isPlaying: boolean }) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const posFromPointer = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0.5;
    const rect = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      draggingRef.current = true;
      onSpeedChange(positionToSpeed(posFromPointer(e.clientX)));
    },
    [posFromPointer, onSpeedChange],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      onSpeedChange(positionToSpeed(posFromPointer(e.clientX)));
    },
    [posFromPointer, onSpeedChange],
  );

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const speedLabel = formatSpeed(
    positionToSpeed(thumbPos).daysPerSecond,
    positionToSpeed(thumbPos).isPlaying,
  );

  return (
    <div
      ref={trackRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: "relative",
        width: "20rem",
        height: `${STRIP_HIT_HEIGHT}px`,
        cursor: "pointer",
        touchAction: "none",
        display: "flex",
        alignItems: "center",
      }}
      aria-label="Speed control"
      role="slider"
      aria-valuetext={speedLabel}
    >
      {/* Track */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          height: `${STRIP_TRACK_HEIGHT}px`,
          borderRadius: `${STRIP_TRACK_HEIGHT}px`,
          background: "rgba(255, 255, 255, 0.2)",
        }}
      />
      {/* Ticks (decorative) */}
      {STRIP_TICKS.map((tick, i) => {
        const isCenter = i === STRIP_PAUSE_TICK;
        const tickH = isCenter ? STRIP_CENTER_TICK_HEIGHT : STRIP_TICK_HEIGHT;
        const pos = speedToPosition(tick.daysPerSecond, tick.daysPerSecond !== 0);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${pos * 100}%`,
              width: isCenter ? "4px" : "3px",
              height: `${tickH}px`,
              borderRadius: "1px",
              transform: `translateX(-${isCenter ? 2 : 1.5}px)`,
              background: isCenter
                ? "rgba(255, 255, 255, 0.5)"
                : "rgba(255, 255, 255, 0.25)",
              top: `${(STRIP_HIT_HEIGHT - tickH) / 2}px`,
            }}
          />
        );
      })}
      {/* Thumb */}
      <div
        style={{
          position: "absolute",
          left: `${thumbPos * 100}%`,
          width: `${STRIP_THUMB_SIZE}px`,
          height: `${STRIP_THUMB_SIZE}px`,
          borderRadius: "50%",
          background: HUD_TEXT_ACTIVE,
          transform: "translateX(-50%)",
          transition: draggingRef.current ? "none" : "left 120ms ease",
          boxShadow: "0 0 4px rgba(0, 0, 0, 0.4)",
        }}
      />
    </div>
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
      const topRight =
        event.clientX >= window.innerWidth - HUD_HOT_CORNER_WIDTH &&
        event.clientY <= HUD_HOT_CORNER_HEIGHT;
      const leftEdge =
        event.clientX <= HUD_HOT_LEFT_EDGE_WIDTH &&
        event.clientY <= HUD_HOT_LEFT_EDGE_HEIGHT;
      return topRight || leftEdge;
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

// ---------------------------------------------------------------------------
// Scale bar
// ---------------------------------------------------------------------------

const SCALE_FOV_RAD = (CAMERA_FOV * Math.PI) / 180;
const SCALE_KM_PER_UNIT = 1_000;
const SCALE_TARGET_PX = 120; // ideal bar width in pixels
const SCALE_NICE = [1, 2, 5]; // multiplied by powers of 10

/** Pick a "nice" round number <= value from the 1-2-5 series. */
function niceFloor(value: number): number {
  const exp = Math.pow(10, Math.floor(Math.log10(value)));
  const mantissa = value / exp;
  let nice = 1;
  for (const n of SCALE_NICE) {
    if (n <= mantissa) nice = n;
  }
  return nice * exp;
}

function formatScaleLabel(km: number): string {
  if (km >= 1e6) return `${+(km / 1e6).toPrecision(3)}M km`;
  if (km >= 1) return `${+km.toPrecision(3)} km`;
  const m = km * 1000;
  if (m >= 1) return `${+m.toPrecision(3)} m`;
  return `${+(m * 100).toPrecision(3)} cm`;
}

function ScaleBar({
  cameraDistanceRef,
  hudVisible,
}: {
  cameraDistanceRef: { readonly current: number };
  hudVisible: boolean;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const prevLabel = useRef("");

  useEffect(() => {
    let raf = 0;
    function tick() {
      raf = requestAnimationFrame(tick);
      const bar = barRef.current;
      const label = labelRef.current;
      if (!bar || !label) return;

      const dist = cameraDistanceRef.current; // scene units
      const screenH = window.innerHeight || 1;
      const screenW = window.innerWidth || 1;
      const aspect = screenW / screenH;

      // Visible world width at the focus distance
      const visibleHeight = 2 * dist * Math.tan(SCALE_FOV_RAD / 2);
      const visibleWidth = visibleHeight * aspect;

      // What the target bar width represents in km
      const rawKm =
        (SCALE_TARGET_PX / screenW) * visibleWidth * SCALE_KM_PER_UNIT;
      if (!Number.isFinite(rawKm) || rawKm <= 0) return;

      const niceKm = niceFloor(rawKm);
      const actualPx = (niceKm / (visibleWidth * SCALE_KM_PER_UNIT)) * screenW;

      bar.style.width = `${actualPx}px`;
      const text = formatScaleLabel(niceKm);
      if (text !== prevLabel.current) {
        label.textContent = text;
        prevLabel.current = text;
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cameraDistanceRef]);

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1.2rem",
        left: "1.2rem",
        zIndex: 1000,
        fontFamily: HUD_FONT_FAMILY,
        opacity: hudVisible ? 1 : 0,
        transform: hudVisible ? "translateY(0)" : "translateY(0.5rem)",
        transition: "opacity 360ms ease, transform 360ms ease",
        pointerEvents: "none",
      }}
    >
      <span
        ref={labelRef}
        style={{
          display: "block",
          fontSize: "0.65rem",
          letterSpacing: "0.04em",
          color: HUD_TEXT_MUTED,
          marginBottom: "0.2rem",
        }}
      />
      <div
        ref={barRef}
        style={{
          height: "2px",
          minWidth: "20px",
          background: HUD_TEXT_MUTED,
          borderRadius: "1px",
          boxShadow: "0 0 4px rgba(0,0,0,0.5)",
        }}
      />
    </div>
  );
}

const STORAGE_KEY = "asterion-state";

type PersistedState = {
  focusBodyId: string;
  activeMissionId: string | null;
  simulationDateMs: number;
  daysPerSecond: number;
  isPlaying: boolean;
};

function loadPersistedState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (
      typeof parsed.focusBodyId !== "string" ||
      typeof parsed.simulationDateMs !== "number" ||
      !Number.isFinite(parsed.simulationDateMs)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

const PERSISTED = loadPersistedState();

export function App() {
  const { hidden: levaHidden, toggle: toggleLeva } = useLevaVisibility();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isHudHovered, setIsHudHovered] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownOpenRef = useRef({ focus: false, search: false });
  const updateDropdownOpen = useCallback((key: "focus" | "search", open: boolean) => {
    dropdownOpenRef.current[key] = open;
    setIsDropdownOpen(dropdownOpenRef.current.focus || dropdownOpenRef.current.search);
  }, []);
  const onFocusOpenChange = useCallback((open: boolean) => updateDropdownOpen("focus", open), [updateDropdownOpen]);
  const onSearchOpenChange = useCallback((open: boolean) => updateDropdownOpen("search", open), [updateDropdownOpen]);
  const cameraDistanceRef = useRef(1);
  const [focusBodyId, setFocusBodyId] = useState<BodyId>(() => {
    if (PERSISTED?.focusBodyId && PERSISTED.focusBodyId in BODY_DEFINITIONS) {
      return PERSISTED.focusBodyId as BodyId;
    }
    return DEFAULT_FOCUS_BODY_ID;
  });
  const [activeMissionId, setActiveMissionId] = useState<string | null>(() => {
    if (
      PERSISTED?.activeMissionId &&
      MISSION_REGISTRY.some((m) => m.id === PERSISTED.activeMissionId)
    ) {
      return PERSISTED.activeMissionId;
    }
    return null;
  });
  const [timeline, setTimeline] = useState<SimulationTimeline>(() => {
    const anchorDateMs = PERSISTED?.simulationDateMs ?? Date.now();
    const tl = createSimulationTimeline(anchorDateMs);
    if (PERSISTED) {
      tl.daysPerSecond = typeof PERSISTED.daysPerSecond === "number" && Number.isFinite(PERSISTED.daysPerSecond)
        ? PERSISTED.daysPerSecond
        : tl.daysPerSecond;
      tl.isPlaying = typeof PERSISTED.isPlaying === "boolean"
        ? PERSISTED.isPlaying
        : tl.isPlaying;
    }
    return tl;
  });
  const fullscreenSupported = document.fullscreenEnabled;
  const hudVisible = useAmbientHud(!levaHidden || isHudHovered || isDropdownOpen);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const state: PersistedState = {
        focusBodyId,
        activeMissionId,
        simulationDateMs: currentSimulationDateMs(timeline, timelineSystemMs()),
        daysPerSecond: timeline.daysPerSecond,
        isPlaying: timeline.isPlaying,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, 500);
    return () => window.clearTimeout(id);
  }, [focusBodyId, activeMissionId, timeline]);

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

  return (
    <div
      ref={viewportRef}
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes hudContentReveal {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes observatoryPanelReveal {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
      `}</style>
      <div
        style={{
          position: "fixed",
          top: "1rem",
          left: "1rem",
          zIndex: 1000,
          display: "grid",
          gap: "0.7rem",
          width: `min(${LEVA_PANEL_WIDTH}, calc(100vw - 2rem))`,
          opacity: hudVisible ? 1 : 0,
          transform: hudVisible ? "translateY(0)" : "translateY(-0.65rem)",
          transition: "opacity 360ms ease, transform 360ms ease",
          pointerEvents: hudVisible ? "auto" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <FocusHudControl
            focusBodyId={focusBodyId}
            activeMissionId={activeMissionId}
            onFocusBodyChange={setFocusBodyId}
            onOpenChange={onFocusOpenChange}
          />
          {activeMissionId && (() => {
            const mission = MISSION_REGISTRY.find((m) => m.id === activeMissionId);
            if (!mission) return null;
            return (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  padding: "0.25rem 0.45rem",
                  borderRadius: "0.4rem",
                  background: "rgba(28, 30, 36, 0.5)",
                  backdropFilter: "blur(12px) saturate(160%)",
                  WebkitBackdropFilter: "blur(12px) saturate(160%)",
                  fontFamily: HUD_FONT_FAMILY,
                }}
              >
                <span
                  style={{
                    fontSize: "0.72rem",
                    letterSpacing: "0.02em",
                    color: HUD_TEXT_MUTED,
                  }}
                >
                  {mission.label}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveMissionId(null);
                    setFocusBodyId(DEFAULT_FOCUS_BODY_ID);
                  }}
                  aria-label={`Dismiss ${mission.label}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "1.1rem",
                    height: "1.1rem",
                    padding: 0,
                    border: "none",
                    borderRadius: "999px",
                    background: "transparent",
                    color: HUD_TEXT_MUTED,
                    cursor: "pointer",
                    fontSize: "0.65rem",
                    lineHeight: 1,
                    transition: "background 150ms ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.15)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  ✕
                </button>
              </div>
            );
          })()}
          <SearchHudControl
            onSelectBody={setFocusBodyId}
            onOpenChange={onSearchOpenChange}
            onSelectMission={(mission) => {
              setFocusBodyId(mission.id);
              if (activeMissionId !== mission.id) {
                setActiveMissionId(mission.id);
                setTimeline((current) => {
                  const systemMs = timelineSystemMs();
                  return rebaseSimulationTimeline(current, {
                    anchorDateMs: Date.parse(mission.launchUtc),
                  }, systemMs);
                });
              }
            }}
          />
        </div>
        <Leva fill hidden={levaHidden} collapsed />
      </div>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 50% 42%, transparent 0%, rgba(0, 0, 0, 0.04) 55%, rgba(0, 0, 0, 0.25) 100%)",
        }}
      />
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
          fontFamily: HUD_FONT_FAMILY,
          opacity: hudVisible ? 1 : 0,
          transform: hudVisible ? "translateY(0)" : "translateY(-0.65rem)",
          transition: "opacity 360ms ease, transform 360ms ease",
          pointerEvents: hudVisible ? "auto" : "none",
        }}
        onMouseEnter={() => {
          setIsHudHovered(true);
        }}
        onMouseLeave={() => {
          setIsHudHovered(false);
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.45rem" }}>
          <TimeHudControl
            timeline={timeline}
            setTimeline={setTimeline}
          />
          <div
            style={{
              display: "grid",
              gap: "0.3rem",
            }}
          >
            <button
              type="button"
              onClick={toggleLeva}
              style={hudIconButtonStyle(!levaHidden)}
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
                style={hudIconButtonStyle(isFullscreen)}
                aria-pressed={isFullscreen}
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                <FullscreenIcon active={isFullscreen} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <ScaleBar cameraDistanceRef={cameraDistanceRef} hudVisible={hudVisible} />
      <Canvas
        gl={createRenderer as NonNullable<CanvasProps["gl"]>}
        camera={{
          position: DEFAULT_CAM_POS,
          fov: CAMERA_FOV,
          near: CAMERA_NEAR,
          far: CAMERA_FAR,
        }}
        style={{ position: "fixed", inset: 0 }}
      >
        <Scene
          focusBodyId={focusBodyId}
          activeMissionId={activeMissionId}
          timeline={timeline}
          cameraDistanceRef={cameraDistanceRef}
        />
      </Canvas>
    </div>
  );
}
