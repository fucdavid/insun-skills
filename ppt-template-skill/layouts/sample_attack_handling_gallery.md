# 重点车型车黑打击情况一览 (sample_attack_handling_gallery)

Source: `排版示例.pptx` slide 2. Compiled package: `layouts/compiled/sample_attack_handling_gallery.pptx`.

## Use Case

Use for negative handling or black-account attack evidence with one data table and three evidence cards.

## Semantic Fields

- `title`
- `summary`
- `handling_table`
- `cards[].title`
- `cards[].result`
- `cards[].image`
- `time_period`

## Mapping Rule

This layout uses explicit semantic fields. Do not use generic `text_blocks[]` for this layout. Keep each value short enough for its original textbox. Use tables as two-dimensional arrays and image fields as local file paths.

## Constraints

- Uses compiled shape cloning and loads only when this layout is selected.
- `owns_title=true`; clear template sample text before rendering.
- Split into multiple slides if content is too dense.
