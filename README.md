# Insun Skills 技能仓库

本仓库用于存放和共享 [WorkBuddy](https://www.codebuddy.cn/) 平台上的可复用技能（Skills）。

---

## 技能列表

### 1. geo-brand-diagnosis

**功能描述**：GEO（生成引擎优化）品牌诊断分析技能。通过 AI 平台（DeepSeek、豆包、Kimi）模拟真实用户搜索行为，自动生成测试问题、批量提交、提取回答和参考信源，最终输出品牌提及率诊断报告（HTML + PDF）。

**适用场景**：汽车品牌（比亚迪、昊铂、广汽埃安、奕境等）AI 搜索可见性诊断、舆情监控、品牌认知度评估。

**核心特性**：
- 测试问题贴合真实搜索意图，模拟自然搜索口吻，不含品牌名称
- 支持 DeepSeek、豆包、Kimi 三平台批量测试
- 提取每条 AI 回答的品牌提及率和参考信源
- 生成结构化诊断报告（核心结论 → 指标总览 → 各平台表现 → 多维指标 → 优化建议）
- 支持竞品对比分析

**详细文档**：见 [geo-brand-diagnosis/SKILL.md](./geo-brand-diagnosis/SKILL.md)

---

### 2. ppt-template-skill

**功能描述**：基于用户上传的 PPT 模板生成演示文稿。使用双轨策略：模板页（封面/过渡/尾页）通过 XML 克隆保证 100% 视觉还原，其中尾页必须原样保留；内容页正文区通过 pptxgenjs 按大纲内容动态排版。

**适用场景**：
- 汽车品牌 PPT 生成（吉利、奕境、广汽埃安、昊铂、比亚迪王朝、领克、猛士等）
- 任何 `.pptx` 模板文件的自动化内容填充

**核心特性**：
- 模板分类与路由（`dual_track` / `style_clone` / `manual_review`）
- XML 克隆确保封面、过渡页、尾页视觉 100% 还原
- 尾页作为品牌收尾页原样保留，不替换任何模板文字
- 内容页根据大纲条目数量、内容类型自动选择最优布局
- 用户画像用饼图、核心指标用进度条等数据可视化支持
- 严格的格式一致性检查（字体、颜色、尾页篡改检测）
- 新增布局引擎（`ppt_engine/`、`layouts_impl/`）支持更丰富的排版模式

**布局类型**（内容页）：

| 布局 | 适用场景 |
|------|---------|
| `kpi_card` | 2-4 个核心指标、数据卡片 |
| `bullet_list` | 4-6 个同级要点、策略抓手 |
| `timeline` | 阶段、流程、演进路径 |
| `insight_onepage` | 核心观点 + 逻辑链 + 数据证明 + 金句 |
| `campaign_three_columns` | 三栏运营/营销规划页 |
| `statement_action_bar` | 声明 + 行动号召页 |

**主要脚本**：
```bash
# 模板分类
python scripts/classify_template.py 模板.pptx template_spec.json template_route.json

# dual_track 路线
python scripts/build_skeleton.py template_spec.json content.json output/ 模板.pptx
node scripts/render_content.js output/content_manifest.json
python scripts/merge_content.py output/ 最终输出.pptx 模板.pptx

# style_clone 路线（更常用）
python scripts/render_style_clone_report.py content.json 最终输出.pptx 模板.pptx
```

**模板支持**（10套）：
- 奕境模板（`dual_track`）
- 吉利模版、启境PPT模板、奕派科技PPT模板、广汽埃安模板
- 昊铂埃安BU-PPT模板、比亚迪王朝秦系口碑项目模板
- 领克其他模板（青色）、领克电车类模板（靛紫）
- 猛士项目模板

**详细文档**：见 [ppt-template-skill/SKILL.md](./ppt-template-skill/SKILL.md)

---

### 3. 领克IP爆款视频专家

**功能描述**：领克（Lynk & Co）品牌短视频文案生成专家。用户给出话题，自动判断类型（快讯号 / 深度解读），生成符合爆款风格的视频旁白文案。

**触发词**：领克视频、领克文案、领克快讯、领克深度、视频文案、领克旁白、写个领克视频

---

## 使用方式

1. 将技能目录复制到 WorkBuddy 的 skills 目录下：
   ```bash
   cp -r <技能名> ~/.workbuddy/skills/
   ```

2. 在 WorkBuddy 中通过 `@skill:技能名` 调用，例如：
   - `@skill:geo-brand-diagnosis`
   - `@skill:ppt-template-skill`

---

## 贡献指南

欢迎提交新的技能或改进现有技能。提交时请确保：
- 技能目录包含完整的 `SKILL.md` 文件
- 提供清晰的技能描述和使用说明
- 避免提交依赖目录（如 `node_modules`、`__pycache__`）

---

*本仓库由 WorkBuddy 用户维护，用于团队协作和技能共享。*
