const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

class LinkedInAutomation {
  constructor(options = {}) {
    this.email = options.email;
    this.password = options.password;
    this.browser = null;
    this.page = null;
    this.loggedIn = false;
  }

  async launch() {
    // Use a dedicated automation profile (copy of your profile)
    const userDataDir = '/Users/apple/Library/Application Support/Google/Chrome/PlaywrightAutomation';
    
    this.browser = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check'
      ],
      viewport: { width: 1280, height: 800 }
    });

    this.page = this.browser.pages()[0] || await this.browser.newPage();
    
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
  }

  async login() {
    if (!this.email || !this.password) {
      throw new Error('Email and password required for login');
    }

    await this.page.goto('https://www.linkedin.com/login');
    await this.page.waitForSelector('#username');
    
    await this.page.fill('#username', this.email);
    await this.page.fill('#password', this.password);
    await this.page.click('button[type="submit"]');
    
    try {
      await this.page.waitForURL('https://www.linkedin.com/feed/', { timeout: 30000 });
      this.loggedIn = true;
      console.log('Logged in successfully');
    } catch (e) {
      const errorText = await this.page.textContent('body').catch(() => '');
      if (errorText.includes('challenge') || errorText.includes('verification')) {
        console.log('2FA/Challenge required - please complete manually in the browser');
        await this.page.waitForURL('https://www.linkedin.com/feed/', { timeout: 120000 });
        this.loggedIn = true;
      } else {
        throw new Error('Login failed: ' + errorText);
      }
    }
  }

  async uploadImage(imagePath) {
    if (!this.loggedIn) await this.login();

    const absolutePath = path.resolve(imagePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Image not found: ${absolutePath}`);
    }

    await this.page.goto('https://www.linkedin.com/feed/');
    await this.page.waitForSelector('[data-urn*="share-box"]', { timeout: 10000 });

    const fileInput = await this.page.waitForSelector('input[type="file"]', { timeout: 5000 });
    await fileInput.setInputFiles(absolutePath);

    await this.page.waitForSelector('[data-test-id="media-preview"]', { timeout: 15000 });
    console.log('Image uploaded successfully');
  }

  async postContent(text, imagePath = null) {
    if (!this.loggedIn) await this.login();

    await this.page.goto('https://www.linkedin.com/feed/');
    await this.page.waitForSelector('[data-urn*="share-box"]', { timeout: 10000 });

    if (imagePath) {
      await this.uploadImage(imagePath);
    }

    const editor = await this.page.waitForSelector('[data-placeholder="What do you want to talk about?"]', { timeout: 5000 });
    await editor.click();
    await editor.fill(text);

    const postButton = await this.page.waitForSelector('button[data-test-id="share-submit"]', { timeout: 5000 });
    await postButton.click();

    await this.page.waitForSelector('[data-test-id="toast-success"]', { timeout: 10000 });
    console.log('Post published successfully!');
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

module.exports = LinkedInAutomation;