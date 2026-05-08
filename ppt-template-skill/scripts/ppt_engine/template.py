from __future__ import annotations

import json
import re
from collections import Counter
from copy import deepcopy
from pathlib import Path

from .primitives import emu_to_in


def replace_text_preserve_shape(shape, text):
    if not getattr(shape, "has_text_frame", False):
        return
    text = "" if text is None else str(text)
    tf = shape.text_frame

    # Keep the original paragraph/run formatting intact. Rebuilding the text
    # frame changes theme colors, font sizes, shadows and other template styles.
    first_run = None
    first_paragraph = tf.paragraphs[0] if tf.paragraphs else None
    for paragraph in tf.paragraphs:
        if paragraph.runs:
            first_run = paragraph.runs[0]
            break
    if first_run is None:
        if first_paragraph is None:
            tf.text = text
            return
        first_run = first_paragraph.add_run()

    first_run.text = text
    first_run_element = first_run._r
    seen_first = False
    for paragraph in tf.paragraphs:
        for run in paragraph.runs:
            if run._r is first_run_element and not seen_first:
                seen_first = True
                continue
            run.text = ""


def text_shapes(slide):
    return [shape for shape in slide.shapes if getattr(shape, "has_text_frame", False) and (shape.text or "").strip()]


def iter_text_shapes(shapes):
    for shape in shapes:
        if getattr(shape, "has_text_frame", False):
            yield shape
        try:
            is_group = getattr(shape, "shape_type", None) and str(shape.shape_type).startswith("GROUP")
        except NotImplementedError:
            is_group = False
        if is_group:
            yield from iter_text_shapes(shape.shapes)


def all_text_frame_shapes(slide):
    return list(iter_text_shapes(slide.shapes))


def collect_slide_fonts(slides):
    fonts = Counter()
    for slide in slides:
        for shape in all_text_frame_shapes(slide):
            for paragraph in shape.text_frame.paragraphs:
                for run in paragraph.runs:
                    if run.font.name:
                        fonts[run.font.name] += 1
    return fonts


def is_title_like_shape(shape):
    name = getattr(shape, "name", "").lower()
    text = (shape.text or "").strip().lower() if getattr(shape, "has_text_frame", False) else ""
    top = emu_to_in(getattr(shape, "top", 9999999))
    return (
        "标题" in name
        or "title" in name
        or "标题" in text
        or "项目背景" in text
        or (top < 1.2 and bool(text) and len(text) <= 40)
        or text in ("xxx", "xxxx", "这是一个标题")
    )


def is_subtitle_like_shape(shape):
    name = getattr(shape, "name", "").lower()
    text = (shape.text or "").strip().lower() if getattr(shape, "has_text_frame", False) else ""
    return "副标题" in name or "subtitle" in name or "小标题" in text or text == "xxxxx"


def clear_text_frames(slide):
    for shape in list(all_text_frame_shapes(slide)):
        if (shape.text or "").strip():
            shape.element.getparent().remove(shape.element)


def prepare_content_template(slide, slide_data, registry):
    body = slide_data.get("body", {}) if isinstance(slide_data.get("body", {}), dict) else {}
    meta = None if body.get("render_mode") == "adaptive" else registry.get(body.get("layout", "auto"))
    if meta and (meta.owns_title or meta.clear_template_sample_text):
        clear_text_frames(slide)
        return None

    page_title = slide_data.get("page_title") or slide_data.get("title") or ""
    subtitle = slide_data.get("subtitle") or ""
    frames = all_text_frame_shapes(slide)
    title_shape = next((shape for shape in frames if is_title_like_shape(shape)), None)
    subtitle_shape = next((shape for shape in frames if shape is not title_shape and is_subtitle_like_shape(shape)), None)

    preserved = []
    if title_shape is not None:
        replace_text_preserve_shape(title_shape, page_title)
        preserved.append(title_shape.element)
    if subtitle_shape is not None:
        replace_text_preserve_shape(subtitle_shape, subtitle)
        preserved.append(subtitle_shape.element)

    for shape in list(all_text_frame_shapes(slide)):
        if any(shape.element is element for element in preserved):
            continue
        if (shape.text or "").strip():
            shape.element.getparent().remove(shape.element)

    if title_shape is None:
        return None
    return emu_to_in(title_shape.top + title_shape.height)


def duplicate_slide(prs, source_slide):
    layout = source_slide.slide_layout
    dest = prs.slides.add_slide(layout)
    for shape in list(dest.shapes):
        shape.element.getparent().remove(shape.element)
    for shape in source_slide.shapes:
        dest.shapes._spTree.insert_element_before(deepcopy(shape.element), "p:extLst")
    for rel in source_slide.part.rels.values():
        if "notesSlide" in rel.reltype:
            continue
        if rel.is_external:
            dest.part.rels.get_or_add_ext_rel(rel.reltype, rel.target_ref)
        else:
            dest.part.rels.get_or_add(rel.reltype, rel.target_part)
    return dest


def delete_slide(prs, index):
    sld_id_lst = prs.slides._sldIdLst
    slide_id = list(sld_id_lst)[index]
    r_id = slide_id.rId
    prs.part.drop_rel(r_id)
    sld_id_lst.remove(slide_id)


def move_slide(prs, old_index, new_index):
    sld_id_lst = prs.slides._sldIdLst
    slides = list(sld_id_lst)
    slide = slides[old_index]
    sld_id_lst.remove(slide)
    sld_id_lst.insert(new_index, slide)


def get_slide_text(slide):
    return "\n".join(shape.text.strip() for shape in all_text_frame_shapes(slide) if (shape.text or "").strip())


def looks_like_toc_text(text):
    text_l = text.lower()
    return any(word in text_l for word in ("目录", "contents", "content", "agenda"))


def detect_template_roles(prs):
    cover_idx = 0
    end_idx = len(prs.slides) - 1
    toc_idx = None
    transition_indices = []
    content_indices = []
    for idx, slide in enumerate(prs.slides):
        if idx in (cover_idx, end_idx):
            continue
        text = get_slide_text(slide)
        if toc_idx is None and looks_like_toc_text(text):
            toc_idx = idx
            continue
        if re.search(r"(过渡|章节|chapter|part)", text, re.I):
            transition_indices.append(idx)
        else:
            content_indices.append(idx)
    if not content_indices:
        content_indices = [min(1, len(prs.slides) - 1)]
    return cover_idx, toc_idx, transition_indices, content_indices, end_idx


def slide_file_index(slide_file):
    match = re.search(r"slide(\d+)\.xml", str(slide_file or ""))
    return int(match.group(1)) - 1 if match else None


def load_template_role_spec(template_path: Path):
    spec_dir = template_path.parent
    for spec_path in spec_dir.glob("*_spec_corrected.json"):
        try:
            spec = json.loads(spec_path.read_text(encoding="utf-8-sig"))
        except Exception:
            continue
        if spec.get("template_file") != template_path.name:
            continue

        roles = {"cover": [], "toc": [], "transition": [], "content": [], "end": []}
        slide_types = spec.get("slide_types") or {}
        if not isinstance(slide_types, dict):
            return None

        for role, info in slide_types.items():
            if role == "content_styles" and isinstance(info, list):
                for item in info:
                    if isinstance(item, dict):
                        idx = slide_file_index(item.get("slide_file"))
                        if idx is not None:
                            roles["content"].append(idx)
                continue
            if not isinstance(info, dict):
                continue
            idx = slide_file_index(info.get("slide_file"))
            if idx is None:
                continue
            if role in ("content", "content_style"):
                roles["content"].append(idx)
            elif role in ("transition", "chapter"):
                roles["transition"].append(idx)
            elif role in roles:
                roles[role].append(idx)

        return roles
    return None


def load_template_tokens(template_path: Path):
    spec_dir = template_path.parent
    for spec_path in spec_dir.glob("*_spec_corrected.json"):
        try:
            spec = json.loads(spec_path.read_text(encoding="utf-8-sig"))
        except Exception:
            continue
        if spec.get("template_file") == template_path.name:
            tokens = spec.get("design_tokens") or {}
            return dict(tokens) if isinstance(tokens, dict) else {}
    return {}


def resolve_template_roles(prs, template_path: Path):
    spec_roles = load_template_role_spec(template_path)
    if spec_roles:
        slide_count = len(prs.slides)
        cover_idx = spec_roles["cover"][0] if spec_roles["cover"] else 0
        toc_idx = spec_roles["toc"][0] if spec_roles["toc"] else None
        content_indices = spec_roles["content"] or [
            idx for idx in range(1, slide_count - 1)
            if idx != toc_idx and idx not in spec_roles["transition"]
        ]
        end_idx = spec_roles["end"][0] if spec_roles["end"] else slide_count - 1
        return cover_idx, toc_idx, spec_roles["transition"], content_indices, end_idx

    return detect_template_roles(prs)
