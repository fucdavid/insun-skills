# style2_risk_response_matrix

Uses precompiled shape-clone layout from `排版样式2.pptx` slide 10. Runtime loads only `layouts/compiled/style2_risk_response_matrix.pptx` and `layouts/specs/style2_risk_response_matrix.json`.

Use for: risk forecast, public opinion response, mitigation matrix.

Core fields:
- `title`
- `summary`
- `column_labels[]`
- `risk_subjects[]`
- `risk_forecasts[]`
- `response_strategies[]`
- `actions[]`
- `monitoring_guidance[]`

Optional image fields use `risk_images[]`. If no image path is supplied, original reference images are preserved with their original z-order.

Limit: Use for 4 risk subjects across forecast/strategy/action/monitoring columns.
