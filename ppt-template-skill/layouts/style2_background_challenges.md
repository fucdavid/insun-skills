# style2_background_challenges

Uses precompiled shape-clone layout from `排版样式2.pptx` slide 2. Runtime loads only `layouts/compiled/style2_background_challenges.pptx` and `layouts/specs/style2_background_challenges.json`.

Use for: market/user/technology challenge overview.

Core fields:
- `title`
- `challenge_summary`
- `challenges[]`

Optional image fields use `challenge_images[]`. If no image path is supplied, original reference images are preserved with their original z-order.

Limit: Use for one challenge summary plus exactly 3 challenge cards.
