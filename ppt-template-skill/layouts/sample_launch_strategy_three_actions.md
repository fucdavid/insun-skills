# 上市期间核心策略举措1 (sample_launch_strategy_three_actions)

Source: `排版示例.pptx` slide 6. Compiled package: `layouts/compiled/sample_launch_strategy_three_actions.pptx`.

## Use Case

Use for launch-period strategy with action 1, action 2 and action 3 plus classification table.

## Semantic Fields

- `title`
- `summary`
- `action1`
- `action2`
- `action3`
- `classification_table`
- `bottom_note`

## Mapping Rule

This layout uses explicit semantic fields. Do not use generic `text_blocks[]` for this layout. Keep each value short enough for its original textbox. Use tables as two-dimensional arrays and image fields as local file paths.

## Constraints

- Uses compiled shape cloning and loads only when this layout is selected.
- `owns_title=true`; clear template sample text before rendering.
- Split into multiple slides if content is too dense.
