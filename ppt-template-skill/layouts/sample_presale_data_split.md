# 重点车型投入拆解 (sample_presale_data_split)

Source: `排版示例.pptx` slide 3. Compiled package: `layouts/compiled/sample_presale_data_split.pptx`.

## Use Case

Use for before/after presale data split or two-panel opinion data breakdown.

## Semantic Fields

- `title`
- `period_note`
- `data_title`
- `left_panel`
- `right_panel`

## Mapping Rule

This layout uses explicit semantic fields. Do not use generic `text_blocks[]` for this layout. Keep each value short enough for its original textbox. Use tables as two-dimensional arrays and image fields as local file paths.

## Constraints

- Uses compiled shape cloning and loads only when this layout is selected.
- `owns_title=true`; clear template sample text before rendering.
- Split into multiple slides if content is too dense.
