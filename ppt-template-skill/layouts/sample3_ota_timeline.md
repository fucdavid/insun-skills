# sample3_ota_timeline

使用预编译 shape 克隆方案，来源为 `排版样例3.pptx` 第 2 页。运行时只加载 `layouts/compiled/sample3_ota_timeline.pptx` 和 `layouts/specs/sample3_ota_timeline.json`。

适用：OTA传播、新媒体三阶段传播、产品升级传播节奏。

核心字段：
- `title`
- `summary`
- `dimensions[0..1].title/desc`
- `theme`
- `stages[0..2].phase/date/event/keyword/strategy/detail`
- `fee`

限制：阶段固定 3 个，目标维度固定 2 个；多余内容拆页。
