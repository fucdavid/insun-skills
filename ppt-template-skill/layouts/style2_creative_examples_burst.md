# style2_creative_examples_burst

Uses precompiled shape-clone layout from `排版样式2.pptx` slide 7. Runtime loads only `layouts/compiled/style2_creative_examples_burst.pptx` and `layouts/specs/style2_creative_examples_burst.json`.

Use for: launch/burst creative examples.

Core fields:
- `title`
- `summary`
- `example_note`
- `platforms`
- `cards[]`

Optional image fields use `creative_images[]`. If no image path is supplied, original reference images are preserved with their original z-order.

Limit: Use for exactly 3 burst-phase creative examples.
