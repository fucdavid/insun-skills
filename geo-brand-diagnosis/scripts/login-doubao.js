const { chromium } = require('playwright');

/**
 * 豆包（Doubao）登录保存脚本
 * 用法：node scripts/login-doubao.js
 *
 * 功能：
 * 1. 打开豆包（非无头模式）
 * 2. 等待用户手动登录
 * 3. 自动检测登录成功（有输入框）
 * 4. 保存登录态到 doubao-auth.json
 */

const DOUBAO_URL = 'https://www.doubao.com/chat/';
const AUTH_FILE = 'doubao-auth.json';

(async () => {
  console.log('[豆包 登录] 启动浏览器...');
  console.log('[豆包 登录] 请在打开的浏览器中手动登录豆包');
  console.log('[豆包 登录] 登录成功后脚本会自动检测并保存登录态');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(DOUBAO_URL);
  console.log('[豆包 登录] 已打开豆包，等待登录...');

  // 每3秒检测一次登录状态
  let loggedIn = false;
  const checkInterval = setInterval(async () => {
    try {
      const result = await page.evaluate(() => {
        // 豆包登录后会出现 textarea 输入框
        const hasInput = !!document.querySelector('textarea');
        // 检查页面是否显示登录/注册按钮
        const bodyText = document.body.innerText;
        const needsLogin = bodyText.includes('登录') || bodyText.includes('注册');
        return { hasInput, needsLogin };
      });

      console.log(`[豆包 登录] 检测中... hasInput=${result.hasInput}, needsLogin=${result.needsLogin}`);

      // 登录成功：有输入框且无登录提示
      if (result.hasInput && !result.needsLogin) {
        console.log('[豆包 登录] ✅ 登录成功！正在保存登录态...');
        clearInterval(checkInterval);
        loggedIn = true;

        await context.storageState({ path: AUTH_FILE });
        console.log(`[豆包 登录] ✅ 登录态已保存到 ${AUTH_FILE}`);

        await browser.close();
        console.log('[豆包 登录] 浏览器已关闭，脚本结束');
        process.exit(0);
      }
    } catch (e) {
      console.log('[豆包 登录] 检测异常：', e.message);
    }
  }, 3000);

  // 30分钟后超时
  setTimeout(() => {
    if (!loggedIn) {
      console.log('[豆包 登录] ⏰ 超时（30分钟），脚本退出');
      browser.close();
      process.exit(1);
    }
  }, 30 * 60 * 1000);
})();
