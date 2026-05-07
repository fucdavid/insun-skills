# style2_overall_strategy_timeline

Uses precompiled shape-clone layout from `排版样式2.pptx` slide 3. Runtime loads only `layouts/compiled/style2_overall_strategy_timeline.pptx` and `layouts/specs/style2_overall_strategy_timeline.json`.

Use for: overall strategy, launch timeline, phased communication plan.

Core fields:
- `title`
- `summary`
- `strategy_title`
- `core_point_label`
- `core_point`
- `explanation`
- `stages[]`

Optional image fields use `strategy_images[]`. If no image path is supplied, original reference images are preserved with their original z-order.

Limit: Use for one strategic theme and exactly 3 stage plans.
