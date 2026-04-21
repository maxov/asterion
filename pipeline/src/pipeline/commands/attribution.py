"""Attribution command — generate ATTRIBUTION.md from provenance files."""

from __future__ import annotations

import json

from pipeline.paths import assets_dir, repo_root


def run_attribution() -> None:
    """Read provenance files and regenerate ATTRIBUTION.md at repo root."""
    assets_root = assets_dir()
    prov_files = sorted(assets_root.rglob("*.provenance.json"))

    if not prov_files:
        print("No provenance files found in src/assets/")
        return

    rows: list[dict[str, str]] = []
    for pf in prov_files:
        data = json.loads(pf.read_text(encoding="utf-8"))
        asset_name = pf.name.removesuffix(".provenance.json")
        asset_type = pf.relative_to(assets_root).parts[0]
        rows.append(
            {
                "asset": asset_name,
                "type": asset_type,
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
        "| Type | Asset | Source | License | Attribution | Page |",
        "|------|-------|--------|---------|-------------|------|",
    ]
    for r in rows:
        page_link = f"[link]({r['page']})" if r["page"] else ""
        source_link = f"[link]({r['source']})" if r["source"] else ""
        lines.append(
            f"| {r['type']} | {r['asset']} | {source_link} | {r['license']} "
            f"| {r['attribution']} | {page_link} |"
        )
    lines.append("")

    out = repo_root() / "ATTRIBUTION.md"
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"Generated {out}")
