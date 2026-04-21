"""Attribution command — generate ATTRIBUTION.md from provenance files."""

from __future__ import annotations

import json

from pipeline.paths import repo_root, textures_dir


def run_attribution() -> None:
    """Read provenance files and regenerate ATTRIBUTION.md at repo root."""
    textures = textures_dir()
    prov_files = sorted(textures.glob("*.provenance.json"))

    if not prov_files:
        print("No provenance files found in src/assets/textures/")
        return

    rows: list[dict[str, str]] = []
    for pf in prov_files:
        data = json.loads(pf.read_text(encoding="utf-8"))
        # Texture filename = provenance filename minus .provenance.json
        texture_name = pf.name.removesuffix(".provenance.json")
        rows.append(
            {
                "texture": texture_name,
                "source": data.get("source_url", ""),
                "license": data.get("license", ""),
                "attribution": data.get("attribution", ""),
                "page": data.get("source_page", ""),
            }
        )

    lines: list[str] = [
        "# Attribution",
        "",
        "This file is auto-generated. Do not edit manually.",
        "Regenerate with: `cd pipeline && uv run pipeline attribution`",
        "",
        "| Texture | Source | License | Attribution | Page |",
        "|---------|--------|---------|-------------|------|",
    ]
    for r in rows:
        page_link = f"[link]({r['page']})" if r["page"] else ""
        source_link = f"[link]({r['source']})" if r["source"] else ""
        lines.append(
            f"| {r['texture']} | {source_link} | {r['license']} "
            f"| {r['attribution']} | {page_link} |"
        )
    lines.append("")

    out = repo_root() / "ATTRIBUTION.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"Generated {out}")
