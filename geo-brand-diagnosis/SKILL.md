---
name: "geo-brand-diagnosis"
description: "GEO（生成引擎优化）品牌诊断分析技能。工作流程：1) 用户提供品牌词（如'特斯拉 Model Y'）；2) 根据品牌词自动生成10个符合用户搜索意图的测试问题；3) 提供用户确认/修改；4) 对主流 AI 平台（DeepSeek、豆包、Kimi 等）批量提交问题；5) 提取 AI 回答和参考信源；6) 生成品牌提及率诊断报告（含 HTML 可视化）。触发词：GEO 诊断、品牌诊断、生成引擎优化、AI 平台提及率、geo-report、品牌认知测试。"
agent_created: true
---

# GEO 品牌诊断分析技能

## 概述

此技能用于诊断指定品牌/公司在主流 AI 平台中的认知度和提及率。通过 Playwright 自动化登录各平台，批量提交测试问题，提取 AI 回答，最终生成可视化 HTML 诊断报告。

## 何时使用此技能

- 用户提到"GEO 诊断"、"品牌诊断"、"生成引擎优化"
- 用户想测试某品牌在 AI 搜索/回答中的提及率
- 用户需要生成 AI 平台诊断报告
- 用户提到"geo-report"、"提及率"、"品牌认知"
- **GEO场景核心目标**：让 AI 在开放式问题中**主动提及/推荐品牌**，而非直接问"XX品牌怎么样"

## 前置依赖

- Node.js + Playwright：`npm install playwright`
- 技能目录含 `scripts/`（登录/测试脚本）、`references/`（平台选择器文档）

## 标准工作流

### 第0步：接收品牌词，生成测试问题（⚠️ 必须先执行）

用户提供参考品牌词（如"映盛中国"、"比亚迪汉"）后，**必须先生成问题供用户确认，不得直接执行诊断**。

#### GEO 场景核心设计原则

GEO（生成引擎优化）的目标是**让 AI 在回答中主动提及品牌**，而非直接问"XX品牌怎么样"。问题设计应遵循：

| 原则 | 说明 | ❌ 错误示例 | ✅ 正确示例 |
|------|------|-----------|-----------|
| **开放式** | 不提品牌名，让AI自由发挥推荐 | "比亚迪汉怎么样？" | "20-30万中大型纯电轿车有哪些推荐？" |
| **场景化** | 从用户真实需求出发 | "比亚迪汉性价比高吗？" | "家庭用车选纯电还是插混？有哪些适合家用的车型？" |
| **不含品牌** | 问题中不出现目标品牌 | "小米SU7和比亚迪汉怎么选？" | "小米SU7和同价位竞品怎么选？" |
| **多维覆盖** | 覆盖品牌核心卖点维度 | 单一维度 | 选购、续航、智驾、口碑、保养等多维 |

#### 问题生成步骤

1. 根据品牌词，生成 **10 个**符合用户搜索意图的问题
2. 问题需覆盖以下意图类型（每类 1-3 题）：

| 意图类型 | 说明 | 示例（品牌词：比亚迪汉） |
|---------|------|---------------------------|
| 选购推荐 | 用户想找推荐 | "2026年20-30万中大型纯电轿车有哪些推荐？" |
| 评测体验 | 用户想了解产品对比 | "中大型纯电轿车高速续航实测，哪些车型表现最好？" |
| 方案咨询 | 用户求解决方案 | "纯电轿车后期保养费用对比，哪些车型维护成本低？" |
| 细分场景 | 特定使用场景 | "适合年轻人开的中大型纯电轿车，外观运动感强有哪些？" |
| 价格咨询 | 用户关心价格 | "落地25万左右的中大型轿车，哪些口碑好、质量稳定？" |
| 品牌口碑 | 用户关注口碑 | "20-30万高性价比纯电轿车，哪些闭眼买不踩坑？" |
| 负面关切 | 用户担心的问题 | "智驾功能强且价格不贵的中大型轿车有哪些？" |
| 决策指导 | 帮助用户做决定 | "家庭用车选纯电还是插混？有哪些适合家用的车型推荐？" |

3. **将 10 个问题以列表形式展示给用户，明确请求确认**
4. **主动询问竞品**：如"是否需要补充竞品？（如小米SU7、极氪001等）"
5. 等待用户确认或提出修改
6. **收到确认后** 才能进入下一步

> ⚠️ 禁止跳过确认步骤直接执行诊断！

#### 竞品调研

生成问题时同步调研竞品并填入 `questions.json` 的 `competitors` 字段：
- 直接竞品（同级别、同价位）
- 间接竞品（同品牌不同系列）
- 爆款竞品（市场热度高的同类型产品）

> 竞品会被纳入报告对比分析，了解品牌在竞品包围中的提及率。

### 1. 初始化项目

```bash
mkdir -p geo-diagnosis/{scripts,assets,results} && cd geo-diagnosis
npm init -y && npm install playwright
```

> 如果已有登录态文件（`xxx-auth.json`），直接复制到项目目录即可跳过登录步骤。

### 2. 各平台登录并保存登录态

（如果用户已保存过登录态文件，可跳过此步，直接复制到项目目录）

```bash
node scripts/login-kimi.js        # 保存 → kimi-auth.json
node scripts/login-doubao.js      # 保存 → doubao-auth.json
node scripts/login-deepseek.js    # 保存 → deepseek-auth.json
```

登录脚本逻辑（通用）：
1. 用 `chromium.launch({ headless: false })` 打开浏览器
2. 导航至平台 URL，等待用户手动登录
3. 轮询检测登录成功（有输入框 && 无登录按钮）
4. 调用 `context.storageState({ path: 'xxx-auth.json' })` 保存

> **注意**：不要用 `launchPersistentContext`（与 Edge 冲突），也不要用 `process.stdin`（WorkBuddy 不支持）。

### 3. 批量提交测试问题

将用户确认后的问题保存为 `assets/questions.json`，然后运行：

```bash
# 推荐用 fix-questions.js（有"等新回答"机制，更可靠）
node scripts/fix-questions.js --platform kimi --questions 1,2,3,4,5,6,7,8,9,10
node scripts/fix-questions.js --platform deepseek --questions 1,2,3,4,5,6,7,8,9,10
node scripts/fix-questions.js --platform doubao --questions 1,2,3,4,5,6,7,8,9,10
```

> 也可以用 `batch-test.js --platform kimi --questions assets/questions.json`，但它在同会话多题时可能提取到上一题的回答。`fix-questions.js` 通过计数机制（`countAnswers`）解决了这个问题。

**脚本核心逻辑（已实测验证）**：

1. 加载 `xxx-auth.json` 恢复登录态
2. 记录发送前的回答元素数量（`countAnswers`）
3. 输入问题并发送
4. **等新回答出现**：`countAnswers > prevCount` 后才开始稳定计时
5. **等回答完成**：轮询最后一个回答元素 `innerText.length` 连续 5 秒不变
6. 提取最后一个回答元素的文本（`extractAnswer`）
7. **提取参考信源链接**（`extractLinks`）：从回答 DOM 的 `<a>` 标签直接提取 `href`，避免 `innerText` 丢失链接
8. 保存为 `results/{platform}-q{N}.md`（含 `## AI 完整回答` 和 `## 参考信源` 段落）

#### 各平台实测选择器（2026-05 验证）

| 平台 | 输入框 | 回答元素 | 回答计数 | 特殊处理 |
|------|--------|---------|---------|---------|
| **DeepSeek** | `textarea` | `[data-virtual-list-item-key]` 最后一个 | 同上元素数量 | 同页多题 count 不递增，直接等长度稳定 |
| **Kimi** | `div[contenteditable="true"].chat-input-editor` | `.markdown` 最后一个 | 同上元素数量 | 首页视频弹窗遮挡 → Escape + JS click + `force: true` |
| **豆包** | `textarea` | `[data-message-id]` 最后一个 | 同上元素数量 | URL 需用 `https://www.doubao.com/chat/` |

### 3.5 断点续跑（可选）

如果中途失败，用 `fix-questions.js` 只补跑缺失题目：

```bash
# 只补跑 Q7 和 Q10
node scripts/fix-questions.js --platform kimi --questions 7,10

# DeepSeek 补跑 Q5-Q10
node scripts/fix-questions.js --platform deepseek --questions 5,6,7,8,9,10
```

脚本会自动检测已有结果（回答部分 > 100 字节视为有效），不会覆盖已采集的数据。

### 4. 生成诊断报告

```bash
node scripts/generate-report.js
```

报告自动读取 `assets/questions.json` 和 `results/` 目录，生成 `geo-report.html`。

**命令行参数**（可选）：
```bash
node scripts/generate-report.js --brand "映盛中国"
node scripts/generate-report.js --brand "映盛中国" --competitors "蓝色光标,华彩汽车传播,百分点"
```

**`questions.json` 格式**（含竞品列表 + intent 字段）：
```json
{
  "questions": [
    { "id": 1, "text": "问题文本", "intent": "车型推荐" },
    ...
  ],
  "competitors": ["蓝色光标", "华彩汽车传播", "百分点", "新意互动", "原圈科技"]
}
```

> **⚠️ `intent` 字段必填！** `generate-report.js` 的雷达图依赖每道题的 `intent` 来做多维分析。缺少 `intent` 会导致雷达图所有标签显示为 "undefined"。intent 应为简短的中文标签（如"车型推荐"、"家庭需求"、"动力选择"等），相同 intent 的问题会被聚合为一个维度。

> 如果不传 `--competitors` 且 `questions.json` 无 `competitors` 字段，报告将跳过竞品分析板块。建议在生成问题时同步调研竞品并填入。

**报告 8 大板块**：
1. 核心结论（综合提及率 + 评级）
2. 总体指标表现（4 张指标卡片）
3. 各 AI 平台指标表现（3 张平台卡片 + 竞品提及提示）
4. 多维度具体分析（Chart.js 图表 + **竞品对比表格**）
5. AI 对话摘要（**全部 30 条对话**，含品牌未提及的；点击弹框查看完整回答 + 参考信源链接）
6. 信源渠道分析（AI 引用链接的来源分类 + 环形图；无链接时显示提示）
7. GEO 优化建议（含竞品威胁提醒）

## 品牌关键词匹配（⚠️ 重要）

`generate-report.js` 的 `getBrandKeywords()` 函数负责从品牌名生成匹配关键词。**AI 回答中品牌名格式可能与输入不一致，必须注意**：

### 已知坑：连字符变体
- 品牌名 "本田CRV" → AI 回答中写作 **"CR-V"**（带连字符）
- 品牌名 "马自达CX5" → AI 可能写作 **"CX-5"**
- 如果关键词不含变体，会导致 **提及率 0% 的误报**

### 当前解决方案
`getBrandKeywords()` 会自动：
1. 提取品牌名中的英文/数字部分（如 "本田CRV" → "CRV"）
2. 生成连字符变体（"CRV" → "CR-V"、"C-RV"、"C-R-V" 等）
3. 生成字母+数字变体（"CX5" → "CX-5"）
4. 移除连字符的反向变体（"CX-5" → "CX5"）

### 验证关键词
生成报告后，务必检查提及率是否合理。如果知名品牌显示 0%，大概率是关键词匹配问题。可用以下命令快速验证：

```bash
grep -oh "品牌关键词" results/*.md | wc -l
```

## 平台已知问题与解决方案

### DeepSeek
- **虚拟列表**：回答在虚拟列表 `[data-virtual-list-item-key]` 中，同页多题时元素总数不递增（始终显示可见项）
- **对策**：直接等最后一个元素 `innerText.length` 稳定即可，不依赖 count 递增
- **不要用** `.message-assistant` 等类名（已被混淆）

### Kimi
- **首页弹窗**：打开后可能有视频推广弹窗，覆盖输入框导致 `click()` timeout
- **对策**：先 `page.keyboard.press('Escape')`，再 `page.evaluate` JS click，最后 `input.click({ force: true })`
- **同会话多题**：`.markdown` 元素会在新回答出现时增加，需要先等 count > prevCount
- **contenteditable**：不能用 `fill()`，需先 `el.innerText = ''` 清空再 `type()`

### 豆包
- **URL**：直接访问 `https://www.doubao.com/chat/`（加 `/chat/` 路径）
- **回答元素**：`[data-message-id]`，count 递增正常
- **输入框**：`textarea`，可用 `fill()`

### 通用注意事项

#### 数据时效性
- **不同天的数据不能混用**！每次诊断必须清空 `results/*.md` 后重新采集
- AI 回答内容每天可能不同，混合使用会导致统计不准确

#### 参考信源提取（⚠️ 2026-05-06 修复验证）
- `fix-questions.js` 的 `extractLinks()` 从回答 DOM 的 `<a>` 标签提取链接
- **DeepSeek**：直接在最后一个 `[data-virtual-list-item-key]` 元素的 `<a>` 标签提取。回答中有"已阅读 N 个网页"提示时链接正常存在于 `<a>` 标签中。部分题目（如"轿车vsSUV"类非搜索问题）不会触发联网搜索，信源为0是正常的
- **Kimi**：回答文本中**没有 `<a>` 标签**，参考来源以 `.rag-tag` 形式嵌入（仅显示站点名如 zol.com.cn、车家号）。**必须点击 `.ref-action` "引用"按钮**，等 `.ref` 面板展开后，从面板内的 `<a>` 标签提取链接（排除 kimi.com 自身链接）
- **豆包**：回答文本中**没有 `<a>` 标签**。**必须点击 `.entry-btn-title-v3-uM2642` "参考 X 篇资料"按钮**，然后提取新出现的非 doubao.com 外部 `<a>` 标签。注意链接文本可能含多余空格，需 `replace(/\s+/g,' ')` 清理
- 如果信源分析板块显示"未检测到引用链接"，说明采集时未提取到链接，需用最新版 `fix-questions.js` 重新采集

## 文件结构

```
skills/geo-brand-diagnosis/
├── SKILL.md                          # 本文件
├── scripts/
│   ├── login-kimi.js                # Kimi 登录保存
│   ├── login-doubao.js              # 豆包登录保存
│   ├── login-deepseek.js            # DeepSeek 登录保存
│   ├── batch-test.js                # 基础批量测试脚本
│   ├── fix-questions.js             # 精确补跑脚本（推荐，有"等新回答"机制）
│   ├── dom-probe.js                 # DOM 选择器探测器
│   └── generate-report.js           # 报告生成脚本
├── references/
│   └── platform-selectors.md        # 各平台 DOM 选择器文档（实测版）
└── assets/
    └── geo-report-template.html     # HTML 报告模板（含下载功能）
```

## 项目工作目录结构

```
geo-diagnosis/
├── assets/
│   └── questions.json               # AI 生成的 10 个测试问题
├── results/
│   ├── kimi-q1.md ~ kimi-q10.md
│   ├── deepseek-q1.md ~ deepseek-q10.md
│   └── doubao-q1.md ~ doubao-q10.md
├── scripts/                          # 从技能目录复制或直接引用
├── deepseek-auth.json               # 登录态文件
├── kimi-auth.json
├── doubao-auth.json
├── generate-report.js               # 报告生成
└── geo-report.html                  # 最终输出
```

## 诊断报告解读

报告核心指标：
- **综合品牌提及率** = 三平台总提及次数 / 30次测试
- **评级标准**：≥50% 强势存在 🏆 | ≥30% 有所存在 📊 | ≥15% 存在感弱 ⚠️ | <15% 几乎不可见 🚨
- **原文摘录**：高亮显示品牌名在 AI 回答中的上下文
- **优化建议**：针对低提及场景和薄弱平台给出具体行动建议

## 迭代建议

- 扩大平台覆盖：加入 Claude、文心一言、通义千问
- 定期监控：用自动化任务每周跑一次，追踪提及率变化
- 内容优化：根据诊断结果指导 SEO/GEO 内容策略
- 竞品对比：同时跑竞品关键词，做横向对比分析
