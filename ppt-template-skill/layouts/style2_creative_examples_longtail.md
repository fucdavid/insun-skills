# style2_creative_examples_longtail

Uses precompiled shape-clone layout from `排版样式2.pptx` slide 9. Runtime loads only `layouts/compiled/style2_creative_examples_longtail.pptx` and `layouts/specs/style2_creative_examples_longtail.json`.

Use for: longtail creative examples and owner story seeding.

Core fields:
- `title`
- `summary`
- `example_note`
- `platforms`
- `cards[]`

Optional image fields use `creative_images[]`. If no image path is supplied, original reference images are preserved with their original z-order.

Limit: Use for exactly 3 longtail creative examples.
