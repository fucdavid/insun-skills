# 排版库使用说明

本目录的公开排版库同步 `pptx` 技能 `references/t*.md` 的完整 T 系列语义排版方案。

核心原则：

- 内容页统一输出 `slides[].body.layout = "t_variant"`。
- 具体版式通过 `slides[].body.variant` 指定，例如 `T4a_cards`、`T4e_timeline`、`T7_table`。
- T 变体实现放在 `layouts/references/t*.md`，每个 md 内提供一个 JS / pptxgenjs 模板函数。
- 参考 PPT 或参考图片不作为原始 shape 克隆来源；渲染时运行时加载对应 md，把 T 模板的 10 x 5.625 全页坐标映射到当前用户模板的 `body_zone`，颜色和字体继承当前模板。
- 旧 `registry.json` 只作为历史兼容索引存在，不属于公开排版流程。
- 内容必须尽量保持用户原始大纲完整，空间不足时拆页，不静默删改。

## 使用流程

1. 先读取 `t_variants.json`，根据内容类型选择候选 T 变体。
2. 生成 `content.json` 时写入该变体需要的语义字段。
3. `scripts/render_content.js` 根据 `variant` 从 `t_variants.json` 找到 `reference_file` 和 `function`，再按需读取对应 `layouts/references/t*.md`，提取并执行其中的 `pptxgenjs` 模板函数。
4. 如果内容超过变体容量，优先拆页；不要缩到不可读，也不要改写结论。
5. 没有专用变体时，使用 `T4a_cards` 或 `T4b_numbered_list` 承载原文要点。

## 当前 T 变体

当前已登记 58 个 T 变体，完整清单以 `t_variants.json` 为准。生成时不要把可用范围硬编码为旧的 7 个变体。

常用内容页变体包括：

- `T4a_cards`、`T4b_numbered_list`、`T4c_text_image`、`T4d_metrics`、`T4e_timeline`
- `T5_comparison`、`T6_kpi`、`T7_table`
- `T11_milestone_timeline` 到 `T31_strategy_matrix` 的通用业务结构页
- `T32_wuhan_marathon_live_plan` 到 `T35_koc_april_summary` 的活动/KOC 规划页
- `T36_m9_negative_handling` 到 `T44_m9_monitor_split` 的 M9 舆情/评论运营页
- `T45_byd_core_value_insight` 到 `T54_byd_risk_response_matrix` 的 BYD 口碑项目页

`T1_cover`、`T2_toc`、`T3_transition`、`T8_end`、`T9_dark_cover`、`T10_dark_sidebar_toc` 属于模板角色参考页。使用品牌 PPT 模板生成时，封面、目录、过渡和尾页仍优先克隆用户选择的模板页；这些 T 变体只作为从零生成或用户明确要求时的参考。

## 新增布局标准

后续新增排版时，先判断它属于现有 T 变体的扩展，还是需要新增 T 变体。

新增时必须登记：

- `id`
- `reference_file`
- `function`
- 适用内容类型
- 字段 schema
- 容量限制
- 溢出处理策略
- 参考来源

新增渲染能力放在 `layouts/references/t*.md`，不是写死进 `scripts/render_content.js`。`render_content.js` 只负责索引读取、md 代码块提取、受控执行、通用字段适配、坐标映射和模板配色适配；不得自行写一套只“看起来像”的近似布局，也不得恢复原始 shape 克隆路径。

## 质量门槛

- 不出现标题重叠、示例文字残留或右侧溢出。
- 不遗漏用户大纲里的关键数据、案例、来源和金句。
- 不把截图红框、选择框、批注线当作版式元素。
- 不让参考图/PPT 的品牌色覆盖所选模板的品牌色。
- 尾页原样保留；封面、目录、过渡页只替换文字，不改样式。
