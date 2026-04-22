# Asterion — Solar System WebGL Renderer

Physically-grounded solar system renderer running in the browser via Three.js WebGL.

## Requirements

The app currently runs on the WebGL renderer path only.

## Setup

```bash
pnpm install
pnpm run dev
```

Production build:

```bash
pnpm run build
pnpm run preview
```

Processed assets are generated via the pipeline under `src/assets/` with
`.provenance.json` sidecars. Runtime copies live in `public/<asset_type>/`.
The renderer now uses this for both textures and mission-profile data
such as Artemis II.

## Textures

The renderer works without texture files — it uses solid-color fallbacks.
To add real textures, drop them into **`public/textures/`** with these names:

| File                  | Slot                  | Format               |
| --------------------- | --------------------- | -------------------- |
| `saturn_albedo.jpg`   | Saturn surface color  | sRGB JPEG            |
| `saturn_normal.jpg`   | Saturn surface normal | Linear JPEG          |
| `ring_color.png`      | Ring color strip      | sRGB PNG             |
| `ring_alpha.png`      | Ring transparency     | Greyscale linear PNG |

Ring textures are mapped radially: U = 0 at the inner edge (74,500 km), U = 1
at the outer edge (140,220 km).

> Textures live in `public/textures/` (Vite static serving) rather than
> `src/assets/textures/` so they are not bundled into the JS — appropriate for
> large planetary texture files.

## Leva Controls

Press **H** to toggle the dev panel. Controls:

| Folder  | Control          | Description                                                        |
| ------- | ---------------- | ------------------------------------------------------------------ |
| Saturn  | Axial Tilt       | Saturn's axial tilt relative to its orbital plane (default 26.73)  |
| Rings   | Opacity          | Ring transparency, 0 = invisible, 1 = fully opaque                |
| Sun     | Time of Year     | Rotates the sun direction around Saturn's orbital plane            |
| Sun     | Intensity        | Directional light intensity (default pi, energy-conserving)        |
| Bloom   | Threshold        | Minimum brightness for bloom glow                                  |
| Bloom   | Strength         | Bloom effect intensity                                             |
| Bloom   | Radius           | Bloom spread radius                                                |
| Tonemap | Exposure         | ACES Filmic tonemapping exposure multiplier                        |

## Scale & Precision

1 scene unit = 1,000 km. Saturn's equatorial radius is ~60 units, the ring
system extends to ~140 units. Stars sit on a sphere at 5,000 units. All
geometry fits comfortably in float32 precision.

The camera near/far planes (0.1 to 100,000) cover the full scene without
z-fighting. For future solar-system-scale work (moons, other planets), switch
to a logarithmic depth buffer or camera-relative rendering.

## Architecture

```
src/
  main.tsx              React entry
  App.tsx               WebGL init, Canvas, Leva panel toggle
  Scene/
    Scene.tsx           R3F scene composition + postprocessing (bloom)
    Saturn.tsx          Oblate sphere, PBR material, optional textures
    Rings.tsx           Flat disk, correct radii, radial UV mapping
    Stars.tsx           Dense random starfield on a sphere
    Lighting.tsx        Directional sunlight + faint ambient
  lib/
    constants.ts        Physical constants (Saturn dimensions, radii, tilt)
    units.ts            km to scene-unit conversion
  shaders/              WebGL shader modules for Earth + atmosphere effects
public/
  textures/             Drop texture files here (not bundled)
```
