from __future__ import annotations

import json
import re

from .primitives import footer, title
from .template import iter_text_shapes, replace_text_preserve_shape, text_shapes


def ensure_toc_slide(desired_slides, has_toc_template):
    if not has_toc_template:
        return [slide for slide in desired_slides if slide.get("type") != "toc"]
    if any(slide.get("type") == "toc" for slide in desired_slides):
        return desired_slides

    items = [
        slide.get("page_title") or slide.get("title")
        for slide in desired_slides
        if slide.get("type") == "content" and (slide.get("page_title") or slide.get("title"))
    ]
    if not items:
        return desired_slides

    slides = list(desired_slides)
    insert_at = 1 if slides and slides[0].get("type") == "cover" else 0
    slides.insert(insert_at, {"type": "toc", "title": "目录", "items": items[:8]})
    return slides


def replace_cover_text(slide, cover_data, content):
    shapes = text_shapes(slide)
    if not shapes:
        return
    title_text = cover_data.get("title") or content.get("title", "")
    date_text = cover_data.get("date") or content.get("date", "")
    subtitle_text = cover_data.get("subtitle") or content.get("subtitle", "")
    title_shape = max(shapes, key=lambda s: (s.width or 0) * (s.height or 0))
    replace_text_preserve_shape(title_shape, title_text)
    remaining = [s for s in shapes if s is not title_shape]
    date_shape = None
    if remaining and date_text:
        date_shape = max(remaining, key=lambda s: s.top or 0)
        replace_text_preserve_shape(date_shape, date_text)
    for shape in remaining:
        if shape is date_shape:
            continue
        original = shape.text.strip().lower()
        is_placeholder = any(token in original for token in ["xxx", "标题", "副标题", "subtitle", "tagline"])
        is_hash_like = len(original) > 80 and all(ch in "0123456789abcdef" for ch in original)
        if subtitle_text and is_placeholder:
            replace_text_preserve_shape(shape, subtitle_text)
        elif is_placeholder or is_hash_like:
            replace_text_preserve_shape(shape, "")


def replace_end_text(slide, end_data, content):
    shapes = text_shapes(slide)
    if not shapes:
        return
    title_text = end_data.get("title") or content.get("end_title") or "谢谢"
    date_text = end_data.get("date") or content.get("date", "")
    title_shape = max(shapes, key=lambda s: (s.width or 0) * (s.height or 0))
    replace_text_preserve_shape(title_shape, title_text)
    remaining = [s for s in shapes if s is not title_shape]
    date_shape = None
    if remaining and date_text:
        date_shape = max(remaining, key=lambda s: s.top or 0)
        replace_text_preserve_shape(date_shape, date_text)
    for shape in remaining:
        if shape is date_shape:
            continue
        original = shape.text.strip().lower()
        if any(token in original for token in ["xxx", "标题", "副标题", "thanks", "thank you", "谢谢"]):
            replace_text_preserve_shape(shape, "")


def render_toc_slide(slide, slide_data, page_num, source, ctx):
    items = slide_data.get("items", [])
    if not items:
        return

    if render_toc_from_template_spec(slide, slide_data, ctx):
        return

    def is_toc_marker(text):
        normalized = text.strip().lower()
        if normalized in ("目录", "contents", "content", "agenda", "part"):
            return True
        return bool(re.fullmatch(r"(?:0?[1-9]|part\s*0?[1-9])", normalized))

    candidates = []
    for shape in iter_text_shapes(slide.shapes):
        raw = shape.text.strip()
        normalized = raw.lower()
        if is_toc_marker(raw):
            continue
        if (
            "x" in normalized
            or "标题" in raw
            or "部分" in raw
            or re.match(r"^[一二三四五六七八九十][、.]", raw)
            or re.match(r"^0?[1-9][、. )]", raw)
        ):
            candidates.append(shape)

    if len(candidates) < len(items):
        extra = [shape for shape in iter_text_shapes(slide.shapes) if shape not in candidates and not is_toc_marker(shape.text)]
        candidates.extend(extra)

    def replacement(original, item):
        text = original.strip()
        match = re.match(r"^([一二三四五六七八九十][、.]\s*)(.*)$", text)
        if match:
            return match.group(1) + str(item)
        match = re.match(r"^(0?[1-9][、. )]\s*)(.*)$", text)
        if match:
            return match.group(1) + str(item)
        return str(item)

    if len(candidates) == 1 and len(items) > 1:
        original_lines = [line.strip() for line in candidates[0].text.splitlines() if line.strip()]
        prefixes = []
        for line in original_lines:
            match = re.match(r"^([一二三四五六七八九十][、.]\s*)", line) or re.match(r"^(0?[1-9][、. )]\s*)", line)
            prefixes.append(match.group(1) if match else "")
        while len(prefixes) < len(items):
            prefixes.append(f"{len(prefixes) + 1:02d} ")
        replace_text_preserve_shape(candidates[0], "\n\n".join(prefixes[idx] + str(item) for idx, item in enumerate(items)))
        return

    for idx, item in enumerate(items):
        if idx >= len(candidates):
            break
        replace_text_preserve_shape(candidates[idx], replacement(candidates[idx].text, item))
    for idx in range(len(items), len(candidates)):
        replace_text_preserve_shape(candidates[idx], "")


def render_toc_from_template_spec(slide, slide_data, ctx):
    spec = load_matching_template_spec(ctx)
    if not spec:
        return False
    toc = (spec.get("slide_types") or {}).get("toc") or {}
    placeholders = toc.get("placeholders") or {}
    item_names = placeholders.get("items") or []
    if not item_names:
        return False

    by_name = {getattr(shape, "name", ""): shape for shape in iter_text_shapes(slide.shapes)}

    title_name = placeholders.get("title")
    title_shape = by_name.get(title_name)
    if title_shape is not None and (slide_data.get("title") or slide_data.get("page_title")):
        replace_text_preserve_shape(title_shape, slide_data.get("title") or slide_data.get("page_title"))

    items = slide_data.get("items", [])
    replaced = False
    for idx, shape_name in enumerate(item_names):
        shape = by_name.get(shape_name)
        if shape is None:
            continue
        replace_text_preserve_shape(shape, items[idx] if idx < len(items) else "")
        replaced = True
    return replaced


def load_matching_template_spec(ctx):
    template_path = ctx.template_path
    for spec_path in template_path.parent.glob("*_spec_corrected.json"):
        try:
            spec = json.loads(spec_path.read_text(encoding="utf-8-sig"))
        except Exception:
            continue
        if spec.get("template_file") == template_path.name:
            return spec
    return None


def render_transition_slide(slide, slide_data, page_num, source, ctx):
    chapter = slide_data.get("chapter") or slide_data.get("section") or ""
    heading = slide_data.get("title") or slide_data.get("page_title") or ""
    text_shapes_in_order = list(iter_text_shapes(slide.shapes))
    if not text_shapes_in_order:
        return
    if len(text_shapes_in_order) == 1:
        original = text_shapes_in_order[0].text.strip()
        if chapter:
            match = re.match(r"^(\S+)(\s+)(.*)$", original)
            replace_text_preserve_shape(text_shapes_in_order[0], f"{chapter}{match.group(2)}{heading}" if match else f"{chapter}   {heading}")
        else:
            replace_text_preserve_shape(text_shapes_in_order[0], heading)
        return
    if chapter:
        replace_text_preserve_shape(text_shapes_in_order[0], chapter)
        replace_text_preserve_shape(text_shapes_in_order[1], heading)
    else:
        replace_text_preserve_shape(text_shapes_in_order[0], heading)


def infer_auto_layout(body):
    items = body.get("items", [])
    if body.get("quote") and (body.get("path") or body.get("evolution") or body.get("data") or body.get("insight")):
        return "insight_onepage"
    if any(item.get("value") for item in items):
        return "kpi"
    if len(items) == 4 and body.get("timeline"):
        return "timeline"
    return "grid"


def render_content_slide(slide, slide_data, page_num, source, registry, ctx, draw_title=True, content_top=None):
    body = slide_data.get("body", {})
    if isinstance(body, dict):
        body.setdefault("_page_title", slide_data.get("page_title") or slide_data.get("title") or "")
    layout = registry.normalize(body.get("layout", "auto"))
    if layout == "auto":
        layout = infer_auto_layout(body)
    meta = registry.get(layout)
    if meta and meta.owns_title:
        draw_title = False
    if draw_title:
        title(slide, slide_data.get("page_title") or slide_data.get("title", ""), slide_data.get("subtitle"), ctx=ctx)

    renderer = registry.load_renderer(layout)
    if renderer is None:
        import layouts_impl.basic as renderer
        layout = registry.normalize(layout)

    start_y = max(1.35, (content_top or 1.1) + 0.28)
    renderer.render(slide, body, ctx, start_y=start_y, layout=layout)
    footer(slide, page_num, source, ctx=ctx)
