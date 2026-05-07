# sample3_live_overall

使用预编译 shape 克隆方案，来源为 `排版样例3.pptx` 第 1 页。运行时只加载 `layouts/compiled/sample3_live_overall.pptx` 和 `layouts/specs/sample3_live_overall.json`。

适用：大型活动直播总览、赛事直播规划、发布会直播规划。

核心字段：
- `title`
- `banner`
- `purpose`
- `strategy`
- `benefit`
- `video_items_left`
- `video_items_right`
- `live_image` 可选，未提供时保留原位占位框

限制：保持原始表格式结构，不自动拉伸区域；内容过长时拆页。
