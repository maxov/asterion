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
  FrontSide,
  Group,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { EARTH_RADIUS_KM } from "../lib/constants.ts";
import type { RendererMode } from "../lib/rendererMode.ts";
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
import { createEarthAtmosphereMaterial } from "../shaders/earthAtmosphereMaterial.ts";
import { createEarthAuroraMaterial } from "../shaders/earthAuroraMaterial.ts";
import { createEarthMaterial } from "../shaders/earthMaterial.ts";

const EARTH_RADIUS = kmToUnits(EARTH_RADIUS_KM);
const ATMOSPHERE_SCALE = 1.02;
const CLOUD_LAYER_SCALE = 1.003;
const AURORA_LAYER_SCALE = 1.012;
const FALLBACK_COLOR = "#3f78c7";
const NIGHT_LIGHTS_INTENSITY = 1.15;
const CLOUD_DRIFT_PERIOD_MS = 96 * 3_600_000;
const AURORA_LOOP_MS = 9 * 3_600_000;

type EarthProps = {
  localSunDirection: Vector3;
  rendererMode: RendererMode;
  simulationStateRef: MutableRefObject<SolarSystemState>;
};

export function Earth({ localSunDirection, rendererMode, simulationStateRef }: EarthProps) {
  const timelineRef = useRef(earthTextureTimeline(simulationStateRef.current.dateMs));
  const [monthIndex, setMonthIndex] = useState(timelineRef.current.monthIndex);
  const monthIndexRef = useRef(monthIndex);
  const cloudSpinRef = useRef<Group>(null);
  const currentDayPath = earthDayTexturePathForMonth(monthIndex);
  const nextDayPath = earthDayTexturePathForMonth((monthIndex + 1) % 12);

  const { texture: dayTexture, error: dayError } = usePreparedSharedTexture(
    currentDayPath,
    `earth-day-${monthIndex}`,
    configureSrgbTexture,
  );
  const { texture: nextDayTexture, error: nextDayError } = usePreparedSharedTexture(
    nextDayPath,
    `earth-day-${(monthIndex + 1) % 12}`,
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
  const atmosphereMaterialBundle = useMemo(
    () => (rendererMode === "webgpu" ? createEarthAtmosphereMaterial() : null),
    [rendererMode],
  );
  const auroraMaterialBundle = useMemo(
    () => (rendererMode === "webgpu" ? createEarthAuroraMaterial() : null),
    [rendererMode],
  );

  const earthMaterialBundle = useMemo(() => {
    if (rendererMode !== "webgpu") return null;
    if (!dayTexture || !nightTexture) return null;

    return createEarthMaterial(
      dayTexture,
      nightTexture,
      nextDayTexture ?? null,
      timelineRef.current.blend,
      NIGHT_LIGHTS_INTENSITY,
    );
  }, [dayTexture, nightTexture, nextDayTexture, rendererMode]);

  useEffect(() => {
    monthIndexRef.current = monthIndex;
  }, [monthIndex]);

  useEffect(() => () => fallbackMaterial.dispose(), [fallbackMaterial]);
  useEffect(() => {
    return () => {
      earthMaterialBundle?.material.dispose();
    };
  }, [earthMaterialBundle]);
  useEffect(() => {
    return () => {
      cloudMaterial?.dispose();
    };
  }, [cloudMaterial]);
  useEffect(() => {
    return () => {
      atmosphereMaterialBundle?.material.dispose();
    };
  }, [atmosphereMaterialBundle]);
  useEffect(() => {
    return () => {
      auroraMaterialBundle?.material.dispose();
    };
  }, [auroraMaterialBundle]);

  useEffect(() => {
    if (dayError) {
      console.warn(`Earth: failed to load ${currentDayPath}`, dayError);
    }
  }, [currentDayPath, dayError]);
  useEffect(() => {
    if (nextDayError) {
      console.warn(`Earth: failed to preload ${nextDayPath}`, nextDayError);
    }
  }, [nextDayError, nextDayPath]);
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

    if (earthMaterialBundle) {
      earthMaterialBundle.monthBlendUniform.value = timeline.blend;
      earthMaterialBundle.sunDirectionUniform.value
        .copy(localSunDirection)
        .normalize();
    }
    atmosphereMaterialBundle?.sunDirectionUniform.value
      .copy(localSunDirection)
      .normalize();
    if (auroraMaterialBundle) {
      auroraMaterialBundle.sunDirectionUniform.value.copy(localSunDirection).normalize();
      auroraMaterialBundle.phaseUniform.value =
        (((simulationDateMs % AURORA_LOOP_MS) + AURORA_LOOP_MS) % AURORA_LOOP_MS) /
        AURORA_LOOP_MS;
    }

    if (cloudSpinRef.current) {
      const cloudPhase =
        ((simulationDateMs % CLOUD_DRIFT_PERIOD_MS) + CLOUD_DRIFT_PERIOD_MS) %
        CLOUD_DRIFT_PERIOD_MS;
      cloudSpinRef.current.rotation.y =
        (cloudPhase / CLOUD_DRIFT_PERIOD_MS) * Math.PI * 2;
    }
  });

  return (
    <>
      <mesh material={earthMaterialBundle?.material ?? fallbackMaterial}>
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
      {auroraMaterialBundle ? (
        <mesh
          material={auroraMaterialBundle.material}
          renderOrder={2}
          scale={[AURORA_LAYER_SCALE, AURORA_LAYER_SCALE, AURORA_LAYER_SCALE]}
        >
          <sphereGeometry args={[EARTH_RADIUS, 96, 48]} />
        </mesh>
      ) : null}
      {atmosphereMaterialBundle ? (
        <mesh
          material={atmosphereMaterialBundle.material}
          renderOrder={3}
          scale={[ATMOSPHERE_SCALE, ATMOSPHERE_SCALE, ATMOSPHERE_SCALE]}
        >
          <sphereGeometry args={[EARTH_RADIUS, 96, 48]} />
        </mesh>
      ) : null}
    </>
  );
}
