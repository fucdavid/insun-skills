#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Convert an edited paged Word planning document into content.json."""

from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path
from typing import Dict, List
from xml.etree import ElementTree as ET

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def read_docx_lines(path: Path) -> List[str]:
    with zipfile.ZipFile(path) as zf:
        xml = zf.read("word/document.xml")
    root = ET.fromstring(xml)
    lines: List[str] = []
    for para in root.findall(".//w:p", NS):
        parts = [node.text or "" for node in para.findall(".//w:t", NS)]
        text = "".join(parts).strip()
        if text:
            lines.append(text)
    return lines


def planning_doc_confirmed(lines: List[str]) -> bool:
    return any(line.strip().lower() == "confirmation_status: confirmed" for line in lines)


def split_blocks(lines: List[str]) -> tuple[Dict[str, str], List[List[str]]]:
    meta: Dict[str, str] = {}
    blocks: List[List[str]] = []
    current: List[str] | None = None
    for line in lines:
        if line.startswith("项目标题："):
            meta["title"] = line.split("：", 1)[1].strip()
        if re.match(r"^第\s*\d+\s*页[｜|]", line):
            if current:
                blocks.append(current)
            current = [line]
        elif current is not None:
            current.append(line)
    if current:
        blocks.append(current)
    return meta, blocks


def kv(line: str) -> tuple[str, str] | None:
    if "：" not in line:
        return None
    key, value = line.split("：", 1)
    return key.strip(), value.strip()


def parse_list_after(block: List[str], marker: str) -> List[str]:
    try:
        idx = block.index(marker)
    except ValueError:
        return []
    out: List[str] = []
    for line in block[idx + 1 :]:
        if re.match(r"^[\u4e00-\u9fa5A-Za-z_]+：", line) and not line.startswith("- "):
            break
        if line.startswith("- "):
            out.append(line[2:].strip())
    return out


def parse_fields(block: List[str]) -> Dict:
    try:
        idx = block.index("内容字段：")
    except ValueError:
        return {"items": []}

    known_fields = {
        "statement",
        "quote",
        "summary",
        "items",
        "metrics",
        "stages",
        "rows",
        "columns",
        "supporting_lines",
    }
    fields: Dict = {}
    current_key: str | None = None
    nested: List[str] = []
    for line in block[idx + 1 :]:
        if line.startswith("来源：") or line.startswith("备注：") or line.startswith("分页理由："):
            break
        if line.startswith("  - ") and current_key:
            nested.append(line[4:].strip())
            continue
        if line.startswith("- ") and "：" in line:
            key_candidate, value_candidate = line[2:].split("：", 1)
            key_candidate = key_candidate.strip()
            if current_key and key_candidate not in known_fields:
                nested.append(line[2:].strip())
                continue
            if current_key and nested:
                fields[current_key] = normalize_list(current_key, nested)
                nested = []
            current_key = key_candidate
            value = value_candidate.strip()
            if value:
                fields[current_key] = value
                current_key = None
            else:
                fields[current_key] = []
        elif line.startswith("- ") and current_key:
            nested.append(line[2:].strip())
        elif line.startswith("- "):
            fields.setdefault("items", []).append({"label": line[2:].strip(), "desc": ""})

    if current_key and nested:
        fields[current_key] = normalize_list(current_key, nested)
    return fields


def normalize_list(key: str, values: List[str]) -> List[Dict[str, str]]:
    if key == "metrics":
        return [{"label": v, "value": "", "desc": ""} for v in values]
    if key == "stages":
        return [{"label": v, "desc": ""} for v in values]
    if key in ("rows", "items", "supporting_lines"):
        if key == "supporting_lines":
            return values
        return [{"label": v, "desc": ""} for v in values]
    return [{"label": v, "desc": ""} for v in values]


def parse_block(block: List[str]) -> Dict | None:
    data: Dict[str, str] = {}
    for line in block[1:]:
        parsed = kv(line)
        if parsed:
            data[parsed[0]] = parsed[1]

    page_type = data.get("页面类型", "content")
    if page_type == "cover":
        return {
            "type": "cover",
            "title": data.get("标题", ""),
            "subtitle": data.get("副标题", ""),
        }
    if page_type == "toc":
        return {"type": "toc", "title": data.get("标题", "目录"), "items": parse_list_after(block, "目录项：")}
    if page_type == "transition":
        return {"type": "transition", "chapter": data.get("章节", ""), "title": data.get("标题", data.get("页面标题", ""))}
    if page_type == "end":
        return {"type": "end"}
    if page_type != "content":
        return None

    fields = parse_fields(block)
    variant = data.get("推荐排版", "T4a_cards")
    body = {"layout": "t_variant", "variant": variant}
    body.update(fields)
    return {"type": "content", "page_title": data.get("页面标题", data.get("标题", "")), "body": body}


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert paged Word planning doc into content.json.")
    parser.add_argument("input", type=Path, help="Edited paged planning .docx")
    parser.add_argument("output", type=Path, help="Output content.json")
    parser.add_argument(
        "--confirmed-by-user",
        action="store_true",
        help="Required when the user has explicitly confirmed the paged outline in chat instead of editing CONFIRMATION_STATUS in the Word file.",
    )
    args = parser.parse_args()

    lines = read_docx_lines(args.input)
    if not args.confirmed_by_user and not planning_doc_confirmed(lines):
        raise SystemExit(
            "Paged outline is not confirmed. Review it with the user first, then either set "
            "'CONFIRMATION_STATUS: confirmed' in the Word file or rerun with --confirmed-by-user "
            "after explicit user confirmation."
        )

    meta, blocks = split_blocks(lines)
    slides = [slide for block in blocks if (slide := parse_block(block))]
    if not slides:
        raise SystemExit(f"No planned slides found in {args.input}")
    data = {
        "title": meta.get("title") or args.input.stem,
        "source": f"Source: paged Word planning doc {args.input.name}",
        "style_selection": "rotate",
        "slides": slides,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {args.output} with {len(slides)} slides.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
