# style2_execution_plan_burst

Uses precompiled shape-clone layout from `排版样式2.pptx` slide 6. Runtime loads only `layouts/compiled/style2_execution_plan_burst.pptx` and `layouts/specs/style2_execution_plan_burst.json`.

Use for: burst phase execution table.

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

Limit: Use for launch/burst phase execution plan with 5 directions.
