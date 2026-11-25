import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'vite';

// Render the real component and Product Detail styles with local image fixtures only.
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import Gallery from '/src/components/review/ReviewMediaGallery.tsx';
import styles from '/src/pages/productDetail/ProductDetail.module.css';
const image = (position, shape) => ({imagePosition: position, imageUrl: '/__media__/' + shape});
const images = [image(4, 'broken'), image(2, 'square'), image(0, 'portrait'), image(3, 'wide'), image(1, 'landscape')];
const root = createRoot(document.getElementById('root'));
window.renderGallery = (product = 1) => root.render(React.createElement('main', {key: product},
  ...[[], [image(0, 'portrait')], images, images].map((photos, i) => React.createElement('article',
    {key: i, className: styles.review, 'data-review': i},
    React.createElement('div', {className: styles.reviewHeader}, 'Buyer ' + i),
    React.createElement(Gallery, {images: photos, username: 'Buyer ' + i})))));
window.renderGallery();
</script></body></html>`;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => Promise<boolean>, label: string) {
  for (let i = 0; i < 150; i++) { if (await check()) return; await delay(80); }
  throw new Error(`Timed out: ${label}`);
}
type Reply = { result?: { value?: unknown }; exceptionDetails?: unknown; data?: string };
type Pending = { resolve: (value: Reply) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
const pending = new Map<number, Pending>();
const exceptions: unknown[] = [];
let browser: ChildProcess | undefined;
let socket: WebSocket | undefined;
let profile: string | undefined;
let passed = 0;
const vite = await createServer({ plugins: [{ name: 'review-media-fixture', configureServer(server) {
  server.middlewares.use(async (request, response, next) => {
    if (request.url === '/__gallery__') {
      response.setHeader('Content-Type', 'text/html');
      response.end(await server.transformIndexHtml('/__gallery__', fixture)); return;
    }
    if (!request.url?.startsWith('/__media__/')) { next(); return; }
    if (request.url.endsWith('broken')) { response.statusCode = 404; response.end(); return; }
    const shape = request.url.split('/').pop();
    const [width, height] = shape === 'portrait' ? [600, 1000] : shape === 'landscape' ? [1000, 600]
      : shape === 'wide' ? [1200, 300] : [800, 800];
    response.setHeader('Content-Type', 'image/svg+xml');
    response.end(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#d9e5fa"/><text x="20" y="60" font-size="30">${shape}</text></svg>`);
  });
} }], server: { host: '127.0.0.1', port: 0, open: false } });
try {
  await vite.listen();
  const address = vite.httpServer?.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const executable = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium']
    .find(value => value && existsSync(value));
  assert.ok(executable, 'Set CHROME_PATH to an installed Chromium browser');
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'stationery-review-media-'));
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  await until(async () => existsSync(path.join(profile!, 'DevToolsActivePort')), 'browser startup');
  const port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
  const tab = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json()) as { webSocketDebuggerUrl: string };
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => { socket!.onopen = () => resolve(); socket!.onerror = reject; });
  let next = 0;
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(String(data)) as { id: number; method?: string; params?: unknown; error?: unknown; result: Reply };
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params);
    const entry = pending.get(message.id);
    if (entry) { clearTimeout(entry.timer); pending.delete(message.id);
      if (message.error) entry.reject(new Error(JSON.stringify(message.error))); else entry.resolve(message.result); }
  };
  const send = (method: string, params = {}): Promise<Reply> => new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket!.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async <T,>(expression: string): Promise<T> => {
    const reply = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (reply.exceptionDetails) throw new Error(JSON.stringify(reply.exceptionDetails));
    return reply.result?.value as T;
  };
  const read = <T,>(expression: string, review = 2) => evaluate<T>(`(() => { const r = document.querySelector('[data-review="${review}"]'); return (${expression}); })()`);
  const click = async (selector: string, review = 2) => {
    await read(`r.querySelector(${JSON.stringify(selector)}).click()`, review); await delay(40);
  };
  const count = (review = 2) => read<string>('r.querySelector("[role=status]")?.textContent.trim()', review);
  const test = async (label: string, run: () => Promise<void>) => { await run(); passed++; console.log(`PASS ${label}`); };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__requests = []; const nativeFetch = window.fetch; window.fetch = (...args) => { window.__requests.push(String(args[0])); return nativeFetch(...args); };' });
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: base + '/__gallery__' });
  await until(() => evaluate<boolean>('document.querySelectorAll("article").length === 4'), 'gallery fixture');
  await test('Empty, single and maximum-image reviews start collapsed; thumbnails are sorted and grouped', async () => {
    assert.equal(await read('r.querySelector("section")', 0), null);
    assert.equal(await read('r.querySelectorAll("button").length', 1), 1);
    assert.equal(await read('r.querySelectorAll("button").length'), 5);
    assert.equal(await evaluate('document.querySelectorAll("[role=group]").length'), 0);
    assert.equal(await read('r.querySelector("img").getAttribute("src")'), '/__media__/portrait');
    const layout = await read<number[]>('Array.from(r.querySelectorAll("button")).slice(0,2).map(n=>n.getBoundingClientRect().x)');
    assert.equal(layout[1] - layout[0], 98);
    assert.equal(await read('r.querySelector("button").getBoundingClientRect().width'), 88);
  });
  await test('Inline selection, navigation boundaries, highlight and image counter', async () => {
    await click('button'); assert.equal(await count(), '1/5');
    assert.equal(await read(`r.querySelector('[aria-label="Ảnh trước"]').disabled`), true);
    await click('[aria-label="Ảnh tiếp theo"]'); assert.equal(await count(), '2/5');
    assert.equal(await read('r.querySelectorAll("button[aria-pressed=true]").length'), 1);
    await click('button:nth-child(5)'); assert.equal(await count(), '5/5');
    assert.equal(await read(`r.querySelector('[aria-label="Ảnh tiếp theo"]').disabled`), true);
    await until(() => read<boolean>('!!r.querySelector("[role=group] [role=img]")'), 'broken-image fallback');
    assert.equal(await read('r.querySelectorAll("a").length'), 0);
    assert.equal(await evaluate('location.pathname'), '/__gallery__');
  });
  await test('Repeated thumbnail, close button, Escape and arrow keyboard controls', async () => {
    await click('button:nth-child(5)'); assert.equal(await read('r.querySelector("[role=group]")'), null);
    await click('button'); await click('[aria-label="Đóng trình xem ảnh"]');
    assert.equal(await read('r.querySelector("[role=group]")'), null);
    assert.equal(await read('r.querySelector("button") === document.activeElement'), true);
    await click('button'); await read('r.querySelector("button").focus()');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' });
    await delay(40); assert.equal(await count(), '2/5');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    await delay(40); assert.equal(await read('r.querySelector("[role=group]")'), null);
    assert.equal(await read('r.querySelectorAll("button")[1] === document.activeElement'), true);
  });
  await test('Single image has no arrows; reviews retain independent state', async () => {
    await click('button', 1); await click('button', 2); await click('button:nth-child(3)', 3);
    assert.equal(await count(1), '1/1'); assert.equal(await count(2), '1/5'); assert.equal(await count(3), '3/5');
    assert.equal(await read('r.querySelectorAll("[role=group] button").length', 1), 1);
    await click('[aria-label="Đóng trình xem ảnh"]', 2); assert.equal(await count(3), '3/5');
  });
  await test('Portrait, landscape and square previews preserve proportions and fit desktop/mobile', async () => {
    for (const width of [1200, 375]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 });
      for (let index = 0; index < 4; index++) {
        await click(`button:nth-child(${index + 1})`);
        await until(() => read<boolean>('!!r.querySelector("[role=group] > img")?.naturalWidth'), 'image dimensions');
        const size = await read<number[]>('(() => { const n=r.querySelector("[role=group] > img"); const b=n.getBoundingClientRect(); return [b.width,b.height,n.naturalWidth,n.naturalHeight]; })()');
        assert.ok(size[0] <= 500 && size[1] <= 500);
        assert.ok(Math.abs(size[0] / size[1] - size[2] / size[3]) < .01);
        assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
      }
      await click('[aria-label="Đóng trình xem ảnh"]');
    }
  });
  await test('Interactions make no API calls; product remount resets galleries', async () => {
    assert.deepEqual(await evaluate('window.__requests.filter(url=>url.includes("/api/"))'), []);
    await evaluate('window.renderGallery(2)'); await delay(40);
    assert.equal(await evaluate('document.querySelectorAll("[role=group]").length'), 0);
    assert.deepEqual(exceptions, []);
  });
  console.log(`${passed} review media browser checks passed.`);
} finally {
  socket?.close(); browser?.kill(); await vite.close();
  // Keep Chromium's temporary profile if Windows still has its files open.
  if (profile && path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir())
    && path.basename(profile).startsWith('stationery-review-media-')) {
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  }
}
