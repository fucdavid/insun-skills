from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path

from pptx import Presentation
from pptx.oxml.ns import qn
from pptx.oxml.xmlchemy import OxmlElement

from .primitives import add_image_or_slot, emu_to_in
from .template import iter_text_shapes, replace_text_preserve_shape


_CACHE: dict[Path, Presentation] = {}


def _load_presentation(path: Path) -> Presentation:
    resolved = path.resolve()
    if resolved not in _CACHE:
        _CACHE[resolved] = Presentation(str(resolved))
    return _CACHE[resolved]


def _replace_rel_ids(element, rel_id_map: dict[str, str]):
    for node in element.iter():
        for attr_name, attr_value in list(node.attrib.items()):
            if attr_value in rel_id_map:
                node.set(attr_name, rel_id_map[attr_value])


def _strip_placeholder_binding(element):
    # Placeholder shapes can be re-bound to the target template layout by
    # PowerPoint, changing position/orientation. Compiled layouts need source
    # geometry to stay literal, so convert placeholders to ordinary shapes.
    for ph in list(element.iter(qn("p:ph"))):
        parent = ph.getparent()
        if parent is not None:
            parent.remove(ph)


def _ensure_explicit_geometry(element, shape):
    try:
        left, top, width, height = shape.left, shape.top, shape.width, shape.height
    except Exception:
        return
    if None in (left, top, width, height):
        return

    sp_pr = element.find(qn("p:spPr"))
    if sp_pr is None:
        sp_pr = OxmlElement("p:spPr")
        element.insert(1, sp_pr)

    xfrm = sp_pr.find(qn("a:xfrm"))
    if xfrm is None:
        xfrm = OxmlElement("a:xfrm")
        sp_pr.insert(0, xfrm)

    off = xfrm.find(qn("a:off"))
    if off is None:
        off = OxmlElement("a:off")
        xfrm.insert(0, off)
    off.set("x", str(int(left)))
    off.set("y", str(int(top)))

    ext = xfrm.find(qn("a:ext"))
    if ext is None:
        ext = OxmlElement("a:ext")
        xfrm.append(ext)
    ext.set("cx", str(int(width)))
    ext.set("cy", str(int(height)))


def _copy_source_shapes(target_slide, source_slide):
    rel_id_map = {}
    for rel in source_slide.part.rels.values():
        if "notesSlide" in rel.reltype or "slideLayout" in rel.reltype or rel.reltype.endswith("/tags"):
            continue
        if rel.is_external:
            new_rid = target_slide.part.rels.get_or_add_ext_rel(rel.reltype, rel.target_ref)
        else:
            new_rid = target_slide.part.relate_to(rel.target_part, rel.reltype)
        rel_id_map[rel.rId] = new_rid

    for shape in list(target_slide.shapes):
        shape.element.getparent().remove(shape.element)

    for shape in source_slide.shapes:
        element = deepcopy(shape.element)
        _replace_rel_ids(element, rel_id_map)
        _ensure_explicit_geometry(element, shape)
        _strip_placeholder_binding(element)
        target_slide.shapes._spTree.insert_element_before(element, "p:extLst")


def _get_path_value(data, path: str):
    current = data
    for part in path.split("."):
        if "[" in part and part.endswith("]"):
            name, index_text = part[:-1].split("[", 1)
            current = current.get(name, []) if isinstance(current, dict) else []
            try:
                current = current[int(index_text)]
            except (IndexError, ValueError, TypeError):
                return ""
            continue
        if isinstance(current, dict):
            current = current.get(part, "")
        else:
            return ""
    return current


def _format_value(value):
    if value is None:
        return ""
    if isinstance(value, list):
        return "\n".join(_format_value(item) for item in value)
    if isinstance(value, dict):
        title = value.get("title") or value.get("label") or value.get("date") or ""
        desc = value.get("desc") or value.get("result") or value.get("summary") or ""
        if title and desc:
            return f"{title}\n{desc}"
        return str(title or desc)
    return str(value)


def render_compiled_layout(slide, body, ctx, layout_name: str):
    spec_path = ctx.skill_dir / "layouts" / "specs" / f"{layout_name}.json"
    spec = json.loads(spec_path.read_text(encoding="utf-8-sig"))
    source_path = ctx.skill_dir / spec["compiled_pptx"]
    source_prs = _load_presentation(source_path)
    source_slide = source_prs.slides[int(spec.get("source_slide", 1)) - 1]

    _copy_source_shapes(slide, source_slide)

    text_shape_list = list(iter_text_shapes(slide.shapes))
    by_name = {getattr(shape, "name", ""): shape for shape in text_shape_list}
    for field in spec.get("fields", []):
        shape = None
        if field.get("match_text") is not None:
            shape = next((candidate for candidate in text_shape_list if (candidate.text or "").strip() == field.get("match_text")), None)
        if shape is None:
            shape = by_name.get(field.get("shape", ""))
        if shape is None:
            continue
        value = _get_path_value(body, field.get("path", ""))
        text = _format_value(value)
        if not text and field.get("clear_if_empty", True):
            replace_text_preserve_shape(shape, "")
            continue
        if text:
            replace_text_preserve_shape(shape, text)

    for shape_name in spec.get("clear_shapes", []):
        shape = by_name.get(shape_name)
        if shape is not None:
            replace_text_preserve_shape(shape, "")

    by_shape_name = {getattr(shape, "name", ""): shape for shape in slide.shapes}
    for image_field in spec.get("image_fields", []):
        shape = by_shape_name.get(image_field.get("shape", ""))
        if shape is None:
            continue
        x = emu_to_in(shape.left)
        y = emu_to_in(shape.top)
        w = emu_to_in(shape.width)
        h = emu_to_in(shape.height)
        shape.element.getparent().remove(shape.element)
        image_path = _get_path_value(body, image_field.get("path", ""))
        add_image_or_slot(slide, image_path, x, y, w, h, image_field.get("label", "素材图"), ctx)
