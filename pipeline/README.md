# Texture Processing Pipeline

Downloads, processes, and installs planetary imagery for the Penumbra renderer.

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

# Process all sources (run processors, install to src/assets/textures/)
uv run pipeline process

# Fetch + process (default when no subcommand given)
uv run pipeline

# Show source status
uv run pipeline list

# Fetch a single source
uv run pipeline fetch --source saturn_body_bjj

# Process a single source
uv run pipeline process --source saturn_body_bjj

# Regenerate ATTRIBUTION.md from provenance files
uv run pipeline attribution
```

## Recommended sources

**Ring textures:** `saturn_rings_bjj` is the preferred source — Björn Jónsson's raw
1D profile data provides separate backscattered, forward-scattered, and unlit-side
profiles, enabling phase-angle-dependent rendering. The `saturn_rings_fargetanik`
and `saturn_rings_ppe` entries are fallbacks that produce a single combined ring strip.

**Body textures:** `saturn_body_bjj` is the primary Saturn body map.

## Sources

| ID | Description | Status |
|----|-------------|--------|
| `saturn_body_bjj` | Björn Jónsson's Saturn cylindrical map | Ready |
| `saturn_body_sss` | Solar System Scope Saturn fallback (CC-BY 4.0) | URLs need filling in |
| `saturn_rings_bjj` | Björn Jónsson's raw ring profiles (5 files) | Ready (preferred) |
| `saturn_rings_fargetanik` | FarGetaNik's 13K combined RGBA ring texture | Local-only (manual download) |
| `saturn_rings_ppe` | Planet Pixel Emporium color + transparency rings | URLs need filling in |

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

3. Process to install the texture:

   ```sh
   uv run pipeline process --source my_new_source
   ```

4. Commit the updated `sources.toml`, the output texture in `src/assets/textures/`,
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
This reads all `*.provenance.json` files under `src/assets/textures/` and produces
a markdown table with texture name, source, license, attribution, and source page.

## Where outputs land

- `data/raw/` — downloaded files (gitignored, re-fetchable)
- `data/intermediate/` — processor working files (gitignored)
- `src/assets/textures/` — final textures (committed) with `.provenance.json` sidecars

Raw and intermediate data are not committed because they can be reproduced
from the source URLs. The final textures and provenance files are committed
so the frontend works without running the pipeline.

## Processors

Processors transform raw downloads into final textures. Currently available:

- **`passthrough`** — copies the file, stripping EXIF/image metadata
- **`saturn_body`** — validates 2:1 equirectangular maps, converts to RGB, optional resize, outputs JPG/PNG
- **`saturn_rings`** — combines ring textures into a 1px-high RGBA PNG strip (supports `combined_rgba` and `color_plus_transparency` input modes)
- **`saturn_rings_bjj`** — builds scattering (RGBA) and color (RGB) textures from Björn Jónsson's raw 1D ring profiles (5 text files, 13177 samples each)

Processors are registered in `src/pipeline/processors/__init__.py`. To add one,
create a new module in `processors/` and add it to the `PROCESSORS` dict.

## Running tests

```sh
cd pipeline
uv run pytest
```
