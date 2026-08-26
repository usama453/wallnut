const LinkedInAutomation = require('./linkedin-automation');
require('dotenv').config();

async function test() {
  const linkedin = new LinkedInAutomation({
    email: process.env.LINKEDIN_EMAIL,
    password: process.env.LINKEDIN_PASSWORD
  });

  process.on('SIGINT', async () => {
    console.log('\nClosing...');
    await linkedin.close();
    process.exit(0);
  });

  try {
    await linkedin.launch();
    console.log('Browser opened');
    
    await linkedin.page.goto('https://www.linkedin.com', { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('On LinkedIn, URL:', linkedin.page.url());
    
    // Check if already logged in
    if (linkedin.page.url().includes('/feed/')) {
      console.log('Already logged in!');
    } else {
      console.log('Please log in manually in the browser');
      console.log('Press Enter here when done...');
      await new Promise(resolve => process.stdin.once('data', resolve));
      console.log('Logged in!');
    }

    console.log('Ready. Press Ctrl+C to close.');
    await new Promise(() => {});
  } catch (err) {
    console.error('Error:', err.message);
    await linkedin.close();
  }
}

test();