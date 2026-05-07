# style2_judgement_action_bar

Uses precompiled shape-clone layout from `排版样式2.pptx` slide 11. Runtime loads only `layouts/compiled/style2_judgement_action_bar.pptx` and `layouts/specs/style2_judgement_action_bar.json`.

Use for: core judgement, action recommendation, conclusion page.

Core fields:
- `judgement`
- `action`

Optional image fields use `anchor_images[]`. If no image path is supplied, original reference images are preserved with their original z-order.

Limit: Use for one core judgement plus one action conclusion; keep icon anchor.
