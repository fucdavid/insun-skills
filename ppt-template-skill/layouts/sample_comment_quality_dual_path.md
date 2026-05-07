# 上市期间核心策略举措1 (sample_comment_quality_dual_path)

Source: `排版示例.pptx` slide 5. Compiled package: `layouts/compiled/sample_comment_quality_dual_path.pptx`.

## Use Case

Use for comment-quality improvement paths with category evidence and dual-path conclusions.

## Semantic Fields

- `title`
- `summary`
- `theme`
- `quality_bar`
- `categories[]`
- `left_path`
- `right_path`
- `left_result`
- `right_result`
- `category_images[]`

## Mapping Rule

This layout uses explicit semantic fields. Do not use generic `text_blocks[]` for this layout. Keep each value short enough for its original textbox. Use tables as two-dimensional arrays and image fields as local file paths.

## Constraints

- Uses compiled shape cloning and loads only when this layout is selected.
- `owns_title=true`; clear template sample text before rendering.
- Split into multiple slides if content is too dense.
