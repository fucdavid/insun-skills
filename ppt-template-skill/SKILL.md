---
name: ppt-template-skill
description: "基于用户上传的 PPT 模板生成演示文稿。使用双轨策略：模板页（封面/过渡/尾页）通过 XML 克隆保证100%视觉还原，其中尾页必须原样保留；内容页正文区通过 pptxgenjs 按大纲内容动态排版。适用于吉利、奕境等品牌模板，也适用于任何 .pptx 模板文件。"
---

# PPT 模板复用技能

## 用户入口流程：先确定模板来源

当用户要求“生成 PPT / 做一份 PPT / 用模板生成 PPT”时，先判断模板来源，再进入后续技术路由。

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
   - 先让用户选择以下三种方式之一：
     - **选择已有模板**：列出“支持的模板清单”，让用户指定一个模板名。
     - **上传新模板**：让用户提供 `.pptx` 模板文件，随后按新模板接入流程分类。
     - **直接生成**：由模型从已登记模板中选择一个通用模板生成。

### 直接生成规则

用户选择“直接生成”时，不要再要求模板文件：
- 优先从已登记模板中选择与内容风格最接近的模板；
- 如果没有明确品牌或风格偏好，使用通用浅色商务风模板，优先选择 `昊铂埃安BU-PPT模板260115` 或 `广汽埃安模板`；
- 直接生成也必须遵守模板自身页面结构：没有目录页的模板不得自行伪造目录页，有尾页的模板必须原样保留。

### 不要打断的情况

如果用户已经说了“使用某某模板生成……”，直接进入生成流程；不要再问“选择模板/上传模板/直接生成”。

---

## 架构总览

本技能采用**双轨策略**，解决"模板还原"与"内容排版"两个相互独立的问题：

| 页面类型 | 策略 | 理由 |
|---------|------|------|
| 封面、过渡页 | **XML 克隆 + 文字替换** | 背景图/渐变/特效字体完整保留，100% 视觉还原 |
| 尾页 | **XML 克隆，禁止改字** | 尾页作为品牌收尾页原样保留，不替换 THANKS、日期、署名或任何模板文字 |
| 内容页（正文区） | **pptxgenjs 动态生成** | 根据大纲条目数量、内容类型自动选择最合适的布局 |

---

## 路由总则：所有模板先分类

不要假设新上传模板一定符合 `cover + transition + content + end`。每次接入新模板，先运行分类器：

```bash
python scripts/classify_template.py 模板.pptx template_spec.json template_route.json
```

根据 `template_route.json.route` 选择生成路线：

| route | 适用模板 | 生成方式 |
|-------|----------|----------|
| `dual_track` | 有明确封面、章节/过渡、内容页、尾页模板 | 走标准双轨：`build_skeleton.py` + `render_content.js` + `merge_content.py` |
| `style_clone` | 只有封面 + 内容风格页 + 可选尾页/金句页，缺少完整语义占位符 | 走通用风格克隆：`render_style_clone_report.py`，复制内容风格页并用 python-pptx 直接绘制正文 |
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

### 第5步：内容页正文排版（pptxgenjs）

内容页正文区通过 `scripts/render_content.js` 独立生成每张内容页，结果以图片形式嵌入（或直接写入 pptxgenjs 输出合并）。

**布局自动选择规则：**

```
items 数量  →  自动布局
──────────────────────────────────────────────────
1 条目      →  big_stat（大字数据 + 说明）
2 条目      →  two_col（左右两栏卡片）
3 条目      →  three_col（三栏卡片，含图标）
4 条目      →  four_grid（2×2 网格卡片）
5-6 条目    →  bullet_list（带图标的要点列表）
7+ 条目     →  compact_list（紧凑列表，双栏）
含 value 字段 → 优先使用 kpi_card 布局（大数字突出）
含 steps 字段 → timeline 布局（横向流程）
含 table 字段 → table 布局
```

**代码模板见 `scripts/render_content.js` 中各 `layout_*` 函数。**

关键参数：从 `template_spec.json` 读取 `body_zone` 和 `design_tokens`，确保正文颜色与模板主色一致。

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

## 内容页正文区布局参考

以下所有布局均在 `body_zone` 定义的区域内排版，所有颜色从 `design_tokens` 读取。

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

支持的 `body.layout`：`auto`、`kpi`/`kpi_card`、`grid`、`timeline`、`big_stat`/`quote`。

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
slides[].body.layout auto（推荐）/ kpi_card / three_col / two_col /
                     bullet_list / timeline / big_stat / compact_list
slides[].body.items[].label   条目标签/小标题
slides[].body.items[].value   大数字（有此字段时自动用 kpi_card 布局）
slides[].body.items[].desc    描述文字
slides[].body.items[].icon    图标名（可选，见 render_content.js ICON_MAP）
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
    ├── render_content.js       # 第5步：内容页正文排版（pptxgenjs）
    ├── render_style_clone_report.py # style_clone 路线：复制内容风格页并直接绘制报告页
    ├── render_geely_report.py  # style_clone 实现脚本，默认使用内置吉利模板
    ├── replace_text.py         # 文字替换工具（保留 XML 格式标签）
    ├── merge_content.py        # 第6步：合并内容页到骨架
    ├── add_slide.py            # 复制 slide 工具
    └── office/
        ├── unpack.py           # 解压 PPTX
        ├── pack.py             # 打包 PPTX
        └── soffice.py          # LibreOffice 转 PDF
```
