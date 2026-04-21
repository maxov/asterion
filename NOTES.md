# Notes

Rough edges and gotchas we've hit in this project. Not documentation — context
for the next person (often future-me) who runs into the same wall.

## Stack

- three `^0.184.0`
- `three/webgpu` (WebGPURenderer, RenderPipeline, node materials)
- React 19 + StrictMode on
- @react-three/fiber v9
- TSL (Three Shading Language) for custom shaders

This combination is bleeding-edge as of April 2026. Much of what follows is
working around rough edges in that specific combo, not general three/R3F
advice.

## Textured materials must be imperative node materials

**Do not** use R3F's JSX material components (`<meshStandardMaterial>`,
`<meshBasicMaterial>`, etc.) with a `map` prop on the WebGPU renderer. The
material renders without the map — silently, no errors — because R3F's
reconciler doesn't route map assignments through the node material's binding
layer.

**Do** construct node materials imperatively inside a `useEffect` after the
texture loads, store the material in `useState`, and attach via
`<mesh material={material ?? fallback}>`:

    import { MeshStandardNodeMaterial } from 'three/webgpu'

    const mat = new MeshStandardNodeMaterial()
    mat.map = texture
    mat.roughness = 0.85
    mat.metalness = 0

Property assignment (`mat.map = tex`) is more reliable than the options-bag
constructor (`new MeshStandardNodeMaterial({ map: tex, ... })`) — the latter
has had inconsistent map handling across three versions.

For untextured materials (solid color, fallback), JSX components are fine.

See `src/Scene/Saturn.tsx` for the canonical pattern.

## Texture loading + StrictMode

StrictMode dev-mode double-invokes effects (mount → cleanup → mount). This
interacts badly with async texture loading + GPU resource disposal.

**Do:**
- Track resources in local `let` variables inside the effect.
- Use a `disposed` flag; check it in async callbacks before setting state.
- In cleanup, set `disposed = true` and dispose locally-owned resources.

**Do not:**
- Call `setState` in cleanup. The queued state update races with the next
  mount's updates and can leave the component in a bad state.
- Touch shared state (`scene.background`, refs that cross components) in
  cleanup. Next mount will overwrite it anyway.

See Saturn.tsx and Stars.tsx for the correct pattern.

## Debugging render issues

The order we should have followed (and didn't, repeatedly):

1. Check the console for deprecation warnings. Three's API moves fast;
   `PostProcessing` → `RenderPipeline`, etc. Deprecated APIs often "mostly
   work" and fail in subtle ways that look like your bug.
2. If the screen is all one color, check `canvas.toDataURL()` in devtools —
   tiny string = nothing rendering, long varied string = rendering but invisible.
3. Drop a hot-pink `<meshBasicMaterial>` cube at origin as a pipeline canary.
4. Bypass postprocessing. If the canary appears only when post is off, the
   pipeline is broken, not the scene.
5. Binary-search with a known-good commit. Branch, make one change, test,
   commit or discard. Do not iterate on a drifting codebase.

## Working with Claude Code on broken states

Claude Code tends to layer changes on top of whatever's already there. When
debugging, it doesn't cleanly revert — it accumulates.

For fixes under ~30 lines, edit by hand. Claude Code is for building features
on a working base, not for surgical fixes in broken code.

When iterating on experiments, use branches:

    git checkout -b try/thing
    # edit, test
    # worked? merge. broken? git checkout main && git branch -D try/thing

Don't use `git stash` for this — stashes are easy to lose.

## Rings geometry

Three.js's built-in `RingGeometry` sets UVs based on world-space XY of each
vertex, not on (angle, radius). This makes it useless for radial textures.

Use a custom geometry where:
- `uv.x` = angular position (0–1 around the ring)
- `uv.y` = normalized radial position (0 at inner edge, 1 at outer edge)

See `src/Scene/Rings.tsx`.

## Ring texture orientation

The ring texture output by the pipeline is a long thin strip: width is the
radial dimension, height is 1. Custom ring geometry has UV.y as the radial
direction. So the texture needs to be sampled along its width when UV.y
varies — i.e. the texture needs to be rotated 90° at load time so the
natural U direction of the image lines up with UV.y of the geometry.

The rotation happens in `rotateTexture90` in Rings.tsx.

## Rings material: punted for v0

The physically-correct ring material (`src/shaders/ringsMaterial.ts`) uses
TSL to blend backscatter / forward-scatter / unlit-side profiles by phase
angle, sampling five separate channels. This caused a flicker-to-black
instability on the current stack that we could not isolate.

For v0, rings use a single pre-baked RGBA texture (RGB = color × backscatter,
A = 1 − transparency), rendered with a plain `MeshBasicNodeMaterial`. The
TSL material is left in the repo for a future revisit when three/webgpu
stabilizes. To reactivate it, flip the `output_mode` in the
`saturn_rings_bjj` source entry and rewrite Rings.tsx against the two-texture
outputs.

## Rings: textured path blocked on three/webgpu bug

Shipping rings with fallback solid-color `MeshStandardMaterial`. The textured
path is blocked by a bug we could not isolate.

What we tried (all caused flicker-to-black, none produced validation errors):
- TSL multi-channel material (`createRingMaterial`) with scattering + color textures
- Plain `MeshBasicNodeMaterial` with a combined RGBA texture
- Plain `MeshStandardNodeMaterial` with a combined RGBA texture
- Swapping `NormalBlending` for `AdditiveBlending`

What we ruled out:
- React lifecycle / StrictMode (console confirms correct mount/load/set/render order)
- Texture loading (loads correctly, dimensions correct, no 404)
- Transparency sort (forcing opaque did not help)
- Saturn-rings interaction specifically (flicker reproduces with rings alone)
- Postprocessing pipeline (flicker persists with bypass on)
- `MeshBasicNodeMaterial` as a class (atmosphere uses it without issue)

Atmosphere's `MeshBasicNodeMaterial` works fine. The difference we couldn't
pin down is either (a) adding a map, (b) `DoubleSide` vs `BackSide`, or (c)
something interacting between the rings geometry, the camera, and the
pipeline that we don't see. Next step is a minimal HTML+three.js repro
outside this codebase to file upstream.

Stack: three 0.184.0, @react-three/fiber 9.6.0, Safari + WebGPU on M4 Max.

## Known deprecation warnings we accept

- `THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.`
  — comes from R3F internals, not our code. Ignore until R3F updates.

## Texture pipeline

- Outputs go under `src/assets/textures/` and are served from
  `public/textures/` via symlink or copy. Load paths in frontend code are
  `/textures/foo.jpg`.
- Raw downloads live in `data/raw/`, gitignored. Integrity via sha256 in
  `sources.toml`. First fetch: `uv run pipeline fetch --source <id> --record`
  to populate the hash.
- Texture provenance is tracked per output in `<file>.provenance.json`
  sidecars. `uv run pipeline attribution` regenerates `ATTRIBUTION.md`.
