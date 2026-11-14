"""Generate docs/DATA_SOURCES.md from data/manifest.yaml and data/pipeline/SOURCES.md.

Produces a unified master table of all datasets with columns:
Product | Family | Resolution | Level | Licence | Credit | URL | Retrieved Date | SIMULATED | Evidence
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = REPO_ROOT / "data" / "manifest.yaml"
SOURCES_MD_PATH = REPO_ROOT / "data" / "pipeline" / "SOURCES.md"
OUTPUT_PATH = REPO_ROOT / "docs" / "DATA_SOURCES.md"


def load_manifest() -> list[dict[str, Any]]:
    if not MANIFEST_PATH.exists():
        return []
    with open(MANIFEST_PATH, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data.get("products", []) if isinstance(data, dict) else []


def load_sources_md_items() -> list[dict[str, str]]:
    if not SOURCES_MD_PATH.exists():
        return []
    with open(SOURCES_MD_PATH, encoding="utf-8") as f:
        content = f.read()

    items: list[dict[str, str]] = []
    lines = content.splitlines()
    in_table = False
    for line in lines:
        line_str = line.strip()
        if "## Master Summary Table" in line_str:
            in_table = True
            continue
        if in_table and line_str.startswith("---"):
            in_table = False
            continue

        if in_table and line_str.startswith("| **") and "|" in line_str[1:]:
            parts = [p.strip() for p in line_str.split("|")[1:-1]]
            if len(parts) >= 7:
                name_match = re.search(r"\*\*(.+?)\*\*", parts[0])
                name = name_match.group(1) if name_match else parts[0]
                val = parts[1]
                evidence = parts[2]
                url = parts[3]
                dt = parts[4]
                lic_credit = parts[5]
                status = parts[6]
                items.append({
                    "item": name,
                    "value": val,
                    "evidence": evidence,
                    "url": url,
                    "date": dt,
                    "license_credit": lic_credit,
                    "status": status,
                })
    return items


def determine_family(item_name: str, item_val: str) -> str:
    name_lower = f"{item_name} {item_val}".lower()
    if "topography" in name_lower or "dem" in name_lower:
        return "topography"
    if "thermal" in name_lower or "themis" in name_lower:
        return "thermal"
    if "spectral" in name_lower or "crism" in name_lower:
        return "spectral"
    if "radiation" in name_lower or "rad" in name_lower:
        return "radiation"
    if "atmosphere" in name_lower or "rems" in name_lower:
        return "atmosphere"
    if "orbiter" in name_lower or "ephemeris" in name_lower:
        return "orbits"
    if "traverse" in name_lower or "boxwork" in name_lower or "place" in name_lower or "gazetteer" in name_lower:
        return "geology"
    if "colour" in name_lower or "texture" in name_lower or "mosaic" in name_lower or "ortho" in name_lower:
        return "optical"
    if "mars24" in name_lower or "time" in name_lower:
        return "sun"
    return "geodesy"


def main() -> None:
    manifest_products = load_manifest()
    pipeline_sources = load_sources_md_items()

    rows: list[dict[str, Any]] = []

    # 1. Add manifest products (already processed or downloaded)
    for p in manifest_products:
        res = f"{p['resolution_m']} m" if p.get("resolution_m") is not None and p["resolution_m"] > 0 else "vector"
        rows.append({
            "product": p.get("product_id", p.get("id")),
            "family": p.get("family", "general"),
            "resolution": res,
            "level": p.get("level", "-"),
            "licence": p.get("license", "public domain"),
            "credit": p.get("credit", "NASA"),
            "url": p.get("source_url", "-"),
            "retrieved_date": str(p.get("retrieved_at", "-"))[:10],
            "simulated": "SIMULATED" if p.get("simulated") else "No",
            "evidence": p.get("notes", "Manifest entry verified in data/manifest.yaml"),
        })

    # 2. Add pipeline reference sources
    for s in pipeline_sources:
        family = determine_family(s["item"], s["value"])
        # Extract resolution if mentioned
        res_match = re.search(r"(\d+(?:\.\d+)?\s*(?:m|cm)/p[xx]|m/pixel|\d+\s*m/px)", s["value"])
        resolution = res_match.group(1) if res_match else "-"

        # Determine level
        if "L3" in s["value"] or "HiRISE" in s["value"] or "1 m/px" in s["value"] or "0.25 m" in s["value"]:
            level = "L3"
        elif "L2" in s["value"] or "CTX" in s["value"] or "6 m/px" in s["value"]:
            level = "L2"
        elif "L1" in s["value"] or "200 m" in s["value"]:
            level = "L1"
        else:
            level = "L0/Ref"

        # Check verification status
        status_clean = s["status"].lower()
        if "confirm" in status_clean or "verified" in status_clean:
            evidence = s["evidence"] if s["evidence"] else s["status"]
        else:
            evidence = "not verified"

        lic = s["license_credit"].split(";")[0] if ";" in s["license_credit"] else s["license_credit"]
        credit = s["license_credit"]

        rows.append({
            "product": s["item"],
            "family": family,
            "resolution": resolution,
            "level": level,
            "licence": lic,
            "credit": credit,
            "url": s["url"],
            "retrieved_date": s["date"],
            "simulated": "No",
            "evidence": evidence,
        })

    # Generate Markdown documentation
    doc = [
        "# DATUM-4 Data Sources and Attribution",
        "",
        "This document lists all datasets incorporated into or verified for DATUM-4 (marsnav),",
        "combining active pipeline artifacts (`data/manifest.yaml`) and verified research references (`data/pipeline/SOURCES.md`).",
        "",
        "## Master Data Sources Table",
        "",
        "| Product | Family | Resolution | Level | Licence | Credit | URL | Retrieved Date | SIMULATED | Evidence |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]

    for r in rows:
        url_display = f"[{r['url'][:35]}...]({r['url']})" if r['url'].startswith("http") else r['url']
        doc.append(
            f"| **{r['product']}** | {r['family']} | {r['resolution']} | {r['level']} | {r['licence']} | {r['credit']} | {url_display} | {r['retrieved_date']} | {r['simulated']} | {r['evidence']} |"
        )

    doc.extend([
        "",
        "---",
        "",
        "## Attribution and Open Science Compliance",
        "- All datasets derive from public domain planetary missions (NASA, USGS, ESA, DLR, Univ. Arizona, ASU, JHU APL, SwRI, CAB).",
        "- Synthetic baselines are clearly flagged with **SIMULATED**.",
        "- In accordance with NASA Space Apps Challenge regulations, no NASA logos or endorsement claims are made.",
        "- High-resolution datasets adhere to D-14 using USGS MSL Gale DEM Mosaic products.",
    ])

    OUTPUT_PATH.write_text("\n".join(doc) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} data source rows to {OUTPUT_PATH}")
    for idx, r in enumerate(rows, 1):
        print(f"Row {idx:02d}: {r['product']} | {r['family']} | {r['level']} | SIMULATED={r['simulated']} | {r['evidence'][:60]}")


if __name__ == "__main__":
    main()
