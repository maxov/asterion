# Asset Processing Pipeline

Downloads, processes, and installs renderer assets for Asterion.
Today that includes planetary textures and normalized mission-profile data.

## Bootstrap

```sh
cd pipeline
uv sync
```

## Commands

Run from the `pipeline/` directory:

```sh
# Fetch all sources
uv run pipeline fetch

# Process all sources (run processors, install to src/assets/<asset_type>/, and publish to public/<asset_type>/)
uv run pipeline process

# Fetch + process (default when no subcommand given)
uv run pipeline

# Show source status
uv run pipeline list

# Re-sync processed assets to public/<asset_type>/ for runtime loading
uv run pipeline install

# Fetch a single source
uv run pipeline fetch --source saturn_body_bjj

# Process a single source
uv run pipeline process --source saturn_body_bjj

# Regenerate ATTRIBUTION.md from provenance files
uv run pipeline attribution
```

## Recommended texture sources

**Ring textures:** `saturn_rings_bjj` is the preferred source — Björn Jónsson's raw
1D profile data provides separate backscattered, forward-scattered, and unlit-side
profiles, enabling phase-angle-dependent rendering. The `saturn_rings_fargetanik`
and `saturn_rings_ppe` entries are fallbacks that produce a single combined ring strip.

**Body textures:**
- Prefer official USGS Astrogeology / mission mosaics for rocky or icy bodies when a good global product exists (`phobos_usgs`, `io_color_usgs`, `europa_usgs`, `ganymede_color_usgs`, `callisto_usgs`, `titan_iss_usgs`, `triton_color_usgs`, `iapetus_usgs`).
- Prefer Solar System Scope for quick CC-BY whole-planet color maps and for gas giants where “artist-friendly” color is usually more useful than provenance-maximal raw mission products (`mercury_sss`, `venus_surface_sss`, `mars_sss`, `jupiter_sss`, `uranus_sss`, `neptune_sss`, `saturn_body_sss`).
- `saturn_body_bjj` remains the preferred Saturn body map.

Some official moon products are single-band or near-IR rather than natural color.
That is still the best provenance-first baseline, but if you want a more
photographic look later, treat those as the detail layer and add color grading,
atmospheric haze, or a stylized fallback in the renderer.

For dwarf/minor planets, the current catalog takes a pragmatic mixed approach:
- `vesta_usgs` uses the official Dawn/USGS global colorized relief product.
- `pluto_usgs` uses the official New Horizons global mosaic from USGS Astrogeology.
- `ceres_sss`, `haumea_sss`, `makemake_sss`, and `eris_sss` use Solar System Scope CC-BY maps, which are explicitly partly fictional fills for incompletely mapped bodies.

## Sources

The full registry in `sources.toml` now includes Earth, Moon, mission assets,
and an expanded catalog of additional planets and major moons. The table below
just calls out a few headline entries:

| ID | Description | Status |
|----|-------------|--------|
| `saturn_body_bjj` | Björn Jónsson's Saturn cylindrical map | Ready |
| `saturn_body_sss` | Solar System Scope Saturn fallback (CC-BY 4.0) | Ready |
| `saturn_rings_bjj` | Björn Jónsson's raw ring profiles (5 files) | Ready (preferred) |
| `saturn_rings_ppe` | Planet Pixel Emporium color + transparency rings | Ready |
| `mercury_sss` ... `neptune_sss` | Additional whole-planet body maps | Cataloged; record hashes on first fetch |
| `vesta_usgs`, `ceres_sss`, `pluto_usgs`, `haumea_sss`, `makemake_sss`, `eris_sss` | Dwarf/minor-planet basemaps | Cataloged; record hashes on first fetch |
| `phobos_usgs` ... `iapetus_usgs` | Curated major-moon basemaps | Cataloged; record hashes on first fetch |

## Mission assets

Mission data uses the same `[[source]]` registry and provenance flow as textures,
but writes into `src/assets/missions/` and `public/missions/`.

There are now two supported mission patterns:

- `mission_profile` for declarative/nominal mission paths where the renderer
  synthesizes the curve from metadata.
- `jpl_horizons_mission` for missions backed by sampled JPL Horizons vectors.

Mission profile sources use `asset_type = "missions"` and a nested `[source.config]`
table for the normalized mission metadata:

```toml
[[source]]
id = "example_mission"
description = "Nominal mission profile"
url = "https://example.com/mission-reference.pdf"
sha256 = ""
license = "Public Domain"
attribution = "NASA"
source_page = "https://example.com"
processor = "mission_profile"
asset_type = "missions"
output = "example_mission.json"

[source.config]
mission_id = "example"
mission_name = "Example Mission"
trajectory_model = "earth-moon-free-return-v1"
launch_utc = "2026-01-01T00:00:00Z"
duration_seconds = 86400
streak_window_seconds = 172800

[source.config.parameters]
tli_seconds = 3600
lunar_sphere_entry_seconds = 250000
closest_approach_seconds = 300000
closest_approach_altitude_km = 10000
lunar_sphere_exit_seconds = 360000

[[source.config.events]]
id = "launch"
label = "Launch"
t_plus_seconds = 0
```

Horizons-backed mission sources follow the same metadata shape, but use the
Horizons API as the primary raw input and optionally attach PDFs or other files
as `extra_files` for supporting provenance:

```toml
[[source]]
id = "example_mission_horizons"
description = "Mission vectors from JPL Horizons"
url = "https://ssd.jpl.nasa.gov/api/horizons.api?...fixed query..."
sha256 = ""
license = "Public Domain"
attribution = "NASA/JPL Solar System Dynamics"
source_page = "https://ssd-api.jpl.nasa.gov/doc/horizons.html"
processor = "jpl_horizons_mission"
asset_type = "missions"
download_normalizer = "jpl_horizons_json"
output = "example_mission.json"

[[source.extra_files]]
name = "press_kit"
url = "https://example.com/mission-press-kit.pdf"
sha256 = ""

[source.config]
mission_id = "example"
mission_name = "Example Mission"
launch_utc = "2026-01-01T00:00:00Z"
duration_seconds = 86400

[[source.config.events]]
id = "launch"
label = "Launch"
t_plus_seconds = 0
```

`download_normalizer = "jpl_horizons_json"` canonicalizes volatile Horizons
headers such as request-time banners before hashing, so the fetched raw snapshot
stays reproducible and provenance-friendly.

## Scattering texture channel layout

The `saturn_rings_scattering.png` output from `saturn_rings_bjj` is a 13177x1 RGBA PNG:

| Channel | Semantics |
|---------|-----------|
| R | Backscattered brightness (0° phase angle) |
| G | Forward-scattered brightness (~139° phase angle) |
| B | Unlit-side brightness |
| A | Transparency — **Björn's convention: 1 = no material, 0 = opaque** |

**Important:** The alpha channel uses Björn's inverted convention (opposite of
standard premultiplied alpha). The shader must account for this: a pixel with A=255
means empty space, A=0 means fully opaque ring material.

A companion `saturn_rings_color.png` (13177x1 RGB) provides per-sample ring color.

## Launching Jupyter

```sh
cd pipeline
uv run jupyter lab
```

Notebooks live in `notebooks/`. See `notebooks/README.md` for conventions.

## Adding a new source

1. Add an entry to `sources.toml`:

   ```toml
   [[source]]
   id = "my_new_source"
   description = "What this texture is"
   url = "https://example.com/texture.jpg"
   sha256 = ""
   license = "Public Domain"
   attribution = "NASA/JPL"
   source_page = "https://example.com"
   processor = "passthrough"
   output = "my_texture.jpg"
   ```

   For sources with additional input files, use `extra_files`:

   ```toml
   extra_files = [
     { name = "secondary", url = "https://example.com/extra.txt", sha256 = "" },
   ]
   ```

   For processors that produce multiple outputs, use `extra_outputs`:

   ```toml
   output = "primary.png"
   extra_outputs = ["secondary.png"]
   ```

2. Fetch with `--record` to populate the sha256:

   ```sh
   uv run pipeline fetch --source my_new_source --record
   ```

3. Process the source:

   ```sh
   uv run pipeline process --source my_new_source
   ```

4. Install runtime copies if the frontend loads from `public/`:

   ```sh
   uv run pipeline install
   ```

5. Commit the updated `sources.toml`, the output asset in `src/assets/<asset_type>/`,
   and its `.provenance.json` sidecar.

## Local-only sources

Some sources (e.g., DeviantArt) can't be fetched programmatically. These have
`local_only = true` in `sources.toml`. To use them:

1. Visit the source page listed in `sources.toml`.
2. Download the file manually.
3. Place it at `data/raw/<source_id>.<ext>` (e.g., `data/raw/saturn_rings_fargetanik.png`).
4. Run `uv run pipeline fetch --source <id> --record` to capture the checksum.
5. Run `uv run pipeline process --source <id>` to process and install.

## Attribution

Run `uv run pipeline attribution` to regenerate `ATTRIBUTION.md` at the repo root.
This reads all `*.provenance.json` files under `src/assets/` and produces
a markdown table with asset type, asset name, source, license, attribution,
and source page.

## Where outputs land

- `data/raw/` — downloaded files (gitignored, re-fetchable)
- `data/intermediate/` — processor working files (gitignored)
- `src/assets/<asset_type>/` — final committed assets with `.provenance.json` sidecars
- `public/<asset_type>/` — runtime copies served directly by Vite

Raw and intermediate data are not committed because they can be reproduced
from the source URLs. The final processed assets and provenance files are
committed so the frontend works without rerunning the pipeline.

## Processors

Processors transform raw downloads into final assets. Currently available:

- **`moon_height`** — converts LOLA-derived Moon displacement TIFFs into browser-friendly linear grayscale PNG height maps
- **`earth_clouds`** — derives an RGBA Earth cloud layer from paired NASA SVS equirectangular maps
- **`jpl_horizons_mission`** — converts JPL Horizons vector-table responses into sampled mission trajectory assets
- **`mission_profile`** — normalizes declarative mission metadata into a frontend mission asset JSON
- **`passthrough`** — copies the file, stripping EXIF/image metadata
- **`body_texture`** — validates 2:1 equirectangular maps, converts to RGB, optional resize, outputs JPG/PNG
- **`saturn_body`** — backward-compatible alias for older Saturn/Earth/Moon registry entries
- **`saturn_rings`** — combines ring textures into a 1px-high RGBA PNG strip (supports `combined_rgba` and `color_plus_transparency` input modes)
- **`saturn_rings_bjj`** — builds scattering (RGBA) and color (RGB) textures from Björn Jónsson's raw 1D ring profiles (5 text files, 13177 samples each)
- **`zip_glb`** — extracts a GLB member from a zip archive for manually downloaded model assets

Processors are registered in `pipeline/src/pipeline/processors/__init__.py`. To add one,
create a new module in `processors/` and add it to the `PROCESSORS` dict.

## Running tests

```sh
cd pipeline
uv run pytest
```
