// Saturn body (km)
export const SATURN_EQUATORIAL_RADIUS = 60_268;
export const SATURN_POLAR_RADIUS = 54_364;
export const SUN_RADIUS_KM = 695_700;

// Solar system bodies (km)
export const MERCURY_RADIUS_KM = 2_439.7;
export const VENUS_RADIUS_KM = 6_051.8;
export const EARTH_RADIUS_KM = 6_378.137;
export const MARS_RADIUS_KM = 3_389.5;
export const VESTA_RADIUS_KM = 261.385;
export const CERES_RADIUS_KM = 469.7;
export const JUPITER_RADIUS_KM = 69_911;
export const URANUS_RADIUS_KM = 25_362;
export const NEPTUNE_RADIUS_KM = 24_622;
export const PLUTO_RADIUS_KM = 1_188.3;
export const MOON_RADIUS_KM = 1_737.4;
export const PHOBOS_RADIUS_KM = 11.267;
export const IO_RADIUS_KM = 1_821.6;
export const EUROPA_RADIUS_KM = 1_560.8;
export const GANYMEDE_RADIUS_KM = 2_634.1;
export const CALLISTO_RADIUS_KM = 2_410.3;
export const TRITON_RADIUS_KM = 1_353.4;
export const IAPETUS_RADIUS_KM = 734.5;
export const HAUMEA_RADIUS_KM = 870;
export const MAKEMAKE_RADIUS_KM = 715;
export const ERIS_RADIUS_KM = 1_200;
export const AU_KM = 149_597_870.7;
export const EARTH_MOON_MASS_RATIO = 81.30057;
export const EARTH_AXIAL_TILT_DEG = 23.439281;
export const MERCURY_AXIAL_TILT_DEG = 0.034;
export const VENUS_AXIAL_TILT_DEG = 177.36;
export const MARS_AXIAL_TILT_DEG = 25.19;
export const VESTA_AXIAL_TILT_DEG = 0;
export const CERES_AXIAL_TILT_DEG = 4;
export const JUPITER_AXIAL_TILT_DEG = 3.13;
export const SATURN_AXIAL_TILT_DEG = 26.73;
export const URANUS_AXIAL_TILT_DEG = 97.77;
export const NEPTUNE_AXIAL_TILT_DEG = 28.32;
export const PLUTO_AXIAL_TILT_DEG = 57;
export const HAUMEA_AXIAL_TILT_DEG = 0;
export const MAKEMAKE_AXIAL_TILT_DEG = 0;
export const ERIS_AXIAL_TILT_DEG = 0;
export const MERCURY_ROTATION_PERIOD_HOURS = 1_407.5;
export const VENUS_ROTATION_PERIOD_HOURS = 5_832.5;
export const MARS_ROTATION_PERIOD_HOURS = 24.6229;
export const VESTA_ROTATION_PERIOD_HOURS = 5.3421276322;
export const CERES_ROTATION_PERIOD_HOURS = 9.07417;
export const JUPITER_ROTATION_PERIOD_HOURS = 9.925;
export const SATURN_ROTATION_PERIOD_HOURS = 10.7;
export const URANUS_ROTATION_PERIOD_HOURS = 17.24;
export const NEPTUNE_ROTATION_PERIOD_HOURS = 16.11;
export const PLUTO_ROTATION_PERIOD_HOURS = 153.2935;
export const HAUMEA_ROTATION_PERIOD_HOURS = 3.9154;
export const MAKEMAKE_ROTATION_PERIOD_HOURS = 22.8266;
export const ERIS_ROTATION_PERIOD_HOURS = 25.9;

// Ring system (km) — D ring inner to F ring outer
export const RING_INNER_RADIUS = 74_500;
export const RING_OUTER_RADIUS = 140_220;


// Titan (Saturn VI) — mean physical/orbital elements (J2000 where noted).
// Source set used in-app: NASA + JPL summary values.
export const TITAN_RADIUS_KM = 2_574.73;
export const TITAN_ORBIT_SEMIMAJOR_AXIS_KM = 1_221_870;
export const TITAN_ORBIT_ECCENTRICITY = 0.0288;
export const TITAN_ORBIT_PERIOD_DAYS = 15.945421;
export const TITAN_ORBIT_INCLINATION_DEG = 0.34854;
export const TITAN_LONGITUDE_OF_ASCENDING_NODE_DEG = 28.0600;
export const TITAN_LONGITUDE_OF_PERIAPSIS_DEG = 186.5855;
export const TITAN_MEAN_LONGITUDE_J2000_DEG = 189.64;

// Axial tilt relative to orbital plane (degrees)
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
export const DEFAULT_BLOOM_THRESHOLD = 0.8;
// export const DEFAULT_BLOOM_THRESHOLD = 0.72;
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
