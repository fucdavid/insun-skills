# 重点产品舆情现状 (sample_opinion_status_dashboard)

Source: `排版示例.pptx` slide 4. Compiled package: `layouts/compiled/sample_opinion_status_dashboard.pptx`.

## Use Case

Use for opinion status dashboard with overall data, positive/negative ratio and negative examples.

## Semantic Fields

- `title`
- `summary`
- `overall_summary`
- `positive_rate`
- `negative_rate`
- `positive_views`
- `negative_views`
- `handling_result`
- `negative_images[]`

## Mapping Rule

This layout uses explicit semantic fields. Do not use generic `text_blocks[]` for this layout. Keep each value short enough for its original textbox. Use tables as two-dimensional arrays and image fields as local file paths.

## Constraints

- Uses compiled shape cloning and loads only when this layout is selected.
- `owns_title=true`; clear template sample text before rendering.
- Split into multiple slides if content is too dense.
