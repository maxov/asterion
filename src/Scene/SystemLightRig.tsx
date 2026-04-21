import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Color,
  type AmbientLight,
  type DirectionalLight,
  Object3D,
  Vector3,
} from "three";

const LIGHT_DISTANCE = 1000;
const SUN_COLOR = new Color(0xfff5e1);

type SystemLightRigProps = {
  ambientIntensity?: number;
  direction: Vector3;
  intensity: number;
  layer: number;
  targetRef: RefObject<Object3D | null>;
};

export function SystemLightRig({
  ambientIntensity = 0.005,
  direction,
  intensity,
  layer,
  targetRef,
}: SystemLightRigProps) {
  const directionalRef = useRef<DirectionalLight>(null);
  const ambientRef = useRef<AmbientLight>(null);
  const lightTarget = useMemo(() => new Object3D(), []);
  const lightPositionRef = useRef(new Vector3());
  const targetPositionRef = useRef(new Vector3());

  useEffect(() => {
    directionalRef.current?.layers.set(layer);
    ambientRef.current?.layers.set(layer);
  }, [layer]);

  useEffect(() => {
    const directionalLight = directionalRef.current;
    if (!directionalLight) return;

    directionalLight.target = lightTarget;
    directionalLight.target.updateMatrixWorld();
  }, [lightTarget]);

  useFrame(() => {
    if (!targetRef.current) return;

    targetRef.current.getWorldPosition(targetPositionRef.current);
    lightTarget.position.copy(targetPositionRef.current);
    lightPositionRef.current
      .copy(direction)
      .multiplyScalar(LIGHT_DISTANCE)
      .add(targetPositionRef.current);

    directionalRef.current?.position.copy(lightPositionRef.current);
    lightTarget.updateMatrixWorld();
  });

  return (
    <>
      <primitive object={lightTarget} />
      <directionalLight
        ref={directionalRef}
        intensity={intensity}
        color={SUN_COLOR}
      />
      <ambientLight ref={ambientRef} intensity={ambientIntensity} />
    </>
  );
}
