# style2_execution_plan_prewarm

Uses precompiled shape-clone layout from `排版样式2.pptx` slide 4. Runtime loads only `layouts/compiled/style2_execution_plan_prewarm.pptx` and `layouts/specs/style2_execution_plan_prewarm.json`.

Use for: prewarm phase execution table.

Core fields:
- `title`
- `phase`
- `goal`
- `goal_detail`
- `strategy`
- `strategy_detail`
- `directions[]`
- `titles[]`
- `formats[]`
- `volumes[]`

Optional image fields use `plan_images[]`. If no image path is supplied, original reference images are preserved with their original z-order.

Limit: Use for execution plan with 4 directions and title examples.
