---
name: ppt-template-skill
description: "基于用户上传的 PPT 模板生成演示文稿。模板页（封面/目录/过渡/尾页）通过 XML 克隆保证视觉还原，其中尾页必须原样保留；内容页统一使用从 pptx 技能 references/t*.md 同步的完整 T 系列语义排版模板库，在所选模板的正文安全区内重绘，不使用原始 shape 克隆或 compiled_shape 复刻作为公开排版路径。适用于吉利、奕境等品牌模板，也适用于任何 .pptx 模板文件。"
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
| 内容页（正文区） | **完整 T 系列语义排版 + 模板风格重绘** | 使用同步到 `layouts/references/t*.md` 的完整 `pptx` T 模板库，输出 `layout: "t_variant"`；运行时根据 `layouts/t_variants.json` 渐进式加载对应 md 中的 JS 模板函数，在当前模板正文安全区内用模板字体、主色和页眉页脚重绘，内容放不下时拆页 |

---

## 模板页硬规则：只替换占位符，不重排

所有模板都必须遵守同一条边界：**封面、目录、过渡页、尾页属于模板页，不属于内容排版库。**

生成时必须按 `*_spec_corrected.json` 中登记的 `slide_types.<role>.placeholders` 精确替换已有文本框：

- `cover.placeholders.title` 只写封面标题。
- `cover.placeholders.date` 只写日期。
- `cover.placeholders.subtitle / author / presenter / department` 只有模板 spec 明确登记时才写；没有登记时不要强行新增文本框。
- `toc.placeholders.items[]` 只替换模板已有目录项文本框，不能把编号框、装饰文字或内容页标题框当目录项。
- `transition.placeholders.chapter/title` 只替换模板已有章节号和标题文本框。
- `end` 永远原样保留，不替换、不清空、不新增任何文字。

禁止：

- 用“最大文本框=标题”“最靠下文本框=日期”等几何猜测替代 spec 占位符。
- 在封面、目录、过渡页、尾页上新增文本框来补充汇报人、汇报对象、说明文字或来源。
- 为了放更多信息而改变模板页字体大小、颜色、位置、层级、背景或 Logo。
- 把排版库 T 模板用于封面、目录、过渡页、尾页。

如果某个模板缺少必要占位符，先修正该模板的 `*_spec_corrected.json`；不要在生成阶段临时重画模板页。

---

## 路由总则：所有模板先分类

不要假设新上传模板一定符合 `cover + transition + content + end`。每次接入新模板，先运行分类器：

```bash
python scripts/classify_template.py 模板.pptx template_spec.json template_route.json
```

根据 `template_route.json.route` 选择生成路线：

| route | 适用模板 | 生成方式 |
|-------|----------|----------|
| `dual_track` | 有明确封面、章节/过渡、内容页、尾页模板 | 走 `render_report.py`：Python 克隆模板页并清空内容示例文字，JS/pptxgenjs 生成 T 系列正文页，再合并注入 |
| `style_clone` | 只有封面 + 内容风格页 + 可选尾页/金句页，缺少完整语义占位符 | 走 `render_report.py`：复制内容风格页，JS/pptxgenjs 生成 T 系列正文页，再合并注入 |
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
# Node.js（内容页正文排版）
npm install -g pptxgenjs

# Python（模板解析 + 质量检查）
pip install "markitdown[pptx]" defusedxml Pillow --break-system-packages

# 验证
node -e "require('pptxgenjs'); console.log('OK')"
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

如果输入是 `.docx` 长大纲，必须先运行语义规划器，不要手写把所有内容页固定成 `grid`：

```bash
python scripts/outline_planner.py 大纲.docx content.json
```

---

## 分页 Word 策划稿流程

当用户的输入是长大纲、Word 文档、访谈纪要、研究材料，或用户明确希望“先梳理分页规则 / 减少手动排版工作量”时，优先采用这个中间流程：

```bash
python scripts/outline_to_paged_docx.py 原始大纲.docx outputs/paged_outline.docx
```

生成 `paged_outline.docx` 后必须暂停，向用户说明识别到的章节、原始页数、建议目标页数、可拆分页和排版匹配方案，并等待用户确认。**在用户确认前，禁止直接调用 `render_report.py` 生成 PPT。**

该脚本会把原始内容整理成可编辑的 Word 策划稿，结构包括：

- 每一页的页面类型：`cover` / `toc` / `transition` / `content` / `end`
- 每一页的页面标题
- 内容页推荐的 T 系列排版：例如 `T13_statement`、`T4d_metrics`、`T4e_timeline`、`T5_comparison`、`T7_table`
- 排版理由、分页理由、容量提示
- 内容字段：`statement`、`items`、`metrics`、`stages`、`rows`、`supporting_lines` 等

用户可以直接在 Word 中调整分页、标题、推荐排版和内容字段。策划稿默认包含：

```text
CONFIRMATION_STATUS: pending
```

确认后再转成 `content.json`。如果用户在 Word 中把状态改为 `CONFIRMATION_STATUS: confirmed`，直接运行：

```bash
python scripts/paged_docx_to_content_json.py outputs/paged_outline.docx outputs/content.json
```

如果用户是在对话中明确确认，而没有编辑 Word 文件，则必须显式带确认参数：

```bash
python scripts/paged_docx_to_content_json.py outputs/paged_outline.docx outputs/content.json --confirmed-by-user
```

随后进入常规 PPT 生成流程：

```bash
python scripts/render_report.py outputs/content.json outputs/result.pptx templates/模板.pptx
```

### 使用规则

1. 这个 Word 不是最终交付 PPT，只是“AI 自动分页 + 人工可确认”的中间策划稿。
2. Word 策划稿不得删改用户大纲的核心观点、数据、案例、来源和金句；内容过多时应拆页，而不是压缩到不可读或随意改写。
3. 内容页必须继续走 `layout: "t_variant"`，由 `variant` 渐进式加载 `layouts/references/t*.md` 中的排版脚本。
4. 封面、目录、过渡、尾页仍使用所选模板的模板页规则；尾页必须原样保留。
5. 如果用户已经给出明确页码结构，`outline_to_paged_docx.py` 应尊重原页码，只补充排版建议和容量提示。
6. 对长 `.docx` / 长大纲生成 PPT 时，确认门禁是强制步骤；除非用户在同一轮明确说“无需确认，直接生成”，否则不能跳过。

### 适用场景

- “基于大纲生成分页 Word 文档”
- “先帮我拆页，再生成 PPT”
- “依托 AI 自动梳理 PPT 排版逻辑与分页规则”
- “内容很多，先给我一个可修改的分页稿”

`outline_planner.py` 会先把页面拆成信息结构，再匹配 `layouts/t_variants.json` 中登记的 T 系列语义版式。当前已同步 `pptx/references` 下所有 `t*.md` 排版模板，索引中共有 58 个变体。常用内容页变体包括：

- `T13_statement`：核心观点 / 金句 / 开场判断。
- `T4d_metrics`：KPI、经营数据、NPS、利润率等指标页。
- `T4e_timeline`：阶段规划、演进路径、年度节奏、战役节奏页。
- `T5_comparison`：对比分析、风险应对、竞品比较页。
- `T7_table`：执行计划、资源分工、任务清单、预算排期页。
- `T4a_cards` / `T4b_numbered_list`：普通要点、策略模块、步骤递进页。

内容页必须写入 `"layout": "t_variant"` 和具体 `"variant"`。本技能不再把参考 PPT 的原始 shapes 或 `compiled_shape` 作为公开排版方案；参考 `pptx` 目录时，必须把对应 `t*.md` 同步到 `layouts/references/`，并在 `layouts/t_variants.json` 登记 `reference_file` 与 `function`。由于本技能还要保留用户选择的品牌模板页眉、标题、页脚和尾页，T 模板的 10 x 5.625 全页坐标会映射到当前模板的 `body_zone` 内渲染，而不是自由发挥一套近似布局。

禁止：
- 在规划阶段一律写 `"layout": "grid"` 或继续依赖旧的 `auto/grid/kpi/timeline`。
- 只依赖 `render_content_slide().infer_auto_layout()` 的 `kpi/timeline/grid` 旧逻辑来代表排版库匹配。
- 为了命中排版库而删除用户原始大纲里的关键数据、案例、来源或金句。

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
        "layout": "t_variant",
        "variant": "T4d_metrics",
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
        "layout": "t_variant",
        "variant": "T4a_cards",
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

**`layout: "t_variant"` 规则**（详见第5步）：系统根据内容语义选择 `layouts/t_variants.json` 中登记的 T 变体，并在模板正文安全区内重绘。不要把可用范围硬编码为少数几个旧变体。

### 第4步：克隆模板 → 生成框架 PPTX

运行 `scripts/build_skeleton.py`，按 content.json 的页面顺序，从模板复制对应 slide XML，生成只有框架没有内容的 PPTX：

```bash
python scripts/build_skeleton.py template_spec.json content.json output_skeleton/ 模板.pptx
```

这一步完成后，所有模板页（封面/过渡/尾页）的视觉效果已100%还原，内容页正文区为空。

### 第5步：内容页正文排版（T 系列语义排版）

内容页正文通过 `scripts/render_report.py` 调度，并完全采用 `pptx` 技术方案：先识别内容结构并写入 `layout: "t_variant"` 与 `variant`；再由 `scripts/render_content.js` 只读取 `layouts/t_variants.json` 索引，按当前页 `variant` 渐进式加载 `layouts/references/t*.md`，提取其中 JavaScript / `pptxgenjs` 模板函数并执行，生成正文单页 PPTX；最后由 `scripts/merge_content.py` 把正文 shapes 注入模板页。运行时会把 T 模板的 10 x 5.625 坐标映射进入当前模板正文安全区，并过滤 T 模板自带标题区，避免和品牌模板标题重叠。`layouts/registry.json` 和 `compiled_shape` 不再作为公开排版路径。

**排版库选择规则：**

1. 先把用户材料拆成信息结构，例如“核心判断+金句”“阶段路径”“指标数据”“对比矩阵”“执行计划”“普通要点”。
2. 规划阶段只读取 `layouts/t_variants.json` 的索引字段：`id`、`content_types`、`capacity`、`fields`、`reference_file`、`function`。不要一次性加载 `layouts/references/t*.md` 全量文件。
3. 选择最匹配的 T 变体后，生成 `content.json` 的语义字段，例如 `metrics[]`、`stages[]`、`columns[]`、`rows[]`、`statement`、`items[]`。
4. 如果内容超过某个 T 变体容量，优先拆成多页；不要通过缩小到不可读、删内容或改结论来强行塞入一页。
5. 如果没有专用 T 变体，使用 `T4a_cards` 或 `T4b_numbered_list` 承载原始要点；仍然必须保持大纲内容完整。

所有公开内容排版都必须走 `layout: "t_variant"`。旧的 `registry` 布局、预编译单页包和 shape 克隆文件仅可作为历史兼容代码存在，不得在技能说明、生成流程或给其他模型的指导中推荐使用。

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

- **核心观点/金句页**：使用 `T13_statement`，承载核心判断、支撑说明和金句。
- **指标数据页**：使用 `T4d_metrics`，承载 KPI、NPS、利润率、预算、增长等数据。
- **阶段/路径页**：使用 `T4e_timeline`，承载演进路径、年度节奏、战役计划。
- **对比/风险页**：使用 `T5_comparison`，承载前后变化、竞品比较、风险应对。
- **计划/清单页**：使用 `T7_table`，承载任务、资源、排期和分工。
- **普通要点页**：使用 `T4a_cards` 或 `T4b_numbered_list`，承载策略模块、方法论、长文本递进。

强制限制：
- 单页正文内容过密时优先拆成多页，不要强塞到一个版式里。
- 标题不要重复绘制，优先使用模板原有标题文本框；T 变体默认只绘制正文区，不覆盖模板标题框。
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

后续新增内容页排版时，只扩展 `pptx` 风格的 T 系列语义排版，不新增原始 shape 克隆路线。

#### 渐进式披露原则

排版库必须按“先索引、后详情”的方式使用，避免一次加载所有版式说明：

1. **默认只读取 T 变体索引**
   - 先根据内容类型选择候选 T 变体。
   - 布局索引文件为 `layouts/t_variants.json`。
   - 不要把 `layouts/references/t*.md` 或 `G:/ppt-templates/pptx/references/t*.md` 的完整说明一次性加载进上下文。

2. **确定变体后再加载必要参考**
   - 只有当某页确定需要某个 T 变体时，运行时才按需读取 `layouts/references/t*.md`。
   - `render_content.js` 从 md 的代码块中提取对应 `function`，在受控上下文中执行该 JS 模板函数。
   - 渲染必须保留该 T 模板的主体结构、相对比例、层级关系、字段映射和信息密度。
   - 不复制参考模板的品牌视觉或原始 shapes；颜色、字体、页眉标题和页脚继承当前用户选择的 PPT 模板。

3. **生成时只传必要字段**
   - `content.json` 只包含当前 T 变体需要的字段。
   - 不要为了“备用”同时填入多个互斥字段，例如同一页不要同时塞 `metrics`、`stages`、`columns`、`rows`。

#### 常用内容类型矩阵

下表只是常用映射，完整可选变体必须读取 `layouts/t_variants.json`。

| Content type | Variant | Fields | Use case |
|---------|---------|---------|---------|
| 普通要点 / 策略模块 | `T4a_cards` | `summary/items[]` | 2-6 个要点卡片。 |
| 步骤 / 方法论 / 长文本递进 | `T4b_numbered_list` | `summary/items[]` | 3-7 个编号步骤。 |
| KPI / 经营数据 / NPS / 预算 | `T4d_metrics` | `summary/metrics[]/details[]` | 3-5 个关键数据 + 原文细节。 |
| 阶段规划 / 演进路径 / 年度节奏 | `T4e_timeline` | `summary/stages[]` | 3-6 个阶段节点。 |
| 对比 / 风险应对 / 竞品比较 | `T5_comparison` | `summary/columns[]` | 2-4 列对比信息。 |
| 执行计划 / 任务清单 / 资源分工 | `T7_table` | `headers[]/rows[]` | 最多 7 行、5 列。 |
| 核心观点 / 金句 / 结论 | `T13_statement` | `statement/supporting_lines[]/quote` | 1 个判断 + 支撑说明 + 金句。 |

#### 新增布局准入条件

只有满足以下任一条件，才新增布局：
- 已有布局会造成明显信息错配，例如把“观点+路径+数据+金句”塞进普通网格；
- 该版式能复用到一类内容，而不是只服务某一页；
- 用户提供的参考页存在清晰结构模式，例如“三栏专题卡”“左右对比”“矩阵象限”“问题-方案-收益”。

新增布局必须按 T 系列语义排版标准执行：
- 优先判断是否能映射到 `layouts/t_variants.json` 已登记的 58 个 T 变体；能映射时只补充说明，不新增主类。
- 需要新增主类时，把参考页整理成 `layouts/references/t*.md`，在 md 中提供 JS / pptxgenjs 模板函数。
- 在 `layouts/t_variants.json` 登记 `reference_file` 和 `function`，让运行时按需加载执行；不要把新增布局代码直接写死进 `render_content.js`。
- 参考 PPTX 可用于读取真实比例、字号层级和信息密度，但不得复制原始 shapes 作为生成路径。
- 必须区分版式本体和截图批注：红框、选择框、标注线等批注不得绘制到 PPT 中。
- 必须声明字段 schema、容量限制和溢出策略。
- 必须生成样例 PPT 验证，确认无标题重叠、无示例文字残留、无文本溢出、尾页原样保留。

#### 用户提供图片或 PPT 时的整理流程

当用户上传 PPT 页面截图或 PPTX，并要求“把这个排版整理到排版库”时，必须按以下流程处理：

0. **优先抽象 T 版式结构**
   - 如果用户给的是 PPTX，优先读取页面中的区域比例、字号层级、行列数量和信息密度。
   - 如果用户只给图片，先反推结构和比例；实现后必须用样例 PPT 验证并根据截图反馈修正。

1. **识别版式骨架**
   - 判断页面是几栏、几区、是否有顶部总论、底部总结、图片位、数据位、流程位。
   - 只抽象结构，不绑定截图里的具体品牌、车型、日期或活动名。
   - 标注哪些元素是版式本体，哪些只是截图批注或编辑器选择框。

2. **提炼内容语义**
   - 把页面元素映射成语义字段，例如 `headline`、`columns`、`cards`、`metrics`、`quote`、`footer`。
   - 文字内容较长时，给出字段字数上限，避免其他模型照抄长段导致溢出。

3. **命名 T 变体**
   - 使用 T 系列语义名，例如 `T16_issue_solution_benefit`。
   - 不使用品牌名、项目名或截图文件名作为变体名。

4. **登记文档**
   - 在排版库说明中加入适用场景、页面结构、标准 `content.json`、使用约束。
   - 明确该布局是否使用模板标题框、是否要清空模板示例文本、哪些固定视觉锚点必须保留。
   - 如果是已有布局的变体，用 `_compact`、`_visual`、`_text` 命名，不要重复造新主类。

5. **实现或排期实现**
   - 若现有脚本能支持，直接映射到已有 T 变体并补充说明。
   - 若现有脚本不能支持，在 `render_content.js` 中新增 `renderXxx()` 并在 `t_variants.json` 中登记。
   - 实现后至少生成一个样例验证。

6. **反馈给用户**
   - 说明该图片被抽象成了哪个布局名。
   - 说明新增了哪些字段、适用什么场景、有什么限制。
   - 如果只更新了文档、暂未实现脚本，必须明确说明。

#### 新增布局登记要求

每新增一个布局，必须同时更新三处：

1. **脚本实现**
   - 在 `scripts/render_content.js` 中新增 JS/pptxgenjs 渲染函数，或复杂时新增独立 JS T 模块。
   - 调度入口仍然使用 `layout: "t_variant"`。
   - 坐标必须按当前模板 `body_zone` 和安全边距计算，正文避开页脚、Logo 和模板固定品牌元素。

2. **技能文档**
   - 在 `layouts/t_variants.json` 登记变体索引。
   - 更新 `layouts/README.md`，写明适用场景、标准 `content.json` 字段结构、数量限制、字数限制、图片/图标处理规则。
   - 如影响通用规则，再同步更新 `SKILL.md`。

3. **样例验证**
   - 至少用一个已登记模板生成样例 PPT。
   - 检查页面数量、标题、关键字段是否写入。
   - 检查模板示例文本是否清理干净，视觉锚点是否保留，截图批注是否没有误绘制。
   - 检查文字是否超出文本框或页面边界；不能靠不可读字号强塞。
   - 如涉及尾页，必须验证尾页 XML 原样保留。

#### 命名规范

- 变体名使用 T 系列语义名，不使用模板名或品牌名，例如 `T16_issue_solution_benefit`。
- 字段名也使用语义名：`summary`、`items`、`metrics`、`stages`、`columns`、`rows`、`quote`。

#### 变体策略

同类布局后续可以增加安全变体，但必须受控：
- 使用 `_compact` 表示紧凑版，例如 `T4a_cards_compact`。
- 使用 `_visual` 表示图片占比更高的版本。
- 使用 `_text` 表示文字信息更密的版本。
- 不要让模型自由随机坐标；如果需要变化，使用 `style_selection` 或 `style_seed` 在已登记变体中选择。

### T 变体示例

推荐 `content.json`：

```json
{
  "type": "content",
  "page_title": "核心研判",
  "body": {
    "layout": "t_variant",
    "variant": "T13_statement",
    "statement": "基于目前产品舆论态势及竞品攻击情况进行研判，银河M9上市期间内可能会遭受更多攻击",
    "supporting_lines": [
      "竞品上市窗口容易触发舆情攻击与信息误读",
      "需要提前配置口碑维护方向、资源和监测机制"
    ],
    "quote": "需及时调整口碑维护方向及资源规划来打好这场舆论硬仗"
  }
}
```

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

以下布局是脚本内部历史兜底能力，不属于当前排版库。当前公开排版库以 `layouts/t_variants.json` 为准；其他版式等用户后续提供参考图/PPT 后，再按 T 系列语义排版机制加入。

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

    // 视觉锚点使用纯几何形状，不依赖图标库
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
        "layout": "t_variant",
        "variant": "T4a_cards",
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

# 3. 生成 PPT：模板页克隆 + JS/pptxgenjs 内容页排版 + 合并注入
python ../scripts/render_report.py content.json 最终输出.pptx ../templates/奕境模板.pptx

# 4. 质量检查（内容）
python -m markitdown 最终输出.pptx

# 5. 质量检查（视觉）
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
# - dual_track/style_clone: 统一使用 render_report.py
# - manual_review: 人工修正 new_spec.json 后再生成

# 生成示例
python scripts/render_report.py content.json final_output.pptx templates/新模板.pptx
```

---

### 场景二补充：style_clone 路线

当模板只有「封面 + 内容视觉页 + 尾页/金句页」时，仍使用统一入口：

```bash
python scripts/render_report.py content.json final_output.pptx templates/吉利模版.pptx
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
- 由 `render_report.py` 内部完成模板克隆、JS/pptxgenjs 正文生成和合并注入；不要手动拆成旧三步链路。

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

Available public content layout is `slides[].body.layout = "t_variant"`. The selected variant must be one of the 58 T variants registered in `layouts/t_variants.json`; do not hard-code the old subset of seven variants.

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
slides[].body.layout       内容页固定写 "t_variant"
slides[].body.variant      T 变体名，必须来自 layouts/t_variants.json，例如 T4a_cards / T4d_metrics / T17_swimlane_map / T31_strategy_matrix / T54_byd_risk_response_matrix
slides[].body.summary      页面总述，可选
slides[].body.items[]      普通要点、步骤、卡片内容
slides[].body.metrics[]    指标项，T4d_metrics 使用
slides[].body.stages[]     阶段节点，T4e_timeline 使用
slides[].body.columns[]    对比列，T5_comparison 使用
slides[].body.headers[]    表头，T7_table 使用
slides[].body.rows[]       表格行，T7_table 使用
slides[].body.statement    核心判断，T13_statement 使用
slides[].body.supporting_lines[] 支撑说明，T13_statement 使用
slides[].body.quote        金句或行动结论，T13_statement 使用
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
│   ├── t_variants.json         # 公开 T 系列语义排版索引
│   ├── references/             # 从 pptx/references 同步的 t*.md；运行时按需加载 JS 模板函数
│   └── registry.json           # 历史兼容索引，不作为公开排版流程
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
    ├── build_skeleton.py       # 历史兼容：按大纲克隆模板页
    ├── render_content.js       # JS/pptxgenjs T 系列正文排版器
    ├── render_style_clone_report.py # 历史兼容入口；公开流程使用 render_report.py
    ├── render_report.py        # 核心入口：委托 render_report_pptxjs.py
    ├── render_report_pptxjs.py # Python 克隆模板页 + JS 生成正文 + 合并注入
    ├── ppt_engine/
    │   ├── compiled_layout.py  # 历史兼容模块，不作为公开排版流程
    │   ├── context.py          # design_tokens / 字体 / runtime context
    │   ├── primitives.py       # tx/rich_tx/rect/footer/title 等基础绘制
    │   ├── template.py         # 模板识别、克隆、标题清理、spec 读取
    │   ├── content.py          # 目录/过渡/内容页调度
    │   └── layout_registry.py  # 历史兼容 registry；compiled_shape 条目会被跳过
    ├── layouts_impl/           # 历史兼容 Python 布局模块，不作为公开排版流程
    ├── replace_text.py         # 文字替换工具（保留 XML 格式标签）
    ├── merge_content.py        # 第6步：合并内容页到骨架
    ├── add_slide.py            # 复制 slide 工具
    └── office/
        ├── unpack.py           # 解压 PPTX
        ├── pack.py             # 打包 PPTX
        └── soffice.py          # LibreOffice 转 PDF
```
