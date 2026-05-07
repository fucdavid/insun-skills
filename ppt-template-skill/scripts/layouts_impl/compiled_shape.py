from __future__ import annotations

from ppt_engine.compiled_layout import render_compiled_layout


LAYOUT_NAME = "compiled_shape"
OWNS_TITLE = True


def render(slide, body, ctx, start_y=1.35, layout=None):
    if not layout:
        raise ValueError("compiled_shape layout requires the concrete layout name")
    render_compiled_layout(slide, body, ctx, layout)
