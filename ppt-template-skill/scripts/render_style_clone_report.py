#!/usr/bin/env python3
"""
Generic style-clone report renderer.

This is the fallback route for newly uploaded templates that do not expose a
complete cover/transition/content/end semantic set but do have:
  - slide 1: cover-like page
  - slide 2: reusable content/style page
  - optional last slide: closing/quote page

It reuses the template's first slide as cover, duplicates slide 2 as many times
as needed for content pages, and uses the last slide as closing page.

Usage:
  python scripts/render_style_clone_report.py content.json output.pptx template.pptx
"""

from __future__ import annotations

import sys
from pathlib import Path

from render_report import build


def main():
    if len(sys.argv) < 4:
        print("Usage: python render_style_clone_report.py content.json output.pptx template.pptx")
        sys.exit(1)
    build(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))


if __name__ == "__main__":
    main()
