# GEO 品牌诊断完整工作流

> 本文档提供从零开始完成一次 GEO 品牌诊断的标准流程。

---

## 阶段一：环境准备

```bash
mkdir geo-diagnosis && cd geo-diagnosis
npm init -y
npm install playwright
node -e "require('playwright').chromium.launch().then(b => b.close())"  # 安装浏览器
```

目录结构：
```
geo-diagnosis/
├── results/              # 测试结果输出
├── *-auth.json          # 各平台登录态（gitignore！）
└── package.json
```

---

## 阶段二：保存各平台登录态

对每个平台分别运行登录脚本（脚本位于技能 `scripts/` 目录）：

```bash
node scripts/login-kimi.js      # → kimi-auth.json
node scripts/login-doubao.js   # → doubao-auth.json（待创建）
node scripts/login-deepseek.js  # → deepseek-auth.json（待创建）
```

**登录脚本通用逻辑**：
1. `chromium.launch({ headless: false })` 打开可见浏览器
2. 导航至平台 URL，等待用户手动登录
3. 轮询检测：`有输入框 && 无登录按钮` = 登录成功
4. `context.storageState({ path: 'xxx-auth.json' })` 保存

⚠️ **注意**：
- 不要用 `launchPersistentContext`（与 Edge 冲突）
- 不要用 `process.stdin`（WorkBuddy 不支持交互输入）
- 豆包的 `doubao-auth.json` 较大（~890KB），含大量 cookies

---

## 阶段三：DOM 选择器探测（关键！）

各平台 UI 会更新，使用前务必先探测最新选择器：

```bash
node scripts/dom-probe.js --platform kimi
```

输出示例：
```
[DOM Probe] 找到 3 个候选回答容器：
  1. .chat-content-item-assistant (字数: 1245)
  2. .segment-container (字数: 1245)
建议使用的选择器：.chat-content-item-assistant .segment-container
```

将确认后的选择器更新至 `scripts/batch-test.js` 对应平台的配置中。

---

## 阶段四：批量提交测试问题

编辑 `assets/questions.json` 确认测试问题，然后运行：

```bash
node scripts/batch-test.js --platform kimi --questions assets/questions.json
node scripts/batch-test.js --platform doubao --questions assets/questions.json
node scripts/batch-test.js --platform deepseek --questions assets/questions.json
```

输出：`results/{platform}-q{N}.md`

**等待策略**（重要！）：
- Kimi/豆包会先联网搜索（20-30秒），切忌用固定等待时间
- 正确做法：轮询 `document.body.innerText.length` 连续5秒不变且 > 500 字符

---

## 阶段五：生成诊断报告

```bash
node scripts/generate-report.js \
  --results results/ \
  --output geo-report.html \
  --brand "比亚迪 宋PLUS DM-i"
```

报告功能：
- 各平台提及率柱状图
- 每个问题的回答详情卡片
- 参考信源分析
- **下载 PDF**：点击右上角按钮调用 `window.print()`
- **下载长图**：调用 `html2canvas` 截图导出 PNG
- 打印时自动隐藏下载按钮（`@media print`）

---

## 阶段六：报告解读与建议

### 核心指标

| 指标 | 计算方式 | 意义 |
|------|---------|------|
| 品牌提及率 | 提及次数 / 问题总数 | 品牌在 AI 回答中的认知度 |
| 正面提及率 | 正面提及次数 / 提及次数 | 品牌口碑 |
| 信源引用率 | 引用品牌相关网页数 / 总信源数 | 内容 SEO 效果 |

### 优化建议

1. **提高提及率**：在知乎、汽车之家、易车等平台发布含品牌关键词的高质量内容
2. **提高信源引用率**：优化官网 SEO，提交百度/搜狗站长平台
3. **定期监控**：设置每月运行一次，追踪提及率变化趋势

---

## 常见问题排查

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 登录态失效 | Cookie 过期（7-30天） | 重新运行登录脚本 |
| 回答内容截断 | 选择器选到了错误元素 | 运行 `dom-probe.js` 重新探测 |
| 回答等待超时 | 平台响应慢 / 网络问题 | 增大 `batch-test.js` 中的等待轮次 |
| 报告生成失败 | `results/` 目录为空或格式错误 | 检查各平台测试结果文件是否存在 |
| html2canvas 截图空白 | 跨域图片 / 样式问题 | 添加 `useCORS: true`，检查图片域名 |

---

## 迭代 Checklist

- [ ] 扩大平台覆盖（Claude、文心一言、通义千问）
- [ ] 增加测试用例（覆盖更多场景）
- [ ] 情感分析（正面/中性/负面标注）
- [ ] 竞品对比（同时测试多个品牌的提及率）
- [ ] 自动化定时任务（每周/每月自动运行）
