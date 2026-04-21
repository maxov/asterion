import {
  useEffect,
  memo,
  useMemo,
  useRef,
  type ElementRef,
  type RefObject,
} from "react";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useControls } from "leva";
import { Color, MathUtils, Vector3, type Group } from "three";
import { Atmosphere } from "./Atmosphere.tsx";
import { Earth } from "./Earth.tsx";
import { Lighting } from "./Lighting.tsx";
import { Moon } from "./Moon.tsx";
import { Rings } from "./Rings.tsx";
import { Saturn } from "./Saturn.tsx";
import { Stars } from "./Stars.tsx";
import { SystemLightRig } from "./SystemLightRig.tsx";
import { Titan } from "./Titan.tsx";
import {
  BODY_DEFINITIONS,
  BODY_OPTIONS,
  DEFAULT_FOCUS_BODY_ID,
  type BodyId,
} from "../lib/bodies.ts";
import {
  createSolarSystemState,
  updateSolarSystemState,
} from "../lib/solarSystemState.ts";
import {
  DEFAULT_BLOOM_RADIUS,
  DEFAULT_BLOOM_STRENGTH,
  DEFAULT_BLOOM_THRESHOLD,
  EARTH_AXIAL_TILT_DEG,
  DEFAULT_EXPOSURE,
  SATURN_AXIAL_TILT_DEG,
  SATURN_ROTATION_PERIOD_HOURS,
  SUN_INTENSITY,
} from "../lib/constants.ts";
import {
  earthRotationAngleRad,
  setSynchronousQuaternion,
  spinAngleFromHours,
} from "../lib/bodyOrientation.ts";
import {
  currentSimulationDateMs,
  timelineSystemMs,
  type SimulationTimeline,
} from "../lib/simulationTimeline.ts";
import { kmToUnits } from "../lib/units.ts";

type Pipeline = { outputNode: unknown; renderAsync: () => Promise<void> };

type OrbitControlsHandle = ElementRef<typeof OrbitControls>;
type BodyAnchorMap = Record<BodyId, RefObject<Group | null>>;
type SceneProps = {
  timeline: SimulationTimeline;
};

const BODY_IDS = Object.keys(BODY_DEFINITIONS) as BodyId[];
const AXIAL_TILT_RAD = (SATURN_AXIAL_TILT_DEG * Math.PI) / 180;
const AXIAL_TILT_AXIS = new Vector3(0, 0, 1);
const EARTH_AXIAL_TILT_RAD = (EARTH_AXIAL_TILT_DEG * Math.PI) / 180;
const CANARY_COLOR = new Color("#ff1fbf");
const CAMERA_NEAR_SCALE = 0.01;
const CAMERA_FAR_MARGIN = 1.2;
const TARGET_FOLLOW_DAMPING = 0.16;
const DISTANCE_FOLLOW_DAMPING = 0.18;
const FALLBACK_VIEW_DIRECTION = new Vector3(0.54, 0.31, 0.78).normalize();
const LOCAL_UP_AXIS = new Vector3(0, 1, 0);

function copyKmVectorToUnits(target: Vector3, source: Vector3) {
  target.set(kmToUnits(source.x), kmToUnits(source.y), kmToUnits(source.z));
}

function Effects() {
  const { gl, scene, camera } = useThree();
  const pipelineRef = useRef<Pipeline | null>(null);
  const renderInFlightRef = useRef(false);

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
    let cancelled = false;

    async function init() {
      try {
        const [{ RenderPipeline }, { pass }, { bloom }] = await Promise.all([
          import("three/webgpu"),
          import("three/tsl"),
          import("three/addons/tsl/display/BloomNode.js"),
        ] as const);

        if (cancelled) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pipeline = new (RenderPipeline as any)(gl) as Pipeline;
        const scenePass = pass(scene, camera);
        const tex = scenePass.getTextureNode();
        const bloomPass = bloom(
          tex,
          bloomStrength,
          bloomRadius,
          bloomThreshold,
        );
        pipeline.outputNode = tex.add(bloomPass);
        pipelineRef.current = pipeline;
      } catch (err) {
        console.warn(
          "WebGPU postprocessing unavailable, falling back to direct render:",
          err,
        );
      }
    }

    init();
    return () => {
      cancelled = true;
      pipelineRef.current = null;
      renderInFlightRef.current = false;
    };
  }, [gl, scene, camera, bloomStrength, bloomRadius, bloomThreshold]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    (gl as unknown as { toneMappingExposure: number }).toneMappingExposure =
      exposure;
  }, [gl, exposure]);

  useFrame(() => {
    if (!postprocess || !pipelineRef.current) {
      gl.render(scene, camera);
      return;
    }

    if (renderInFlightRef.current) return;

    renderInFlightRef.current = true;
    void pipelineRef.current
      .renderAsync()
      .catch((err) => {
        console.warn(
          "WebGPU postprocessing render failed, falling back to direct render:",
          err,
        );
        pipelineRef.current = null;
      })
      .finally(() => {
        renderInFlightRef.current = false;
      });
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
    kmToUnits(BODY_DEFINITIONS[focusBodyId].defaultFocusDistanceKm),
  );
  const snapToFocusRef = useRef(true);
  const focusDefinition = BODY_DEFINITIONS[focusBodyId];
  const minDistance = kmToUnits(focusDefinition.minDistanceKm);
  const maxDistance = kmToUnits(focusDefinition.maxDistanceKm);

  useEffect(() => {
    targetDistanceRef.current = MathUtils.clamp(
      kmToUnits(focusDefinition.defaultFocusDistanceKm),
      minDistance,
      maxDistance,
    );
    snapToFocusRef.current = true;
  }, [
    focusBodyId,
    focusDefinition.defaultFocusDistanceKm,
    maxDistance,
    minDistance,
  ]);

  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const scale = Math.pow(0.95, event.deltaY * 0.01);
      targetDistanceRef.current = MathUtils.clamp(
        targetDistanceRef.current * scale,
        minDistance,
        maxDistance,
      );
    };

    gl.domElement.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      gl.domElement.removeEventListener("wheel", onWheel);
    };
  }, [gl, maxDistance, minDistance]);

  useFrame(() => {
    const controls = controlsRef.current;
    const anchor = bodyAnchors[focusBodyId].current;
    if (!controls || !anchor) return;

    anchor.getWorldPosition(desiredTargetRef.current);
    currentOffsetRef.current.copy(camera.position).sub(controls.target);

    let currentDistance = currentOffsetRef.current.length();
    if (currentDistance <= 1e-5) {
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

export const Scene = memo(function Scene({ timeline }: SceneProps) {
  const camera = useThree((state) => state.camera);
  const controlsRef = useRef<OrbitControlsHandle | null>(null);
  const saturnAnchorRef = useRef<Group>(null);
  const saturnSpinRef = useRef<Group>(null);
  const titanAnchorRef = useRef<Group>(null);
  const titanSpinRef = useRef<Group>(null);
  const earthAnchorRef = useRef<Group>(null);
  const earthSpinRef = useRef<Group>(null);
  const moonAnchorRef = useRef<Group>(null);
  const moonSpinRef = useRef<Group>(null);
  const simulationRef = useRef(createSolarSystemState(DEFAULT_FOCUS_BODY_ID));
  const saturnLocalSunDirectionRef = useRef(new Vector3(1, 0, 0));
  const localDirectionToParentRef = useRef(new Vector3());

  const bodyAnchors = useMemo<BodyAnchorMap>(
    () => ({
      earth: earthAnchorRef,
      moon: moonAnchorRef,
      saturn: saturnAnchorRef,
      titan: titanAnchorRef,
    }),
    [],
  );

  const { texturedSaturn, texturedRings, debugCanary } = useControls("Debug", {
    texturedSaturn: { value: true, label: "Saturn Texture" },
    texturedRings: { value: true, label: "Ring Texture" },
    debugCanary: { value: false, label: "Canary Cube" },
  });

  const { focusBody } = useControls("Navigation", {
    focusBody: {
      value: DEFAULT_FOCUS_BODY_ID,
      options: BODY_OPTIONS,
      label: "Center On",
    },
  });
  const focusBodyId = focusBody as BodyId;
  const focusDefinition = BODY_DEFINITIONS[focusBodyId];

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

    if (saturnAnchorRef.current) {
      copyKmVectorToUnits(
        saturnAnchorRef.current.position,
        simulation.bodies.saturn.positionRelativeToFocusKm,
      );
    }
    if (titanAnchorRef.current) {
      copyKmVectorToUnits(
        titanAnchorRef.current.position,
        simulation.bodies.titan.positionRelativeToParentKm,
      );
    }
    if (earthAnchorRef.current) {
      copyKmVectorToUnits(
        earthAnchorRef.current.position,
        simulation.bodies.earth.positionRelativeToFocusKm,
      );
    }
    if (moonAnchorRef.current) {
      copyKmVectorToUnits(
        moonAnchorRef.current.position,
        simulation.bodies.moon.positionRelativeToParentKm,
      );
    }

    const saturnSpinAngle = spinAngleFromHours(
      simulation.dateMs,
      SATURN_ROTATION_PERIOD_HOURS,
    );
    saturnSpinRef.current?.rotation.set(0, saturnSpinAngle, 0);
    earthSpinRef.current?.rotation.set(
      0,
      earthRotationAngleRad(simulation.dateMs),
      0,
    );

    saturnLocalSunDirectionRef.current
      .copy(simulation.bodies.saturn.sunDirectionWorld)
      .applyAxisAngle(AXIAL_TILT_AXIS, -AXIAL_TILT_RAD)
      .applyAxisAngle(LOCAL_UP_AXIS, -saturnSpinAngle)
      .normalize();

    if (titanAnchorRef.current && titanSpinRef.current) {
      localDirectionToParentRef.current
        .copy(titanAnchorRef.current.position)
        .multiplyScalar(-1)
        .normalize();
      setSynchronousQuaternion(
        titanSpinRef.current.quaternion,
        localDirectionToParentRef.current,
        LOCAL_UP_AXIS,
      );
    }

    if (moonAnchorRef.current && moonSpinRef.current) {
      localDirectionToParentRef.current
        .copy(moonAnchorRef.current.position)
        .multiplyScalar(-1)
        .normalize();
      setSynchronousQuaternion(
        moonSpinRef.current.quaternion,
        localDirectionToParentRef.current,
        LOCAL_UP_AXIS,
      );
    }

    let furthestBodyDistanceKm = 1;
    for (const bodyId of BODY_IDS) {
      const body = simulation.bodies[bodyId];
      furthestBodyDistanceKm = Math.max(
        furthestBodyDistanceKm,
        body.positionRelativeToFocusKm.length() +
          BODY_DEFINITIONS[bodyId].renderRadiusKm,
      );
    }

    const nextNear = Math.max(
      0.1,
      kmToUnits(focusDefinition.defaultFocusDistanceKm) * CAMERA_NEAR_SCALE,
    );
    const nextFar = Math.max(
      kmToUnits(furthestBodyDistanceKm * CAMERA_FAR_MARGIN),
      kmToUnits(focusDefinition.maxDistanceKm) * 1.1,
    );

    if (
      Math.abs(camera.near - nextNear) > 1e-3 ||
      Math.abs(camera.far - nextFar) > 1
    ) {
      camera.near = nextNear;
      camera.far = nextFar;
      camera.updateProjectionMatrix();
    }
  }, -1);

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.05}
        enablePan={false}
        enableZoom={false}
        minDistance={kmToUnits(focusDefinition.minDistanceKm)}
        maxDistance={kmToUnits(focusDefinition.maxDistanceKm)}
      />
      <FocusCameraRig
        bodyAnchors={bodyAnchors}
        controlsRef={controlsRef}
        focusBodyId={focusBodyId}
      />

      <SystemLightRig
        direction={simulationRef.current.bodies[focusBodyId].sunDirectionWorld}
        intensity={sunIntensity}
        layer={0}
        targetRef={bodyAnchors[focusBodyId]}
      />

      <group ref={saturnAnchorRef}>
        <group rotation={[0, 0, AXIAL_TILT_RAD]}>
          <group ref={saturnSpinRef}>
            <Saturn
              localSunDirection={saturnLocalSunDirectionRef.current}
              textured={texturedSaturn}
            />
            <Atmosphere />
          </group>
          <Rings
            textured={texturedRings}
            sunDirection={simulationRef.current.bodies.saturn.sunDirectionWorld}
          />
          <group ref={titanAnchorRef}>
            <group ref={titanSpinRef}>
              <Titan />
            </group>
          </group>
          {debugCanary ? <DebugCanary /> : null}
        </group>
      </group>

      <group ref={earthAnchorRef}>
        <group rotation={[0, 0, EARTH_AXIAL_TILT_RAD]}>
          <group ref={earthSpinRef}>
            <Earth
              localSunDirection={simulationRef.current.bodies.earth.sunDirectionWorld}
              simulationStateRef={simulationRef}
            />
          </group>
        </group>
        <group ref={moonAnchorRef}>
          <group ref={moonSpinRef}>
            <Moon />
          </group>
        </group>
      </group>

      <Stars />
      <Lighting direction={simulationRef.current.focusSunDirectionWorld} />
      <Effects />
    </>
  );
});
