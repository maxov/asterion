import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  FrontSide,
  Group,
  LinearFilter,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import { EARTH_RADIUS_KM } from "../lib/constants.ts";
import type { SolarSystemState } from "../lib/solarSystemState.ts";
import { kmToUnits } from "../lib/units.ts";
import {
  EARTH_CLOUD_TEXTURE_PATH,
  configureSrgbTexture,
  EARTH_NIGHT_TEXTURE_PATH,
  earthDayTexturePathForMonth,
  earthTextureTimeline,
} from "../lib/planetTextures.ts";
import { usePreparedSharedTexture } from "../lib/useSharedTexture.ts";

const EARTH_RADIUS = kmToUnits(EARTH_RADIUS_KM);
const ATMOSPHERE_SCALE = 1.02;
const CLOUD_LAYER_SCALE = 1.003;
const AURORA_LAYER_SCALE = 1.012;
const FALLBACK_COLOR = "#3f78c7";
const NIGHT_LIGHTS_INTENSITY = 1.15;
const CLOUD_DRIFT_PERIOD_MS = 96 * 3_600_000;
const AURORA_LOOP_MS = 9 * 3_600_000;
const EARTH_ATMOSPHERE_COLOR = new Color("#66a9ff");
const AURORA_BASE_COLOR = new Color("#80ffd7");

type EarthProps = {
  localSunDirection: Vector3;
  simulationStateRef: MutableRefObject<SolarSystemState>;
};

function createAuroraTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "lighter";

  const paintHemisphere = (centerY: number, direction: 1 | -1, hueOffset: number) => {
    for (let i = 0; i < 42; i += 1) {
      const x = (i / 41) * canvas.width;
      const wave = Math.sin(i * 0.72 + hueOffset) * 18;
      const stripeWidth = canvas.width / 16;
      const stripeHeight = 40 + (i % 5) * 7;
      const y = centerY + direction * (wave + Math.cos(i * 0.33) * 8);
      const gradient = context.createLinearGradient(
        x,
        y - stripeHeight,
        x,
        y + stripeHeight,
      );
      gradient.addColorStop(0, "rgba(0,0,0,0)");
      gradient.addColorStop(0.18, "rgba(20,255,148,0.0)");
      gradient.addColorStop(0.36, "rgba(24,255,148,0.34)");
      gradient.addColorStop(0.55, "rgba(120,255,238,0.9)");
      gradient.addColorStop(0.72, "rgba(116,140,255,0.28)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = gradient;
      context.fillRect(
        x - stripeWidth / 2,
        y - stripeHeight,
        stripeWidth,
        stripeHeight * 2,
      );
    }
  };

  paintHemisphere(canvas.height * 0.17, 1, 0.2);
  paintHemisphere(canvas.height * 0.83, -1, 1.4);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

export function Earth({ localSunDirection, simulationStateRef }: EarthProps) {
  void localSunDirection;
  const timelineRef = useRef(earthTextureTimeline(simulationStateRef.current.dateMs));
  const [monthIndex, setMonthIndex] = useState(timelineRef.current.monthIndex);
  const monthIndexRef = useRef(monthIndex);
  const cloudSpinRef = useRef<Group>(null);
  const auroraSpinRef = useRef<Group>(null);
  const currentDayPath = earthDayTexturePathForMonth(monthIndex);

  const { texture: dayTexture, error: dayError } = usePreparedSharedTexture(
    currentDayPath,
    `earth-day-${monthIndex}`,
    configureSrgbTexture,
  );
  const { texture: nightTexture, error: nightError } = usePreparedSharedTexture(
    EARTH_NIGHT_TEXTURE_PATH,
    "earth-night-2016",
    configureSrgbTexture,
  );
  const { texture: cloudTexture, error: cloudError } = usePreparedSharedTexture(
    EARTH_CLOUD_TEXTURE_PATH,
    "earth-clouds-svs",
    configureSrgbTexture,
  );

  const fallbackMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: FALLBACK_COLOR,
        roughness: 0.9,
        metalness: 0,
      }),
    [],
  );
  const earthMaterial = useMemo(() => {
    if (!dayTexture) return null;

    return new MeshStandardMaterial({
      map: dayTexture,
      emissive: new Color(1, 1, 1),
      emissiveMap: nightTexture ?? null,
      emissiveIntensity: nightTexture ? NIGHT_LIGHTS_INTENSITY * 0.18 : 0,
      roughness: 0.92,
      metalness: 0,
    });
  }, [dayTexture, nightTexture]);
  const cloudMaterial = useMemo(() => {
    if (!cloudTexture) return null;

    return new MeshPhysicalMaterial({
      alphaMap: cloudTexture,
      map: cloudTexture,
      transparent: true,
      opacity: 0.62,
      alphaTest: 0.04,
      depthWrite: false,
      side: FrontSide,
      roughness: 0.92,
      metalness: 0,
    });
  }, [cloudTexture]);
  const atmosphereMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: EARTH_ATMOSPHERE_COLOR,
        transparent: true,
        opacity: 0.34,
        side: BackSide,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [],
  );
  const auroraTexture = useMemo(
    () => createAuroraTexture(),
    [],
  );
  const auroraMaterial = useMemo(() => {
    if (!auroraTexture) return null;

    return new MeshBasicMaterial({
      color: AURORA_BASE_COLOR,
      map: auroraTexture,
      transparent: true,
      opacity: 0.9,
      side: FrontSide,
      depthWrite: false,
      blending: AdditiveBlending,
    });
  }, [auroraTexture]);

  useEffect(() => {
    monthIndexRef.current = monthIndex;
  }, [monthIndex]);

  useEffect(() => () => fallbackMaterial.dispose(), [fallbackMaterial]);
  useEffect(() => {
    return () => {
      earthMaterial?.dispose();
    };
  }, [earthMaterial]);
  useEffect(() => {
    return () => {
      cloudMaterial?.dispose();
    };
  }, [cloudMaterial]);
  useEffect(() => {
    return () => atmosphereMaterial.dispose();
  }, [atmosphereMaterial]);
  useEffect(() => {
    return () => {
      auroraMaterial?.dispose();
      auroraTexture?.dispose();
    };
  }, [auroraMaterial, auroraTexture]);

  useEffect(() => {
    if (dayError) {
      console.warn(`Earth: failed to load ${currentDayPath}`, dayError);
    }
  }, [currentDayPath, dayError]);
  useEffect(() => {
    if (nightError) {
      console.warn(
        `Earth: failed to load ${EARTH_NIGHT_TEXTURE_PATH}`,
        nightError,
      );
    }
  }, [nightError]);
  useEffect(() => {
    if (cloudError) {
      console.warn(`Earth: failed to load ${EARTH_CLOUD_TEXTURE_PATH}`, cloudError);
    }
  }, [cloudError]);

  useFrame(() => {
    const simulationDateMs = simulationStateRef.current.dateMs;
    const timeline = earthTextureTimeline(simulationDateMs);
    timelineRef.current = timeline;

    if (timeline.monthIndex !== monthIndexRef.current) {
      monthIndexRef.current = timeline.monthIndex;
      startTransition(() => {
        setMonthIndex(timeline.monthIndex);
      });
    }

    if (cloudSpinRef.current) {
      const cloudPhase =
        ((simulationDateMs % CLOUD_DRIFT_PERIOD_MS) + CLOUD_DRIFT_PERIOD_MS) %
        CLOUD_DRIFT_PERIOD_MS;
      cloudSpinRef.current.rotation.y =
        (cloudPhase / CLOUD_DRIFT_PERIOD_MS) * Math.PI * 2;
    }

    if (auroraSpinRef.current) {
      const auroraPhase =
        (((simulationDateMs % AURORA_LOOP_MS) + AURORA_LOOP_MS) % AURORA_LOOP_MS) /
        AURORA_LOOP_MS;
      auroraSpinRef.current.rotation.y = auroraPhase * Math.PI * 2;
    }
  });

  return (
    <>
      <mesh material={earthMaterial ?? fallbackMaterial}>
        <sphereGeometry args={[EARTH_RADIUS, 128, 64]} />
      </mesh>
      {cloudMaterial ? (
        <group ref={cloudSpinRef}>
          <mesh
            material={cloudMaterial}
            renderOrder={1}
            scale={[CLOUD_LAYER_SCALE, CLOUD_LAYER_SCALE, CLOUD_LAYER_SCALE]}
          >
            <sphereGeometry args={[EARTH_RADIUS, 96, 48]} />
          </mesh>
        </group>
      ) : null}
      {auroraMaterial ? (
        <group
          ref={auroraSpinRef}
          renderOrder={2}
          scale={[AURORA_LAYER_SCALE, AURORA_LAYER_SCALE, AURORA_LAYER_SCALE]}
        >
          <mesh material={auroraMaterial}>
            <sphereGeometry args={[EARTH_RADIUS, 96, 48]} />
          </mesh>
        </group>
      ) : null}
      {atmosphereMaterial ? (
        <mesh
          material={atmosphereMaterial}
          renderOrder={3}
          scale={[ATMOSPHERE_SCALE, ATMOSPHERE_SCALE, ATMOSPHERE_SCALE]}
        >
          <sphereGeometry args={[EARTH_RADIUS, 96, 48]} />
        </mesh>
      ) : null}
    </>
  );
}
