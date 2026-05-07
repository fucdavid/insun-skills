# 重点车型投入 (sample_opinion_data_overview)

Source: `排版示例.pptx` slide 1. Compiled package: `layouts/compiled/sample_opinion_data_overview.pptx`.

## Use Case

Use for communication/opinion data overview with two KPI tables and two evidence image zones.

## Semantic Fields

- `title`
- `period_note`
- `data_title`
- `propagation_table`
- `comment_table`
- `left_images[]`
- `right_images[]`

## Mapping Rule

This layout uses explicit semantic fields. Do not use generic `text_blocks[]` for this layout. Keep each value short enough for its original textbox. Use tables as two-dimensional arrays and image fields as local file paths.

## Constraints

- Uses compiled shape cloning and loads only when this layout is selected.
- `owns_title=true`; clear template sample text before rendering.
- Split into multiple slides if content is too dense.
