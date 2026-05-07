const { chromium } = require('playwright');
const fs = require('fs');

/**
 * 精确补跑单题 - 等待新回答出现后才开始计时
 * 用法：node scripts/fix-questions.js --platform kimi --questions 7,10
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
      // 先等新答案出现（count增加）
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(1000);
        const count = await page.evaluate(() => document.querySelectorAll('[data-virtual-list-item-key]').length);
        if (count > prevCount) { console.log(`  新回答出现，count=${count}`); break; }
        if (i % 5 === 0) process.stdout.write(`  等新答案 ${i}s count=${count}/${prevCount}\n`);
      }
      // 然后等长度稳定
      let lastLen = 0, stable = 0;
      for (let i = 0; i < 180; i++) {
        await page.waitForTimeout(1000);
        const len = await page.evaluate(() => {
          const items = document.querySelectorAll('[data-virtual-list-item-key]');
          if (items.length === 0) return 0;
          return (items[items.length - 1].innerText || '').length;
        });
        if (len === lastLen && len > 300) { stable++; if (stable >= 5) return true; }
        else { stable = 0; }
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
            if (url && !seen.has(url) && url.startsWith('http')) {
              seen.add(url); links.push({ text: text || url, url });
            }
          });
        }
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
      // 先等新回答的 .markdown 数量超过 prevCount
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(1000);
        const count = await page.evaluate(() => document.querySelectorAll('.markdown').length);
        if (count > prevCount) { console.log(`  新回答出现，count=${count}`); break; }
        if (i % 5 === 0) process.stdout.write(`  等新答案 ${i}s count=${count}/${prevCount}\n`);
      }
      // 然后等最后一个 .markdown 长度稳定
      let lastLen = 0, stable = 0;
      for (let i = 0; i < 180; i++) {
        await page.waitForTimeout(1000);
        const len = await page.evaluate(() => {
          const mds = document.querySelectorAll('.markdown');
          if (mds.length === 0) return 0;
          return (mds[mds.length - 1].innerText || '').length;
        });
        if (len === lastLen && len > 200) { stable++; if (stable >= 5) return true; }
        else { stable = 0; }
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
      // Kimi的参考链接不在回答<a>标签内，需要点击"引用"按钮展开引用面板
      // 1. 点击 .ref-action 按钮展开引用面板
      const refBtn = await page.$('.ref-action');
      if (refBtn) {
        await refBtn.click();
        await page.waitForTimeout(2000);
      }
      // 2. 从展开的 .ref 面板中提取链接
      return await page.evaluate(() => {
        const links = []; const seen = new Set();
        const refPanel = document.querySelector('.ref');
        if (refPanel) {
          refPanel.querySelectorAll('a').forEach(a => {
            const url = a.href; const text = (a.textContent || '').trim();
            if (url && !seen.has(url) && url.startsWith('http') && !url.includes('kimi.com')) {
              seen.add(url); links.push({ text: text || url, url });
            }
          });
        }
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
      for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(1000);
        const count = await page.evaluate(() => document.querySelectorAll('[data-message-id]').length);
        if (count > prevCount) { console.log(`  新回答出现，count=${count}`); break; }
        if (i % 5 === 0) process.stdout.write(`  等新答案 ${i}s count=${count}/${prevCount}\n`);
      }
      let lastLen = 0, stable = 0;
      for (let i = 0; i < 180; i++) {
        await page.waitForTimeout(1000);
        const len = await page.evaluate(() => {
          const items = document.querySelectorAll('[data-message-id]');
          if (items.length === 0) return 0;
          return (items[items.length - 1].innerText || '').length;
        });
        if (len === lastLen && len > 200) { stable++; if (stable >= 5) return true; }
        else { stable = 0; }
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
      // 豆包的参考链接需要点击"参考 X 篇资料"按钮展开
      // 1. 点击 .entry-btn-title-v3-uM2642 按钮展开参考资料
      const refEntry = await page.$('.entry-btn-title-v3-uM2642');
      if (refEntry) {
        await refEntry.click();
        await page.waitForTimeout(2000);
      }
      // 2. 提取新出现的外部链接（排除doubao.com自身链接）
      return await page.evaluate(() => {
        const links = []; const seen = new Set();
        document.querySelectorAll('a').forEach(a => {
          const url = a.href; const text = (a.textContent || '').trim();
          if (url && !seen.has(url) && url.startsWith('http') && !url.includes('doubao.com')) {
            seen.add(url);
            // 清理text中的多余空白
            const cleanText = text.replace(/\s+/g, ' ').substring(0, 100);
            links.push({ text: cleanText || url, url });
          }
        });
        return links;
      });
    }
  }
};

async function sendQuestion(page, platform, cfg, question) {
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
  let targetQids = [];
  let questionsFile = 'assets/questions.json';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--platform') platformName = args[i + 1];
    if (args[i] === '--questions') {
      // 如果是文件路径
      if (args[i+1].endsWith('.json')) {
        questionsFile = args[i + 1];
      } else {
        // 否则是题目ID列表
        targetQids = args[i + 1].split(',').map(Number);
      }
    }
  }

  const cfg = PLATFORMS[platformName];
  if (!cfg) { console.error(`未知平台: ${platformName}`); process.exit(1); }

  const allQuestions = JSON.parse(fs.readFileSync(questionsFile, 'utf8')).questions;
  if (!fs.existsSync('results')) fs.mkdirSync('results');

  const pending = targetQids.length > 0
    ? allQuestions.filter(q => targetQids.includes(q.id))
    : allQuestions;

  console.log(`\n[精确补跑] 平台: ${platformName} | 问题: Q${pending.map(q=>q.id).join(', Q')}\n`);

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
  console.log('✅ 登录态有效，开始运行...\n');

  for (const q of pending) {
    const outFile = `results/${platformName}-q${q.id}.md`;
    console.log(`\n[Q${q.id}] ${q.question}`);

    // 记录发送前的回答数量
    const prevCount = await cfg.countAnswers(page);
    console.log(`  发送前回答数: ${prevCount}`);

    await sendQuestion(page, platformName, cfg, q.question);
    await page.waitForTimeout(2000);

    console.log(`[Q${q.id}] 等待AI回答...`);
    const ok = await cfg.waitForAnswer(page, prevCount);
    if (!ok) console.log(`[Q${q.id}] ⚠️ 等待超时，提取现有内容`);

    const answer = await cfg.extractAnswer(page);
    console.log(`[Q${q.id}] 回答字数: ${answer.length}`);

    // 提取参考信源链接
    const links = cfg.extractLinks ? await cfg.extractLinks(page) : [];
    console.log(`[Q${q.id}] 参考信源: ${links.length} 条`);

    const linksMd = links.length > 0
      ? '\n\n## 参考信源\n' + links.map(l => `- [${l.text}](${l.url})`).join('\n')
      : '';

    fs.writeFileSync(outFile,
      `# ${platformName} 测试结果 - 问题${q.id}\n\n## 问题\n${q.question}\n\n## AI 完整回答\n\n${answer}${linksMd}\n`,
      'utf8'
    );
    console.log(`[Q${q.id}] ✅ 已保存 → ${outFile}`);

    if (q !== pending[pending.length - 1]) {
      console.log('  ⏸ 间隔5秒...');
      await page.waitForTimeout(5000);
    }
  }

  console.log('\n[精确补跑] 🎉 完成！');
  await browser.close();
}

main().catch(e => {
  console.error('❌ 错误:', e.message);
  console.error(e.stack);
  process.exit(1);
});
