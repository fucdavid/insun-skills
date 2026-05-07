---
name: ppt-template-skill
description: "基于用户上传的 PPT 模板生成演示文稿。使用双轨策略：模板页（封面/过渡/尾页）通过 XML 克隆保证100%视觉还原，其中尾页必须原样保留；内容页优先使用 layouts/registry.json 中登记的排版库并按需加载 compiled_shape 布局，无匹配时才使用基础兜底排版。适用于吉利、奕境等品牌模板，也适用于任何 .pptx 模板文件。"
---

# PPT 模板复用技能

## 用户入口流程：生成前必须先确定模板 PPT

当用户要求“生成 PPT / 做一份 PPT / 用模板生成 PPT”时，必须先确定要使用的模板 PPT，再进入后续技术路由。没有模板选择时，不要直接生成。

### 入口决策

1. **用户已明确模板名**
   - 直接使用该模板生成，不再追问模板选择。
   - 模板名可以是登记名、文件名或明显别名，例如“启境模板”“比亚迪王朝秦系模板”“广汽埃安模板”。
   - 如果模板名模糊或多个模板都可能匹配，先让用户确认具体模板。

2. **用户上传了新的 `.pptx` 模板**
   - 先保存到 `templates/`。
   - 立即运行 `scripts/classify_template.py` 分类，生成对应 `*_spec.json` 和 `*_route.json`。
   - 分类结果为 `manual_review` 时，必须检查页面角色并修正 spec 后再生成。
   - 不要把新模板强行套用已有模板的 spec。

3. **用户没有指定模板，也没有上传模板**
   - 先让用户选择模板 PPT，生成流程暂停在模板选择前。
   - 只提供以下两种入口：
     - **选择已有模板**：列出“支持的模板清单”，让用户指定一个模板名。
     - **上传新模板**：让用户提供 `.pptx` 模板文件，随后按新模板接入流程分类。
   - 不允许模型自行选择模板“直接生成”，除非用户明确说“你帮我从已有模板里选一个”。即便如此，也要在回复中说明选择了哪个模板及原因，再开始生成。

### 不要打断的情况

如果用户已经说了“使用某某模板生成……”，直接进入生成流程；不要再问“选择模板/上传模板/直接生成”。

---

## 架构总览

本技能采用**双轨策略**，解决"模板还原"与"内容排版"两个相互独立的问题：

| 页面类型 | 策略 | 理由 |
|---------|------|------|
| 封面、过渡页 | **XML 克隆 + 文字替换** | 背景图/渐变/特效字体完整保留，100% 视觉还原 |
| 尾页 | **XML 克隆，禁止改字** | 尾页作为品牌收尾页原样保留，不替换 THANKS、日期、署名或任何模板文字 |
| 内容页（正文区） | **registry 排版库优先 + 基础兜底** | 先按内容结构匹配 `layouts/registry.json` 中 ready 布局，只加载命中的 detail/spec/compiled PPTX；无匹配时才使用基础兜底或拆页 |

---

## 路由总则：所有模板先分类

不要假设新上传模板一定符合 `cover + transition + content + end`。每次接入新模板，先运行分类器：

```bash
python scripts/classify_template.py 模板.pptx template_spec.json template_route.json
```

根据 `template_route.json.route` 选择生成路线：

| route | 适用模板 | 生成方式 |
|-------|----------|----------|
| `dual_track` | 有明确封面、章节/过渡、内容页、尾页模板 | 优先走 `render_report.py`：模板页克隆 + registry 排版库调度；旧链路 `build_skeleton.py` + `render_content.js` + `merge_content.py` 仅作兼容 |
| `style_clone` | 只有封面 + 内容风格页 + 可选尾页/金句页，缺少完整语义占位符 | 优先走 `render_report.py`：复制内容风格页并按 registry 排版库生成正文；`render_style_clone_report.py` 仅作兼容 |
| `manual_review` | 页面结构过少或识别不可靠 | 打开/检查 `template_spec.json`，人工指定 slide 类型、占位符和正文区后再选路线 |

**判断原则：**
- 如果模板内容页本身有稳定标题占位符和可清空正文区，优先 `dual_track`。
- 如果模板像吉利模板一样只有封面、内容视觉风格页和尾页，但没有正文占位符，不要强行用 `build_skeleton`；用 `style_clone`。
- 如果模板包含目录页，使用 `toc` 类型；目录页一般位于封面之后，标题含「目录 / CONTENTS / Agenda」或含多个 `01/02/03` 章节项。
- 如果用户上传新模板，必须先保存模板文件并分类；不要直接套用奕境或吉利的 spec。

---

## 完整工作流程：dual_track 路线（9步，严格顺序）

### 第1步：安装依赖

```bash
# Node.js（内容页生成 + 图标）
npm install -g pptxgenjs react-icons react react-dom sharp

# Python（模板解析 + 质量检查）
pip install "markitdown[pptx]" defusedxml Pillow --break-system-packages

# 验证
node -e "require('pptxgenjs'); require('react-icons/fa'); require('sharp'); console.log('OK')"
```

### 第2步：分类并解析模板 → 生成 template_spec.json

优先运行 `scripts/classify_template.py`，自动识别页面类型并推荐路线：

```bash
python scripts/classify_template.py 模板.pptx template_spec.json template_route.json
```

如果 `route = dual_track`，继续使用本节后续步骤。若 `route = style_clone`，跳到「style_clone 路线」。

**输出格式示例（奕境模板）：**

```json
{
  "template_file": "奕境模板.pptx",
  "slide_size": { "w_emu": 9144000, "h_emu": 5143500 },
  "design_tokens": {
    "primary_color": "861B2F",
    "text_dark": "1D1D1A",
    "bg_light": "F5F2EE",
    "font_title": "SourceHanSansCN-Medium",
    "font_body": "SourceHanSansCN-Regular"
  },
  "slide_types": {
    "cover":      { "slide_file": "slide1.xml", "placeholders": { "title": "矩形 4", "date": "文本占位符 2" } },
    "toc":        { "slide_file": "slide2.xml", "placeholders": { "title": "标题 1", "items": ["目录项 1", "目录项 2", "目录项 3"] } },
    "transition": { "slide_file": "slide2.xml", "placeholders": { "chapter": "副标题 3", "title": "标题 2" } },
    "content":    { "slide_file": "slide3.xml", "placeholders": { "page_title": "标题 2" }, "body_zone": { "x": 0.42, "y": 1.3, "w": 12.3, "h": 3.9 } },
    "end":        { "slide_file": "slide4.xml", "placeholders": {} }
  }
}
```

**`body_zone`** 是内容页正文区的可用空间（英寸），pptxgenjs 在此区域内排版。

**安全边距规则：** 内容渲染会自动把正文区约束在 16:9 页面安全版心内，左右至少保留约 `0.62in`。不要把 `body_zone.w` 设置到贴近整页宽度，否则 4 列 KPI 卡片容易在 PowerPoint 中贴边或右侧溢出。`render_content.js` 会通过 `clampZone()` 兜底修正。

### 第3步：分析用户大纲，规划 content.json

根据用户提供的内容（文字/文档/口述），生成结构化大纲：

```json
{
  "title": "演示文稿标题",
  "slides": [
    {
      "type": "cover",
      "title": "奕境汽车用户运营年度策略规划",
      "date": "2026.04"
    },
    {
      "type": "transition",
      "chapter": "01",
      "title": "用户洞察与市场分析"
    },
    {
      "type": "toc",
      "title": "目录",
      "items": [
        "用户洞察与市场分析",
        "全年运营策略框架",
        "渠道与服务体系",
        "2026关键课题"
      ]
    },
    {
      "type": "content",
      "page_title": "2026年核心用户画像",
      "body": {
        "layout": "auto",
        "items": [
          { "label": "主力用户年龄", "value": "28-40岁", "desc": "占整体用户的67%，以家庭用户为主" },
          { "label": "购车决策周期", "value": "3.2个月", "desc": "较2025年缩短18天，信息获取效率提升" },
          { "label": "复购意愿指数", "value": "82分", "desc": "行业均值74分，品牌黏性持续走强" }
        ]
      }
    },
    {
      "type": "content",
      "page_title": "全年用户运营策略框架",
      "body": {
        "layout": "auto",
        "items": [
          { "label": "拉新阶段", "desc": "精准投放社交媒体，覆盖潜客触达场景，转化率目标+25%" },
          { "label": "培育阶段", "desc": "内容矩阵+试驾激励双线并行，缩短决策漏斗路径" },
          { "label": "转化阶段", "desc": "限时权益包+专属顾问跟进，季度销售目标12,000台" },
          { "label": "留存阶段", "desc": "会员分层运营，NPS目标75+，老带新占比达30%" }
        ]
      }
    },
    {
      "type": "end"
    }
  ]
}
```

**`layout: "auto"` 规则**（详见第5步）：系统根据 items 数量和内容类型自动选择最合适的版式。

### 第4步：克隆模板 → 生成框架 PPTX

运行 `scripts/build_skeleton.py`，按 content.json 的页面顺序，从模板复制对应 slide XML，生成只有框架没有内容的 PPTX：

```bash
python scripts/build_skeleton.py template_spec.json content.json output_skeleton/ 模板.pptx
```

这一步完成后，所有模板页（封面/过渡/尾页）的视觉效果已100%还原，内容页正文区为空。

### 第5步：内容页正文排版（registry 排版库优先）

内容页正文优先通过 `scripts/render_report.py` 调度：先读取 `layouts/registry.json`，按用户内容的信息结构匹配 `status=ready` 且 `fidelity=accepted/ppt_exact` 的排版库布局；确定布局后，只加载该布局对应的 `detail_file`、`spec_file` 和 `compiled_pptx`。`scripts/render_content.js` / pptxgenjs 仅作为历史 dual_track 或基础兜底能力，不是排版库的首选入口。

**排版库选择规则：**

1. 先把用户材料拆成信息结构，例如“核心判断+行动结论”“三阶段策略”“执行规划表”“三张创意示例卡”“风险应对矩阵”。
2. 只读取 `layouts/registry.json` 的索引字段：`name`、`aliases`、`content_type`、`fields`、`limit`、`detail_file`。
3. 选择最匹配的 ready 布局后，再读取该布局的详情文件和 spec。不要一次性加载所有 `layouts/*.md` 或所有 specs。
4. 生成 `content.json` 时必须写该布局登记的语义字段，不要继续使用通用 `text_blocks[]`、`items[]` 或临时坐标字段来硬塞内容。
5. 如果没有匹配的 ready 布局，优先拆页或使用基础兜底；同时说明该内容类型暂未沉淀为排版库布局。

只有 `layouts/registry.json` 中 `status=ready` 且 `fidelity=accepted/ppt_exact` 的条目才属于可用排版库。历史脚本里存在但未登记为 ready 的版式只能作为内部草稿/兜底，不得推荐给其他模型直接使用。

如果内容无法匹配当前排版库，不要伪造布局；优先使用脚本内部兜底生成基础内容页，或拆页，并提示用户后续可提供参考图或 PPT 加入排版库。

关键参数：从 `template_spec.json` 读取 `body_zone` 和 `design_tokens`，确保正文颜色与模板主色一致。

### 内容页排版质量规则

生成内容页前，必须先把用户材料拆成“信息架构”，不要把所有文字直接塞进同一种网格：

### 用户大纲保真规则

用户提供的大纲、要点、数据、结论和金句是内容源，不能为了排版好看随意删改。

中文内容文件必须以 UTF-8 写入。不要用 PowerShell here-string、`echo` 或控制台管道临时拼中文 JSON；这些路径可能把中文转成 `?`。需要生成中文 `content.json` 时，使用已有文件、补丁写入或明确 `utf-8` 编码的脚本写入。

执行要求：
- 尽量完整保留用户给出的信息点、关键数据、专有名词、引用来源和结论。
- 可以做轻微语言压缩，例如去掉重复语气词、把长句拆成短句，但不得改变含义。
- 不得删除用户明确列出的关键数据、阶段、动作、来源和金句。
- 排版空间不足时，优先选择以下处理方式：
  1. 换成更适合高密度信息的布局；
  2. 拆成多页；
  3. 使用紧凑变体布局；
  4. 保留正文完整，把补充解释放到备注区或下一页；
  5. 明确告诉用户内容过密，需要拆页或确认删减。
- 不允许为了塞进一页而无限缩小字号、压缩到不可读，或静默删掉内容。

内容重构边界：
- 允许：同义压缩、拆分长句、合并重复点、调整顺序以适配版式。
- 不允许：改变观点方向、改写数据口径、删除来源、替换用户指定术语、把多个独立要点合成一个模糊表述。

- **运营规划三栏页**：如果内容是 3 个活动专题、传播专题、KOC/KOL 任务包或节日营销专项，使用 `campaign_three_columns`，结构固定为“顶部总论 + 三栏专题卡 + 底部机制总结”。
- **核心研判行动页**：如果内容是一句核心判断/风险研判，并配一条行动结论，使用 `statement_action_bar`，结构固定为“中上核心判断 + 左侧锚点 + 中部强调线 + 下方行动条”。该布局不使用模板内容页标题框，`page_title` 只用于目录/备注。
- **其他内容类型**：先查 `layouts/registry.json`，如果没有匹配的 ready 布局，可以用脚本内部基础排版兜底生成，但不能声称其属于排版库；如果用户提供参考图/PPT，再按新增布局流程加入排版库。

强制限制：
- 单页正文内容过密时优先拆成多页，不要强塞到一个版式里。
- 标题不要重复绘制，优先使用模板原有标题文本框；但排版库明确声明“不使用标题框”的布局（如 `statement_action_bar`）必须清空模板示例标题，不再额外绘制标题。
- 正文必须避开模板标题区和页脚区；内容区不足时减少文字，不要缩到不可读字号。
- 不要为了“看起来丰富”添加无意义装饰卡片、随机图标或大面积空框。

### 模板配色继承规则

内容页整体配色必须沿用当前选择模板的 `design_tokens`。参考图只用于学习结构和信息层级，不得直接照搬参考图颜色。

执行要求：
- 生成前读取当前模板 spec 的 `design_tokens`，至少使用 `primary_color`、`accent_color`、`text_dark`、`text_mid`、`bg_light`。
- 标题线、专题条、关键数字、流程节点优先使用 `primary_color`。
- 次级强调可使用 `accent_color` 或 `secondary_color`；如果模板没有登记，则从 `primary_color` 派生同色系深浅变化。
- 正文使用模板的 `text_dark` / `text_mid`，不要使用纯随机彩色正文。
- 卡片背景优先使用白色、`bg_light` 或模板浅色背景。
- 用户上传参考图时，只抽象布局结构；除非用户明确要求复刻参考图配色，否则参考图中的橙色、红色、紫色等不能覆盖模板品牌色。

禁止：
- 在吉利、领克、埃安等模板中照搬其他品牌参考图的高饱和色条。
- 同一页内使用 4 种以上无模板来源的强调色。
- 为了区分栏目给每列随意分配红、绿、蓝、橙；栏目区分优先靠位置、编号、标题，而不是随机颜色。

### 模板字体继承规则

内容页字体必须优先沿用当前选择模板的字体体系。参考图只用于判断字号层级，不得跨模板照搬字体。

执行要求：
- 优先使用模板 spec 的 `design_tokens.font_title`、`design_tokens.font_body`、`design_tokens.font_number`。
- 如果 spec 没有登记字体，脚本应从当前模板内容页已有文本框中推断主要字体。
- 如果仍无法识别，才使用通用兜底字体，例如 `Microsoft YaHei`。
- 标题、栏目标题、正文、数据数字可以有字号层级差异，但字体族应保持模板一致。
- 不允许在所有模板中固定使用某一个字体，例如 `汉仪雅酷黑 75W`。

字号规则：
- 优先保留模板原有标题文本框字号。
- 动态绘制正文时，只参考样图的“大/中/小”层级，不直接照搬具体字号。
- 正文字号过小时优先压缩文案或拆页，不要无限缩小。

### 排版库扩展机制

后续新增内容页排版时，不要只针对某一页截图临时写坐标；必须沉淀为可复用布局，并登记到排版库。

#### 渐进式披露原则

排版库必须按“先索引、后详情”的方式使用，避免一次加载所有版式说明：

1. **默认只读取布局索引**
   - 先根据内容类型矩阵选择候选布局。
   - 布局索引文件为 `layouts/registry.json`。
   - 不要把所有布局的完整说明、示例 JSON 和实现细节一次性加载进上下文。

2. **确定布局后再加载详情**
   - 只有当某页确定使用某个布局时，才读取该布局的详细说明、字段约束和示例。
   - 详情文件路径以 `layouts/registry.json` 中的 `detail_file` 为准，例如 `layouts/campaign_three_columns.md`。
   - 例如识别为“三个活动专题”后，只加载 `campaign_three_columns` 的说明。

3. **生成时只传必要字段**
   - `content.json` 只包含当前布局需要的字段。
   - 不要为了“备用”同时填入多个布局字段，例如同一页不要同时塞 `columns`、`path`、`data`、`table`。

4. **新增布局也要支持渐进加载**
   - 每个布局都应该有独立说明和独立示例。
   - 布局索引只保留：布局名、别名、适用内容类型、核心字段、限制摘要。

5. **预编译 shape 克隆布局**
   - 对高保真参考 PPT 页，优先编译为 `layouts/compiled/<layout>.pptx` 单页包，并在 `layouts/specs/<layout>.json` 中登记 shape 字段映射。
   - registry 中 `module` 使用 `compiled_shape`，运行时只在该布局被实际使用时加载对应 compiled PPTX，不加载整份参考 PPT，也不加载其他布局。
   - 生成时复制原始 shapes，再按 spec 替换指定文本框；`image_fields` 只有在用户提供真实图片路径时才替换图片，未提供图片时保留参考 PPT 的原始图片和层级。

#### 内容类型矩阵

| Content type | Layout | Fields | Use case |
|---------|---------|---------|---------|
| 运营规划三栏页 | `campaign_three_columns` | `headline/columns[]/footer` | 固定 3 栏；少于或多于 3 栏不要使用。 |
| 大型活动直播整体规划页 | `sample3_live_overall` | `title/banner/purpose/strategy/benefit/video_items_left/video_items_right` | 活动直播总览页；适合目的/策略/直播线/视频线结构。 |
| OTA/传播三阶段策略页 | `sample3_ota_timeline` | `title/summary/dimensions[]/theme/stages[]/fee` | 2 个目标维度 + 3 个阶段策略 + 费用/资源说明；阶段数量固定为 3。 |
| KOC月度运营总结页 | `sample3_koc_monthly_summary` | `title/summary/metrics[]/topics[]/issue` | 顶部总述 + 左侧核心数据 + 右侧重点事项 + 底部课题；信息过密时拆页。 |
| 核心研判行动页 | `statement_action_bar` | `statement/emphasis/action/action_highlight` | 1 个核心判断 + 1 条行动结论；不使用模板标题框；必须保留左侧圆形图标和三个竖点锚点。 |
| 重点车型投入 | `sample_opinion_data_overview` | `_page_title/period_note/data_title/propagation_table/comment_table/left_images[]/right_images[]` | Use for communication/opinion data overview with two KPI tables and two evidence image zones. |
| 重点车型车黑打击情况一览 | `sample_attack_handling_gallery` | `_page_title/summary/handling_table/cards[].title/cards[].result/cards[].image/time_period` | Use for negative handling or black-account attack evidence with one data table and three evidence cards. |
| 重点车型投入拆解 | `sample_presale_data_split` | `_page_title/period_note/data_title/left_panel/right_panel` | Use for before/after presale data split or two-panel opinion data breakdown. |
| 重点产品舆情现状 | `sample_opinion_status_dashboard` | `_page_title/summary/overall_summary/positive_rate/negative_rate/positive_views/negative_views/handling_result/negative_images[]` | Use for opinion status dashboard with overall data, positive/negative ratio and negative examples. |
| 上市期间核心策略举措1 | `sample_comment_quality_dual_path` | `_page_title/summary/theme/quality_bar/categories[]/left_path/right_path/left_result/right_result/category_images[]` | Use for comment-quality improvement paths with category evidence and dual-path conclusions. |
| 上市期间核心策略举措1 | `sample_launch_strategy_three_actions` | `_page_title/summary/action1/action2/action3/classification_table/bottom_note` | Use for launch-period strategy with action 1, action 2 and action 3 plus classification table. |
| 上市期间核心策略举措2 | `sample_value_breakthrough_dual_columns` | `_page_title/summary/theme/left_column/right_column` | Use for dual-column value breakthrough: rational value vs emotional value paths. |
| 上市期间核心策略举措2 | `sample_positive_spread_gallery` | `_page_title/summary/left_topic/right_topic/target` | Use for positive communication gallery with two content topics and numeric target. |
| Background insight - three strengths | `style2_background_strengths` | `title/core_advantage/cards[]` | Use for one core advantage statement plus exactly 3 strength cards. |
| Background insight - three challenges | `style2_background_challenges` | `title/challenge_summary/challenges[]` | Use for one challenge summary plus exactly 3 challenge cards. |
| Overall strategy with three-stage timeline | `style2_overall_strategy_timeline` | `title/summary/strategy_title/core_point_label/core_point/explanation/stages[]` | Use for one strategic theme and exactly 3 stage plans. |
| Execution plan table - prewarm phase | `style2_execution_plan_prewarm` | `title/phase/goal/goal_detail/strategy/strategy_detail/directions[]/titles[]/formats[]/volumes[]` | Use for execution plan with 4 directions and title examples. |
| Creative examples - three cards prewarm | `style2_creative_examples_prewarm` | `title/summary/example_note/platforms/cards[]` | Use for exactly 3 creative examples with title, format, description and comment seeding. |
| Execution plan table - burst phase | `style2_execution_plan_burst` | `title/phase/goal/goal_detail/strategy/strategy_detail/directions[]/titles[]/formats[]/volumes[]` | Use for launch/burst phase execution plan with 5 directions. |
| Creative examples - three cards burst | `style2_creative_examples_burst` | `title/summary/example_note/platforms/cards[]` | Use for exactly 3 burst-phase creative examples. |
| Execution plan table - longtail phase | `style2_execution_plan_longtail` | `title/phase/goal/goal_detail/strategy/strategy_detail/directions[]/titles[]/formats[]/volumes[]` | Use for longtail phase execution plan with 4 directions. |
| Creative examples - three cards longtail | `style2_creative_examples_longtail` | `title/summary/example_note/platforms/cards[]` | Use for exactly 3 longtail creative examples. |
| Risk forecast and response matrix | `style2_risk_response_matrix` | `title/summary/column_labels[]/risk_subjects[]/risk_forecasts[]/response_strategies[]/actions[]/monitoring_guidance[]` | Use for 4 risk subjects across forecast/strategy/action/monitoring columns. |
| Core judgement and action bar | `style2_judgement_action_bar` | `judgement/action` | Use for one core judgement plus one action conclusion; keep icon anchor. |

当前排版库只保留用户参考图或参考 PPT 沉淀出的 ready 布局；实际可用范围以 `layouts/registry.json` 为准。未匹配到的内容类型先用基础兜底或拆页，后续由用户提供参考图/PPT 后逐个加入。

#### 新增布局准入条件

只有满足以下任一条件，才新增布局：
- 已有布局会造成明显信息错配，例如把“观点+路径+数据+金句”塞进普通网格；
- 该版式能复用到一类内容，而不是只服务某一页；
- 用户提供的参考页存在清晰结构模式，例如“三栏专题卡”“左右对比”“矩阵象限”“问题-方案-收益”。

新增布局必须按 `statement_action_bar` 的质量标准执行：
- 优先使用用户提供的 PPTX 提取真实坐标、尺寸、字体层级、形状层级和固定视觉元素；没有 PPTX 时再用图片反推。
- 不能只做语义骨架、近似网格或通用表格。未达到参考页视觉结构的实现只能标记为 draft/unavailable，不能登记到可用排版库。
- 新增到 `layouts/registry.json` 时必须设置 `status: "ready"`，并设置 `fidelity: "ppt_exact"` 或已由用户验收的 `fidelity: "accepted"`。
- 必须声明是否复用模板原有标题框；如果该布局不使用标题框，生成时必须清空模板示例标题，且不再额外绘制标题。
- 必须区分版式本体和截图批注：红框、选择框、标注线等批注不得绘制到 PPT 中，除非用户明确要求保留。
- 必须声明哪些视觉锚点必须保留，例如圆形图标、竖点、分割线、底部条等，不能在实现中简化或丢失。
- 必须生成样例 PPT 验证，确认无标题重叠、无示例文字残留、无文本溢出、尾页原样保留。

#### 用户提供图片或 PPT 时的整理流程

当用户上传 PPT 页面截图或 PPTX，并要求“把这个排版整理到排版库”时，必须按以下流程处理：

0. **优先提取真实版式参数**
   - 如果用户给的是 PPTX，优先读取页面中的 shape 坐标、尺寸、字体大小、颜色、层级和组合关系。
   - 如果用户只给图片，先反推结构和比例；实现后必须用样例 PPT 验证并根据截图反馈修正。

1. **识别版式骨架**
   - 判断页面是几栏、几区、是否有顶部总论、底部总结、图片位、数据位、流程位。
   - 只抽象结构，不绑定截图里的具体品牌、车型、日期或活动名。
   - 标注哪些元素是版式本体，哪些只是截图批注或编辑器选择框。

2. **提炼内容语义**
   - 把页面元素映射成语义字段，例如 `headline`、`columns`、`cards`、`metrics`、`quote`、`footer`。
   - 文字内容较长时，给出字段字数上限，避免其他模型照抄长段导致溢出。

3. **命名布局**
   - 使用语义化布局名，例如 `campaign_three_columns`、`comparison_matrix`、`issue_solution_benefit`。
   - 不使用品牌名、项目名或截图文件名作为布局名。

4. **登记文档**
   - 在排版库说明中加入适用场景、页面结构、标准 `content.json`、使用约束。
   - 明确该布局是否使用模板标题框、是否要清空模板示例文本、哪些固定视觉锚点必须保留。
   - 如果是已有布局的变体，用 `_compact`、`_visual`、`_text` 命名，不要重复造新主类。

5. **实现或排期实现**
   - 若现有脚本能支持，直接映射到已有布局并补充说明。
   - 若现有脚本不能支持，新增 `layout_xxx()` 并在布局注册/别名中登记。
   - 实现后至少生成一个样例验证。

6. **反馈给用户**
   - 说明该图片被抽象成了哪个布局名。
   - 说明新增了哪些字段、适用什么场景、有什么限制。
   - 如果只更新了文档、暂未实现脚本，必须明确说明。

#### 新增布局登记要求

每新增一个布局，必须同时更新三处：

1. **脚本实现**
   - 在 `scripts/layouts_impl/<layout_name>.py` 中新增布局模块，提供 `render(slide, body, ctx, start_y, layout)`。
   - 在 `layouts/registry.json` 中登记 `module`、`aliases`、`owns_title`、`clear_template_sample_text` 等元信息。
   - 不要把新布局函数塞进入口脚本；入口脚本只负责模板克隆、内容调度和按需加载布局模块。
   - 坐标优先来自参考 PPTX 的真实参数；如需适配模板安全区，只做等比或小幅修正。
   - 如果布局声明不使用标题框，必须在模板预处理阶段清空标题和示例文本，不能让模板标题与新布局重叠。
   - 正文坐标必须避开页脚、Logo 和模板固定品牌元素。

2. **技能文档**
   - 在 `layouts/registry.json` 登记布局索引。
   - 新增或更新 `layouts/<layout_name>.md`，写明适用场景、标准 `content.json` 字段结构、数量限制、字数限制、图片/图标处理规则。
   - 如影响通用规则，再同步更新 `SKILL.md`。

3. **样例验证**
   - 至少用一个已登记模板生成样例 PPT。
   - 检查页面数量、标题、关键字段是否写入。
   - 检查模板示例文本是否清理干净，视觉锚点是否保留，截图批注是否没有误绘制。
   - 检查文字是否超出文本框或页面边界；不能靠不可读字号强塞。
   - 如涉及尾页，必须验证尾页 XML 原样保留。

#### 命名规范

- 布局名使用语义名，不使用模板名或品牌名，例如 `campaign_three_columns`，不要叫 `aion_koc_page`。
- 支持别名时，主名放在前面，别名只用于兼容，例如 `campaign_three_columns` / `operation_plan`。
- 字段名也使用语义名：`headline`、`columns`、`footer`、`insight`、`path`、`data`、`quote`。

#### 变体策略

同类布局后续可以增加安全变体，但必须受控：
- 使用 `_compact` 表示紧凑版，例如 `campaign_three_columns_compact`。
- 使用 `_visual` 表示图片占比更高的版本。
- 使用 `_text` 表示文字信息更密的版本。
- 不要让模型自由随机坐标；如果需要变化，使用 `style_selection` 或 `style_seed` 在已登记变体中选择。

### 布局 F：运营规划三栏页（campaign_three_columns）

适用：KOC/KOL 运营计划、节日营销规划、三大活动专题、三条传播主线。

页面结构：
- 顶部：一句总论/发力方向，控制在 36 字以内。
- 中部：三列专题，每列包含场景说明、红色/主色专题条、任务说明、两个方向/动作、两个素材图位、目标指标。
- 底部：机制强化或协同方式总结，控制在 38 字以内。

推荐 `content.json`：

```json
{
  "type": "content",
  "page_title": "昊铂KOC 5月运营规划",
  "body": {
    "layout": "campaign_three_columns",
    "headline": "五月KOC将从五一假期、S600上市、520节点三大重点事项发力，合力凸显新豪华调性",
    "columns": [
      {
        "scenario": "结合用车场景凸显新豪华体验",
        "tag": "五一出行专题",
        "title": "#五一美昊出行季",
        "desc": "聚焦五一用车场景，邀请KOC分享高速NOA、续航和实用体验，以真实场景展现用车价值。",
        "directions": [
          { "label": "方向一：挑战测评类" },
          { "label": "方向二：体验分享" }
        ],
        "metrics": "计划邀约XX名用户，产出XX条内容，收集XX条线索"
      },
      {
        "scenario": "结合新车试驾凸显智慧豪华",
        "tag": "S600上市营销助力",
        "title": "#ICALL新豪华智慧运动SUV",
        "desc": "邀请用户到店试驾S600并分享口碑，主动邀约首批车主参与体验，展现智慧豪华实力。",
        "directions": [
          { "label": "方向一：试驾口碑分享" },
          { "label": "方向二：首提体验分享" }
        ],
        "metrics": "计划邀请XX名用户，产出试驾口碑XX篇、首提体验XX篇"
      },
      {
        "scenario": "结合生活方式凸显新豪华格调",
        "tag": "5月热点节日借势",
        "title": "#520昊铂和你一起大声说爱",
        "desc": "邀请用户在520节点围绕爱与陪伴表达，结合后备箱花海、储物空间送礼等场景完成内容传播。",
        "directions": [
          { "label": "惊喜后备箱" },
          { "label": "车内送礼" }
        ],
        "metrics": "计划邀请XX名用户，产出试驾口碑XX篇、首提体验XX篇"
      }
    ],
    "footer": "邀约产出方式强化：任务发布邀约 + 优质创作者1V1邀约 + 公域创作非入库车主主动邀约"
  }
}
```

使用约束：
- 固定三栏，少于三栏时不要使用；多于三栏时拆页。
- 每列 `desc` 控制在 55 字以内，`metrics` 控制在 28 字以内。
- 如果有真实图片素材，优先填入两个素材图位；没有图片时保留浅色素材占位，不要用随机网络图。
- 三栏标题条默认使用当前模板 `primary_color` / `accent_color`；参考图里的橙红色只作为结构示意，不能跨模板照搬。

### 布局 G：核心研判行动页（statement_action_bar）

适用：态势研判、风险预警、战略判断、结论承接。

页面结构：
- 该布局不使用模板内容页的顶部标题框，`page_title` 只作为目录/备注信息，不在页面顶部绘制。
- 中部偏上：核心判断文字，拆成“前置判断 + 加粗核心结论”两层。
- 左侧：必须保留视觉锚点，包括灰色圆形图标位和三个竖向小圆点；用户截图中的红框是批注，不属于版式，不要绘制。
- 中部：一条细强调线。
- 下方：黑色圆角行动条，承载下一步动作或资源规划，行动条内重点短语高亮。

推荐 `content.json`：

```json
{
  "type": "content",
  "page_title": "核心研判",
  "body": {
    "layout": "statement_action_bar",
    "statement": "基于目前产品舆论态势及竞品攻击情况进行研判——银河M9上市期间内可能会遭受更多攻击",
    "emphasis": "银河M9上市期间内可能会遭受更多攻击",
    "action": "需及时调整口碑维护方向及资源规划来打好这场舆论硬仗",
    "action_highlight": "调整口碑维护方向及资源规划"
  }
}
```

使用约束：
- `statement` 建议拆成前置判断和核心结论两层；`emphasis` 必须是 `statement` 中需要加粗放大的短语。
- `action_highlight` 必须是 `action` 中需要高亮的短语。
- 用户给出的判断和行动结论应尽量完整保留，空间不足时优先拆页，不要静默删减。
- 不放多张图片，不放多组卡片，不承载复杂数据。
- 字体继承当前模板字体；主体色继承当前模板 `design_tokens`。黑色行动条和高亮短语是该版式的核心视觉层级，除非模板显著冲突，否则保留。
- 左侧视觉锚点是该布局的固定组成部分，不得简化成单个小方块或删除。

### 第6步：合并内容页

```bash
python scripts/merge_content.py output_skeleton/ content_slides/ final_output.pptx
```

### 第7步：质量检查（内容）

```bash
python -m markitdown final_output.pptx
```

逐条核对：
- [ ] 每页标题与大纲一致
- [ ] 无残留占位符文字（XXXX、xxx、TODO）
- [ ] 页面数量与 content.json 一致

```bash
# 快速检查占位符残留
python -m markitdown final_output.pptx | grep -iE "XXXX|xxx|TODO|\[insert"
```

### 第8步：质量检查（视觉）

```bash
python scripts/office/soffice.py --headless --convert-to pdf final_output.pptx
rm -f slide-*.jpg && pdftoppm -jpeg -r 150 final_output.pdf slide
ls -1 "$PWD"/slide-*.jpg
```

逐张检查：
- [ ] 封面/过渡/尾页与原模板视觉一致（背景图、字体特效不丢失）
- [ ] 内容页正文文字无溢出、无截断
- [ ] 内容页配色与模板主色一致
- [ ] 各栏间距均匀，对齐整齐

### 第9步：输出

```bash
cp final_output.pptx /mnt/user-data/outputs/演示文稿.pptx
```

---

## 历史脚本兜底布局参考（非排版库）

以下布局是脚本内部历史兜底能力，不属于当前排版库。当前排版库登记项以 `layouts/registry.json` 为准；其他版式等用户后续提供参考图后，再按排版库扩展机制加入。

### 布局 A：KPI 数据卡片（kpi_card）

适用：items 含 `value` 字段，2-4 条目

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   28-40岁   │ │   3.2个月   │ │    82分     │
│  主力用户年龄│ │ 购车决策周期 │ │  复购意愿指数│
│ 占整体67%   │ │ 较去年缩短18天│ │ 高于行业均值 │
└─────────────┘ └─────────────┘ └─────────────┘
```

```javascript
// kpi_card 布局代码模板
function layoutKpiCard(slide, items, zone, tokens) {
  const cols = items.length;
  const cardW = (zone.w - 0.2 * (cols - 1)) / cols;
  const cardH = zone.h - 0.1;

  items.forEach((item, i) => {
    const x = zone.x + i * (cardW + 0.2);
    const y = zone.y;

    // 卡片背景
    slide.addShape(pres.shapes.RECTANGLE, {
      x, y, w: cardW, h: cardH,
      fill: { color: "FFFFFF" },
      line: { color: tokens.primary_color, width: 1.5 },
      shadow: { type: "outer", blur: 8, offset: 2, angle: 135, color: "000000", opacity: 0.08 }
    });

    // 顶部强调色条
    slide.addShape(pres.shapes.RECTANGLE, {
      x, y, w: cardW, h: 0.05,
      fill: { color: tokens.primary_color }
    });

    // 大数字
    slide.addText(item.value, {
      x: x + 0.15, y: y + 0.15, w: cardW - 0.3, h: 0.8,
      fontSize: 36, bold: true, color: tokens.primary_color,
      align: "center", valign: "middle", margin: 0
    });

    // 标签
    slide.addText(item.label, {
      x: x + 0.15, y: y + 0.95, w: cardW - 0.3, h: 0.3,
      fontSize: 11, bold: true, color: tokens.text_dark,
      align: "center", margin: 0
    });

    // 描述
    if (item.desc) {
      slide.addText(item.desc, {
        x: x + 0.15, y: y + 1.3, w: cardW - 0.3, h: cardH - 1.5,
        fontSize: 10, color: "666666",
        align: "center", lineSpacingMultiple: 1.3, margin: 0
      });
    }
  });
}
```

### 布局 B：三栏图标卡片（three_col）

适用：3 条目，无数值，有标签+描述

```
[图标] 拉新阶段        [图标] 培育阶段        [图标] 转化阶段
       精准投放...            内容矩阵...            限时权益...
```

```javascript
function layoutThreeCol(slide, items, zone, tokens, iconComponents) {
  const cardW = (zone.w - 0.4) / 3;

  items.forEach((item, i) => {
    const x = zone.x + i * (cardW + 0.2);
    const y = zone.y;

    // 图标背景圆
    slide.addShape(pres.shapes.OVAL, {
      x: x + cardW / 2 - 0.25, y: y + 0.1, w: 0.5, h: 0.5,
      fill: { color: tokens.primary_color, transparency: 85 }
    });

    // 图标（react-icons 生成）
    if (iconComponents && iconComponents[i]) {
      // iconComponents[i] 为 base64 PNG
      slide.addImage({ data: iconComponents[i], x: x + cardW / 2 - 0.18, y: y + 0.17, w: 0.36, h: 0.36 });
    }

    // 标题
    slide.addText(item.label, {
      x, y: y + 0.7, w: cardW, h: 0.35,
      fontSize: 13, bold: true, color: tokens.text_dark,
      align: "center", margin: 0
    });

    // 分割线
    slide.addShape(pres.shapes.RECTANGLE, {
      x: x + cardW / 2 - 0.3, y: y + 1.1, w: 0.6, h: 0.03,
      fill: { color: tokens.primary_color }
    });

    // 描述
    slide.addText(item.desc, {
      x: x + 0.1, y: y + 1.2, w: cardW - 0.2, h: zone.h - 1.4,
      fontSize: 10, color: "555555",
      align: "left", lineSpacingMultiple: 1.4, margin: 0
    });
  });
}
```

### 布局 C：要点列表（bullet_list）

适用：4-6 条目，内容以文字描述为主

```
▌ 标签一   描述文字描述文字描述文字描述文字描述文字
▌ 标签二   描述文字描述文字描述文字描述文字描述文字
▌ 标签三   描述文字描述文字描述文字描述文字描述文字
▌ 标签四   描述文字描述文字描述文字描述文字描述文字
```

```javascript
function layoutBulletList(slide, items, zone, tokens) {
  const rowH = (zone.h - 0.1) / items.length;

  items.forEach((item, i) => {
    const y = zone.y + i * rowH;

    // 左侧强调色竖条
    slide.addShape(pres.shapes.RECTANGLE, {
      x: zone.x, y: y + 0.08, w: 0.05, h: rowH - 0.16,
      fill: { color: tokens.primary_color }
    });

    // 标签
    slide.addText(item.label, {
      x: zone.x + 0.15, y: y + 0.06, w: 2.2, h: rowH - 0.12,
      fontSize: 12, bold: true, color: tokens.text_dark,
      align: "left", valign: "middle", margin: 0
    });

    // 描述
    slide.addText(item.desc, {
      x: zone.x + 2.5, y: y + 0.06, w: zone.w - 2.6, h: rowH - 0.12,
      fontSize: 10, color: "555555",
      align: "left", valign: "middle", lineSpacingMultiple: 1.3, margin: 0
    });

    // 底部分隔线（最后一行不加）
    if (i < items.length - 1) {
      slide.addShape(pres.shapes.RECTANGLE, {
        x: zone.x, y: y + rowH - 0.01, w: zone.w, h: 0.01,
        fill: { color: "E8E8E8" }
      });
    }
  });
}
```

### 布局 D：横向时间线（timeline）

适用：items 含 `steps` 字段，或 3-5 个流程节点

```
  [1]           [2]           [3]           [4]
 拉新            培育           转化           留存
 精准投放...     内容矩阵...    限时权益...    会员分层...
  ●────────────────●────────────────●────────────────●
```

```javascript
function layoutTimeline(slide, items, zone, tokens) {
  const stepW = zone.w / items.length;
  const lineY = zone.y + zone.h * 0.55;

  // 连接线
  slide.addShape(pres.shapes.RECTANGLE, {
    x: zone.x + stepW * 0.5, y: lineY - 0.02,
    w: zone.w - stepW, h: 0.04,
    fill: { color: tokens.primary_color, transparency: 60 }
  });

  items.forEach((item, i) => {
    const cx = zone.x + stepW * i + stepW * 0.5;

    // 圆形节点
    slide.addShape(pres.shapes.OVAL, {
      x: cx - 0.22, y: lineY - 0.22, w: 0.44, h: 0.44,
      fill: { color: tokens.primary_color },
      line: { color: "FFFFFF", width: 2 }
    });

    // 步骤编号
    slide.addText(String(i + 1), {
      x: cx - 0.22, y: lineY - 0.22, w: 0.44, h: 0.44,
      fontSize: 12, bold: true, color: "FFFFFF",
      align: "center", valign: "middle", margin: 0
    });

    // 标题（节点上方）
    slide.addText(item.label, {
      x: cx - stepW * 0.45, y: zone.y + 0.05, w: stepW * 0.9, h: 0.4,
      fontSize: 12, bold: true, color: tokens.text_dark,
      align: "center", margin: 0
    });

    // 描述（节点下方）
    slide.addText(item.desc || "", {
      x: cx - stepW * 0.45, y: lineY + 0.3, w: stepW * 0.9, h: zone.h - lineY + zone.y - 0.4,
      fontSize: 10, color: "666666",
      align: "center", lineSpacingMultiple: 1.3, margin: 0
    });
  });
}
```

### 布局 E：大字金句（big_stat / quote）

适用：单条目，或内容为引用/总结语

```javascript
function layoutBigStat(slide, item, zone, tokens) {
  // 左侧装饰色块
  slide.addShape(pres.shapes.RECTANGLE, {
    x: zone.x, y: zone.y + 0.3, w: 0.08, h: zone.h - 0.6,
    fill: { color: tokens.primary_color }
  });

  if (item.value) {
    // 大数字
    slide.addText(item.value, {
      x: zone.x + 0.25, y: zone.y + 0.2, w: zone.w - 0.3, h: 1.4,
      fontSize: 72, bold: true, color: tokens.primary_color,
      align: "left", valign: "middle", margin: 0
    });
    // 标签
    slide.addText(item.label, {
      x: zone.x + 0.25, y: zone.y + 1.7, w: zone.w - 0.3, h: 0.5,
      fontSize: 18, bold: true, color: tokens.text_dark,
      align: "left", margin: 0
    });
  } else {
    // 纯文字金句
    slide.addText(item.label, {
      x: zone.x + 0.25, y: zone.y + 0.3, w: zone.w - 0.3, h: zone.h - 0.6,
      fontSize: 24, color: tokens.text_dark,
      align: "left", valign: "middle", lineSpacingMultiple: 1.6, margin: 0
    });
  }
}
```

---

## 模板文字替换规则（XML 层）

对于克隆的模板页（封面/过渡/尾页），文字替换需精确操作 XML，保留原始字体/特效：

```python
# 正确替换方式（只改 <a:t> 内容，不动 <a:rPr>）
def replace_placeholder_text(xml_str, shape_name, new_text):
    from defusedxml.minidom import parseString
    # 找到指定 shape_name 的 <p:sp>，在其中找到 <a:t>，替换文字
    # ⚠️ 保留所有 <a:rPr> 属性（字体、颜色、阴影效果等）
    # ⚠️ 对于多个 <a:r> 的情况，只保留第一个 <a:r>，删除多余的
    ...
```

详见 `scripts/replace_text.py`。

---

## 常见错误速查

| 错误现象 | 原因 | 修复 |
|---------|------|------|
| 封面背景图丢失 | 克隆 slide 时没有复制 media 文件和 rels | 检查 `scripts/build_skeleton.py` 的 copy_media 步骤 |
| 模板字体变成宋体 | 替换文字时覆盖了 `<a:rPr>` | 只替换 `<a:t>` 文字节点内容 |
| 内容页正文溢出 | body_zone 测量不准 | 重新运行 parse_template.py，检查 body_zone |
| pptxgenjs 颜色带 # | 代码写了 `"#861B2F"` | 改为 `"861B2F"`（无 #） |
| 内容页图标不显示 | react-icons 未安装 | `npm install -g react-icons react react-dom` |
| 打包后文件损坏 | XML namespace 丢失 | 使用 `defusedxml` 而非 `ElementTree` |

---

## 端到端调用示例

### 场景一：使用奕境模板，从零生成一份 PPT

**前提：** 已有 `templates/奕境模板.pptx` 和 `templates/yijing_spec.json`

```bash
# 1. 准备工作目录
mkdir -p work/output && cd work

# 2. 写好大纲（或让模型生成）→ content.json
cat > content.json << 'EOF'
{
  "title": "2026年用户运营年度规划",
  "slides": [
    {
      "type": "cover",
      "title": "奕境汽车用户运营年度策略规划",
      "date": "2026.04"
    },
    {
      "type": "transition",
      "chapter": "01",
      "title": "用户洞察与市场分析"
    },
    {
      "type": "content",
      "page_title": "2026年核心用户画像",
      "body": {
        "layout": "auto",
        "items": [
          { "label": "主力用户年龄", "value": "28-40岁", "desc": "占整体用户的67%，以家庭用户为主" },
          { "label": "购车决策周期", "value": "3.2个月", "desc": "较2025年缩短18天" },
          { "label": "复购意愿指数", "value": "82分",  "desc": "高于行业均值74分" }
        ]
      }
    },
    {
      "type": "transition",
      "chapter": "02",
      "title": "全年运营策略框架"
    },
    {
      "type": "content",
      "page_title": "四阶段用户运营策略",
      "body": {
        "layout": "auto",
        "items": [
          { "label": "拉新", "desc": "精准投放社交媒体，覆盖潜客触达场景，转化率目标+25%" },
          { "label": "培育", "desc": "内容矩阵+试驾激励双线并行，缩短决策漏斗路径" },
          { "label": "转化", "desc": "限时权益包+专属顾问跟进，季度销售目标12,000台" },
          { "label": "留存", "desc": "会员分层运营，NPS目标75+，老带新占比达30%" }
        ]
      }
    },
    {
      "type": "end"
    }
  ]
}
EOF

# 3. 克隆模板页、生成骨架
python ../scripts/build_skeleton.py \
  ../templates/yijing_spec.json \
  content.json \
  output/ \
  ../templates/奕境模板.pptx

# 4. 生成内容页正文
node ../scripts/render_content.js output/content_manifest.json

# 5. 合并 + 打包
python ../scripts/merge_content.py \
  output/ \
  最终输出.pptx \
  ../templates/奕境模板.pptx

# 6. 质量检查（内容）
python -m markitdown 最终输出.pptx

# 7. 质量检查（视觉）
python ../scripts/office/soffice.py --headless --convert-to pdf 最终输出.pptx
rm -f slide-*.jpg && pdftoppm -jpeg -r 150 最终输出.pdf slide
ls -1 "$PWD"/slide-*.jpg
```

---

### 场景二：接入新模板（首次使用）

```bash
# 先分类，不要直接假设模板结构
python scripts/classify_template.py \
  templates/新模板.pptx \
  templates/new_spec.json \
  templates/new_route.json

# 打开 new_route.json，看 route：
# - dual_track: 继续 build_skeleton/render_content/merge_content
# - style_clone: 使用 render_style_clone_report.py
# - manual_review: 人工修正 new_spec.json 后再选择路线

# dual_track 示例
python scripts/build_skeleton.py templates/new_spec.json content.json output/ templates/新模板.pptx
node scripts/render_content.js output/content_manifest.json
python scripts/merge_content.py output/ final_output.pptx templates/新模板.pptx

# style_clone 示例
python scripts/render_style_clone_report.py content.json final_output.pptx templates/新模板.pptx
```

---

### 场景二补充：style_clone 路线

当模板只有「封面 + 内容视觉页 + 尾页/金句页」时，使用通用风格克隆脚本：

```bash
python scripts/render_style_clone_report.py content.json final_output.pptx templates/吉利模版.pptx
```

该路线会：
- 复用第 1 页作为封面；
- 如果模板有目录页，复用目录页视觉生成 `type: "toc"`；目录页可通过「目录/CONTENTS/Agenda」或多个 `01/02/03`、`一、二、三、` 章节编号识别；
- 如果模板没有登记 `toc` 页面，禁止自行用内容页、过渡页或空白页伪造目录页；即使 `content.json` 中出现 `type: "toc"`，脚本也会丢弃该页，避免把内容页标题框当成目录项导致重叠、错位或大面积留白；
- 目录页必须保留模板原样式，不要清空重画标题、卡片或页脚；只替换模板已有目录条目文本框里的文字；
- 目录页中的编号/标记文本框（如 `PART 01`、`01`、`一、` 这类只承担序号作用的元素）不要替换；如果模板目录项少于 `content.json` 的目录条目，只填已有目录项，不要把编号框改成目录文字；
- 过渡页/章节页也必须保留模板原样式，不要清空重画；只替换模板原有标题文本框。若模板将章节号和标题放在同一个文本框（如猛士 `第一部分   xxxxx`），在同一个文本框内替换为 `chapter + 原间隔 + title`。
- 内容页标题也优先使用模板原有标题/副标题文本框原位替换，不要重新绘制标题。标题文本框可能在组合对象内部（如广汽埃安的 `PA-文本框 14`），必须递归识别并替换；正文区的样例文本可以清空后生成正文；如果模板确实没有内容页标题文本框（如吉利模板缺少独立内容页），才允许脚本兜底绘制标题。
- 内容正文区域必须避开标题区域：使用模板标题框时，正文起始位置应根据标题框底部动态下移，并额外留出安全间距，避免 KPI 卡片、列表或流程图与大标题重叠。
- 如果模板有目录页但 `content.json` 漏写 `type: "toc"`，脚本会根据内容页标题自动在封面后补一页目录；
- 将中间内容风格页作为候选，生成内容页时默认按顺序轮换；如需随机交叉，设置顶层 `style_selection: "random"`；
- 复用最后 1 页作为尾页，尾页必须原样保留，不替换、不清空、不新增任何文字；`type: "end"` 只用于声明需要保留结束页，`title`、`date` 等字段在尾页上全部忽略；
- 直接输出完整 PPTX，不再运行 `build_skeleton.py`、`render_content.js`、`merge_content.py`。

`content.json` 仍然使用相同语义字段：

```json
{
  "title": "小鹏汽车2025年发展总结",
  "date": "2026.04",
  "style_selection": "rotate",
  "source": "来源：公司官方IR、交付公告；公开口径整理",
  "slides": [
    { "type": "cover", "title": "小鹏汽车2025年发展总结", "date": "2026.04" },
    {
      "type": "toc",
      "title": "目录",
      "items": ["核心结论", "交付与财务表现", "产品与技术进展", "2026关键课题"]
    },
    {
      "type": "content",
      "page_title": "核心结论：规模跃迁与盈利拐点同时出现",
      "subtitle": "2025 年从销量修复进入经营质量验证阶段",
      "body": {
        "layout": "auto",
        "items": [
          { "label": "全年交付", "value": "42.94万", "desc": "同比增长125.9%" },
          { "label": "全年收入", "value": "767.2亿", "desc": "同比增长87.7%" },
          { "label": "全年毛利率", "value": "18.9%", "desc": "同比提升4.6个百分点" },
          { "label": "产品周期", "desc": "MONA M03、P7+、G7共同支撑销量台阶" }
        ]
      }
    },
    { "type": "end" }
  ]
}
```

Available `slides[].body.layout` values are defined only by `layouts/registry.json`; currently ready layouts include: `campaign_three_columns`, `sample3_live_overall`, `sample3_ota_timeline`, `sample3_koc_monthly_summary`, `statement_action_bar`, `sample_opinion_data_overview`, `sample_attack_handling_gallery`, `sample_presale_data_split`, `sample_opinion_status_dashboard`, `sample_comment_quality_dual_path`, `sample_launch_strategy_three_actions`, `sample_value_breakthrough_dual_columns`, `sample_positive_spread_gallery`, `style2_background_strengths`, `style2_background_challenges`, `style2_overall_strategy_timeline`, `style2_execution_plan_prewarm`, `style2_creative_examples_prewarm`, `style2_execution_plan_burst`, `style2_creative_examples_burst`, `style2_execution_plan_longtail`, `style2_creative_examples_longtail`, `style2_risk_response_matrix`, `style2_judgement_action_bar`. Layouts not marked `status=ready` in registry are not part of the public layout library.

脚本内部仍可能保留 `auto`、`kpi`、`grid` 等历史兜底逻辑，但这些不属于排版库，不作为推荐布局对外暴露。

`style_selection` 可选：
- `rotate`：默认，内容页按模板中间风格页顺序轮换，结果稳定可复现。
- `random`：随机交叉选择中间内容风格页；可加 `style_seed` 固定随机结果。

---

### 场景三：只改某几页文字，不需要正文排版

直接用 `replace_text.py` 操作已有 PPTX：

```python
from scripts.replace_text import replace_multiple
import zipfile, os

# 解压
z = zipfile.ZipFile('原文件.pptx')
z.extractall('unpacked/')

# 修改 slide1 的标题
slide_path = 'unpacked/ppt/slides/slide1.xml'
xml = open(slide_path, encoding='utf-8').read()
xml = replace_multiple(xml, {
    '矩形 4': '新的封面标题',
    '文本占位符 2': '2026.06',
})
open(slide_path, 'w', encoding='utf-8').write(xml)

# 重新打包
from scripts.office.pack import main as pack
pack(['unpacked/', '输出.pptx', '--original', '原文件.pptx'])
```

---

### content.json 字段速查

```
slides[].type        必填  cover / transition / content / end
slides[].title       封面/过渡页标题
slides[].date        封面日期（如 "2026.04"）
slides[].chapter     过渡页章节编号（如 "01"）
slides[].items       目录页条目数组，仅 type=toc 使用
slides[].page_title  内容页顶部标题
slides[].body.layout 当前排版库登记布局名，如 campaign_three_columns / statement_action_bar
slides[].body.headline        三栏运营规划页顶部总论，campaign_three_columns 使用
slides[].body.columns[]       三栏运营规划页的 3 个专题列，campaign_three_columns 使用
slides[].body.footer          三栏运营规划页底部机制总结，campaign_three_columns 使用
slides[].body.statement       核心判断文本，statement_action_bar 使用
slides[].body.emphasis        核心判断中需要加粗强调的部分，statement_action_bar 使用
slides[].body.action          行动结论文本，statement_action_bar 使用
slides[].body.action_highlight 行动结论中需要强调的短语，statement_action_bar 使用
slides[].body._page_title      预编译排版主标题，通常由 page_title 自动写入
slides[].body.<semantic_field>  预编译排版必须使用 registry/detail/spec 中登记的逐页语义字段，例如 summary、theme、cards[]、left_panel、right_column
slides[].body.<table_field>     表格字段必须使用 spec 中登记的语义字段名，例如 propagation_table、classification_table、left_panel.table
slides[].body.<image_field>     图片字段必须使用 spec 中登记的语义字段名，例如 cards[].image、left_images[]、right_topic.images[]
```

尾页规则：无论 `dual_track` 还是 `style_clone`，尾页均复用模板最后一页并原样保留。不要在 `type=end` 中写需要展示的标题、日期、THANKS 文案或署名；即使写了，生成脚本也应忽略这些字段。

---

## 支持的模板清单

| 模板名 | 页面类型 | 备注 |
|--------|---------|------|
| 奕境模板 | cover + transition + content + end | 山景图背景，主色 #861B2F，推荐 `dual_track` |
| 吉利模板 | cover + content-style + end | 封面 + 白底内容页 + “因快乐而伟大”尾页，主色 #093BAA，推荐 `style_clone` |
| 昊铂埃安BU-PPT模板260115 | cover + content-style + end | 浅色 BU 汇报模板，主色 #173846，推荐 `style_clone` |
| 启境PPT模板 | cover + toc + 3 content-styles + end | 白底蓝色科技风，主色 #2D44E3，推荐 `style_clone`；内容页默认轮换 3 种风格，可随机 |
| 比亚迪王朝秦系口碑项目-模板 | cover + toc + content-style + end | 王朝秦系口碑项目模板，推荐 `style_clone` |
| 领克其他模板（青色）底图根据方案车型进行替换 | cover + content-style + end | 领克青色模板，主色 #1EF1C6，推荐 `style_clone`；保留 LYNK&CO 文字装饰 |
| 领克电车类模板（靛紫）底图根据方案车型进行替换 | cover + toc + 2 content-styles + end | 领克靛紫电车模板，主色 #CDB9FB，推荐 `style_clone`；内容页默认轮换 2 种风格 |
| 猛士项目模板 | cover + toc + transition + content-style + end | 猛士项目汇报模板，推荐 `style_clone`；第 3 页为过渡页，第 4 页为正文内容风格页 |
| 奕派科技PPT模板 | cover + toc + content-styles + end | 奕派科技模板，部分占位符无坐标，推荐 `style_clone` |
| 广汽埃安模板 | cover + content-style + end | 广汽埃安模板，主色 #037EF3，推荐 `style_clone` |
| 自定义模板 | 自动识别 | 先运行 `classify_template.py`，按 route 选择生成路线 |

---

## 文件清单

```
ppt-template-skill/
├── SKILL.md                    # 本文件：完整流程 + 布局代码模板
├── editing.md                  # 基础技能：XML 编辑规范
├── pptxgenjs.md                # 基础技能：pptxgenjs API 参考
├── layouts/
│   ├── README.md               # 排版库使用方式与新增布局要求
│   ├── registry.json           # 排版库索引：布局名、别名、适用类型、字段摘要
│   ├── specs/                  # 预编译 shape 克隆布局的字段映射
│   ├── compiled/               # 预编译单页 PPTX 包，按需加载
│   ├── campaign_three_columns.md # 三栏运营规划页布局详情
│   ├── sample3_live_overall.md # 大型活动直播整体规划页布局详情
│   ├── sample3_ota_timeline.md # OTA/传播三阶段策略页布局详情
│   ├── sample3_koc_monthly_summary.md # KOC月度运营总结页布局详情
│   └── statement_action_bar.md # 核心研判行动页布局详情
├── templates/
│   ├── 202604-奕境用户运营PPT模版.pptx
│   ├── 吉利模版.pptx
│   ├── 昊铂埃安BU-PPT模板260115.pptx
│   ├── 启境PPT模板.pptx
│   ├── 比亚迪王朝秦系口碑项目-模板.pptx
│   ├── 领克其他模板（青色）底图根据方案车型进行替换.pptx
│   ├── 领克电车类模板（靛紫）底图根据方案车型进行替换.pptx
│   ├── 猛士项目模板.pptx
│   ├── 奕派科技PPT模板.pptx
│   ├── 广汽埃安模板.pptx
│   ├── yijing_spec_corrected.json
│   ├── geely_spec_corrected.json
│   ├── hyptec_aion_bu_260115_spec_corrected.json
│   ├── qijing_spec_corrected.json
│   ├── byd_dynasty_qin_reputation_spec_corrected.json
│   ├── lynk_cyan_other_spec_corrected.json
│   ├── lynk_indigo_ev_spec_corrected.json
│   ├── mengshi_project_spec_corrected.json
│   ├── yipai_technology_spec_corrected.json
│   └── aion_spec_corrected.json
└── scripts/
    ├── parse_template.py       # 第2步：模板解析 → template_spec.json
    ├── classify_template.py    # 新模板路由分类 → dual_track/style_clone/manual_review
    ├── build_skeleton.py       # 第4步：按大纲克隆模板页
    ├── render_content.js       # Legacy dual_track/basic fallback body renderer; layout library should use render_report.py + registry first
    ├── render_style_clone_report.py # style_clone 路线：复制内容风格页并直接绘制报告页
    ├── render_report.py        # 新核心入口：模板克隆 + 内容调度 + 懒加载布局
    ├── ppt_engine/
    │   ├── compiled_layout.py  # 预编译单页 PPTX shape 克隆 + 字段替换
    │   ├── context.py          # design_tokens / 字体 / runtime context
    │   ├── primitives.py       # tx/rich_tx/rect/footer/title 等基础绘制
    │   ├── template.py         # 模板识别、克隆、标题清理、spec 读取
    │   ├── content.py          # 目录/过渡/内容页调度
    │   └── layout_registry.py  # 读取 layouts/registry.json 并按需 import 布局模块
    ├── layouts_impl/
    │   ├── basic.py            # 内部兜底布局，不属于排版库
    │   ├── compiled_shape.py   # 通用预编译 shape 克隆布局入口
    │   └── statement_action_bar.py
    ├── replace_text.py         # 文字替换工具（保留 XML 格式标签）
    ├── merge_content.py        # 第6步：合并内容页到骨架
    ├── add_slide.py            # 复制 slide 工具
    └── office/
        ├── unpack.py           # 解压 PPTX
        ├── pack.py             # 打包 PPTX
        └── soffice.py          # LibreOffice 转 PDF
```
