const { chromium } = require('playwright');

/**
 * DOM 探测器 - 自动发现 AI 回答容器的选择器
 * 用法：node dom-probe.js --platform kimi
 *
 * 功能：
 * 1. 加载指定平台的登录态
 * 2. 发送一个测试问题
 * 3. 等待回答完成
 * 4. 扫描页面中所有文字 > 200 字的容器
 * 5. 按字数降序输出候选选择器
 */

const PLATFORMS = {
  kimi: {
    url: 'https://www.kimi.com',
    authFile: 'kimi-auth.json',
    inputSelector: 'div[contenteditable="true"].chat-input-editor',
    testQuestion: '宋PLUS DM-i 怎么样？'
  },
  doubao: {
    url: 'https://www.doubao.com',
    authFile: 'doubao-auth.json',
    inputSelector: 'div[contenteditable="true"]',
    testQuestion: '宋PLUS DM-i 怎么样？'
  },
  deepseek: {
    url: 'https://chat.deepseek.com',
    authFile: 'deepseek-auth.json',
    inputSelector: 'textarea, [contenteditable="true"]',
    testQuestion: '宋PLUS DM-i 怎么样？'
  }
};

async function probeDOM(page, platformName) {
  console.log(`\n[DOM Probe] 开始探测 ${platformName} 的回答容器选择器...`);

  // 获取所有含文字的容器，按字数降序排列
  const candidates = await page.evaluate(() => {
    const elements = document.querySelectorAll('*');
    const results = [];
    for (const el of elements) {
      const text = el.innerText || '';
      if (text.length > 200 && el.children.length > 0) {
        // 取第一个有意义的 class
        const cls = el.className.split(' ')[0];
        if (cls && !cls.startsWith(' ') && text.length < 10000) {
          results.push({ cls, len: text.length, text: text.slice(0, 50) });
        }
      }
    }
    return results.sort((a, b) => b.len - a.len).slice(0, 5);
  });

  console.log(`[DOM Probe] 找到 ${candidates.length} 个候选回答容器：`);
  candidates.forEach((c, i) => {
    console.log(`  ${i + 1}. .${c.cls} (字数: ${c.len}) - ${c.text}...`);
  });

  if (candidates.length > 0) {
    const best = candidates[0];
    console.log(`\n[DOM Probe] 建议使用的选择器：.${best.cls}`);
    console.log(`[DOM Probe] 提取回答代码：`);
    console.log(`  const el = document.querySelector('.${best.cls}');`);
    console.log(`  const answer = el ? el.innerText.trim() : '';`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const platformName = args.find(a => !a.startsWith('--')) || 'kimi';
  const platform = PLATFORMS[platformName];

  if (!platform) {
    console.error(`未知平台: ${platformName}`);
    console.error(`支持的平台: ${Object.keys(PLATFORMS).join(', ')}`);
    process.exit(1);
  }

  console.log(`[DOM Probe] 平台: ${platformName}`);
  console.log(`[DOM Probe] URL: ${platform.url}`);
  console.log(`[DOM Probe] 登录态文件: ${platform.authFile}`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: platform.authFile
  });
  const page = await context.newPage();

  await page.goto(platform.url);
  await page.waitForTimeout(3000);

  // 检查登录状态
  const isLoggedIn = await page.evaluate(() => {
    const hasInput = !!document.querySelector('div[contenteditable="true"], textarea');
    const hasLoginBtn = !!document.querySelector('button:has-text("登录")');
    return hasInput && !hasLoginBtn;
  });

  if (!isLoggedIn) {
    console.error('[DOM Probe] ❌ 未登录或登录态已过期，请先运行登录脚本');
    await browser.close();
    process.exit(1);
  }

  console.log('[DOM Probe] ✅ 登录态有效');

  // 发送测试问题
  console.log(`[DOM Probe] 发送测试问题: ${platform.testQuestion}`);
  await page.fill(platform.inputSelector, platform.testQuestion);
  await page.press(platform.inputSelector, 'Enter');
  await page.waitForTimeout(2000);

  // 等待回答完成（连续5秒文字长度不变）
  console.log('[DOM Probe] 等待 AI 回答完成...');
  let lastLen = 0;
  let stableCount = 0;
  for (let i = 0; i < 60; i++) {
    const len = await page.evaluate(() => document.body.innerText.length);
    if (len === lastLen && len > 500) {
      stableCount++;
      if (stableCount >= 5) {
        console.log('[DOM Probe] ✅ 回答完成');
        break;
      }
    } else {
      stableCount = 0;
    }
    lastLen = len;
    await page.waitForTimeout(1000);
  }

  // 探测 DOM
  await probeDOM(page, platformName);

  console.log('\n[DOM Probe] 浏览器保持打开，按 Ctrl+C 退出');
}

main().catch(console.error);
