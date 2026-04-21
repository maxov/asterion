import {
  useEffect,
  memo,
  useMemo,
  useRef,
  type ElementRef,
  type MutableRefObject,
  type RefObject,
} from "react";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useControls } from "leva";
import { Color, MathUtils, Object3D, Vector3, type Group } from "three";
import { Atmosphere } from "./Atmosphere.tsx";
import { Earth } from "./Earth.tsx";
import { Lighting } from "./Lighting.tsx";
import { MissionTrajectories } from "./MissionTrajectory.tsx";
import { Moon } from "./Moon.tsx";
import { Rings } from "./Rings.tsx";
import { Saturn } from "./Saturn.tsx";
import { Stars } from "./Stars.tsx";
import { Sun } from "./Sun.tsx";
import { SystemLightRig } from "./SystemLightRig.tsx";
import { Titan } from "./Titan.tsx";
import {
  BODY_DEFINITIONS,
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
  DEFAULT_EXPOSURE,
  SATURN_AXIAL_TILT_DEG,
  SATURN_ROTATION_PERIOD_HOURS,
  SUN_INTENSITY,
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
import { kmToUnits } from "../lib/units.ts";

type Pipeline = { outputNode: unknown; renderAsync: () => Promise<void> };

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
const AXIAL_TILT_RAD = (SATURN_AXIAL_TILT_DEG * Math.PI) / 180;
const AXIAL_TILT_AXIS = new Vector3(0, 0, 1);
const CANARY_COLOR = new Color("#ff1fbf");
const CAMERA_NEAR_SCALE = 0.01;
const MISSION_CAMERA_NEAR_SCALE = 0.001;
const CAMERA_FAR_MARGIN = 1.2;
const MIN_FOCUS_DISTANCE = 1e-8;
const TARGET_FOLLOW_DAMPING = 0.16;
const DISTANCE_FOLLOW_DAMPING = 0.18;
const FALLBACK_VIEW_DIRECTION = new Vector3(0.54, 0.31, 0.78).normalize();
const LOCAL_UP_AXIS = new Vector3(0, 1, 0);

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

export const Scene = memo(function Scene({
  focusBodyId,
  activeMissionId,
  timeline,
  cameraDistanceRef,
}: SceneProps) {
  const camera = useThree((state) => state.camera);
  const controlsRef = useRef<OrbitControlsHandle | null>(null);
  const sunAnchorRef = useRef<Group>(null);
  const saturnAnchorRef = useRef<Group>(null);
  const saturnSpinRef = useRef<Group>(null);
  const titanAnchorRef = useRef<Group>(null);
  const titanSpinRef = useRef<Group>(null);
  const earthSystemRef = useRef<Group>(null);
  const earthAnchorRef = useRef<Group>(null);
  const earthSpinRef = useRef<Group>(null);
  const moonAnchorRef = useRef<Group>(null);
  const moonSpinRef = useRef<Group>(null);
  const artemisAnchorRef = useRef<Group>(null);
  const artemisFocusOffsetKmRef = useRef(new Vector3());
  const earthSystemOriginKmRef = useRef(new Vector3());
  const simulationRef = useRef(createSolarSystemState(DEFAULT_FOCUS_BODY_ID));
  const saturnLocalSunDirectionRef = useRef(new Vector3(1, 0, 0));
  const localDirectionToParentRef = useRef(new Vector3());
  const focusTargetRef = useRef(new Vector3());

  const bodyAnchors = useMemo<BodyAnchorMap>(
    () => ({
      sun: sunAnchorRef,
      earth: earthAnchorRef,
      moon: moonAnchorRef,
      artemis2: artemisAnchorRef,
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

    if (sunAnchorRef.current) {
      copyKmVectorToUnits(
        sunAnchorRef.current.position,
        simulation.bodies.sun.positionRelativeToFocusKm,
      );
    }
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
    if (moonAnchorRef.current) {
      copyKmVectorToUnits(
        moonAnchorRef.current.position,
        simulation.bodies.moon.positionRelativeToParentKm,
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

    const saturnSpinAngle = spinAngleFromHours(
      simulation.dateMs,
      SATURN_ROTATION_PERIOD_HOURS,
    );
    saturnSpinRef.current?.rotation.set(0, saturnSpinAngle, 0);
    if (earthSpinRef.current) {
      setEarthQuaternion(earthSpinRef.current.quaternion, simulation.dateMs);
    }

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
    const nextFar =
      currentFocusDistance + kmToUnits(furthestBodyDistanceKm * CAMERA_FAR_MARGIN);

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

      <group ref={sunAnchorRef}>
        {focusBodyId === "sun" ? <Sun /> : null}
      </group>

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

      <group ref={earthSystemRef}>
        <group ref={earthAnchorRef}>
          <group ref={earthSpinRef}>
            <Earth
              localSunDirection={simulationRef.current.bodies.earth.sunDirectionWorld}
              simulationStateRef={simulationRef}
            />
          </group>
          <group ref={moonAnchorRef}>
            <group ref={moonSpinRef}>
              <Moon />
            </group>
          </group>
        </group>
      </group>
      <MissionTrajectories
        focusBodyId={focusBodyId}
        activeMissionId={activeMissionId}
        missionAnchors={{
          artemis2: artemisAnchorRef,
        }}
        missionFocusOffsetsKm={{
          artemis2:
            artemisFocusOffsetKmRef as MutableRefObject<Vector3>,
        }}
        systemOriginKmRef={
          earthSystemOriginKmRef as MutableRefObject<Vector3>
        }
        timeline={timeline}
      />

      <Stars />
      {focusBodyId === "sun" ? null : (
        <Lighting direction={simulationRef.current.focusSunDirectionWorld} />
      )}
      <Effects />
    </>
  );
});
