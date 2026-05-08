#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import sys

from render_report_pptxjs import build


def main():
    if len(sys.argv) < 3:
        print("Usage: python render_report.py content.json output.pptx [template.pptx]")
        sys.exit(1)
    script_dir = Path(__file__).resolve().parent
    skill_dir = script_dir.parent
    template = Path(sys.argv[3]) if len(sys.argv) > 3 else skill_dir / "templates" / "吉利模版.pptx"
    build(Path(sys.argv[1]), Path(sys.argv[2]), template)


if __name__ == "__main__":
    main()
