const { chromium } = require('playwright');

/**
 * Kimi 登录保存脚本
 * 用法：node scripts/login-kimi.js
 *
 * 功能：
 * 1. 打开 Kimi（非无头模式）
 * 2. 等待用户手动登录
 * 3. 自动检测登录成功（有输入框 && 无登录按钮）
 * 4. 保存登录态到 kimi-auth.json
 */

const KIMI_URL = 'https://www.kimi.com';
const AUTH_FILE = 'kimi-auth.json';

(async () => {
  console.log('[Kimi 登录] 启动浏览器...');
  console.log('[Kimi 登录] 请在打开的浏览器中手动登录 Kimi');
  console.log('[Kimi 登录] 登录成功后脚本会自动检测并保存登录态');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(KIMI_URL);
  console.log('[Kimi 登录] 已打开 Kimi，等待登录...');

  // 每3秒检测一次登录状态
  let loggedIn = false;
  const checkInterval = setInterval(async () => {
    try {
      const result = await page.evaluate(() => {
        const hasInput = !!document.querySelector('div[contenteditable="true"]');
        const hasLoginBtn = !!document.querySelector('button');
        const btnText = document.body.innerText;
        const needsLogin = btnText.includes('登录') || btnText.includes('注册');
        return { hasInput, needsLogin };
      });

      console.log(`[Kimi 登录] 检测中... hasInput=${result.hasInput}, needsLogin=${result.needsLogin}`);

      if (result.hasInput && !result.needsLogin) {
        console.log('[Kimi 登录] ✅ 登录成功！正在保存登录态...');
        clearInterval(checkInterval);
        loggedIn = true;

        await context.storageState({ path: AUTH_FILE });
        console.log(`[Kimi 登录] ✅ 登录态已保存到 ${AUTH_FILE}`);

        await browser.close();
        console.log('[Kimi 登录] 浏览器已关闭，脚本结束');
        process.exit(0);
      }
    } catch (e) {
      // 页面可能已关闭
      console.log('[Kimi 登录] 检测异常：', e.message);
    }
  }, 3000);

  // 30分钟后超时
  setTimeout(() => {
    if (!loggedIn) {
      console.log('[Kimi 登录] ⏰ 超时（30分钟），脚本退出');
      browser.close();
      process.exit(1);
    }
  }, 30 * 60 * 1000);
})();
