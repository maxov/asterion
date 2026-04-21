import type { CoordinateFrame } from "./astronomicalFrame.ts";
import { publicPath } from "./publicPath.ts";

export type PanoramaId = "eso_brunier" | "risinger" | "sss";

export interface Panorama {
  id: PanoramaId;
  label: string;
  /** Path relative to the public textures directory (served at /textures/). */
  file: string;
  frame: CoordinateFrame;
  attribution: string;
}

/**
 * Panorama orientation assumptions (for visual verification):
 *
 * ESO Brunier (galactic): galactic center at image horizontal center, north
 * galactic pole at top, galactic longitude increases leftward (standard
 * astronomical convention). Same convention as SSS.
 *
 * Risinger (equatorial): assumed RA = 0h at horizontal center (or left edge —
 * visually verify against the downloaded file and adjust). NCP at top, Dec
 * increasing upward. If the downloaded file has a different convention, a
 * single sign flip or 180° texture offset fixes it.
 *
 * SSS (galactic): same convention as ESO Brunier.
 */

export const PANORAMAS: Record<PanoramaId, Panorama> = {
  eso_brunier: {
    id: "eso_brunier",
    label: "ESO Brunier",
    file: publicPath("/textures/milky_way_eso.jpg"),
    frame: "galactic",
    attribution: "ESO / S. Brunier, F. Tapissier",
  },
  risinger: {
    id: "risinger",
    label: "Risinger",
    file: publicPath("/textures/milky_way_risinger.jpg"),
    frame: "galactic",
    attribution: "Nick Risinger / Photopic Sky Survey",
  },
  sss: {
    id: "sss",
    label: "Solar System Scope",
    file: publicPath("/textures/milky_way.jpg"),
    frame: "galactic",
    attribution: "INOVE / Solar System Scope",
  },
};

export const DEFAULT_PANORAMA: PanoramaId = "eso_brunier";
