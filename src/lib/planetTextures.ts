import { MathUtils, SRGBColorSpace, type Texture } from "three";

const EARTH_DAY_MONTH_CODES = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
] as const;

export const EARTH_NIGHT_TEXTURE_PATH = "/textures/earth_night_2016.jpg";
export const MOON_ALBEDO_TEXTURE_PATH = "/textures/moon_albedo.jpg";

export type EarthTextureTimeline = {
  blend: number;
  monthIndex: number;
  nextMonthIndex: number;
};

export function configureSrgbTexture(texture: Texture) {
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
}

export function earthDayTexturePathForMonth(monthIndex: number) {
  const normalizedMonthIndex =
    ((monthIndex % EARTH_DAY_MONTH_CODES.length) +
      EARTH_DAY_MONTH_CODES.length) %
    EARTH_DAY_MONTH_CODES.length;

  return `/textures/earth_day_${EARTH_DAY_MONTH_CODES[normalizedMonthIndex]}.jpg`;
}

export function earthTextureTimeline(dateMs: number): EarthTextureTimeline {
  const date = new Date(dateMs);
  const monthIndex = date.getUTCMonth();
  const monthStartMs = Date.UTC(date.getUTCFullYear(), monthIndex, 1);
  const nextMonthStartMs = Date.UTC(date.getUTCFullYear(), monthIndex + 1, 1);

  return {
    blend: MathUtils.clamp(
      (dateMs - monthStartMs) / (nextMonthStartMs - monthStartMs),
      0,
      1,
    ),
    monthIndex,
    nextMonthIndex: (monthIndex + 1) % EARTH_DAY_MONTH_CODES.length,
  };
}
