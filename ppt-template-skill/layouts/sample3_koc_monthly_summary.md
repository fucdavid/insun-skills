# sample3_koc_monthly_summary

使用预编译 shape 克隆方案，来源为 `排版样例3.pptx` 第 4 页。运行时只加载 `layouts/compiled/sample3_koc_monthly_summary.pptx` 和 `layouts/specs/sample3_koc_monthly_summary.json`。

适用：KOC/KOL 月度运营总结、用户共创月报、活动传播复盘。

核心字段：
- `title`
- `summary`
- `metrics[0..2].value/label`
- `topics[].title/events[]`
- `issue`

限制：该页信息密度高，字段过长时必须拆页；原始示例图片会按 `image_fields` 替换为用户图片或占位框。
