import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useControls } from "leva";
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  FrontSide,
  LinearFilter,
  MathUtils,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Mesh,
  type Texture,
  Vector3,
} from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  RING_INNER_RADIUS,
  RING_OUTER_RADIUS,
  SATURN_EQUATORIAL_RADIUS,
  SATURN_POLAR_RADIUS,
} from "../lib/constants.ts";
import { kmToUnits } from "../lib/units.ts";
import {
  usePreparedSharedTexture,
  useSharedTexture,
} from "../lib/useSharedTexture.ts";

const EQUATORIAL = kmToUnits(SATURN_EQUATORIAL_RADIUS);
const POLAR_SCALE = SATURN_POLAR_RADIUS / SATURN_EQUATORIAL_RADIUS;
const POLAR = EQUATORIAL * POLAR_SCALE;
const FALLBACK_COLOR = new Color(0.76, 0.63, 0.35);
const RING_INNER = kmToUnits(RING_INNER_RADIUS);
const RING_OUTER = kmToUnits(RING_OUTER_RADIUS);
const SHADOW_SHELL_SCALE = 1.0015;
const SHADOW_TEXTURE_SIZES = {
  far: { height: 512, width: 1024 },
  near: { height: 1024, width: 2048 },
} as const;
const SHADOW_PROFILE_WIDTH = 2048;
const SHADOW_FADE_START = 0.03;
const SHADOW_FADE_END = 0.12;
const SHADOW_TERMINATOR_END = 0.08;
const SCATTERING_TEXTURE_PATH = "/textures/saturn_rings_scattering.png";
const SHADOW_HIGH_RES_ENTER_DISTANCE = EQUATORIAL * 2.6;
const SHADOW_HIGH_RES_EXIT_DISTANCE = EQUATORIAL * 3.2;

type ShadowResolutionTier = keyof typeof SHADOW_TEXTURE_SIZES;

type ShadowTextureBundle = {
  cosPhi: Float32Array;
  cosTheta: Float32Array;
  context: CanvasRenderingContext2D;
  height: number;
  imageData: ImageData;
  sinPhi: Float32Array;
  sinTheta: Float32Array;
  texture: CanvasTexture;
  width: number;
};

function configureSaturnTexture(texture: Texture) {
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 1;
  texture.needsUpdate = true;
}

function configureShadowTexture(texture: Texture) {
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.anisotropy = 1;
  texture.needsUpdate = true;
}

function selectShadowResolutionTier(
  distance: number,
  currentTier: ShadowResolutionTier,
) {
  if (currentTier === "near") {
    return distance >= SHADOW_HIGH_RES_EXIT_DISTANCE ? "far" : currentTier;
  }

  return distance <= SHADOW_HIGH_RES_ENTER_DISTANCE ? "near" : currentTier;
}

function createShadowTextureBundle(
  width: number,
  height: number,
): ShadowTextureBundle | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return null;

  const texture = new CanvasTexture(canvas);
  configureShadowTexture(texture);

  const cosPhi = new Float32Array(width);
  const sinPhi = new Float32Array(width);
  for (let x = 0; x < width; x += 1) {
    const u = (x + 0.5) / width;
    const phi = u * Math.PI * 2;
    cosPhi[x] = Math.cos(phi);
    sinPhi[x] = Math.sin(phi);
  }

  const cosTheta = new Float32Array(height);
  const sinTheta = new Float32Array(height);
  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    const theta = v * Math.PI;
    cosTheta[y] = Math.cos(theta);
    sinTheta[y] = Math.sin(theta);
  }

  return {
    cosPhi,
    cosTheta,
    context,
    height,
    imageData: context.createImageData(width, height),
    sinPhi,
    sinTheta,
    texture,
    width,
  };
}

function drawScaledRow(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = 1;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, width, 1);
  return context.getImageData(0, 0, width, 1);
}

function createShadowProfile(scatteringTexture: Texture) {
  const image = scatteringTexture.image as
    | (CanvasImageSource & { height?: number; width?: number })
    | undefined;
  const sourceWidth = image?.width ?? 0;
  const sourceHeight = image?.height ?? 0;

  if (!image || !sourceWidth || !sourceHeight) return null;

  const width = Math.min(sourceWidth, SHADOW_PROFILE_WIDTH);
  const row = drawScaledRow(image, sourceWidth, sourceHeight, width);
  if (!row) return null;

  const opacity = new Float32Array(width);
  for (let x = 0; x < width; x += 1) {
    opacity[x] = 1 - row.data[x * 4 + 3] / 255;
  }

  return opacity;
}

function sampleShadowOpacity(profile: Float32Array, radialMix: number) {
  const clampedMix = MathUtils.clamp(radialMix, 0, 1);
  const lastIndex = profile.length - 1;
  const position = clampedMix * lastIndex;
  const startIndex = Math.floor(position);
  const endIndex = Math.min(startIndex + 1, lastIndex);
  const t = position - startIndex;
  return MathUtils.lerp(profile[startIndex], profile[endIndex], t);
}

function renderShadowTexture(
  bundle: ShadowTextureBundle,
  shadowProfile: Float32Array | null,
  localSunDirection: Vector3,
  strength: number,
) {
  const sun = localSunDirection;
  const sunElevation = Math.abs(sun.y);
  const elevationFade = MathUtils.smoothstep(
    sunElevation,
    SHADOW_FADE_START,
    SHADOW_FADE_END,
  );
  const { data } = bundle.imageData;
  data.fill(0);

  if (
    !shadowProfile ||
    sunElevation <= 1e-5 ||
    elevationFade <= 0 ||
    strength <= 0
  ) {
    bundle.context.putImageData(bundle.imageData, 0, 0);
    bundle.texture.needsUpdate = true;
    return;
  }

  const sunX = sun.x;
  const sunY = sun.y;
  const sunZ = sun.z;
  const inverseEquatorialSquared = 1 / (EQUATORIAL * EQUATORIAL);
  const inversePolarSquared = 1 / (POLAR * POLAR);

  for (let y = 0; y < bundle.height; y += 1) {
    const sinTheta = bundle.sinTheta[y];
    const cosTheta = bundle.cosTheta[y];
    const py = POLAR * cosTheta;
    const ny = py * inversePolarSquared;
    const rayDistance = -py / sunY;

    if (rayDistance <= 0) continue;

    for (let x = 0; x < bundle.width; x += 1) {
      const px = -EQUATORIAL * bundle.cosPhi[x] * sinTheta;
      const pz = EQUATORIAL * bundle.sinPhi[x] * sinTheta;

      const nx = px * inverseEquatorialSquared;
      const nz = pz * inverseEquatorialSquared;
      const normalLength = Math.hypot(nx, ny, nz);
      const lit = (nx * sunX + ny * sunY + nz * sunZ) / normalLength;
      if (lit <= 0) continue;

      const ix = px + sunX * rayDistance;
      const iz = pz + sunZ * rayDistance;
      const radial = Math.hypot(ix, iz);
      if (radial <= RING_INNER || radial >= RING_OUTER) continue;

      const radialMix = (radial - RING_INNER) / (RING_OUTER - RING_INNER);
      const ringShadow = sampleShadowOpacity(shadowProfile, radialMix);
      if (ringShadow <= 0) continue;

      const dayFade = MathUtils.smoothstep(lit, 0, SHADOW_TERMINATOR_END);
      const alpha = Math.min(
        ringShadow * strength * elevationFade * dayFade,
        1,
      );
      if (alpha <= 0) continue;

      const dst = (y * bundle.width + x) * 4;
      data[dst + 3] = Math.round(alpha * 255);
    }
  }

  bundle.context.putImageData(bundle.imageData, 0, 0);
  bundle.texture.needsUpdate = true;
}

type SaturnProps = {
  localSunDirection: Vector3;
  textured?: boolean;
};

export function Saturn({
  localSunDirection,
  textured = true,
}: SaturnProps) {
  const camera = useThree((state) => state.camera);
  const meshRef = useRef<Mesh>(null);
  const [shadowResolutionTier, setShadowResolutionTier] =
    useState<ShadowResolutionTier>(() =>
      selectShadowResolutionTier(camera.position.length(), "far"),
    );
  const shadowResolutionTierRef = useRef(shadowResolutionTier);
  const { texture, error } = usePreparedSharedTexture(
    "/textures/saturn_albedo.jpg",
    "saturn-albedo",
    configureSaturnTexture,
  );
  const { texture: scatteringTexture, error: scatteringError } = useSharedTexture(
    SCATTERING_TEXTURE_PATH,
  );

  const { ringShadowStrength } = useControls("Saturn", {
    ringShadowStrength: {
      value: 0.78,
      min: 0,
      max: 1,
      step: 0.01,
      label: "Ring Shadow",
    },
  });

  const fallback = useMemo(
    () =>
      new MeshStandardMaterial({
        color: FALLBACK_COLOR,
        roughness: 0.85,
        metalness: 0,
      }),
    [],
  );

  useEffect(() => () => fallback.dispose(), [fallback]);
  useEffect(() => {
    if (error) {
      console.warn("Saturn: failed to load /textures/saturn_albedo.jpg", error);
    }
  }, [error]);
  useEffect(() => {
    if (scatteringError) {
      console.warn(
        `Saturn: failed to load ${SCATTERING_TEXTURE_PATH}`,
        scatteringError,
      );
    }
  }, [scatteringError]);

  const material = useMemo(() => {
    if (!textured || !texture) return null;
    const mat = new MeshStandardNodeMaterial();
    mat.map = texture;
    mat.roughness = 0.85;
    mat.metalness = 0;
    return mat;
  }, [textured, texture]);

  useEffect(() => {
    return () => {
      material?.dispose();
    };
  }, [material]);

  const shadowProfile = useMemo(
    () => (scatteringTexture ? createShadowProfile(scatteringTexture) : null),
    [scatteringTexture],
  );
  const deferredSunDirection = useDeferredValue(localSunDirection);
  const deferredRingShadowStrength = useDeferredValue(ringShadowStrength);
  const shadowSize = SHADOW_TEXTURE_SIZES[shadowResolutionTier];

  useEffect(() => {
    shadowResolutionTierRef.current = shadowResolutionTier;
  }, [shadowResolutionTier]);

  useFrame(() => {
    const nextTier = selectShadowResolutionTier(
      camera.position.length(),
      shadowResolutionTierRef.current,
    );

    if (nextTier === shadowResolutionTierRef.current) return;

    shadowResolutionTierRef.current = nextTier;
    startTransition(() => {
      setShadowResolutionTier(nextTier);
    });
  });

  const shadowBundle = useMemo(
    () => createShadowTextureBundle(shadowSize.width, shadowSize.height),
    [shadowSize.height, shadowSize.width],
  );

  const shadowMaterial = useMemo(() => {
    if (!shadowBundle) return null;

    return new MeshBasicMaterial({
      map: shadowBundle.texture,
      transparent: true,
      premultipliedAlpha: true,
      side: FrontSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
  }, [shadowBundle]);

  useEffect(() => {
    if (!shadowBundle) return;
    const frame = requestAnimationFrame(() => {
      renderShadowTexture(
        shadowBundle,
        shadowProfile,
        deferredSunDirection,
        deferredRingShadowStrength,
      );
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [
    shadowBundle,
    shadowProfile,
    deferredSunDirection,
    deferredRingShadowStrength,
  ]);

  useEffect(() => {
    return () => {
      shadowBundle?.texture.dispose();
    };
  }, [shadowBundle]);

  useEffect(() => {
    return () => {
      shadowMaterial?.dispose();
    };
  }, [shadowMaterial]);

  return (
    <>
      <mesh
        ref={meshRef}
        scale={[1, POLAR_SCALE, 1]}
        material={material ?? fallback}
      >
        <sphereGeometry args={[EQUATORIAL, 128, 64]} />
      </mesh>
      {shadowMaterial ? (
        <mesh
          renderOrder={0.5}
          scale={[
            SHADOW_SHELL_SCALE,
            POLAR_SCALE * SHADOW_SHELL_SCALE,
            SHADOW_SHELL_SCALE,
          ]}
          material={shadowMaterial}
        >
          <sphereGeometry args={[EQUATORIAL, 128, 64]} />
        </mesh>
      ) : null}
    </>
  );
}
