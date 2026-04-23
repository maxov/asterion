import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Mesh, Vector3 } from "three";
import { MOON_RADIUS_KM } from "../lib/constants.ts";
import { MISSION_BLOOM_LAYER } from "../lib/renderLayers.ts";
import {
  configureDataTexture,
  configureSrgbTexture,
  MOON_ALBEDO_TEXTURE_PATH,
  MOON_HEIGHT_DISPLACEMENT_BIAS_KM,
  MOON_HEIGHT_DISPLACEMENT_SCALE_KM,
  MOON_HEIGHT_TEXTURE_PATH,
} from "../lib/planetTextures.ts";
import type { SolarSystemState } from "../lib/solarSystemState.ts";
import { kmToUnits } from "../lib/units.ts";
import { usePreparedSharedTexture } from "../lib/useSharedTexture.ts";
import { createMoonMaterial } from "../shaders/moonMaterial.ts";

const MOON_RADIUS = kmToUnits(MOON_RADIUS_KM);
const MOON_DISPLACEMENT_BIAS = kmToUnits(MOON_HEIGHT_DISPLACEMENT_BIAS_KM);
const MOON_DISPLACEMENT_SCALE = kmToUnits(MOON_HEIGHT_DISPLACEMENT_SCALE_KM);
const MOON_WIDTH_SEGMENTS = 512;
const MOON_HEIGHT_SEGMENTS = 256;
const MEAN_EARTH_MOON_DISTANCE_KM = 384_400;
const BASE_EARTHSHINE_STRENGTH = 0.04;
const MISSION_BLOOM_OCCLUDER_SCALE = 1.01;

type MoonProps = {
  simulationStateRef: MutableRefObject<SolarSystemState>;
};

export function Moon({ simulationStateRef }: MoonProps) {
  const earthDirectionRef = useRef(new Vector3());
  const moonOccluderRef = useRef<Mesh>(null);
  const { texture: albedoTexture, error: albedoError } = usePreparedSharedTexture(
    MOON_ALBEDO_TEXTURE_PATH,
    "moon-albedo",
    configureSrgbTexture,
  );
  const { texture: heightTexture, error: heightError } = usePreparedSharedTexture(
    MOON_HEIGHT_TEXTURE_PATH,
    "moon-height",
    configureDataTexture,
  );
  const moonMaterialBundle = useMemo(() => {
    if (!albedoTexture || !heightTexture) return null;

    return createMoonMaterial(
      albedoTexture,
      heightTexture,
      MOON_DISPLACEMENT_SCALE,
      MOON_DISPLACEMENT_BIAS,
    );
  }, [albedoTexture, heightTexture]);

  useEffect(() => {
    if (albedoError) {
      console.warn(`Moon: failed to load ${MOON_ALBEDO_TEXTURE_PATH}`, albedoError);
    }
  }, [albedoError]);

  useEffect(() => {
    if (heightError) {
      console.warn(`Moon: failed to load ${MOON_HEIGHT_TEXTURE_PATH}`, heightError);
    }
  }, [heightError]);
  useEffect(() => {
    return () => {
      moonMaterialBundle?.material.dispose();
    };
  }, [moonMaterialBundle]);

  useEffect(() => {
    moonOccluderRef.current?.layers.disableAll();
    moonOccluderRef.current?.layers.enable(MISSION_BLOOM_LAYER);
  }, []);

  useFrame(() => {
    if (!moonMaterialBundle) return;

    const simulation = simulationStateRef.current;
    const earth = simulation.bodies.earth;
    const moon = simulation.bodies.moon;
    const earthDistanceKm = Math.max(
      earthDirectionRef.current
        .copy(earth.physicalPositionKm)
        .sub(moon.physicalPositionKm)
        .length(),
      1,
    );

    moonMaterialBundle.sunDirectionUniform.value
      .copy(moon.sunDirectionWorld)
      .normalize();
    moonMaterialBundle.earthDirectionUniform.value
      .copy(earthDirectionRef.current)
      .normalize();
    moonMaterialBundle.earthshineStrengthUniform.value =
      BASE_EARTHSHINE_STRENGTH *
      (MEAN_EARTH_MOON_DISTANCE_KM * MEAN_EARTH_MOON_DISTANCE_KM) /
      (earthDistanceKm * earthDistanceKm);
  });

  return (
    <>
      <mesh material={moonMaterialBundle?.material}>
        <sphereGeometry
          args={[MOON_RADIUS, MOON_WIDTH_SEGMENTS, MOON_HEIGHT_SEGMENTS]}
        />
        {moonMaterialBundle ? null : (
          <meshStandardMaterial
            color="#c4c1ba"
            displacementBias={heightTexture ? MOON_DISPLACEMENT_BIAS : 0}
            displacementMap={heightTexture ?? undefined}
            displacementScale={heightTexture ? MOON_DISPLACEMENT_SCALE : 0}
            map={albedoTexture ?? undefined}
            roughness={0.95}
            metalness={0}
          />
        )}
      </mesh>
      <mesh
        ref={moonOccluderRef}
        scale={[
          MISSION_BLOOM_OCCLUDER_SCALE,
          MISSION_BLOOM_OCCLUDER_SCALE,
          MISSION_BLOOM_OCCLUDER_SCALE,
        ]}
      >
        <sphereGeometry
          args={[MOON_RADIUS, MOON_WIDTH_SEGMENTS, MOON_HEIGHT_SEGMENTS]}
        />
        <meshBasicMaterial colorWrite={false} toneMapped={false} />
      </mesh>
    </>
  );
}
