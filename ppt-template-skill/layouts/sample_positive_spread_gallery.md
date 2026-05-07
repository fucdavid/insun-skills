# 上市期间核心策略举措2 (sample_positive_spread_gallery)

Source: `排版示例.pptx` slide 8. Compiled package: `layouts/compiled/sample_positive_spread_gallery.pptx`.

## Use Case

Use for positive communication gallery with two content topics and numeric target.

## Semantic Fields

- `title`
- `summary`
- `left_topic`
- `right_topic`
- `target`

## Mapping Rule

This layout uses explicit semantic fields. Do not use generic `text_blocks[]` for this layout. Keep each value short enough for its original textbox. Use tables as two-dimensional arrays and image fields as local file paths.

## Constraints

- Uses compiled shape cloning and loads only when this layout is selected.
- `owns_title=true`; clear template sample text before rendering.
- Split into multiple slides if content is too dense.
