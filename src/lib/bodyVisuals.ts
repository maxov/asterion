import { publicPath } from "./publicPath.ts";

export type SimpleBodyId =
  | "mercury"
  | "venus"
  | "mars"
  | "vesta"
  | "ceres"
  | "phobos"
  | "jupiter"
  | "io"
  | "europa"
  | "ganymede"
  | "callisto"
  | "titan"
  | "iapetus"
  | "uranus"
  | "neptune"
  | "triton"
  | "pluto"
  | "haumea"
  | "makemake"
  | "eris";

export type SimpleBodyVisual = {
  fallbackColor: string;
  heightSegments?: number;
  metalness?: number;
  roughness?: number;
  textureKey: string;
  texturePath: string;
  widthSegments?: number;
};

export const SIMPLE_BODY_VISUALS: Record<SimpleBodyId, SimpleBodyVisual> = {
  mercury: {
    fallbackColor: "#8f8a82",
    textureKey: "mercury-albedo",
    texturePath: publicPath("/textures/mercury_albedo.jpg"),
  },
  venus: {
    fallbackColor: "#cb9a56",
    textureKey: "venus-surface",
    texturePath: publicPath("/textures/venus_surface.jpg"),
  },
  mars: {
    fallbackColor: "#b35636",
    textureKey: "mars-albedo",
    texturePath: publicPath("/textures/mars_albedo.jpg"),
  },
  vesta: {
    fallbackColor: "#8f8b92",
    roughness: 0.95,
    textureKey: "vesta-surface",
    texturePath: publicPath("/textures/vesta_surface.jpg"),
  },
  ceres: {
    fallbackColor: "#8d877f",
    roughness: 0.96,
    textureKey: "ceres-albedo",
    texturePath: publicPath("/textures/ceres_albedo.jpg"),
  },
  phobos: {
    fallbackColor: "#7e7268",
    heightSegments: 24,
    roughness: 0.96,
    textureKey: "phobos-albedo",
    texturePath: publicPath("/textures/phobos_albedo.jpg"),
    widthSegments: 48,
  },
  jupiter: {
    fallbackColor: "#caa987",
    roughness: 0.92,
    textureKey: "jupiter-albedo",
    texturePath: publicPath("/textures/jupiter_albedo.jpg"),
    widthSegments: 96,
  },
  io: {
    fallbackColor: "#d9c153",
    textureKey: "io-albedo",
    texturePath: publicPath("/textures/io_albedo.jpg"),
  },
  europa: {
    fallbackColor: "#d4cabd",
    textureKey: "europa-albedo",
    texturePath: publicPath("/textures/europa_albedo.jpg"),
  },
  ganymede: {
    fallbackColor: "#9d9588",
    textureKey: "ganymede-albedo",
    texturePath: publicPath("/textures/ganymede_albedo.jpg"),
  },
  callisto: {
    fallbackColor: "#736756",
    textureKey: "callisto-albedo",
    texturePath: publicPath("/textures/callisto_albedo.jpg"),
  },
  titan: {
    fallbackColor: "#c8ad7f",
    textureKey: "titan-surface",
    texturePath: publicPath("/textures/titan_surface.jpg"),
  },
  iapetus: {
    fallbackColor: "#b9ab92",
    textureKey: "iapetus-albedo",
    texturePath: publicPath("/textures/iapetus_albedo.jpg"),
  },
  uranus: {
    fallbackColor: "#9dd8df",
    roughness: 0.9,
    textureKey: "uranus-albedo",
    texturePath: publicPath("/textures/uranus_albedo.jpg"),
    widthSegments: 80,
  },
  neptune: {
    fallbackColor: "#4169c6",
    roughness: 0.9,
    textureKey: "neptune-albedo",
    texturePath: publicPath("/textures/neptune_albedo.jpg"),
    widthSegments: 80,
  },
  triton: {
    fallbackColor: "#d5d0d2",
    textureKey: "triton-albedo",
    texturePath: publicPath("/textures/triton_albedo.jpg"),
  },
  pluto: {
    fallbackColor: "#c6a28c",
    textureKey: "pluto-albedo",
    texturePath: publicPath("/textures/pluto_albedo.jpg"),
  },
  haumea: {
    fallbackColor: "#d9dbe5",
    textureKey: "haumea-albedo",
    texturePath: publicPath("/textures/haumea_albedo.jpg"),
  },
  makemake: {
    fallbackColor: "#a65f45",
    textureKey: "makemake-albedo",
    texturePath: publicPath("/textures/makemake_albedo.jpg"),
  },
  eris: {
    fallbackColor: "#d7d2da",
    textureKey: "eris-albedo",
    texturePath: publicPath("/textures/eris_albedo.jpg"),
  },
};
