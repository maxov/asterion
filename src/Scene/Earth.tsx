import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { folder, useControls } from "leva";
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
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector3,
  type Mesh,
} from "three";
import { EARTH_RADIUS_KM } from "../lib/constants.ts";
import { MISSION_BLOOM_LAYER } from "../lib/renderLayers.ts";
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
import {
  createEarthAtmosphereMaterial,
  EARTH_ATMOSPHERE_DEBUG_VIEW_IDS,
  type EarthAtmosphereDebugView,
} from "../shaders/earthAtmosphereMaterial.ts";
import { createEarthCloudMaterial } from "../shaders/earthCloudMaterial.ts";
import {
  createEarthAuroraMaterial,
  EARTH_AURORA_DEBUG_VIEW_IDS,
  type EarthAuroraDebugView,
} from "../shaders/earthAuroraMaterial.ts";
import {
  createEarthMaterial,
  EARTH_SURFACE_DEBUG_VIEW_IDS,
  type EarthSurfaceDebugView,
} from "../shaders/earthMaterial.ts";

const EARTH_RADIUS = kmToUnits(EARTH_RADIUS_KM);
const ATMOSPHERE_SCALE = 1.02;
const CLOUD_LAYER_SCALE = 1.003;
const AURORA_LAYER_SCALE = 1.012;
const MISSION_BLOOM_OCCLUDER_SCALE = 1.03;
const FALLBACK_COLOR = "#3f78c7";
const NIGHT_LIGHTS_INTENSITY = 1.15;
const CLOUD_DRIFT_PERIOD_MS = 96 * 3_600_000;
const AURORA_LOOP_MS = 9 * 3_600_000;
const EARTH_ATMOSPHERE_COLOR = new Color("#66a9ff");
const AURORA_BASE_COLOR = new Color("#80ffd7");
const DEFAULT_CUSTOM_NIGHT_LIGHTS = 0.98;
const DEFAULT_CUSTOM_ATMOSPHERE_INTENSITY = 0.8;
const DEFAULT_CUSTOM_ATMOSPHERE_POWER = 4.8;
const DEFAULT_CUSTOM_AURORA_INTENSITY = 0.82;
const AURORA_SCREEN_DIAMETER_FADE_START = 0.16;
const AURORA_SCREEN_DIAMETER_FADE_END = 0.34;
const CITY_LIGHTS_SCREEN_DIAMETER_FADE_START = 0.07;
const CITY_LIGHTS_SCREEN_DIAMETER_FADE_END = 0.24;
const SURFACE_MODE_OPTIONS = {
  Standard: "standard",
  Custom: "custom",
} as const;
const SHELL_MODE_OPTIONS = {
  Off: "off",
  Basic: "basic",
  Custom: "custom",
} as const;
const SURFACE_DEBUG_OPTIONS: Record<string, EarthSurfaceDebugView> = {
  Beauty: "beauty",
  DayTexture: "dayTexture",
  NightTexture: "nightTexture",
  BlendFactor: "blendFactor",
  SunAlignment: "sunAlignment",
  WaterMask: "waterMask",
  CityLights: "cityLights",
  Specular: "specular",
};
const ATMOSPHERE_DEBUG_OPTIONS: Record<string, EarthAtmosphereDebugView> = {
  Beauty: "beauty",
  Fresnel: "fresnel",
  Daylight: "daylight",
  Twilight: "twilight",
  SunAlignment: "sunAlignment",
  Opacity: "opacity",
};
const AURORA_DEBUG_OPTIONS: Record<string, EarthAuroraDebugView> = {
  Beauty: "beauty",
  PolarMask: "polarMask",
  RibbonMask: "ribbonMask",
  IlluminationMask: "illuminationMask",
  ViewMask: "viewMask",
  AuroraMask: "auroraMask",
};

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
  const camera = useThree((state) => state.camera);
  const {
    customNightLights,
    customAtmosphereIntensity,
    customAtmospherePower,
    customAuroraIntensity,
    surfaceMode,
    surfaceDebugView,
    atmosphereMode,
    atmosphereDebugView,
    auroraMode,
    auroraDebugView,
  } = useControls(
    "Earth",
    {
      Look: folder({
        customNightLights: {
          value: DEFAULT_CUSTOM_NIGHT_LIGHTS,
          min: 0,
          max: 2.5,
          step: 0.01,
          label: "Night Lights",
        },
        customAtmosphereIntensity: {
          value: DEFAULT_CUSTOM_ATMOSPHERE_INTENSITY,
          min: 0,
          max: 1.5,
          step: 0.01,
          label: "Atmo Intensity",
        },
        customAtmospherePower: {
          value: DEFAULT_CUSTOM_ATMOSPHERE_POWER,
          min: 1,
          max: 10,
          step: 0.1,
          label: "Atmo Power",
        },
        customAuroraIntensity: {
          value: DEFAULT_CUSTOM_AURORA_INTENSITY,
          min: 0,
          max: 2.5,
          step: 0.01,
          label: "Aurora Intensity",
        },
      }),
      Debug: folder(
        {
          surfaceMode: {
            value: SURFACE_MODE_OPTIONS.Custom,
            options: SURFACE_MODE_OPTIONS,
            label: "Surface Mode",
          },
          surfaceDebugView: {
            value: SURFACE_DEBUG_OPTIONS.Beauty,
            options: SURFACE_DEBUG_OPTIONS,
            label: "Surface View",
          },
          atmosphereMode: {
            value: SHELL_MODE_OPTIONS.Custom,
            options: SHELL_MODE_OPTIONS,
            label: "Atmosphere Mode",
          },
          atmosphereDebugView: {
            value: ATMOSPHERE_DEBUG_OPTIONS.Beauty,
            options: ATMOSPHERE_DEBUG_OPTIONS,
            label: "Atmosphere View",
          },
          auroraMode: {
            value: SHELL_MODE_OPTIONS.Custom,
            options: SHELL_MODE_OPTIONS,
            label: "Aurora Mode",
          },
          auroraDebugView: {
            value: AURORA_DEBUG_OPTIONS.Beauty,
            options: AURORA_DEBUG_OPTIONS,
            label: "Aurora View",
          },
        },
        { collapsed: true },
      ),
    },
    { collapsed: false },
  );
  const timelineRef = useRef(earthTextureTimeline(simulationStateRef.current.dateMs));
  const [monthIndex, setMonthIndex] = useState(timelineRef.current.monthIndex);
  const monthIndexRef = useRef(monthIndex);
  const surfaceMeshRef = useRef<Mesh>(null);
  const surfaceOccluderRef = useRef<Mesh>(null);
  const cloudSpinRef = useRef<Group>(null);
  const auroraSpinRef = useRef<Group>(null);
  const earthWorldPositionRef = useRef(new Vector3());
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
  const customEarthMaterialBundle = useMemo(() => {
    if (!dayTexture || !nightTexture) return null;

    return createEarthMaterial(
      dayTexture,
      nightTexture,
      nextDayTexture ?? null,
      timelineRef.current.blend,
      customNightLights,
    );
  }, [customNightLights, dayTexture, nightTexture, nextDayTexture]);
  const cloudMaterialBundle = useMemo(() => {
    if (!cloudTexture) return null;

    return createEarthCloudMaterial(cloudTexture);
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
  const customAtmosphereMaterialBundle = useMemo(
    () => createEarthAtmosphereMaterial(),
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
  const customAuroraMaterialBundle = useMemo(
    () => createEarthAuroraMaterial(),
    [],
  );

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
      customEarthMaterialBundle?.material.dispose();
    };
  }, [customEarthMaterialBundle]);
  useEffect(() => {
    return () => {
      cloudMaterialBundle?.material.dispose();
    };
  }, [cloudMaterialBundle]);
  useEffect(() => {
    return () => atmosphereMaterial.dispose();
  }, [atmosphereMaterial]);
  useEffect(() => {
    return () => {
      customAtmosphereMaterialBundle?.material.dispose();
    };
  }, [customAtmosphereMaterialBundle]);
  useEffect(() => {
    return () => {
      auroraMaterial?.dispose();
      auroraTexture?.dispose();
    };
  }, [auroraMaterial, auroraTexture]);
  useEffect(() => {
    return () => {
      customAuroraMaterialBundle?.material.dispose();
    };
  }, [customAuroraMaterialBundle]);

  useEffect(() => {
    surfaceOccluderRef.current?.layers.disableAll();
    surfaceOccluderRef.current?.layers.enable(MISSION_BLOOM_LAYER);
  }, []);

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
    const customSurface = customEarthMaterialBundle;
    const customAtmosphere = customAtmosphereMaterialBundle;
    const clouds = cloudMaterialBundle;
    const customAurora = customAuroraMaterialBundle;

    if (timeline.monthIndex !== monthIndexRef.current) {
      monthIndexRef.current = timeline.monthIndex;
      startTransition(() => {
        setMonthIndex(timeline.monthIndex);
      });
    }

    let cityLightVisibility = 1;
    let auroraVisibility = 1;
    if (surfaceMeshRef.current && "isPerspectiveCamera" in camera) {
      surfaceMeshRef.current.getWorldPosition(earthWorldPositionRef.current);
      const distanceToEarth = camera.position.distanceTo(earthWorldPositionRef.current);
      const clampedDistance = Math.max(distanceToEarth, EARTH_RADIUS * 1.001);
      const angularDiameter =
        2 * Math.asin(Math.min(1, EARTH_RADIUS / clampedDistance));
      const screenDiameter = angularDiameter / ((camera.fov * Math.PI) / 180);
      const cityNormalized =
        (screenDiameter - CITY_LIGHTS_SCREEN_DIAMETER_FADE_START) /
        (CITY_LIGHTS_SCREEN_DIAMETER_FADE_END -
          CITY_LIGHTS_SCREEN_DIAMETER_FADE_START);
      cityLightVisibility = Math.max(0, Math.min(1, cityNormalized));
      cityLightVisibility =
        cityLightVisibility * cityLightVisibility * (3 - 2 * cityLightVisibility);
      const auroraNormalized =
        (screenDiameter - AURORA_SCREEN_DIAMETER_FADE_START) /
        (AURORA_SCREEN_DIAMETER_FADE_END - AURORA_SCREEN_DIAMETER_FADE_START);
      auroraVisibility = Math.max(0, Math.min(1, auroraNormalized));
      auroraVisibility =
        auroraVisibility * auroraVisibility * (3 - 2 * auroraVisibility);
    }

    if (customSurface) {
      customSurface.atmosphereIntensityUniform.value = customAtmosphereIntensity;
      customSurface.cityLightVisibilityUniform.value = cityLightVisibility;
      customSurface.monthBlendUniform.value = timeline.blend;
      customSurface.nightLightsUniform.value = customNightLights;
      customSurface.sunDirectionUniform.value.copy(localSunDirection).normalize();
      customSurface.debugViewUniform.value =
        EARTH_SURFACE_DEBUG_VIEW_IDS[surfaceDebugView];
    }
    if (earthMaterial) {
      earthMaterial.emissiveIntensity =
        (nightTexture ? NIGHT_LIGHTS_INTENSITY * 0.18 : 0) * cityLightVisibility;
    }
    if (customAtmosphere) {
      customAtmosphere.sunDirectionUniform.value
        .copy(localSunDirection)
        .normalize();
      customAtmosphere.intensityUniform.value = customAtmosphereIntensity;
      customAtmosphere.powerUniform.value = customAtmospherePower;
      customAtmosphere.debugViewUniform.value =
        EARTH_ATMOSPHERE_DEBUG_VIEW_IDS[atmosphereDebugView];
    }
    if (clouds) {
      clouds.sunDirectionUniform.value.copy(localSunDirection).normalize();
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
      if (customAurora) {
        customAurora.phaseUniform.value = auroraPhase;
      }
    }

    if (customAurora) {
      customAurora.sunDirectionUniform.value.copy(localSunDirection).normalize();
      customAurora.intensityUniform.value = customAuroraIntensity;
      customAurora.visibilityUniform.value = auroraVisibility;
      customAurora.debugViewUniform.value =
        EARTH_AURORA_DEBUG_VIEW_IDS[auroraDebugView];
    }
    if (auroraMaterial) {
      auroraMaterial.opacity = 0.9 * auroraVisibility;
    }
  });

  const surfaceMaterial =
    surfaceMode === SURFACE_MODE_OPTIONS.Custom
      ? customEarthMaterialBundle?.material ?? fallbackMaterial
      : earthMaterial ?? fallbackMaterial;
  const activeAtmosphereMaterial =
    atmosphereMode === SHELL_MODE_OPTIONS.Custom
      ? customAtmosphereMaterialBundle?.material ?? null
      : atmosphereMode === SHELL_MODE_OPTIONS.Basic
        ? atmosphereMaterial
        : null;
  const activeAuroraMaterial =
    auroraMode === SHELL_MODE_OPTIONS.Custom
      ? customAuroraMaterialBundle?.material ?? null
      : auroraMode === SHELL_MODE_OPTIONS.Basic
        ? auroraMaterial
        : null;

  return (
    <>
      <mesh ref={surfaceMeshRef} material={surfaceMaterial}>
        <sphereGeometry args={[EARTH_RADIUS, 128, 64]} />
      </mesh>
      <mesh
        ref={surfaceOccluderRef}
        scale={[
          MISSION_BLOOM_OCCLUDER_SCALE,
          MISSION_BLOOM_OCCLUDER_SCALE,
          MISSION_BLOOM_OCCLUDER_SCALE,
        ]}
      >
        <sphereGeometry args={[EARTH_RADIUS, 128, 64]} />
        <meshBasicMaterial colorWrite={false} toneMapped={false} />
      </mesh>
      {cloudMaterialBundle ? (
        <group ref={cloudSpinRef}>
          <mesh
            material={cloudMaterialBundle.material}
            renderOrder={1}
            scale={[CLOUD_LAYER_SCALE, CLOUD_LAYER_SCALE, CLOUD_LAYER_SCALE]}
          >
            <sphereGeometry args={[EARTH_RADIUS, 96, 48]} />
          </mesh>
        </group>
      ) : null}
      {activeAuroraMaterial ? (
        <group
          ref={auroraSpinRef}
          renderOrder={2}
          scale={[AURORA_LAYER_SCALE, AURORA_LAYER_SCALE, AURORA_LAYER_SCALE]}
        >
          <mesh material={activeAuroraMaterial}>
            <sphereGeometry args={[EARTH_RADIUS, 96, 48]} />
          </mesh>
        </group>
      ) : null}
      {activeAtmosphereMaterial ? (
        <mesh
          material={activeAtmosphereMaterial}
          renderOrder={3}
          scale={[ATMOSPHERE_SCALE, ATMOSPHERE_SCALE, ATMOSPHERE_SCALE]}
        >
          <sphereGeometry args={[EARTH_RADIUS, 96, 48]} />
        </mesh>
      ) : null}
    </>
  );
}
