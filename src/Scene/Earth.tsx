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
  MeshStandardMaterial,
  Vector3,
} from "three";
import { EARTH_RADIUS_KM } from "../lib/constants.ts";
import type { SolarSystemState } from "../lib/solarSystemState.ts";
import { kmToUnits } from "../lib/units.ts";
import {
  configureSrgbTexture,
  EARTH_NIGHT_TEXTURE_PATH,
  earthDayTexturePathForMonth,
  earthTextureTimeline,
} from "../lib/planetTextures.ts";
import { usePreparedSharedTexture } from "../lib/useSharedTexture.ts";
import { createEarthMaterial } from "../shaders/earthMaterial.ts";

const EARTH_RADIUS = kmToUnits(EARTH_RADIUS_KM);
const ATMOSPHERE_SCALE = 1.035;
const FALLBACK_COLOR = "#3f78c7";
const NIGHT_LIGHTS_INTENSITY = 1.65;

type EarthProps = {
  localSunDirection: Vector3;
  simulationStateRef: MutableRefObject<SolarSystemState>;
};

export function Earth({ localSunDirection, simulationStateRef }: EarthProps) {
  const timelineRef = useRef(earthTextureTimeline(simulationStateRef.current.dateMs));
  const [monthIndex, setMonthIndex] = useState(timelineRef.current.monthIndex);
  const monthIndexRef = useRef(monthIndex);
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

  const fallbackMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: FALLBACK_COLOR,
        roughness: 0.9,
        metalness: 0,
      }),
    [],
  );

  const earthMaterialBundle = useMemo(() => {
    if (!dayTexture || !nightTexture) return null;

    return createEarthMaterial(
      dayTexture,
      nightTexture,
      nextDayTexture ?? null,
      timelineRef.current.blend,
      NIGHT_LIGHTS_INTENSITY,
    );
  }, [dayTexture, nightTexture, nextDayTexture]);

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

  useFrame(() => {
    const timeline = earthTextureTimeline(simulationStateRef.current.dateMs);
    timelineRef.current = timeline;

    if (timeline.monthIndex !== monthIndexRef.current) {
      monthIndexRef.current = timeline.monthIndex;
      startTransition(() => {
        setMonthIndex(timeline.monthIndex);
      });
    }

    if (!earthMaterialBundle) return;

    earthMaterialBundle.monthBlendUniform.value = timeline.blend;
    earthMaterialBundle.sunDirectionUniform.value
      .copy(localSunDirection)
      .normalize();
  });

  return (
    <>
      <mesh material={earthMaterialBundle?.material ?? fallbackMaterial}>
        <sphereGeometry args={[EARTH_RADIUS, 64, 32]} />
      </mesh>
      <mesh scale={[ATMOSPHERE_SCALE, ATMOSPHERE_SCALE, ATMOSPHERE_SCALE]}>
        <sphereGeometry args={[EARTH_RADIUS, 48, 24]} />
        <meshBasicMaterial
          color="#86c8ff"
          transparent
          opacity={0.22}
          blending={AdditiveBlending}
          side={BackSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </>
  );
}
