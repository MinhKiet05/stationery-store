import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Browser tests for the About page. Start Vite before running this script.
let baseUrl = process.env.TEST_BASE_URL;
let vite;
const workspace = fileURLToPath(new URL('../../', import.meta.url));
const results = [];
const exceptions = [];
const mailtos = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
let profile;
let socket;
let endpoint = process.env.CDP_URL;
let tab;
let send;

async function until(check, description) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await check()) return;
    await delay(100);
  }
  throw new Error(`Timed out: ${description}`);
}

try {
  if (!baseUrl) { vite=await createServer({server:{host:'127.0.0.1',port:0,open:false}});await vite.listen();baseUrl=`http://127.0.0.1:${vite.httpServer.address().port}`; }
  assert.equal((await fetch(`${baseUrl}/about`)).status, 200, 'Vite must be running');
  if (!endpoint) {
    const executable = [process.env.CHROME_PATH,
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      '/usr/bin/google-chrome', '/usr/bin/chromium',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].find(candidate => candidate && existsSync(candidate));
    assert.ok(executable, 'Set CHROME_PATH to a Chromium browser executable');
    profile = await fs.mkdtemp(path.join(os.tmpdir(), 'stationery-about-test-'));
    browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run',
      '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
    { windowsHide: true, stdio: 'ignore' });
    browser.on('error', error => { console.error(error.message); });
    await until(() => existsSync(path.join(profile, 'DevToolsActivePort')), 'Chrome startup');
    const port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
    endpoint = `http://127.0.0.1:${port}`;
  }
  tab = await fetch(`${endpoint}/json/new?about:blank`, { method: 'PUT' }).then(response => response.json());
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
    if (message.method === 'Page.frameRequestedNavigation' && message.params.url.startsWith('mailto:')) mailtos.push(message.params.url);
    if (message.id) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
      else entry.resolve(message.result);
    }
  };
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const navigate = async route => {
    await send('Page.navigate', { url: `${baseUrl}${route}` });
    await until(() => evaluate(`location.pathname === ${JSON.stringify(route.split('#')[0])} && document.readyState === 'complete' && Boolean(document.querySelector('#about-title'))`), route);
    await delay(100);
  };
  const click = async selector => {
    const point = await evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) throw new Error('Missing element: ' + ${JSON.stringify(selector)});
      element.scrollIntoView({block:'center'});
      const rect = element.getBoundingClientRect();
      return {x:rect.left + rect.width / 2, y:rect.top + rect.height / 2};
    })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    await delay(60);
  };
  const type = async (selector, value) => {
    await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); element.scrollIntoView({block:'center'}); element.focus(); element.select(); })()`);
    await send('Input.insertText', { text: value });
    await delay(30);
  };
  const test = async (name, run) => {
    try { await run(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
    catch (error) { results.push({ name, passed: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
  };
  const validForm = async () => {
    await type('main input[name="name"]', 'Nguyễn Văn An');
    await type('main input[name="email"]', 'an@example.com');
    await evaluate(`document.querySelector('select[name="subject"]').value = 'Tư vấn sản phẩm'`);
    await type('main textarea', 'Tôi muốn tư vấn bộ quà tặng & sổ tay.\nXin cảm ơn!');
  };
  const formIsValid = () => evaluate('document.querySelector("main form").checkValidity()');
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`const originalFetch=window.fetch.bind(window);window.fetch=(input,options)=>new URL(typeof input==='string'?input:input.url,location.href).pathname.startsWith('/api/')?Promise.resolve(Response.json(new URL(typeof input==='string'?input:input.url,location.href).pathname==='/api/product-types'?[]:{content:[],products:[],source:'FALLBACK'})):originalFetch(input,options);`});
  await send('Emulation.setDeviceMetricsOverride', { width: 1296, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate('/about');

  await test('Vietnamese page title and main landmark', async () => {
    assert.equal(await evaluate('document.title'), 'Giới thiệu & Liên hệ | StationeryStore');
    assert.equal(await evaluate('document.querySelectorAll("main").length'), 1);
  });
  await test('Hero contact button scrolls to contact', async () => {
    await click('main a[href$="#contact"]');
    assert.equal(await evaluate('location.hash'), '#contact');
    assert.ok(Math.abs(await evaluate('document.querySelector("#contact").getBoundingClientRect().top')) < 40);
  });
  await test('Hero values button scrolls to values', async () => {
    await click('main a[href$="#values"]');
    assert.equal(await evaluate('location.hash'), '#values');
    assert.ok(Math.abs(await evaluate('document.querySelector("#values").getBoundingClientRect().top')) < 40);
  });
  await test('FAQ opens, answers expand, and FAQ closes', async () => {
    await click('[aria-controls="about-faq"]');
    assert.equal(await evaluate('document.querySelector("[aria-controls=about-faq]").getAttribute("aria-expanded")'), 'true');
    await click('#about-faq details summary');
    assert.equal(await evaluate('document.querySelector("#about-faq details").open'), true);
    await click('[aria-controls="about-faq"]');
    assert.equal(await evaluate('Boolean(document.querySelector("#about-faq"))'), false);
  });
  await test('Footer FAQ link opens FAQ on the current page', async () => {
    await click('footer a[href="/about#faq"]');
    assert.equal(await evaluate('Boolean(document.querySelector("#about-faq"))'), true);
  });
  for (const route of ['/about#faq', '/about-us', '/gioi-thieu', '/about/', '/contact', '/lien-he']) {
    await test(`Direct route ${route}`, async () => {
      await navigate(route);
      if (route.endsWith('#faq')) assert.equal(await evaluate('Boolean(document.querySelector("#about-faq"))'), true);
      if (route === '/contact' || route === '/lien-he') assert.ok(Math.abs(await evaluate('document.querySelector("#contact").getBoundingClientRect().top')) < 40);
    });
  }
  await navigate('/about');
  await test('Empty form is rejected', async () => {
    await click('main button[type="submit"]');
    assert.equal(await formIsValid(), false);
    assert.equal(await evaluate('Boolean(document.querySelector("main [role=status]"))'), false);
  });
  await test('Whitespace-only name is rejected', async () => {
    await validForm();
    await type('main input[name="name"]', '     ');
    assert.equal(await formIsValid(), false);
  });
  await test('Malformed email is rejected', async () => {
    await validForm();
    await type('main input[name="email"]', 'not-an-email');
    assert.equal(await formIsValid(), false);
  });
  await test('Subject is required', async () => {
    await validForm();
    await evaluate('document.querySelector("select[name=subject]").value = ""');
    assert.equal(await formIsValid(), false);
  });
  await test('Message shorter than 10 characters is rejected', async () => {
    await validForm();
    await type('main textarea', 'abc');
    assert.equal(await formIsValid(), false);
  });
  await test('Whitespace-only message is rejected', async () => {
    await validForm();
    await type('main textarea', '                    ');
    assert.equal(await formIsValid(), false);
  });
  await test('Message is limited to 500 characters and counter updates', async () => {
    await type('main textarea', 'a'.repeat(550));
    assert.equal(await evaluate('document.querySelector("main textarea").value.length'), 500);
    assert.ok((await evaluate('document.querySelector("main textarea").previousElementSibling.textContent')).includes('500 / 500'));
  });
  await test('Optional phone can be empty', async () => {
    await validForm();
    assert.equal(await formIsValid(), true);
  });
  await test('Valid form prepares a correctly encoded email', async () => {
    await validForm();
    await click('main input[name="newsletter"]');
    const before = mailtos.length;
    await click('main button[type="submit"]');
    await until(() => Promise.resolve(mailtos.length > before), 'mailto navigation');
    const url = new URL(mailtos.at(-1));
    assert.equal(url.pathname, 'cskh@stationerystore.vn');
    assert.equal(url.searchParams.get('subject'), '[StationeryStore] Tư vấn sản phẩm');
    const body = url.searchParams.get('body');
    assert.ok(body.includes('Nguyễn Văn An'));
    assert.ok(body.includes('an@example.com'));
    assert.ok(body.includes('quà tặng & sổ tay.\nXin cảm ơn!'));
    assert.ok(body.includes('ưu đãi: Có'));
    assert.ok(body.includes('Không cung cấp'));
    assert.ok((await evaluate('document.querySelector("main [role=status]").textContent')).includes('bấm Gửi trong ứng dụng email'));
  });
  await test('Editing form clears previous email preparation notice', async () => {
    await type('main input[name="email"]', 'changed@example.com');
    assert.equal(await evaluate('Boolean(document.querySelector("main [role=status]"))'), false);
  });
  await test('Map and branch links point to Google Maps', async () => {
    const urls = await evaluate('Array.from(document.querySelectorAll("main a[href*=google]"), a => a.href)');
    assert.ok(urls.length >= 2, 'Map and branch destinations are present');
    assert.ok(urls.every(url => new URL(url).hostname === 'www.google.com'));
    assert.ok(urls.some(url => new URL(url).searchParams.get('query').includes('Nguyen Hue')));
  });
  await test('Hotline and email links have valid destinations', async () => {
    assert.equal(await evaluate('document.querySelector("main a[href^=tel]").getAttribute("href")'), 'tel:19006868');
    assert.equal(await evaluate('document.querySelector("main a[href^=mailto]").getAttribute("href")'), 'mailto:cskh@stationerystore.vn');
  });
  await test('All page images load from local assets', async () => {
    await evaluate('document.querySelector("main img[loading=lazy]").scrollIntoView()');
    await evaluate('document.querySelector("[class*=mapCanvas]").scrollIntoView()');
    await until(() => evaluate('Array.from(document.querySelectorAll("main img")).every(img => img.complete && img.naturalWidth > 0)'), 'images');
    assert.ok(await evaluate('document.querySelectorAll("main img").length > 0 && Array.from(document.querySelectorAll("main img")).every(img => new URL(img.src).origin === location.origin)'), 'Every content image is served locally');
  });
  for (const width of [320, 390, 768, 1024, 1296, 1536]) {
    await test(`No horizontal scrolling at ${width}px`, async () => {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
      await delay(60);
      const sizes = await evaluate('({ viewport: innerWidth, document: document.documentElement.scrollWidth })');
      assert.ok(sizes.document <= sizes.viewport, JSON.stringify(sizes));
    });
  }
  await test('Footer store link scrolls to store details', async () => {
    await click('footer a[href="/about#stores"]');
    assert.equal(await evaluate('location.hash'), '#stores');
    assert.ok(Math.abs(await evaluate('document.querySelector("#stores").getBoundingClientRect().top')) < 40);
  });
  await test('No uncaught JavaScript errors', async () => assert.equal(exceptions.length, 0, JSON.stringify(exceptions)));
  const report = { baseUrl, passed: results.filter(item => item.passed).length, failed: results.filter(item => !item.passed).length, results };
  await fs.mkdir(path.join(workspace, '.cache'), { recursive: true });
  await fs.writeFile(path.join(workspace, '.cache/about-functional-results.json'), JSON.stringify(report, null, 2));
  console.log(`\n${report.passed} passed, ${report.failed} failed`);
  process.exitCode = report.failed ? 1 : 0;
} finally {
  if (send && socket?.readyState === WebSocket.OPEN) {
    if (browser) await send('Browser.close').catch(() => {});
    else if (tab) await fetch(`${endpoint}/json/close/${tab.id}`).catch(() => {});
  }
  socket?.close();
  if (browser) browser.kill();
  if (vite) await vite.close();
  // The randomly allocated browser profile is left in the system temp folder.
  // Avoid recursive cleanup while Chromium's background processes may be exiting.
}
