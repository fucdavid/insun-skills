#!/usr/bin/env python3
"""
Classify a PPTX template and recommend a generation route.

Usage:
  python scripts/classify_template.py template.pptx template_spec.json template_route.json

Routes:
  dual_track    - cover/transition/content/end are available; use build_skeleton
                  + render_content + merge_content.
  style_clone   - template has cover and at least one reusable style/content slide,
                  but no full semantic page set; use render_style_clone_report.py
                  or a template-specific python-pptx renderer.
  manual_review - not enough structure detected; inspect slides and write/correct spec.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


def run_parse(template: Path, spec: Path):
    script = Path(__file__).with_name("parse_template.py")
    subprocess.run([sys.executable, str(script), str(template), str(spec)], check=True)


def classify(spec: dict) -> dict:
    slide_types = spec.get("slide_types", {})
    keys = set(slide_types)
    has_cover = "cover" in keys
    has_content = "content" in keys
    has_end = "end" in keys
    has_transition = "transition" in keys
    has_toc = "toc" in keys
    content_spec = slide_types.get("content", {})
    content_placeholders = set((content_spec.get("placeholders") or {}).keys())
    has_content_title_placeholder = bool(
        content_placeholders.intersection({"page_title", "title", "heading"})
    )

    if has_cover and has_content and has_content_title_placeholder and (has_end or has_transition or has_toc):
        return {
            "route": "dual_track",
            "reason": "Template exposes reusable cover/content pages and at least one separator/end page.",
            "commands": [
                "python scripts/build_skeleton.py template_spec.json content.json output/ template.pptx",
                "node scripts/render_content.js output/content_manifest.json",
                "python scripts/merge_content.py output/ final_output.pptx template.pptx",
            ],
        }

    slide_count = len(slide_types)
    if has_cover and slide_count >= 2:
        reusable = []
        for key, item in slide_types.items():
            if key != "cover":
                reusable.append(item.get("slide_file"))
        return {
            "route": "style_clone",
            "reason": "Template has a cover and reusable visual slides, but lacks a full semantic content/end set.",
            "content_style_candidates": reusable,
            "commands": [
                "python scripts/render_style_clone_report.py content.json final_output.pptx template.pptx",
            ],
        }

    return {
        "route": "manual_review",
        "reason": "Template structure is too sparse or ambiguous. Inspect slides and correct template_spec.json.",
        "commands": [
            "python scripts/parse_template.py template.pptx template_spec.json",
            "Edit template_spec.json manually, then choose dual_track or style_clone.",
        ],
    }


def main():
    if len(sys.argv) < 4:
        print("Usage: python classify_template.py template.pptx template_spec.json template_route.json")
        sys.exit(1)

    template = Path(sys.argv[1])
    spec_path = Path(sys.argv[2])
    route_path = Path(sys.argv[3])

    run_parse(template, spec_path)
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    route = classify(spec)
    route_path.write_text(json.dumps(route, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(route, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
