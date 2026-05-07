# style2_background_strengths

Uses precompiled shape-clone layout from `排版样式2.pptx` slide 1. Runtime loads only `layouts/compiled/style2_background_strengths.pptx` and `layouts/specs/style2_background_strengths.json`.

Use for: background insight, core product strengths, three proof points.

Core fields:
- `title`
- `core_advantage`
- `cards[]`

Optional image fields use `strength_images[]`. If no image path is supplied, original reference images are preserved with their original z-order.

Limit: Use for one core advantage statement plus exactly 3 strength cards.
