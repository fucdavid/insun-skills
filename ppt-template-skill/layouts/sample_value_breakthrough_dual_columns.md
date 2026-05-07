# 上市期间核心策略举措2 (sample_value_breakthrough_dual_columns)

Source: `排版示例.pptx` slide 7. Compiled package: `layouts/compiled/sample_value_breakthrough_dual_columns.pptx`.

## Use Case

Use for dual-column value breakthrough: rational value vs emotional value paths.

## Semantic Fields

- `title`
- `summary`
- `theme`
- `left_column`
- `right_column`

## Mapping Rule

This layout uses explicit semantic fields. Do not use generic `text_blocks[]` for this layout. Keep each value short enough for its original textbox. Use tables as two-dimensional arrays and image fields as local file paths.

## Constraints

- Uses compiled shape cloning and loads only when this layout is selected.
- `owns_title=true`; clear template sample text before rendering.
- Split into multiple slides if content is too dense.
