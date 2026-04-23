import {
  createRef,
  useEffect,
  memo,
  useMemo,
  useRef,
  type ElementRef,
  type RefObject,
} from "react";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { folder, useControls } from "leva";
import {
  AdditiveBlending,
  Color,
  MathUtils,
  MeshBasicMaterial,
  Object3D,
  Vector2,
  Vector3,
  type Group,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { Atmosphere } from "./Atmosphere.tsx";
import { Earth } from "./Earth.tsx";
import { MissionTrajectories } from "./MissionTrajectory.tsx";
import { Moon } from "./Moon.tsx";
import { Rings } from "./Rings.tsx";
import { Saturn } from "./Saturn.tsx";
import { Stars } from "./Stars.tsx";
import { Sun } from "./Sun.tsx";
import { SunBloomOccluder } from "./SunBloomOccluder.tsx";
import { SystemLightRig } from "./SystemLightRig.tsx";
import { TexturedBody } from "./TexturedBody.tsx";
import {
  BODY_DEFINITIONS,
  DEFAULT_FOCUS_BODY_ID,
  type BodyId,
} from "../lib/bodies.ts";
import {
  createSolarSystemState,
  updateSolarSystemState,
} from "../lib/solarSystemState.ts";
import { MISSION_REGISTRY } from "../lib/missions.ts";
import {
  CERES_AXIAL_TILT_DEG,
  CERES_ROTATION_PERIOD_HOURS,
  DEFAULT_BLOOM_RADIUS,
  DEFAULT_BLOOM_STRENGTH,
  DEFAULT_BLOOM_THRESHOLD,
  DEFAULT_EXPOSURE,
  ERIS_AXIAL_TILT_DEG,
  ERIS_ROTATION_PERIOD_HOURS,
  HAUMEA_AXIAL_TILT_DEG,
  HAUMEA_ROTATION_PERIOD_HOURS,
  JUPITER_AXIAL_TILT_DEG,
  JUPITER_ROTATION_PERIOD_HOURS,
  MAKEMAKE_AXIAL_TILT_DEG,
  MAKEMAKE_ROTATION_PERIOD_HOURS,
  MARS_AXIAL_TILT_DEG,
  MARS_ROTATION_PERIOD_HOURS,
  MERCURY_AXIAL_TILT_DEG,
  MERCURY_ROTATION_PERIOD_HOURS,
  NEPTUNE_AXIAL_TILT_DEG,
  NEPTUNE_ROTATION_PERIOD_HOURS,
  PLUTO_AXIAL_TILT_DEG,
  PLUTO_ROTATION_PERIOD_HOURS,
  SATURN_AXIAL_TILT_DEG,
  SATURN_ROTATION_PERIOD_HOURS,
  SUN_INTENSITY,
  URANUS_AXIAL_TILT_DEG,
  URANUS_ROTATION_PERIOD_HOURS,
  VENUS_AXIAL_TILT_DEG,
  VENUS_ROTATION_PERIOD_HOURS,
  VESTA_AXIAL_TILT_DEG,
  VESTA_ROTATION_PERIOD_HOURS,
} from "../lib/constants.ts";
import {
  setEarthQuaternion,
  setSynchronousQuaternion,
  spinAngleFromHours,
} from "../lib/bodyOrientation.ts";
import {
  currentSimulationDateMs,
  timelineSystemMs,
  type SimulationTimeline,
} from "../lib/simulationTimeline.ts";
import { MISSION_BLOOM_LAYER, SUN_BLOOM_LAYER } from "../lib/renderLayers.ts";
import { kmToUnits } from "../lib/units.ts";

type OrbitControlsHandle = ElementRef<typeof OrbitControls>;
type BodyAnchorMap = Record<BodyId, RefObject<Object3D | null>>;
type SceneProps = {
  focusBodyId: BodyId;
  activeMissionId: string | null;
  timeline: SimulationTimeline;
  /** Written every frame with the camera-to-target distance in scene units. */
  cameraDistanceRef?: RefObject<number>;
};

const BODY_IDS = Object.keys(BODY_DEFINITIONS) as BodyId[];
const AXIAL_SPIN_BODY_IDS = [
  "mercury",
  "venus",
  "mars",
  "vesta",
  "ceres",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
  "haumea",
  "makemake",
  "eris",
] as const;
const DIRECT_SOLAR_BODY_IDS = [
  "mercury",
  "venus",
  "vesta",
  "ceres",
  "uranus",
  "pluto",
  "haumea",
  "makemake",
  "eris",
] as const;
const SYNCHRONOUS_BODY_IDS = [
  "moon",
  "phobos",
  "io",
  "europa",
  "ganymede",
  "callisto",
  "titan",
  "iapetus",
  "triton",
] as const;
type AxialSpinBodyId = (typeof AXIAL_SPIN_BODY_IDS)[number];
type SynchronousBodyId = (typeof SYNCHRONOUS_BODY_IDS)[number];
const BODY_ROTATION_PERIOD_HOURS: Record<AxialSpinBodyId, number> = {
  mercury: MERCURY_ROTATION_PERIOD_HOURS,
  venus: VENUS_ROTATION_PERIOD_HOURS,
  mars: MARS_ROTATION_PERIOD_HOURS,
  vesta: VESTA_ROTATION_PERIOD_HOURS,
  ceres: CERES_ROTATION_PERIOD_HOURS,
  jupiter: JUPITER_ROTATION_PERIOD_HOURS,
  saturn: SATURN_ROTATION_PERIOD_HOURS,
  uranus: URANUS_ROTATION_PERIOD_HOURS,
  neptune: NEPTUNE_ROTATION_PERIOD_HOURS,
  pluto: PLUTO_ROTATION_PERIOD_HOURS,
  haumea: HAUMEA_ROTATION_PERIOD_HOURS,
  makemake: MAKEMAKE_ROTATION_PERIOD_HOURS,
  eris: ERIS_ROTATION_PERIOD_HOURS,
};
const BODY_AXIAL_TILT_RAD: Record<AxialSpinBodyId, number> = {
  mercury: MathUtils.degToRad(MERCURY_AXIAL_TILT_DEG),
  venus: MathUtils.degToRad(VENUS_AXIAL_TILT_DEG),
  mars: MathUtils.degToRad(MARS_AXIAL_TILT_DEG),
  vesta: MathUtils.degToRad(VESTA_AXIAL_TILT_DEG),
  ceres: MathUtils.degToRad(CERES_AXIAL_TILT_DEG),
  jupiter: MathUtils.degToRad(JUPITER_AXIAL_TILT_DEG),
  saturn: MathUtils.degToRad(SATURN_AXIAL_TILT_DEG),
  uranus: MathUtils.degToRad(URANUS_AXIAL_TILT_DEG),
  neptune: MathUtils.degToRad(NEPTUNE_AXIAL_TILT_DEG),
  pluto: MathUtils.degToRad(PLUTO_AXIAL_TILT_DEG),
  haumea: MathUtils.degToRad(HAUMEA_AXIAL_TILT_DEG),
  makemake: MathUtils.degToRad(MAKEMAKE_AXIAL_TILT_DEG),
  eris: MathUtils.degToRad(ERIS_AXIAL_TILT_DEG),
};
const SATURN_AXIAL_TILT_RAD = BODY_AXIAL_TILT_RAD.saturn;
const AXIAL_TILT_AXIS = new Vector3(0, 0, 1);
const CANARY_COLOR = new Color("#ff1fbf");
const CAMERA_NEAR_SCALE = 0.01;
const MISSION_CAMERA_NEAR_SCALE = 0.05;
const CAMERA_FAR_MARGIN = 1.2;
const MIN_FOCUS_DISTANCE = 1e-8;
const ARTEMIS_CAMERA_BODY_IDS: readonly BodyId[] = [
  "sun",
  "earth",
  "moon",
  "artemis2",
];
const ARTEMIS_CAMERA_FAR_MULTIPLIER = 100_000;
const ARTEMIS_CAMERA_MIN_FAR_KM = 50;
const TARGET_FOLLOW_DAMPING = 0.16;
const DISTANCE_FOLLOW_DAMPING = 0.18;
const FALLBACK_VIEW_DIRECTION = new Vector3(0.54, 0.31, 0.78).normalize();
const LOCAL_UP_AXIS = new Vector3(0, 1, 0);
const MISSION_BLOOM_FADE_START_DISTANCE = kmToUnits(20_000);
const MISSION_BLOOM_FADE_HALF_DISTANCE = kmToUnits(180_000);
const MISSION_BLOOM_FADE_EXPONENT = 1.25;
const MISSION_BLOOM_FAR_MIX = 0.3;
const MISSION_BLOOM_TARGET_POSITION = new Vector3();

function createRefMap<TId extends string, TObject extends Object3D = Object3D>(
  ids: readonly TId[],
) {
  return Object.fromEntries(
    ids.map((id) => [id, createRef<TObject>()]),
  ) as Record<TId, RefObject<TObject | null>>;
}

function copyKmVectorToUnits(target: Vector3, source: Vector3) {
  target.set(kmToUnits(source.x), kmToUnits(source.y), kmToUnits(source.z));
}

function clampFocusDistance(bodyId: BodyId, distanceUnits: number) {
  const definition = BODY_DEFINITIONS[bodyId];
  const minDistance = Math.max(
    kmToUnits(definition.minDistanceKm),
    MIN_FOCUS_DISTANCE,
  );
  const maxDistance = Math.max(
    kmToUnits(definition.maxDistanceKm),
    minDistance,
  );

  return MathUtils.clamp(distanceUnits, minDistance, maxDistance);
}

function asymptoticDistanceFade(
  distance: number,
  startDistance: number,
  halfDistance: number,
  exponent: number,
) {
  if (distance <= startDistance) return 0;
  const safeRange = Math.max(halfDistance - startDistance, 1e-6);
  const normalized = (distance - startDistance) / safeRange;
  const weighted = Math.pow(Math.max(normalized, 0), exponent);
  return weighted / (1 + weighted);
}

function Effects({ missionBloomTargetId }: { missionBloomTargetId: string | null }) {
  const { gl, scene, camera, size } = useThree();
  const glRef = useRef(gl);
  const cameraRef = useRef(camera);
  const composerRef = useRef<EffectComposer | null>(null);
  const bloomPassRef = useRef<UnrealBloomPass | null>(null);
  const sunComposerRef = useRef<EffectComposer | null>(null);
  const sunBloomPassRef = useRef<UnrealBloomPass | null>(null);
  const sunBloomOverlayMaterialRef = useRef<MeshBasicMaterial | null>(null);
  const sunBloomOverlayQuadRef = useRef<FullScreenQuad | null>(null);
  const missionComposerRef = useRef<EffectComposer | null>(null);
  const missionBloomPassRef = useRef<UnrealBloomPass | null>(null);
  const missionBloomOverlayMaterialRef = useRef<MeshBasicMaterial | null>(null);
  const missionBloomOverlayQuadRef = useRef<FullScreenQuad | null>(null);

  useEffect(() => {
    glRef.current = gl;
    cameraRef.current = camera;
  }, [gl, camera]);

  const { bloomThreshold, bloomStrength, bloomRadius } = useControls("Bloom", {
    bloomThreshold: {
      value: DEFAULT_BLOOM_THRESHOLD,
      min: 0,
      max: 2,
      step: 0.01,
      label: "Threshold",
    },
    bloomStrength: {
      value: DEFAULT_BLOOM_STRENGTH,
      min: 0,
      max: 3,
      step: 0.01,
      label: "Strength",
    },
    bloomRadius: {
      value: DEFAULT_BLOOM_RADIUS,
      min: 0,
      max: 1,
      step: 0.01,
      label: "Radius",
    },
  });

  const {
    sunBloomEnabled,
    sunBloomThreshold,
    sunBloomStrength,
    sunBloomRadius,
    sunBloomMix,
    sunBloomResolutionScale,
  } = useControls("Sun Bloom", {
    sunBloomEnabled: {
      value: true,
      label: "Enabled",
    },
    sunBloomThreshold: {
      value: 0.06,
      min: 0,
      max: 2,
      step: 0.01,
      label: "Threshold",
    },
    sunBloomStrength: {
      value: 1.85,
      min: 0,
      max: 6,
      step: 0.01,
      label: "Strength",
    },
    sunBloomRadius: {
      value: 0.78,
      min: 0,
      max: 1,
      step: 0.01,
      label: "Radius",
    },
    sunBloomMix: {
      value: 0.68,
      min: 0,
      max: 1,
      step: 0.01,
      label: "Mix",
    },
    sunBloomResolutionScale: {
      value: 0.35,
      min: 0.2,
      max: 1,
      step: 0.05,
      label: "Res Scale",
    },
  });

  const {
    missionBloomEnabled,
    missionBloomThreshold,
    missionBloomStrength,
    missionBloomRadius,
    missionBloomMix,
    missionBloomResolutionScale,
  } = useControls("Mission Bloom", {
    missionBloomEnabled: {
      value: true,
      label: "Enabled",
    },
    missionBloomThreshold: {
      value: 0.12,
      min: 0,
      max: 2,
      step: 0.01,
      label: "Threshold",
    },
    missionBloomStrength: {
      value: 0.9,
      min: 0,
      max: 5,
      step: 0.01,
      label: "Strength",
    },
    missionBloomRadius: {
      value: 0.72,
      min: 0,
      max: 1,
      step: 0.01,
      label: "Radius",
    },
    missionBloomMix: {
      value: 0.62,
      min: 0,
      max: 1,
      step: 0.01,
      label: "Mix",
    },
    missionBloomResolutionScale: {
      value: 0.4,
      min: 0.2,
      max: 1,
      step: 0.05,
      label: "Res Scale",
    },
  });

  const { exposure } = useControls("Tonemap", {
    exposure: {
      value: DEFAULT_EXPOSURE,
      min: 0.1,
      max: 5,
      step: 0.05,
      label: "Exposure",
    },
  });

  const { postprocess } = useControls("Renderer", {
    postprocess: { value: true, label: "Postprocess" },
  });

  useEffect(() => {
    const composer = new EffectComposer(gl);
    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
      new Vector2(size.width, size.height),
      DEFAULT_BLOOM_STRENGTH,
      DEFAULT_BLOOM_RADIUS,
      DEFAULT_BLOOM_THRESHOLD,
    );

    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
    composerRef.current = composer;
    bloomPassRef.current = bloomPass;

    return () => {
      composerRef.current = null;
      bloomPassRef.current = null;
      bloomPass.dispose();
      composer.dispose();
    };
  }, [gl, scene, camera, size.height, size.width]);

  useEffect(() => {
    const sunBloomWidth = Math.max(
      1,
      Math.round(size.width * sunBloomResolutionScale),
    );
    const sunBloomHeight = Math.max(
      1,
      Math.round(size.height * sunBloomResolutionScale),
    );
    const composer = new EffectComposer(gl);
    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
      new Vector2(sunBloomWidth, sunBloomHeight),
      sunBloomStrength,
      sunBloomRadius,
      sunBloomThreshold,
    );
    const overlayMaterial = new MeshBasicMaterial({
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      map: bloomPass.renderTargetsHorizontal[0].texture,
      opacity: sunBloomMix,
      toneMapped: false,
      transparent: true,
    });
    const overlayQuad = new FullScreenQuad(overlayMaterial);

    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.renderToScreen = false;
    composer.setPixelRatio(1);
    composer.setSize(sunBloomWidth, sunBloomHeight);

    sunComposerRef.current = composer;
    sunBloomPassRef.current = bloomPass;
    sunBloomOverlayMaterialRef.current = overlayMaterial;
    sunBloomOverlayQuadRef.current = overlayQuad;

    return () => {
      sunComposerRef.current = null;
      sunBloomPassRef.current = null;
      sunBloomOverlayMaterialRef.current = null;
      sunBloomOverlayQuadRef.current = null;
      overlayQuad.dispose();
      overlayMaterial.dispose();
      bloomPass.dispose();
      composer.dispose();
    };
  }, [
    gl,
    scene,
    camera,
    size.height,
    size.width,
    sunBloomResolutionScale,
  ]);

  useEffect(() => {
    const missionBloomWidth = Math.max(
      1,
      Math.round(size.width * missionBloomResolutionScale),
    );
    const missionBloomHeight = Math.max(
      1,
      Math.round(size.height * missionBloomResolutionScale),
    );
    const composer = new EffectComposer(gl);
    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
      new Vector2(missionBloomWidth, missionBloomHeight),
      missionBloomStrength,
      missionBloomRadius,
      missionBloomThreshold,
    );
    const overlayMaterial = new MeshBasicMaterial({
      blending: AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      map: bloomPass.renderTargetsHorizontal[0].texture,
      opacity: missionBloomMix,
      toneMapped: false,
      transparent: true,
    });
    const overlayQuad = new FullScreenQuad(overlayMaterial);

    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.renderToScreen = false;
    composer.setPixelRatio(1);
    composer.setSize(missionBloomWidth, missionBloomHeight);

    missionComposerRef.current = composer;
    missionBloomPassRef.current = bloomPass;
    missionBloomOverlayMaterialRef.current = overlayMaterial;
    missionBloomOverlayQuadRef.current = overlayQuad;

    return () => {
      missionComposerRef.current = null;
      missionBloomPassRef.current = null;
      missionBloomOverlayMaterialRef.current = null;
      missionBloomOverlayQuadRef.current = null;
      overlayQuad.dispose();
      overlayMaterial.dispose();
      bloomPass.dispose();
      composer.dispose();
    };
  }, [
    gl,
    scene,
    camera,
    size.height,
    size.width,
    missionBloomResolutionScale,
  ]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [gl, size.height, size.width]);

  useEffect(() => {
    const composer = sunComposerRef.current;
    if (!composer) return;
    const sunBloomWidth = Math.max(
      1,
      Math.round(size.width * sunBloomResolutionScale),
    );
    const sunBloomHeight = Math.max(
      1,
      Math.round(size.height * sunBloomResolutionScale),
    );
    composer.setPixelRatio(1);
    composer.setSize(sunBloomWidth, sunBloomHeight);
  }, [size.height, size.width, sunBloomResolutionScale]);

  useEffect(() => {
    const composer = missionComposerRef.current;
    if (!composer) return;
    const missionBloomWidth = Math.max(
      1,
      Math.round(size.width * missionBloomResolutionScale),
    );
    const missionBloomHeight = Math.max(
      1,
      Math.round(size.height * missionBloomResolutionScale),
    );
    composer.setPixelRatio(1);
    composer.setSize(missionBloomWidth, missionBloomHeight);
  }, [missionBloomResolutionScale, size.height, size.width]);

  useEffect(() => {
    const bloomPass = bloomPassRef.current;
    if (!bloomPass) return;
    bloomPass.threshold = bloomThreshold;
    bloomPass.strength = bloomStrength;
    bloomPass.radius = bloomRadius;
  }, [bloomThreshold, bloomStrength, bloomRadius]);

  useEffect(() => {
    const bloomPass = sunBloomPassRef.current;
    if (!bloomPass) return;
    bloomPass.threshold = sunBloomThreshold;
    bloomPass.strength = sunBloomStrength;
    bloomPass.radius = sunBloomRadius;
  }, [sunBloomThreshold, sunBloomStrength, sunBloomRadius]);

  useEffect(() => {
    const bloomPass = missionBloomPassRef.current;
    if (!bloomPass) return;
    bloomPass.threshold = missionBloomThreshold;
    bloomPass.strength = missionBloomStrength;
    bloomPass.radius = missionBloomRadius;
  }, [missionBloomThreshold, missionBloomStrength, missionBloomRadius]);

  useEffect(() => {
    const overlayMaterial = sunBloomOverlayMaterialRef.current;
    if (!overlayMaterial) return;
    overlayMaterial.opacity = sunBloomMix;
  }, [sunBloomMix]);

  useEffect(() => {
    const overlayMaterial = missionBloomOverlayMaterialRef.current;
    if (!overlayMaterial) return;
    overlayMaterial.opacity = missionBloomMix;
  }, [missionBloomMix]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    (gl as unknown as { toneMappingExposure: number }).toneMappingExposure =
      exposure;
  }, [gl, exposure]);

  useFrame(() => {
    const renderer = glRef.current;
    const activeCamera = cameraRef.current;
    const previousAutoClear = renderer.autoClear;

    if (!postprocess || !composerRef.current) {
      renderer.render(scene, activeCamera);
      return;
    }

    composerRef.current.render();

    const sunComposer = sunComposerRef.current;
    const sunBloomPass = sunBloomPassRef.current;
    const sunBloomOverlayMaterial = sunBloomOverlayMaterialRef.current;
    const sunBloomOverlayQuad = sunBloomOverlayQuadRef.current;
    const missionComposer = missionComposerRef.current;
    const missionBloomPass = missionBloomPassRef.current;
    const missionBloomOverlayMaterial = missionBloomOverlayMaterialRef.current;
    const missionBloomOverlayQuad = missionBloomOverlayQuadRef.current;
    const originalLayerMask = activeCamera.layers.mask;

    if (
      sunBloomEnabled &&
      sunBloomMix > 0 &&
      sunBloomStrength > 0 &&
      sunComposer &&
      sunBloomPass &&
      sunBloomOverlayMaterial &&
      sunBloomOverlayQuad
    ) {
      const originalBackground = scene.background;
      activeCamera.layers.mask = 1 << SUN_BLOOM_LAYER;
      scene.background = null;
      try {
        sunComposer.render();
      } finally {
        scene.background = originalBackground;
      }
      activeCamera.layers.mask = originalLayerMask;
      sunBloomOverlayMaterial.opacity = sunBloomMix;
      renderer.autoClear = false;
      renderer.setRenderTarget(null);
      sunBloomOverlayQuad.render(renderer);
    }

    if (
      missionBloomEnabled &&
      missionBloomMix > 0 &&
      missionBloomStrength > 0 &&
      missionComposer &&
      missionBloomPass &&
      missionBloomOverlayMaterial &&
      missionBloomOverlayQuad
    ) {
      let effectiveMissionBloomMix = missionBloomMix;
      if (missionBloomTargetId) {
        const missionBloomTarget = scene.getObjectByName(missionBloomTargetId);
        if (missionBloomTarget) {
        missionBloomTarget.getWorldPosition(MISSION_BLOOM_TARGET_POSITION);
        const distanceToMission = activeCamera.position.distanceTo(
          MISSION_BLOOM_TARGET_POSITION,
        );
        const distanceFade = asymptoticDistanceFade(
          distanceToMission,
          MISSION_BLOOM_FADE_START_DISTANCE,
          MISSION_BLOOM_FADE_HALF_DISTANCE,
          MISSION_BLOOM_FADE_EXPONENT,
        );
        effectiveMissionBloomMix *= MathUtils.lerp(
          1,
            MISSION_BLOOM_FAR_MIX,
            distanceFade,
          );
        }
      }

      if (effectiveMissionBloomMix > 0) {
        activeCamera.layers.mask = 1 << MISSION_BLOOM_LAYER;
        missionComposer.render();
        activeCamera.layers.mask = originalLayerMask;
        missionBloomOverlayMaterial.opacity = effectiveMissionBloomMix;
        renderer.autoClear = false;
        renderer.setRenderTarget(null);
        missionBloomOverlayQuad.render(renderer);
      }
    }

    activeCamera.layers.mask = originalLayerMask;
    renderer.autoClear = previousAutoClear;
  }, 1);

  return null;
}

function DebugCanary() {
  return (
    <mesh position={[0, 0, 90]} renderOrder={10}>
      <boxGeometry args={[6, 6, 6]} />
      <meshBasicMaterial color={CANARY_COLOR} toneMapped={false} />
    </mesh>
  );
}

type FocusCameraRigProps = {
  bodyAnchors: BodyAnchorMap;
  controlsRef: RefObject<OrbitControlsHandle | null>;
  focusBodyId: BodyId;
};

function FocusCameraRig({
  bodyAnchors,
  controlsRef,
  focusBodyId,
}: FocusCameraRigProps) {
  const { camera, gl } = useThree();
  const desiredTargetRef = useRef(new Vector3());
  const currentOffsetRef = useRef(new Vector3());
  const targetDistanceRef = useRef(
    clampFocusDistance(
      focusBodyId,
      kmToUnits(BODY_DEFINITIONS[focusBodyId].defaultFocusDistanceKm),
    ),
  );
  const snapToFocusRef = useRef(true);
  const focusDefinition = BODY_DEFINITIONS[focusBodyId];

  useEffect(() => {
    targetDistanceRef.current = clampFocusDistance(
      focusBodyId,
      kmToUnits(focusDefinition.defaultFocusDistanceKm),
    );
    snapToFocusRef.current = true;
  }, [focusBodyId, focusDefinition.defaultFocusDistanceKm]);

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const scale = Math.pow(0.95, event.deltaY * 0.01);
      targetDistanceRef.current = clampFocusDistance(
        focusBodyId,
        targetDistanceRef.current * scale,
      );
    };

    gl.domElement.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      gl.domElement.removeEventListener("wheel", onWheel);
    };
  }, [focusBodyId, gl]);

  useFrame(() => {
    const controls = controlsRef.current;
    const anchor = bodyAnchors[focusBodyId].current;
    if (!controls || !anchor) return;

    anchor.getWorldPosition(desiredTargetRef.current);
    currentOffsetRef.current.copy(camera.position).sub(controls.target);

    let currentDistance = currentOffsetRef.current.length();
    if (currentDistance <= MIN_FOCUS_DISTANCE) {
      currentOffsetRef.current.copy(FALLBACK_VIEW_DIRECTION);
      currentDistance = targetDistanceRef.current;
    } else {
      currentOffsetRef.current.multiplyScalar(1 / currentDistance);
    }

    if (snapToFocusRef.current) {
      controls.target.copy(desiredTargetRef.current);
      camera.position
        .copy(desiredTargetRef.current)
        .addScaledVector(currentOffsetRef.current, targetDistanceRef.current);
      controls.update();
      snapToFocusRef.current = false;
      return;
    }

    controls.target.lerp(desiredTargetRef.current, TARGET_FOLLOW_DAMPING);
    const nextDistance = MathUtils.lerp(
      currentDistance,
      targetDistanceRef.current,
      DISTANCE_FOLLOW_DAMPING,
    );
    camera.position
      .copy(controls.target)
      .addScaledVector(currentOffsetRef.current, nextDistance);
    controls.update();
  }, 0);

  return null;
}

export const Scene = memo(function Scene({
  focusBodyId,
  activeMissionId,
  timeline,
  cameraDistanceRef,
}: SceneProps) {
  const camera = useThree((state) => state.camera);
  const controlsRef = useRef<OrbitControlsHandle | null>(null);
  const bodyAnchors = useMemo<BodyAnchorMap>(() => createRefMap(BODY_IDS), []);
  const axialSpinRefs = useMemo(
    () => createRefMap<AxialSpinBodyId, Group>(AXIAL_SPIN_BODY_IDS),
    [],
  );
  const synchronousSpinRefs = useMemo(
    () => createRefMap<SynchronousBodyId, Group>(SYNCHRONOUS_BODY_IDS),
    [],
  );
  const earthSystemRef = useRef<Group>(null);
  const earthSpinRef = useRef<Group>(null);
  const marsSystemRef = useRef<Group>(null);
  const jupiterSystemRef = useRef<Group>(null);
  const saturnSystemRef = useRef<Group>(null);
  const neptuneSystemRef = useRef<Group>(null);
  const artemisFocusOffsetKmRef = useRef(new Vector3());
  const earthSystemOriginKmRef = useRef(new Vector3());
  const simulationRef = useRef(createSolarSystemState(DEFAULT_FOCUS_BODY_ID));
  const saturnLocalSunDirectionRef = useRef(new Vector3(1, 0, 0));
  const localDirectionToParentRef = useRef(new Vector3());
  const focusTargetRef = useRef(new Vector3());
  const missionBloomTargetId = useMemo(
    () =>
      activeMissionId ??
      MISSION_REGISTRY.find((mission) => mission.id === focusBodyId)?.id ??
      null,
    [activeMissionId, focusBodyId],
  );

  const {
    ringShadowStrength,
    ringOpacity,
    ringChromaGain,
    ringWarmth,
    planetShadowStrength,
    atmosphereIntensity,
    atmospherePower,
    texturedSaturn,
    texturedRings,
    debugCanary,
  } = useControls(
    "Saturn",
    {
      Look: folder({
        ringShadowStrength: {
          value: 0.78,
          min: 0,
          max: 1,
          step: 0.01,
          label: "Ring Shadow",
        },
        ringOpacity: {
          value: 0.7,
          min: 0,
          max: 1,
          step: 0.01,
          label: "Ring Opacity",
        },
        ringChromaGain: {
          value: 1.45,
          min: 1,
          max: 6,
          step: 0.05,
          label: "Ring Chroma",
        },
        ringWarmth: {
          value: 0.26,
          min: 0,
          max: 1,
          step: 0.01,
          label: "Ring Warmth",
        },
        planetShadowStrength: {
          value: 1.36,
          min: 0,
          max: 1.5,
          step: 0.01,
          label: "Planet Shadow",
        },
        atmosphereIntensity: {
          value: 0.24,
          min: 0,
          max: 1,
          step: 0.01,
          label: "Glow Intensity",
        },
        atmospherePower: {
          value: 3.5,
          min: 1,
          max: 10,
          step: 0.1,
          label: "Glow Power",
        },
      }),
      Debug: folder(
        {
          texturedSaturn: { value: true, label: "Saturn Texture" },
          texturedRings: { value: true, label: "Ring Texture" },
          debugCanary: { value: false, label: "Canary Cube" },
        },
        { collapsed: true },
      ),
    },
    { collapsed: false },
  );

  const { sunIntensity } = useControls("Lighting", {
    sunIntensity: {
      value: SUN_INTENSITY,
      min: 0,
      max: 10,
      step: 0.1,
      label: "Intensity",
    },
  });

  useFrame(() => {
    const simulation = updateSolarSystemState(
      simulationRef.current,
      currentSimulationDateMs(timeline, timelineSystemMs()),
      focusBodyId,
    );

    if (bodyAnchors.sun.current) {
      copyKmVectorToUnits(
        bodyAnchors.sun.current.position,
        simulation.bodies.sun.positionRelativeToFocusKm,
      );
    }
    for (const bodyId of DIRECT_SOLAR_BODY_IDS) {
      const anchor = bodyAnchors[bodyId].current;
      if (!anchor) continue;
      copyKmVectorToUnits(
        anchor.position,
        simulation.bodies[bodyId].positionRelativeToFocusKm,
      );
    }

    earthSystemOriginKmRef.current.copy(
      simulation.bodies.earth.positionRelativeToFocusKm,
    );
    if (focusBodyId === "artemis2") {
      earthSystemOriginKmRef.current.sub(artemisFocusOffsetKmRef.current);
    }
    if (earthSystemRef.current) {
      copyKmVectorToUnits(
        earthSystemRef.current.position,
        earthSystemOriginKmRef.current,
      );
    }
    if (marsSystemRef.current) {
      copyKmVectorToUnits(
        marsSystemRef.current.position,
        simulation.bodies.mars.positionRelativeToFocusKm,
      );
    }
    if (jupiterSystemRef.current) {
      copyKmVectorToUnits(
        jupiterSystemRef.current.position,
        simulation.bodies.jupiter.positionRelativeToFocusKm,
      );
    }
    if (saturnSystemRef.current) {
      copyKmVectorToUnits(
        saturnSystemRef.current.position,
        simulation.bodies.saturn.positionRelativeToFocusKm,
      );
    }
    if (neptuneSystemRef.current) {
      copyKmVectorToUnits(
        neptuneSystemRef.current.position,
        simulation.bodies.neptune.positionRelativeToFocusKm,
      );
    }

    if (bodyAnchors.moon.current) {
      copyKmVectorToUnits(
        bodyAnchors.moon.current.position,
        simulation.bodies.moon.positionRelativeToParentKm,
      );
    }
    if (bodyAnchors.phobos.current) {
      copyKmVectorToUnits(
        bodyAnchors.phobos.current.position,
        simulation.bodies.phobos.positionRelativeToParentKm,
      );
    }
    if (bodyAnchors.io.current) {
      copyKmVectorToUnits(
        bodyAnchors.io.current.position,
        simulation.bodies.io.positionRelativeToParentKm,
      );
    }
    if (bodyAnchors.europa.current) {
      copyKmVectorToUnits(
        bodyAnchors.europa.current.position,
        simulation.bodies.europa.positionRelativeToParentKm,
      );
    }
    if (bodyAnchors.ganymede.current) {
      copyKmVectorToUnits(
        bodyAnchors.ganymede.current.position,
        simulation.bodies.ganymede.positionRelativeToParentKm,
      );
    }
    if (bodyAnchors.callisto.current) {
      copyKmVectorToUnits(
        bodyAnchors.callisto.current.position,
        simulation.bodies.callisto.positionRelativeToParentKm,
      );
    }
    if (bodyAnchors.titan.current) {
      copyKmVectorToUnits(
        bodyAnchors.titan.current.position,
        simulation.bodies.titan.positionRelativeToParentKm,
      );
    }
    if (bodyAnchors.iapetus.current) {
      copyKmVectorToUnits(
        bodyAnchors.iapetus.current.position,
        simulation.bodies.iapetus.positionRelativeToParentKm,
      );
    }
    if (bodyAnchors.triton.current) {
      copyKmVectorToUnits(
        bodyAnchors.triton.current.position,
        simulation.bodies.triton.positionRelativeToParentKm,
      );
    }

    for (const bodyId of AXIAL_SPIN_BODY_IDS) {
      const spinRef = axialSpinRefs[bodyId].current;
      if (!spinRef) continue;
      spinRef.rotation.set(
        0,
        spinAngleFromHours(
          simulation.dateMs,
          BODY_ROTATION_PERIOD_HOURS[bodyId],
        ),
        0,
      );
    }

    if (earthSpinRef.current) {
      setEarthQuaternion(earthSpinRef.current.quaternion, simulation.dateMs);
    }

    const saturnSpinAngle = spinAngleFromHours(
      simulation.dateMs,
      SATURN_ROTATION_PERIOD_HOURS,
    );
    saturnLocalSunDirectionRef.current
      .copy(simulation.bodies.saturn.sunDirectionWorld)
      .applyAxisAngle(AXIAL_TILT_AXIS, -SATURN_AXIAL_TILT_RAD)
      .applyAxisAngle(LOCAL_UP_AXIS, -saturnSpinAngle)
      .normalize();

    for (const bodyId of SYNCHRONOUS_BODY_IDS) {
      const anchor = bodyAnchors[bodyId].current;
      const spinRef = synchronousSpinRefs[bodyId].current;
      if (!anchor || !spinRef) continue;

      localDirectionToParentRef.current
        .copy(anchor.position)
        .multiplyScalar(-1)
        .normalize();
      setSynchronousQuaternion(
        spinRef.quaternion,
        localDirectionToParentRef.current,
        LOCAL_UP_AXIS,
      );
    }

    const farPlaneBodyIds =
      focusBodyId === "artemis2" ? ARTEMIS_CAMERA_BODY_IDS : BODY_IDS;

    let furthestBodyDistanceKm = 1;
    for (const bodyId of farPlaneBodyIds) {
      const body = simulation.bodies[bodyId];
      furthestBodyDistanceKm = Math.max(
        furthestBodyDistanceKm,
        body.positionRelativeToFocusKm.length() +
          BODY_DEFINITIONS[bodyId].renderRadiusKm,
      );
    }

    const currentFocusDistance = camera.position.distanceTo(
      controlsRef.current?.target ?? focusTargetRef.current.set(0, 0, 0),
    );
    if (cameraDistanceRef) {
      (cameraDistanceRef as { current: number }).current = currentFocusDistance;
    }
    const nearScale =
      focusBodyId === "artemis2" ? MISSION_CAMERA_NEAR_SCALE : CAMERA_NEAR_SCALE;
    const nextNear = Math.max(
      MIN_FOCUS_DISTANCE,
      currentFocusDistance * nearScale,
    );
    const unclampedFar =
      currentFocusDistance + kmToUnits(furthestBodyDistanceKm * CAMERA_FAR_MARGIN);
    const nextFar =
      focusBodyId === "artemis2"
        ? Math.min(
            unclampedFar,
            Math.max(
              kmToUnits(ARTEMIS_CAMERA_MIN_FAR_KM),
              kmToUnits(
                (simulation.bodies.sun.positionRelativeToFocusKm.length() +
                  BODY_DEFINITIONS.sun.renderRadiusKm) *
                  CAMERA_FAR_MARGIN,
              ),
              currentFocusDistance * ARTEMIS_CAMERA_FAR_MULTIPLIER,
            ),
          )
        : unclampedFar;

    if (
      Math.abs(camera.near - nextNear) > 1e-3 ||
      Math.abs(camera.far - nextFar) > 1
    ) {
      camera.near = nextNear;
      camera.far = nextFar;
      camera.updateProjectionMatrix();
    }
  }, -1);

  const focusLightDirection =
    focusBodyId === "sun"
      ? camera.position
      : simulationRef.current.bodies[focusBodyId].sunDirectionWorld;
  const controlDampingEnabled = focusBodyId !== "artemis2";
  const controlDampingFactor = controlDampingEnabled ? 0.05 : 0;

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        enableDamping={controlDampingEnabled}
        dampingFactor={controlDampingFactor}
        enablePan={false}
        enableZoom={false}
      />
      <FocusCameraRig
        bodyAnchors={bodyAnchors}
        controlsRef={controlsRef}
        focusBodyId={focusBodyId}
      />

      <SystemLightRig
        direction={focusLightDirection}
        intensity={sunIntensity}
        layer={0}
        targetRef={bodyAnchors[focusBodyId]}
      />

      <group ref={bodyAnchors.sun}>
        <Sun />
      </group>

      {DIRECT_SOLAR_BODY_IDS.map((bodyId) => (
        <group key={bodyId} ref={bodyAnchors[bodyId]}>
          <group rotation={[0, 0, BODY_AXIAL_TILT_RAD[bodyId]]}>
            <group ref={axialSpinRefs[bodyId]}>
              <TexturedBody bodyId={bodyId} />
              <SunBloomOccluder radiusKm={BODY_DEFINITIONS[bodyId].radiusKm} />
            </group>
          </group>
        </group>
      ))}

      <group ref={earthSystemRef}>
        <group ref={bodyAnchors.earth}>
          <group ref={earthSpinRef}>
            <Earth
              localSunDirection={simulationRef.current.bodies.earth.sunDirectionWorld}
              simulationStateRef={simulationRef}
            />
            <SunBloomOccluder radiusKm={BODY_DEFINITIONS.earth.radiusKm} />
          </group>
          <group ref={bodyAnchors.moon}>
            <group ref={synchronousSpinRefs.moon}>
              <Moon simulationStateRef={simulationRef} />
              <SunBloomOccluder radiusKm={BODY_DEFINITIONS.moon.radiusKm} />
            </group>
          </group>
        </group>
      </group>

      <group ref={marsSystemRef}>
        <group ref={bodyAnchors.mars}>
          <group rotation={[0, 0, BODY_AXIAL_TILT_RAD.mars]}>
            <group ref={axialSpinRefs.mars}>
              <TexturedBody bodyId="mars" />
              <SunBloomOccluder radiusKm={BODY_DEFINITIONS.mars.radiusKm} />
            </group>
          </group>
          <group ref={bodyAnchors.phobos}>
            <group ref={synchronousSpinRefs.phobos}>
              <TexturedBody bodyId="phobos" />
              <SunBloomOccluder radiusKm={BODY_DEFINITIONS.phobos.radiusKm} />
            </group>
          </group>
        </group>
      </group>

      <group ref={jupiterSystemRef}>
        <group ref={bodyAnchors.jupiter}>
          <group rotation={[0, 0, BODY_AXIAL_TILT_RAD.jupiter]}>
            <group ref={axialSpinRefs.jupiter}>
              <TexturedBody bodyId="jupiter" />
              <SunBloomOccluder radiusKm={BODY_DEFINITIONS.jupiter.radiusKm} />
            </group>
          </group>
          <group ref={bodyAnchors.io}>
            <group ref={synchronousSpinRefs.io}>
              <TexturedBody bodyId="io" />
              <SunBloomOccluder radiusKm={BODY_DEFINITIONS.io.radiusKm} />
            </group>
          </group>
          <group ref={bodyAnchors.europa}>
            <group ref={synchronousSpinRefs.europa}>
              <TexturedBody bodyId="europa" />
              <SunBloomOccluder radiusKm={BODY_DEFINITIONS.europa.radiusKm} />
            </group>
          </group>
          <group ref={bodyAnchors.ganymede}>
            <group ref={synchronousSpinRefs.ganymede}>
              <TexturedBody bodyId="ganymede" />
              <SunBloomOccluder radiusKm={BODY_DEFINITIONS.ganymede.radiusKm} />
            </group>
          </group>
          <group ref={bodyAnchors.callisto}>
            <group ref={synchronousSpinRefs.callisto}>
              <TexturedBody bodyId="callisto" />
              <SunBloomOccluder radiusKm={BODY_DEFINITIONS.callisto.radiusKm} />
            </group>
          </group>
        </group>
      </group>

      <group ref={saturnSystemRef}>
        <group ref={bodyAnchors.saturn}>
          <group rotation={[0, 0, SATURN_AXIAL_TILT_RAD]}>
            <group ref={axialSpinRefs.saturn}>
              <Saturn
                localSunDirection={saturnLocalSunDirectionRef.current}
                worldSunDirection={simulationRef.current.bodies.saturn.sunDirectionWorld}
                ringShadowStrength={ringShadowStrength}
                textured={texturedSaturn}
              />
              <SunBloomOccluder radiusKm={BODY_DEFINITIONS.saturn.radiusKm} />
              <Atmosphere
                intensity={atmosphereIntensity}
                power={atmospherePower}
                worldSunDirection={simulationRef.current.bodies.saturn.sunDirectionWorld}
              />
            </group>
            <Rings
              chromaGain={ringChromaGain}
              opacity={ringOpacity}
              planetShadowStrength={planetShadowStrength}
              warmth={ringWarmth}
              textured={texturedRings}
              sunDirection={simulationRef.current.bodies.saturn.sunDirectionWorld}
            />
            {debugCanary ? <DebugCanary /> : null}
          </group>
          <group ref={bodyAnchors.titan}>
            <group ref={synchronousSpinRefs.titan}>
              <TexturedBody bodyId="titan" />
              <SunBloomOccluder radiusKm={BODY_DEFINITIONS.titan.radiusKm} />
            </group>
          </group>
          <group ref={bodyAnchors.iapetus}>
            <group ref={synchronousSpinRefs.iapetus}>
              <TexturedBody bodyId="iapetus" />
              <SunBloomOccluder radiusKm={BODY_DEFINITIONS.iapetus.radiusKm} />
            </group>
          </group>
        </group>
      </group>

      <group ref={neptuneSystemRef}>
        <group ref={bodyAnchors.neptune}>
          <group rotation={[0, 0, BODY_AXIAL_TILT_RAD.neptune]}>
            <group ref={axialSpinRefs.neptune}>
              <TexturedBody bodyId="neptune" />
              <SunBloomOccluder radiusKm={BODY_DEFINITIONS.neptune.radiusKm} />
            </group>
          </group>
          <group ref={bodyAnchors.triton}>
            <group ref={synchronousSpinRefs.triton}>
              <TexturedBody bodyId="triton" />
              <SunBloomOccluder radiusKm={BODY_DEFINITIONS.triton.radiusKm} />
            </group>
          </group>
        </group>
      </group>

      <MissionTrajectories
        focusBodyId={focusBodyId}
        activeMissionId={activeMissionId}
        missionAnchors={{
          artemis2: bodyAnchors.artemis2,
        }}
        missionFocusOffsetsKm={{
          artemis2: artemisFocusOffsetKmRef,
        }}
        systemOriginKmRef={earthSystemOriginKmRef}
        timeline={timeline}
      />

      <Stars />
      <Effects missionBloomTargetId={missionBloomTargetId} />
    </>
  );
});
