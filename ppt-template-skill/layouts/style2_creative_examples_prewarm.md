# style2_creative_examples_prewarm

Uses precompiled shape-clone layout from `排版样式2.pptx` slide 5. Runtime loads only `layouts/compiled/style2_creative_examples_prewarm.pptx` and `layouts/specs/style2_creative_examples_prewarm.json`.

Use for: creative examples, content seeding examples.

Core fields:
- `title`
- `summary`
- `example_note`
- `platforms`
- `cards[]`

Optional image fields use `creative_images[]`. If no image path is supplied, original reference images are preserved with their original z-order.

Limit: Use for exactly 3 creative examples with title, format, description and comment seeding.
