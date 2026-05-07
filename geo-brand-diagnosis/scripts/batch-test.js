const { chromium } = require('playwright');
const fs = require('fs');

/**
 * 批量测试脚本（推荐版）- 遍历问题列表，逐平台提交并保存回答
 * 用法：node scripts/batch-test.js --platform kimi --questions assets/questions.json
 * 输出：results/{platform}-q{N}.md
 *
 * 2026-05 实测验证版：使用正确的选择器和两阶段等待策略
 */

const PLATFORMS = {
  deepseek: {
    url: 'https://chat.deepseek.com/',
    authFile: 'deepseek-auth.json',
    inputSel: 'textarea',
    countAnswers: async (page) => {
      return await page.evaluate(() => document.querySelectorAll('[data-virtual-list-item-key]').length);
    },
    waitForAnswer: async (page, prevCount) => {
      // DeepSeek 虚拟列表 count 不递增，直接等长度稳定
      let lastLen = 0, stable = 0;
      for (let i = 0; i < 180; i++) {
        await page.waitForTimeout(1000);
        const len = await page.evaluate(() => {
          const items = document.querySelectorAll('[data-virtual-list-item-key]');
          if (items.length === 0) return 0;
          return (items[items.length - 1].innerText || '').length;
        });
        if (len === lastLen && len > 300) { stable++; if (stable >= 5) return true; }
        else stable = 0;
        lastLen = len;
        if (i % 10 === 0) process.stdout.write(`  ⏳ ${i}s len=${len}\n`);
      }
      return false;
    },
    extractAnswer: async (page) => {
      return await page.evaluate(() => {
        const items = document.querySelectorAll('[data-virtual-list-item-key]');
        if (items.length === 0) return '';
        return (items[items.length - 1].innerText || '').trim();
      });
    },
    extractLinks: async (page) => {
      return await page.evaluate(() => {
        const links = []; const seen = new Set();
        const items = document.querySelectorAll('[data-virtual-list-item-key]');
        if (items.length > 0) {
          items[items.length - 1].querySelectorAll('a').forEach(a => {
            const url = a.href; const text = (a.textContent || '').trim();
            if (url && !seen.has(url)) { seen.add(url); links.push({ text: text || url, url }); }
          });
        }
        document.querySelectorAll('[class*="ref"],[class*="source"],[class*="citation"],[class*="search"],[class*="web"]').forEach(el => {
          el.querySelectorAll('a').forEach(a => {
            const url = a.href; const text = (a.textContent || '').trim();
            if (url && !seen.has(url)) { seen.add(url); links.push({ text: text || url, url }); }
          });
        });
        return links;
      });
    }
  },

  kimi: {
    url: 'https://www.kimi.com',
    authFile: 'kimi-auth.json',
    inputSel: 'div[contenteditable="true"].chat-input-editor',
    countAnswers: async (page) => {
      return await page.evaluate(() => document.querySelectorAll('.markdown').length);
    },
    waitForAnswer: async (page, prevCount) => {
      // 先等新 .markdown 出现
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(1000);
        const count = await page.evaluate(() => document.querySelectorAll('.markdown').length);
        if (count > prevCount) break;
        if (i % 5 === 0) process.stdout.write(`  等新答案 ${i}s\n`);
      }
      // 然后等长度稳定
      let lastLen = 0, stable = 0;
      for (let i = 0; i < 180; i++) {
        await page.waitForTimeout(1000);
        const len = await page.evaluate(() => {
          const mds = document.querySelectorAll('.markdown');
          if (mds.length === 0) return 0;
          return (mds[mds.length - 1].innerText || '').length;
        });
        if (len === lastLen && len > 200) { stable++; if (stable >= 5) return true; }
        else stable = 0;
        lastLen = len;
        if (i % 10 === 0) process.stdout.write(`  ⏳ ${i}s len=${len}\n`);
      }
      return false;
    },
    extractAnswer: async (page) => {
      return await page.evaluate(() => {
        const mds = document.querySelectorAll('.markdown');
        if (mds.length === 0) return '';
        return (mds[mds.length - 1].innerText || '').trim();
      });
    },
    extractLinks: async (page) => {
      return await page.evaluate(() => {
        const links = []; const seen = new Set();
        const mds = document.querySelectorAll('.markdown');
        if (mds.length > 0) {
          mds[mds.length - 1].querySelectorAll('a').forEach(a => {
            const url = a.href; const text = (a.textContent || '').trim();
            if (url && !seen.has(url)) { seen.add(url); links.push({ text: text || url, url }); }
          });
        }
        document.querySelectorAll('.search-result,.reference,[class*="ref"],[class*="source"],[class*="citation"]').forEach(el => {
          el.querySelectorAll('a').forEach(a => {
            const url = a.href; const text = (a.textContent || '').trim();
            if (url && !seen.has(url)) { seen.add(url); links.push({ text: text || url, url }); }
          });
        });
        return links;
      });
    }
  },

  doubao: {
    url: 'https://www.doubao.com/chat/',
    authFile: 'doubao-auth.json',
    inputSel: 'textarea',
    countAnswers: async (page) => {
      return await page.evaluate(() => document.querySelectorAll('[data-message-id]').length);
    },
    waitForAnswer: async (page, prevCount) => {
      // 先等新回答出现
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(1000);
        const count = await page.evaluate(() => document.querySelectorAll('[data-message-id]').length);
        if (count > prevCount) break;
        if (i % 5 === 0) process.stdout.write(`  等新答案 ${i}s\n`);
      }
      // 然后等长度稳定
      let lastLen = 0, stable = 0;
      for (let i = 0; i < 180; i++) {
        await page.waitForTimeout(1000);
        const len = await page.evaluate(() => {
          const items = document.querySelectorAll('[data-message-id]');
          if (items.length === 0) return 0;
          return (items[items.length - 1].innerText || '').length;
        });
        if (len === lastLen && len > 200) { stable++; if (stable >= 5) return true; }
        else stable = 0;
        lastLen = len;
        if (i % 10 === 0) process.stdout.write(`  ⏳ ${i}s len=${len}\n`);
      }
      return false;
    },
    extractAnswer: async (page) => {
      return await page.evaluate(() => {
        const items = document.querySelectorAll('[data-message-id]');
        if (items.length === 0) return '';
        return (items[items.length - 1].innerText || '').trim();
      });
    },
    extractLinks: async (page) => {
      return await page.evaluate(() => {
        const links = []; const seen = new Set();
        const items = document.querySelectorAll('[data-message-id]');
        if (items.length > 0) {
          items[items.length - 1].querySelectorAll('a').forEach(a => {
            const url = a.href; const text = (a.textContent || '').trim();
            if (url && !seen.has(url)) { seen.add(url); links.push({ text: text || url, url }); }
          });
        }
        document.querySelectorAll('[class*="ref"],[class*="source"],[class*="search"],[class*="citation"]').forEach(el => {
          el.querySelectorAll('a').forEach(a => {
            const url = a.href; const text = (a.textContent || '').trim();
            if (url && !seen.has(url)) { seen.add(url); links.push({ text: text || url, url }); }
          });
        });
        return links;
      });
    }
  }
};

async function sendQuestion(page, platform, cfg, question) {
  // Kimi：按 Escape 关弹窗，再 JS click 绕过覆盖层
  if (platform === 'kimi') {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const el = document.querySelector('div[contenteditable="true"].chat-input-editor');
      if (el) el.click();
    });
    await page.waitForTimeout(500);
  }

  const input = page.locator(cfg.inputSel).first();
  await input.click({ force: true });
  await page.waitForTimeout(300);

  if (cfg.inputSel === 'textarea') {
    await input.fill(question);
  } else {
    // contenteditable 先清空再输入
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) { el.innerText = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }, cfg.inputSel);
    await page.waitForTimeout(200);
    await input.type(question, { delay: 20 });
  }
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
}

async function main() {
  const args = process.argv.slice(2);
  let platformName = 'kimi';
  let questionsFile = 'assets/questions.json';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--platform') platformName = args[i + 1];
    if (args[i] === '--questions') questionsFile = args[i + 1];
  }

  const cfg = PLATFORMS[platformName];
  if (!cfg) {
    console.error(`未知平台: ${platformName}，支持: ${Object.keys(PLATFORMS).join(', ')}`);
    process.exit(1);
  }

  const questions = JSON.parse(fs.readFileSync(questionsFile, 'utf8')).questions;
  if (!fs.existsSync('results')) fs.mkdirSync('results');

  console.log(`\n[批量测试] 平台: ${platformName} | 问题数: ${questions.length}\n`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ storageState: cfg.authFile });
  const page = await context.newPage();

  await page.goto(cfg.url);
  console.log('页面已打开，等待加载...');
  await page.waitForTimeout(5000);

  const inputVisible = await page.locator(cfg.inputSel).first().isVisible({ timeout: 15000 }).catch(() => false);
  if (!inputVisible) {
    console.error('❌ 未找到输入框，请检查登录态');
    await browser.close();
    process.exit(1);
  }
  console.log('✅ 登录态有效，开始批量测试...\n');

  for (const q of questions) {
    const outFile = `results/${platformName}-q${q.id}.md`;
    console.log(`[Q${q.id}] ${q.question}`);

    // 记录发送前的回答数量
    const prevCount = await cfg.countAnswers(page);

    await sendQuestion(page, platformName, cfg, q.question);
    await page.waitForTimeout(2000);

    console.log(`[Q${q.id}] 等待AI回答...`);
    const ok = await cfg.waitForAnswer(page, prevCount);
    if (!ok) console.log(`[Q${q.id}] ⚠️ 等待超时，尝试提取现有内容`);

    const answer = await cfg.extractAnswer(page);
    console.log(`[Q${q.id}] 回答字数: ${answer.length}`);

    // 提取参考信源链接
    const links = cfg.extractLinks ? await cfg.extractLinks(page) : [];
    console.log(`[Q${q.id}] 提取到 ${links.length} 条参考链接`);

    // 保存回答 + 参考信源
    const linksMd = links.length > 0
      ? '\n\n## 参考信源\n' + links.map(l => `- [${l.text}](${l.url})`).join('\n')
      : '';
    fs.writeFileSync(outFile,
      `# ${platformName} 测试结果 - 问题${q.id}\n\n## 问题\n${q.question}\n\n## AI 完整回答\n\n${answer}${linksMd}\n`,
      'utf8'
    );
    console.log(`[Q${q.id}] ✅ 已保存 → ${outFile}\n`);

    // 间隔 5 秒，避免限流
    await page.waitForTimeout(5000);
  }

  console.log('[批量测试] 🎉 全部完成！');
  await browser.close();
}

main().catch(e => {
  console.error('❌ 错误:', e.message);
  console.error(e.stack);
  process.exit(1);
});
