// Saturn body (km)
export const SATURN_EQUATORIAL_RADIUS = 60_268;
export const SATURN_POLAR_RADIUS = 54_364;

// Ring system (km) — D ring inner to F ring outer
export const RING_INNER_RADIUS = 74_500;
export const RING_OUTER_RADIUS = 140_220;

// Axial tilt relative to orbital plane (degrees)
export const SATURN_AXIAL_TILT_DEG = 26.73;

// Starfield
export const STAR_COUNT = 8_000;
export const STAR_SPHERE_RADIUS_KM = 5_000_000;

// Sunlight at Saturn's orbital distance (~9.5 AU).
// Earth receives ~120,000 lux; inverse-square gives Saturn ~1,330 lux.
// We use Math.PI as the directional light intensity: with a Lambertian
// material of albedo 1.0, this produces an outgoing radiance of exactly 1,
// keeping the HDR pipeline in a physically grounded range before tonemapping.
export const SUN_INTENSITY = Math.PI;

// Default tonemap exposure — starting point for ACES Filmic
export const DEFAULT_EXPOSURE = 1.0;

// Bloom defaults: cinematic but still plausibly photographic
export const DEFAULT_BLOOM_THRESHOLD = 0.72;
export const DEFAULT_BLOOM_STRENGTH = 0.6;
export const DEFAULT_BLOOM_RADIUS = 0.55;

// Camera defaults (in scene units after km→unit conversion)
export const CAMERA_MIN_DISTANCE_KM = 80_000;
export const CAMERA_MAX_DISTANCE_KM = 2_000_000;
export const CAMERA_DEFAULT_POSITION_KM: [number, number, number] = [
  200_000, 120_000, 280_000,
];
export const CAMERA_FOV = 45;
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 100_000;
