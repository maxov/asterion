import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Canvas } from "@react-three/fiber";
import { Leva } from "leva";
import { ACESFilmicToneMapping, SRGBColorSpace } from "three";
import { Scene } from "./Scene/Scene.tsx";
import {
  BODY_DEFINITIONS,
  DEFAULT_FOCUS_BODY_ID,
  type BodyId,
} from "./lib/bodies.ts";
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
  formatLocalDateTimeInputValue,
  parseLocalDateTimeInputValue,
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
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const HUD_IDLE_MS = 1_200;
const LEVA_PANEL_WIDTH = "20rem";
const HUD_HOT_CORNER_WIDTH = 128;
const HUD_HOT_CORNER_HEIGHT = 96;
const HUD_FONT_FAMILY =
  '"JetBrains Mono", "SF Mono", "Fira Code", monospace';
const HUD_MONO_FAMILY =
  '"JetBrains Mono", "SF Mono", "Fira Code", monospace';
const HUD_TEXT_MUTED = "rgba(245, 247, 250, 0.6)";
const HUD_TEXT_ACTIVE = "rgba(245, 247, 250, 0.95)";
const HUD_TEXT_SUBTLE = "rgba(208, 216, 227, 0.5)";
const FOCUS_BODY_OPTIONS = Object.values(BODY_DEFINITIONS);
const TIME_RATE_PRESETS = [
  { label: "Realtime", daysPerSecond: REALTIME_DAYS_PER_SECOND },
  { label: "1h/s", daysPerSecond: 1 / 24 },
  { label: "1d/s", daysPerSecond: 1 },
  { label: "10d/s", daysPerSecond: 10 },
  { label: "-1d/s", daysPerSecond: -1 },
] as const;

type TimeHudControlProps = {
  open: boolean;
  onOpenChange: Dispatch<SetStateAction<boolean>>;
  timeline: SimulationTimeline;
  setTimeline: Dispatch<SetStateAction<SimulationTimeline>>;
};

type FocusHudControlProps = {
  focusBodyId: BodyId;
  onFocusBodyChange: (focusBodyId: BodyId) => void;
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

function hudChipButtonStyle(active = false, disabled = false): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "1.9rem",
    padding: "0 0.7rem",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "999px",
    background: active ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.04)",
    color: active ? HUD_TEXT_ACTIVE : HUD_TEXT_MUTED,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: HUD_FONT_FAMILY,
    fontSize: "0.68rem",
    fontWeight: 400,
    letterSpacing: "0.02em",
    opacity: disabled ? 0.4 : 1,
    transition: "background 180ms ease, color 180ms ease, opacity 180ms ease",
  };
}

function matchesRate(a: number, b: number) {
  return Math.abs(a - b) < 1e-6;
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

function formatPlaybackStatus(timeline: SimulationTimeline): string | null {
  if (!timeline.isPlaying) return "Paused";
  if (matchesRate(timeline.daysPerSecond, REALTIME_DAYS_PER_SECOND)) {
    return null;
  }

  const absDaysPerSecond = Math.abs(timeline.daysPerSecond);
  const direction = timeline.daysPerSecond < 0 ? "backward" : "forward";
  if (absDaysPerSecond < 1) {
    return `Running ${direction} at ${(absDaysPerSecond * 24).toFixed(1)} h/s`;
  }

  return `Running ${direction} at ${absDaysPerSecond.toFixed(absDaysPerSecond < 10 ? 1 : 0)} d/s`;
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
  onFocusBodyChange,
}: FocusHudControlProps) {
  const [open, setOpen] = useState(false);
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

  const currentLabel =
    FOCUS_BODY_OPTIONS.find((b) => b.id === focusBodyId)?.label ?? focusBodyId;

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
      style={{
        ...hudSurfaceStyle("0.6rem", visible),
        fontFamily: HUD_FONT_FAMILY,
        color: HUD_TEXT_ACTIVE,
        minWidth: mounted ? "10rem" : undefined,
        display: "grid",
        gap: "0.1rem",
      }}
    >
      {trigger}
      {mounted && (
        <div
          style={{
            display: "grid",
            gap: "0.1rem",
            opacity: visible ? 1 : 0,
            transition: `opacity ${HUD_FADE_MS}ms ease`,
          }}
        >
          {FOCUS_BODY_OPTIONS.map((body) => {
            const selected = body.id === focusBodyId;
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
          <div style={{ height: "0.15rem" }} />
        </div>
      )}
    </div>
  );
}

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
        fontFamily: HUD_FONT_FAMILY,
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

function TimeHudControl({
  open,
  onOpenChange,
  timeline,
  setTimeline,
}: TimeHudControlProps) {
  const { mounted, visible } = useDeferredOpen(open);
  const [displaySystemMs, setDisplaySystemMs] = useState(() => timelineSystemMs());
  const [isEditingTime, setIsEditingTime] = useState(false);
  const currentDateMs = currentSimulationDateMs(timeline, displaySystemMs);
  const [timeDraft, setTimeDraft] = useState(() =>
    formatLocalDateTimeInputValue(currentDateMs),
  );
  const isDraftValid = parseLocalDateTimeInputValue(timeDraft) !== null;
  const timeInputValue = isEditingTime
    ? timeDraft
    : formatLocalDateTimeInputValue(currentDateMs);
  const playbackStatus = formatPlaybackStatus(timeline);
  const heroTime = formatHudClockTime(currentDateMs);
  const heroDate = formatHudCalendarDate(currentDateMs);

  const updateTimeline = useCallback(
    (updates: Partial<Omit<SimulationTimeline, "anchorSystemMs">>) => {
      setTimeline((current) =>
        rebaseSimulationTimeline(current, updates, timelineSystemMs()),
      );
    },
    [setTimeline],
  );

  const shiftTimeline = useCallback(
    (deltaMs: number) => {
      setTimeline((current) => {
        const systemMs = timelineSystemMs();
        return rebaseSimulationTimeline(
          current,
          {
            anchorDateMs: currentSimulationDateMs(current, systemMs) + deltaMs,
          },
          systemMs,
        );
      });
    },
    [setTimeline],
  );

  const applyDraftTime = useCallback(() => {
    const parsed = parseLocalDateTimeInputValue(timeDraft);
    if (parsed === null) return;

    updateTimeline({ anchorDateMs: parsed });
    setIsEditingTime(false);
  }, [timeDraft, updateTimeline]);

  const togglePlayback = useCallback(() => {
    setTimeline((current) =>
      rebaseSimulationTimeline(
        current,
        { isPlaying: !current.isPlaying },
        timelineSystemMs(),
      ),
    );
  }, [setTimeline]);

  const jumpToNow = useCallback(() => {
    updateTimeline({
      anchorDateMs: Date.now(),
      daysPerSecond: REALTIME_DAYS_PER_SECOND,
      isPlaying: true,
    });
  }, [updateTimeline]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setDisplaySystemMs(timelineSystemMs());
    }, 250);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const trigger = (
    <button
      type="button"
      onClick={() => {
        onOpenChange((v) => !v);
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4rem",
        padding: "0.4rem 0.1rem",
        background: "none",
        border: "none",
        color: open ? HUD_TEXT_ACTIVE : HUD_TEXT_MUTED,
        cursor: "pointer",
        fontFamily: HUD_FONT_FAMILY,
        textAlign: "right",
        transition: "color 180ms ease",
      }}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label="Toggle time controls"
      title="Open time controls"
    >
      <div style={{ display: "grid", gap: "0.1rem" }}>
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
          {heroDate}{playbackStatus ? ` · ${playbackStatus}` : ""}
        </span>
      </div>
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
          flexShrink: 0,
        }}
      >
        ▸
      </span>
    </button>
  );

  return (
    <div
      style={{
        ...hudSurfaceStyle("0.75rem", visible),
        width: mounted ? "min(22rem, calc(100vw - 2rem))" : undefined,
        display: "grid",
        color: HUD_TEXT_ACTIVE,
        fontFamily: HUD_FONT_FAMILY,
      }}
    >
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        {trigger}
      </div>

      {mounted && (
        <div
          style={{
            display: "grid",
            gap: "0.7rem",
            opacity: visible ? 1 : 0,
            transition: `opacity ${HUD_FADE_MS}ms ease`,
            padding: "0.7rem 0.85rem 0.85rem",
          }}
        >
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={togglePlayback}
              style={hudChipButtonStyle(timeline.isPlaying)}
            >
              {timeline.isPlaying ? "Pause" : "Resume"}
            </button>
            <button
              type="button"
              onClick={jumpToNow}
              style={hudChipButtonStyle(false)}
            >
              Now
            </button>
            {TIME_RATE_PRESETS.map((preset) => {
              const active =
                timeline.isPlaying &&
                matchesRate(timeline.daysPerSecond, preset.daysPerSecond);

              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    updateTimeline({
                      daysPerSecond: preset.daysPerSecond,
                      isPlaying: true,
                    });
                  }}
                  style={hudChipButtonStyle(active)}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                shiftTimeline(-7 * DAY_MS);
              }}
              style={hudChipButtonStyle(false)}
            >
              -1w
            </button>
            <button
              type="button"
              onClick={() => {
                shiftTimeline(-DAY_MS);
              }}
              style={hudChipButtonStyle(false)}
            >
              -1d
            </button>
            <button
              type="button"
              onClick={() => {
                shiftTimeline(-HOUR_MS);
              }}
              style={hudChipButtonStyle(false)}
            >
              -1h
            </button>
            <button
              type="button"
              onClick={() => {
                shiftTimeline(HOUR_MS);
              }}
              style={hudChipButtonStyle(false)}
            >
              +1h
            </button>
            <button
              type="button"
              onClick={() => {
                shiftTimeline(DAY_MS);
              }}
              style={hudChipButtonStyle(false)}
            >
              +1d
            </button>
            <button
              type="button"
              onClick={() => {
                shiftTimeline(7 * DAY_MS);
              }}
              style={hudChipButtonStyle(false)}
            >
              +1w
            </button>
          </div>

          <div style={{ display: "flex", gap: "0.4rem" }}>
            <input
              type="datetime-local"
              step={1}
              value={timeInputValue}
              onChange={(event) => {
                setTimeDraft(event.target.value);
              }}
              onFocus={() => {
                setTimeDraft(formatLocalDateTimeInputValue(currentDateMs));
                setIsEditingTime(true);
              }}
              onBlur={() => {
                setIsEditingTime(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  applyDraftTime();
                }
              }}
              style={{
                flex: 1,
                minWidth: 0,
                height: "2.1rem",
                padding: "0 0.65rem",
                borderRadius: "0.6rem",
                border: isDraftValid
                  ? "1px solid rgba(255, 255, 255, 0.08)"
                  : "1px solid rgba(255, 117, 117, 0.5)",
                background: "rgba(255, 255, 255, 0.04)",
                color: HUD_TEXT_ACTIVE,
                colorScheme: "dark",
                fontFamily: HUD_MONO_FAMILY,
                fontSize: "0.72rem",
                letterSpacing: "0.03em",
                fontVariantNumeric: "tabular-nums",
              }}
              aria-label="Set local time"
            />
            <button
              type="button"
              onClick={applyDraftTime}
              disabled={!isDraftValid}
              style={hudChipButtonStyle(false, !isDraftValid)}
            >
              Apply
            </button>
          </div>
        </div>
      )}
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
  const [isTimePanelOpen, setIsTimePanelOpen] = useState(false);
  const [focusBodyId, setFocusBodyId] =
    useState<BodyId>(DEFAULT_FOCUS_BODY_ID);
  const [timeline, setTimeline] = useState<SimulationTimeline>(() =>
    createSimulationTimeline(),
  );
  const fullscreenSupported = document.fullscreenEnabled;
  const hudVisible = useAmbientHud(!levaHidden || isHudHovered || isTimePanelOpen);

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
        <FocusHudControl
          focusBodyId={focusBodyId}
          onFocusBodyChange={setFocusBodyId}
        />
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
            open={isTimePanelOpen}
            onOpenChange={setIsTimePanelOpen}
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
        <Scene focusBodyId={focusBodyId} timeline={timeline} />
      </Canvas>
    </div>
  );
}
