import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let vite, browser, profile, socket, send, evaluate;
const pending = new Map(), exceptions = [];
const artifacts = fileURLToPath(new URL('../../.cache/scroll-restoration/', import.meta.url));
let passed = 0;
async function until(check, label) { for (let i = 0; i < 150; i++) { if (await check()) return; await delay(80); } throw new Error(`Timed out: ${label}`); }
async function test(label, run) { await run(); passed++; console.log(`PASS ${label}`); }

try {
  vite = await createServer({ plugins: [{ name: 'scroll-probe', configureServer(server) {
    server.middlewares.use((req,res,next)=>{
      if (!req.url?.startsWith('/scroll-probe')) return next();
      const html='<html><body><div id="root"></div><script type="module" src="/tests/probes/scrollProbe.tsx"></script></body></html>';
      server.transformIndexHtml(req.url,html).then(page=>{res.setHeader('Content-Type','text/html');res.end(page);}).catch(next);
    });
  } }], server: { host: '127.0.0.1', port: 0, open: false } }); await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const executable = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(value => value && existsSync(value));
  assert.ok(executable, 'Set CHROME_PATH to an installed Chromium browser');
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'stationery-scroll-test-'));
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  await until(() => existsSync(path.join(profile, 'DevToolsActivePort')), 'browser startup');
  let port;
  await until(async () => { try {
    port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
    return /^\d+$/.test(port);
  } catch { return false; } }, 'readable browser port');
  const tab = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then(response => response.json());
  socket = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let next = 0;
  socket.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.method === 'Runtime.exceptionThrown') exceptions.push(msg.params.exceptionDetails);
    const entry = pending.get(msg.id); if (entry) { clearTimeout(entry.timer); pending.delete(msg.id); msg.error ? entry.reject(new Error(JSON.stringify(msg.error))) : entry.resolve(msg.result); }
  };
  send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++next; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout ${method}`)); }, 15000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
  evaluate = async expression => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });


  await send('Page.navigate', { url: base + '/scroll-probe/search?sort=price' });
  const ready = route => until(() => evaluate(`document.querySelector('main')?.dataset.ready === ${JSON.stringify('/scroll-probe/' + route)}`), 'content ' + route);
  const scroll = async y => { await evaluate(`window.scrollTo({top:${y},behavior:'instant'})`); await delay(100); };
  const near = async y => assert.ok(Math.abs((await evaluate('scrollY')) - y) < 2, `Expected scroll ${y}, got ${await evaluate('scrollY')}`);
  await ready('search');
  await evaluate('window.__spaMarker=1');
  await test('Path navigation resets immediately; Back restores after delayed content', async () => {
    await scroll(900); await click('#detail'); await ready('products/one'); await near(0);
    await scroll(450); await evaluate('history.back()'); await ready('search');
    await until(async () => Math.abs((await evaluate('scrollY')) - 900) < 2, 'Back position');
    assert.equal(await evaluate('location.search'), '?sort=price');
    await evaluate('history.forward()'); await ready('products/one');
    await until(async () => Math.abs((await evaluate('scrollY')) - 450) < 2, 'Forward position');
  });
  await test('Query changes and modal open/close keep current position', async () => {
    await scroll(700); await click('#query'); await delay(100); await near(700);
    await click('#toggle'); await delay(100); await near(700);
    await click('#toggle'); await delay(100); await near(700);
  });
  await test('Admin route navigation also resets to top', async () => {
    await click('#admin'); await ready('dashboard'); await near(0);
    await scroll(600); await click('#search'); await ready('search'); await near(0);
  });
  await test('Same-page and delayed cross-route anchors remain functional', async () => {
    await click('#anchor'); await delay(100); await near(1800);
    await click('#query'); await delay(100); await near(1800);
    await click('#cross-anchor'); await ready('other');
    await until(async () => Math.abs((await evaluate('scrollY')) - 1800) < 2, 'delayed anchor');
  });
  assert.equal(await evaluate('window.__spaMarker'), 1);
  assert.deepEqual(exceptions, []);
  console.log(`${passed} targeted scroll restoration browser checks passed.`);

} catch (error) {
  console.error(error); process.exitCode = 1;
  if (send) { const { data } = await send('Page.captureScreenshot', { format: 'png' }).catch(() => ({})); if (data) { await fs.mkdir(artifacts, { recursive: true }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(data, 'base64')); } }
} finally {
  if (send) await send('Browser.close').catch(() => {}); socket?.close(); browser?.kill(); if (vite) await vite.close();
  if (profile && path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('stationery-scroll-test-')) { await delay(300); await fs.rm(profile, { recursive: true, force: true, maxRetries: 4 }).catch(() => {}); }
}
