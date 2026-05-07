# 各平台 DOM 选择器参考（2026-05 实测验证版）

> 本文档记录各 AI 平台的登录检测、输入框、回答容器的 DOM 选择器。
> 所有选择器均经过实际 Playwright 自动化测试验证。
> 由于平台会更新 UI，建议每次使用前先运行 `scripts/dom-probe.js` 验证。

---

## DeepSeek（chat.deepseek.com）

| 用途 | 选择器 | 备注 |
|------|--------|------|
| 输入框 | `textarea` | 标准 textarea |
| 回答元素 | `[data-virtual-list-item-key]` | 取**最后一个**的 innerText |
| 回答计数 | `document.querySelectorAll('[data-virtual-list-item-key]').length` | ⚠️ 同页多题时 count 不递增 |

**实测发现**：
- ❌ `.message-assistant` 等类名已被混淆，不可用
- ✅ `[data-virtual-list-item-key]` 是虚拟列表项，最后一个即为最新回答
- ⚠️ 同一会话中连续提问时，虚拟列表的元素总数不会递增（只渲染可见区域），所以**不能依赖 count 递增来判断新回答出现**
- ✅ 直接等最后一个元素的 `innerText.length` 稳定即可（连续5秒不变且 > 300 字符）

**登录态文件**：`deepseek-auth.json`

---

## Kimi（www.kimi.com）

| 用途 | 选择器 | 备注 |
|------|--------|------|
| 输入框 | `div[contenteditable="true"].chat-input-editor` | contenteditable，不可用 fill() |
| 回答元素 | `.markdown` | 取**最后一个**的 innerText |
| 回答计数 | `document.querySelectorAll('.markdown').length` | ✅ 同页多题 count 正常递增 |

**实测发现**：
- ❌ `.chat-content-item-assistant .segment-container` 不可靠
- ✅ `.markdown` 是最稳定的回答容器选择器
- ✅ 同会话多题时 count 递增正常，可以用来判断新回答出现
- ⚠️ **首页弹窗问题**：打开 Kimi 后可能有视频推广弹窗覆盖输入框，导致 click() timeout
  - 解决方案：先 `Escape` 关弹窗 → JS `el.click()` → `input.click({ force: true })`
- ⚠️ contenteditable 输入框不能用 `fill()`，需先 `el.innerText = ''` 清空再 `type()`
- ✅ 等待策略：先等 `.markdown` count > prevCount，再等长度稳定（> 200 字符，5秒不变）

**登录态文件**：`kimi-auth.json`

---

## 豆包 / Doubao（www.doubao.com）

| 用途 | 选择器 | 备注 |
|------|--------|------|
| URL | `https://www.doubao.com/chat/` | ⚠️ 必须加 `/chat/` 路径 |
| 输入框 | `textarea` | 标准 textarea |
| 回答元素 | `[data-message-id]` | 取**最后一个**的 innerText |
| 回答计数 | `document.querySelectorAll('[data-message-id]').length` | ✅ 同页多题 count 正常递增 |

**实测发现**：
- ❌ `.chat-content-item-assistant .segment-container` 不可靠（class 混淆）
- ✅ `[data-message-id]` 是最稳定的回答元素选择器
- ✅ count 递增正常（每次提问后 count +2，用户消息+AI回答各一个）
- ✅ 等待策略：先等 count > prevCount，再等长度稳定（> 200 字符，5秒不变）
- ⚠️ URL 需要加 `/chat/` 后缀，否则可能进入推荐页而非对话页

**登录态文件**：`doubao-auth.json`（较大，约 890KB）

---

## 等待回答完成的统一策略

**两阶段等待**（推荐）：

```
阶段1：等新回答出现（count 递增）
  - 轮询回答元素数量，直到 count > 发送前的 prevCount
  - 超时 30 秒后降级为直接等长度稳定

阶段2：等回答内容稳定
  - 轮询最后一个回答元素的 innerText.length
  - 连续 5 秒不变且长度 > 阈值视为完成
  - 超时 180 秒
```

**阈值**：
- DeepSeek：> 300 字符（回答通常较长）
- Kimi：> 200 字符
- 豆包：> 200 字符

---

## 平台 URL 汇总

| 平台 | URL | 备注 |
|------|-----|------|
| DeepSeek | `https://chat.deepseek.com/` | |
| 豆包 | `https://www.doubao.com/chat/` | 必须加 `/chat/` |
| Kimi | `https://www.kimi.com` | 注意弹窗 |

---

## 注意事项

1. **选择器会失效**：各平台频繁更新 UI（class 混淆），脚本中的选择器可能随时失效
2. **登录态过期**：`xxx-auth.json` 有效期约 7-30 天，过期需重新登录
3. **反爬机制**：频繁请求可能触发验证码，建议每次请求间隔 4-5 秒
4. **回答等待时间**：各平台回答时间差异大（30秒到3分钟），切忌用固定等待时间
5. **中文路径问题**：Playwright 脚本避免放在含中文的路径下运行
6. **headless: false**：建议在可见浏览器模式运行，方便排查问题
