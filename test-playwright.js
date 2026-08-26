const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });
  const page = await browser.newPage();
  await page.goto('https://www.linkedin.com');
  console.log('Page title:', await page.title());
  await browser.close();
  console.log('Playwright works with your Chrome!');
})();
