# Insun Skills 技能仓库

本仓库用于存放和共享 [WorkBuddy](https://www.codebuddy.cn/) 平台上的可复用技能（Skills）。

## 技能列表

### 1. ppt-template-skill

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

**主要脚本**：
```bash
python scripts/classify_template.py 模板.pptx template_spec.json template_route.json  # 模板分类
python scripts/build_skeleton.py template_spec.json template_route.json skeleton.pptx   # 生成骨架
node scripts/render_content.js outline.json content.pptx                               # 内容渲染
python scripts/merge_content.py skeleton.pptx content.pptx final.pptx                  # 合并输出
```

**模板支持**：
- 吉利模版、启境PPT模板、奕派科技PPT模板、广汽埃安模版
- 昊铂埃安BU-PPT模版、比亚迪王朝秦系口碑项目模板
- 领克其他模板（青色）、领克电车类模板（靛紫）
- 猛士项目模板、奇景模板、意境模板等

---

### 2. 领克IP爆款视频专家

**功能描述**：领克（Lynk & Co）品牌短视频文案生成专家。用户给出话题，自动判断类型（快讯号 / 深度解读），生成符合爆款风格的视频旁白文案。

**触发词**：领克视频、领克文案、领克快讯、领克深度、视频文案、领克旁白、写个领克视频

**文案类型**：

| 类型 | 判断标准 | 字数 | 时长 |
|------|---------|------|------|
| **快讯号** | 时效性强的单一新闻事件（新车上市、销量战报、技术发布、荣誉认证等） | 250-300字 | 约30秒 |
| **快讯号·阿sir纪录片** | 同上，但要求「麦克阿瑟风格」时使用，结尾有虚构「车神麦克阿瑟」点评 | 250-300字 | 约30秒 |
| **深度解读** | 需要分析、解读、说理的话题（技术解读、行业趋势、品牌战略、热点评论等） | 600-700字 | 1-2分钟 |

**文案模板**：
- **模板A：快讯号（车语领潮所，30秒 / 250-300字）**
  - 4段式结构：发布文案 + 视频标题 + 正文文案 + 结尾引导
  - 标题公式：冲突数字 + 结果碾压 + 强情绪词
- **模板B：深度解读（1-2分钟 / 600-700字）**
  - 5段式结构：发布文案 + 视频标题 + 开头钩子 + 正文分点论证 + 结尾引导

---

## 使用方式

1. 将技能目录复制到 WorkBuddy 的 skills 目录下：
   ```bash
   cp -r ppt-template-skill ~/.workbuddy/skills/
   cp -r 领克IP爆款视频专家 ~/.workbuddy/skills/
   ```

2. 在 WorkBuddy 中通过 `@skill:技能名` 调用，例如：
   - `@skill:ppt-template-skill`
   - `@skill:领克IP爆款视频专家`

---

## 贡献指南

欢迎提交新的技能或改进现有技能。提交时请确保：
- 技能目录包含完整的 `SKILL.md` 文件
- 提供清晰的技能描述和使用说明
- 避免提交依赖目录（如 `node_modules`、`__pycache__`）

---

*本仓库由 WorkBuddy 用户维护，用于团队协作和技能共享。*
