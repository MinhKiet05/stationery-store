import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Fixtures exist only inside this browser test. Every API call is intercepted;
// no credentials, production reads/writes, or real login are used.
function mockApi() {
  const nativeFetch = window.fetch.bind(window);
  if (!sessionStorage.getItem('dashboard-test-initialized')) {
    localStorage.setItem('accessToken', 'browser-test-token');
    sessionStorage.setItem('dashboard-test-initialized', 'true');
  }
  window.__requests = [];
  window.__unexpected = [];
  window.__failure = null;
  window.__empty = false;
  window.__delay = Number(sessionStorage.getItem('identity-delay') || 0);
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (!url.pathname.startsWith('/api/')) return nativeFetch(input, options);
    const route = url.pathname;
    window.__requests.push({ route, query: Object.fromEntries(url.searchParams), authorization: new Headers(options.headers).get('Authorization') });
    options.signal?.throwIfAborted();
    if (window.__failure?.route === route) return Response.json({ detail: 'SQL password=private-diagnostic' }, { status: window.__failure.status });
    if (route === '/api/auth/me') {
      await new Promise(resolve => setTimeout(resolve, window.__delay));
      options.signal?.throwIfAborted();
      return Response.json({ userID: 1, username: 'test-admin', fullName: 'Quản trị kiểm thử', email: 'admin@example.test', role: sessionStorage.getItem('test-role') || 'ADMIN' });
    }
    const range = { startDate: url.searchParams.get('startDate'), endDate: url.searchParams.get('endDate') };
    if (route === '/api/admin/statistics/overview') return Response.json({ ...range, totalOrders: window.__empty ? 0 : 12, successfulOrders: 4, totalRevenue: window.__empty ? 0 : 9876543, totalDiscount: 0, quantitySold: 5, totalCustomers: 34, newCustomers: 2 });
    if (route === '/api/admin/statistics/revenue') return Response.json({ ...range, groupBy: url.searchParams.get('groupBy'), totalRevenue: 9876543, periods: window.__empty ? [] : [
      { periodStart: range.startDate, orderCount: 2, totalRevenue: 1234567 },
      { periodStart: range.endDate, orderCount: 2, totalRevenue: 8641976 },
    ] });
    if (route === '/api/admin/statistics/orders') return Response.json({ ...range, totalOrders: window.__empty ? 0 : 12,
      statusCounts: { PENDING: window.__empty ? 0 : 3, PROCESSING: window.__empty ? 0 : 2, SHIPPED: window.__empty ? 0 : 1, DELIVERED: window.__empty ? 0 : 4, CANCELLED: window.__empty ? 0 : 1, RETURN_PENDING: window.__empty ? 0 : 1 }, returnRequestCounts: { PENDING: 2, APPROVED: 0, REJECTED: 0, COMPLETED: 0 } });
    if (route === '/api/admin/dashboard/orders') {
      const page = Number(url.searchParams.get('page') || 0);
      return Response.json({ content: window.__empty ? [] : Array.from({ length: page ? 2 : 6 }, (_, index) => ({ orderID: 100 - page * 6 - index, orderDate: `${range.endDate}T14:30:00`, customerName: `Khách kiểm thử ${index + 1}`, username: `customer${index}`, totalAmount: 250000 + index * 10000, status: ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURN_PENDING'][index], paymentMethod: 'COD', isPaid: index % 2 === 1 })), totalElements: window.__empty ? 0 : 8, totalPages: window.__empty ? 0 : 2, number: page });
    }
    if (route === '/api/admin/dashboard/low-stock') {
      const page = Number(url.searchParams.get('page') || 0);
      return Response.json({ content: window.__empty ? [] : Array.from({ length: page ? 2 : 5 }, (_, index) => ({ variantID: page * 5 + index + 1, productID: index + 1, productTitle: `Bút gel kiểm thử ${page * 5 + index + 1}`, title: 'Mực xanh · 0.5 mm', sku: `TEST-${page * 5 + index + 1}`, stockQuantity: index, available: true })), totalElements: window.__empty ? 0 : 7, totalPages: window.__empty ? 0 : 2 });
    }
    // Login/store routes can render during redirects; keep all their reads isolated too.
    if (route === '/api/cart/items') return Response.json({ items: [], subtotal: 0 });
    if (route === '/api/product-types') return Response.json([]);
    if (route.startsWith('/api/recommendations/')) return Response.json({ products: [], source: 'POPULAR' });
    if (route.startsWith('/api/products')) return Response.json({ content: [], totalElements: 0, totalPages: 0 });
    window.__unexpected.push(route);
    return Response.json({}, { status: 500 });
  };
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let vite, browser, profile, socket, send, evaluate;
let passed = 0;
const exceptions = [];
const pending = new Map();
const artifacts = fileURLToPath(new URL('../../.cache/dashboard/', import.meta.url));
async function until(check, label) {
  for (let index = 0; index < 120; index++) { if (await check()) return; await delay(80); }
  throw new Error(`Timed out: ${label}`);
}
async function test(name, run) { await run(); passed++; console.log(`PASS ${name}`); }

try {
  vite = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const executable = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(value => value && existsSync(value));
  assert.ok(executable, 'Set CHROME_PATH to an installed Chromium browser');
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'stationery-dashboard-test-'));
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  await until(() => existsSync(path.join(profile, 'DevToolsActivePort')), 'browser startup');
  const port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
  const tab = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then(response => response.json());
  socket = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let next = 0;
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
    const entry = pending.get(message.id);
    if (entry) { clearTimeout(entry.timer); pending.delete(message.id); message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result); }
  };
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${mockApi.toString()})()` });
  const navigate = async route => { await send('Page.navigate', { url: base + route }); await until(() => evaluate(`location.pathname === ${JSON.stringify(route)} && !!window.__requests`), route); };
  const loaded = () => until(() => evaluate("document.querySelectorAll('.dashboard-stat').length === 6 && !!document.querySelector('.dashboard-table tbody tr')"), 'dashboard data');
  const click = async selector => { assert.equal(await evaluate(`(() => {const node=document.querySelector(${JSON.stringify(selector)});if(!node || node.disabled)return false;node.click();return true})()`), true, selector); };
  const text = () => evaluate('document.body.textContent');
  const capture = async name => {
    await fs.mkdir(artifacts, { recursive: true });
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await fs.writeFile(path.join(artifacts, name), Buffer.from(data, 'base64'));
  };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await navigate('/dashboard'); await loaded();
  await test('ADMIN uses verified /me and renders only backend metrics without storefront header/chat', async () => {
    assert.match(await text(), /Quản trị kiểm thử/);
    assert.match(await text(), /9\.876\.543/);
    assert.equal(await evaluate("document.querySelectorAll('header').length"), 1);
    assert.equal(await evaluate("document.querySelectorAll('.dashboard-sidebar nav a').length"), 7);
    assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Mở trợ lý mua sắm\"]')"), false);
    assert.equal(await evaluate("window.__requests.filter(r=>r.route.startsWith('/api/admin/')).every(r=>r.authorization==='Bearer browser-test-token')"), true);
    assert.equal(await evaluate("document.querySelectorAll('.dashboard-bar-chart rect').length"), 2);
    assert.equal(await evaluate("document.querySelectorAll('.dashboard-distribution-list li').length"), 6);
    await capture('desktop.png');
  });
  await test('Revenue tooltip and grouping use actual API values', async () => {
    await evaluate("document.querySelector('.dashboard-bar-chart rect').focus()");
    await until(() => evaluate("document.querySelector('.dashboard-chart-summary').textContent.includes('1.234.567')"), 'focused bar tooltip');
    assert.match(await evaluate("document.querySelector('.dashboard-chart-summary').textContent"), /1\.234\.567/);
    await evaluate("const s=document.querySelector('.dashboard-chart-select select');s.value='MONTH';s.dispatchEvent(new Event('change',{bubbles:true}))");
    await until(() => evaluate("window.__requests.some(r=>r.route.endsWith('/revenue')&&r.query.groupBy==='MONTH')"), 'groupBy query');
  });
  await test('Orders and low stock paginate on the server', async () => {
    await click('[aria-label="Trang đơn hàng tiếp theo"]');
    await until(() => evaluate("document.querySelector('.dashboard-table tbody')?.textContent.includes('#ST-94')"), 'orders next page');
    assert.equal(await evaluate("document.querySelectorAll('.dashboard-table tbody tr').length"), 2);
    await click('[aria-label="Trang tồn kho tiếp theo"]');
    await until(() => evaluate("document.querySelector('.dashboard-stock-list')?.textContent.includes('TEST-6')"), 'stock next page');
  });
  await test('Date filter applies to statistics and recent orders; refresh keeps the range', async () => {
    await evaluate(`(() => {const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      for(const [label,value] of [['Từ ngày','2026-10-01'],['Đến ngày','2026-10-31']]) { const input=document.querySelector('[aria-label="'+label+'"]');setter.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true})); }})()`);
    await click('.dashboard-filters button[type=submit]'); await loaded();
    await until(() => evaluate("window.__requests.some(r=>r.route.endsWith('/overview')&&r.query.startDate==='2026-10-01'&&r.query.endDate==='2026-10-31')"), 'date range request');
    await click('.dashboard-filter-buttons button[type=button]'); await loaded();
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Từ ngày\"]').value"), '2026-10-01');
  });
  await test('API errors replace metrics, support retry, and do not expose diagnostics or fake zero', async () => {
    await evaluate("window.__failure={route:'/api/admin/statistics/overview',status:500}");
    await click('.dashboard-filter-buttons button[type=button]');
    await until(() => evaluate("!!document.querySelector('.dashboard-content [role=alert]')"), 'error state');
    assert.equal(await evaluate("[...document.querySelectorAll('.dashboard-stat h2')].some(n=>n.textContent==='Doanh thu trong kỳ')"), false);
    assert.equal((await text()).includes('private-diagnostic'), false);
    await evaluate("window.__failure=null;document.querySelector('.dashboard-content [role=alert] button').click()"); await loaded();
  });
  await test('Empty results show empty states while genuine zero revenue is displayed', async () => {
    await evaluate('window.__empty=true'); await click('.dashboard-filter-buttons button[type=button]');
    await until(() => evaluate("document.body.textContent.includes('Chưa có đơn hàng trong kỳ.')"), 'empty chart');
    assert.match(await text(), /Không có biến thể nào/);
    assert.equal(await evaluate("document.querySelectorAll('.dashboard-table tbody tr').length"), 0);
    assert.match(await evaluate("document.querySelector('.dashboard-stat-value').textContent"), /0/);
    await evaluate('window.__empty=false'); await click('.dashboard-filter-buttons button[type=button]'); await loaded();
  });
  await test('Desktop sidebar collapses and every placeholder link remains in the admin layout', async () => {
    await click('[aria-controls="dashboard-sidebar"]');
    assert.equal(await evaluate("document.querySelector('.dashboard-shell').classList.contains('is-collapsed')"), true);
    for (const route of ['reviews', 'promotions', 'returns', 'orders', 'products', 'users']) {
      await click(`.dashboard-sidebar a[href="/dashboard/${route}"]`);
      await until(() => evaluate(`location.pathname==='/dashboard/${route}'&&!!document.querySelector('.dashboard-placeholder')`), route);
      assert.match(await text(), /Chức năng đang được phát triển/);
      assert.equal(await evaluate("document.querySelectorAll('header').length"), 1);
      assert.equal(await evaluate("document.querySelectorAll('.dashboard-nav-link.active').length"), 1);
    }
    await navigate('/dashboard/orders');
    await until(() => evaluate("!!document.querySelector('.dashboard-placeholder')"), 'direct reload child route');
  });
  await test('Mobile drawer, Escape, overlay and navigation work without horizontal page overflow', async () => {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await navigate('/dashboard'); await loaded();
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    await click('[aria-controls="dashboard-sidebar"]'); await delay(250);
    assert.equal(await evaluate("document.querySelector('.dashboard-sidebar').getAttribute('aria-modal')"), 'true');
    await capture('mobile-drawer.png');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    await until(() => evaluate("!document.querySelector('.dashboard-overlay')"), 'escape closes drawer');
    await click('[aria-controls="dashboard-sidebar"]'); await click('.dashboard-overlay');
    await click('[aria-controls="dashboard-sidebar"]'); await click('.dashboard-sidebar a[href="/dashboard/users"]');
    await until(() => evaluate("location.pathname==='/dashboard/users'&&!document.querySelector('.dashboard-overlay')"), 'mobile navigate');
    await navigate('/dashboard'); await loaded(); await capture('mobile.png');
  });
  await test('Responsive sizes remain contained, hidden navigation is inert, and desktop resize releases the drawer', async () => {
    for (const width of [320, 768, 1024, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width <= 800 });
      await delay(150);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `width ${width}`);
      assert.equal(await evaluate("document.querySelector('[aria-controls=\"dashboard-sidebar\"]').getAttribute('aria-expanded')"), width <= 800 ? 'false' : 'true');
      assert.equal(await evaluate("document.querySelector('.dashboard-sidebar').inert"), width <= 800);
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await delay(100); await click('[aria-controls="dashboard-sidebar"]');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await until(() => evaluate("!document.querySelector('.dashboard-overlay') && document.body.style.overflow !== 'hidden'"), 'desktop resize releases modal');
    await capture('desktop.png');
  });
  await test('CUSTOMER with a forged local role cannot access overview or any child route', async () => {
    await evaluate("sessionStorage.setItem('test-role','CUSTOMER');localStorage.setItem('role','ADMIN')");
    for (const route of ['', '/users', '/orders', '/products', '/reviews', '/promotions', '/returns']) {
      await navigate('/dashboard' + route);
      await until(() => evaluate("document.body.textContent.includes('403')"), `forbidden ${route}`);
      assert.equal(await evaluate("!!document.querySelector('.dashboard-shell')"), false);
      assert.equal(await evaluate("window.__requests.some(r=>r.route.startsWith('/api/admin/'))"), false);
    }
    await evaluate("sessionStorage.removeItem('test-role')");
  });
  await test('Loading verification never flashes protected content', async () => {
    await evaluate("sessionStorage.setItem('identity-delay','1500')"); await navigate('/dashboard');
    await until(() => evaluate("document.body.textContent.includes('Đang xác minh')"), 'auth loading');
    assert.equal(await evaluate("!!document.querySelector('.dashboard-shell')"), false);
    await loaded(); await evaluate("sessionStorage.removeItem('identity-delay')");
  });
  await test('A 403 removes all previously rendered protected data', async () => {
    await evaluate("window.__failure={route:'/api/admin/statistics/revenue',status:403}");
    await click('.dashboard-filter-buttons button[type=button]');
    await until(() => evaluate("document.body.textContent.includes('403')"), 'revoked permission');
    assert.equal(await evaluate("!!document.querySelector('.dashboard-shell')"), false);
  });
  await test('A 401 clears the session and redirects to the existing login flow', async () => {
    await navigate('/dashboard'); await loaded();
    await evaluate("window.__failure={route:'/api/admin/statistics/overview',status:401}");
    await click('.dashboard-filter-buttons button[type=button]');
    await until(() => evaluate("location.pathname==='/login'"), 'expired session');
    assert.equal(await evaluate("localStorage.getItem('accessToken')"), null);
    assert.equal(await evaluate("!!document.querySelector('.dashboard-shell')"), false);
  });
  await test('Anonymous direct access to dashboard and children redirects to login', async () => {
    for (const route of ['/dashboard', '/dashboard/orders', '/dashboard/users']) {
      await navigate(route);
      await until(() => evaluate("location.pathname==='/login'"), `anonymous ${route}`);
      assert.equal(await evaluate("window.__requests.some(r=>r.route.startsWith('/api/admin/'))"), false);
    }
  });
  await test('Logout uses the existing token/event flow', async () => {
    await evaluate("localStorage.setItem('accessToken','browser-test-token')"); await navigate('/dashboard'); await loaded();
    await click('.dashboard-account summary'); await click('.dashboard-account-menu button');
    await until(() => evaluate("location.pathname==='/login'"), 'logout');
    assert.equal(await evaluate("localStorage.getItem('accessToken')"), null);
  });
  assert.deepEqual(exceptions, [], 'No browser runtime exceptions');
  assert.deepEqual(await evaluate('window.__unexpected'), [], 'All API calls intercepted');
  console.log(`${passed} dashboard browser checks passed. Screenshots: ${artifacts}`);
} catch (error) {
  console.error(error); process.exitCode = 1;
  if (send) { const { data } = await send('Page.captureScreenshot', { format: 'png' }).catch(() => ({})); if (data) { await fs.mkdir(artifacts, { recursive: true }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(data, 'base64')); } }
} finally {
  if (send) await send('Browser.close').catch(() => {});
  socket?.close(); browser?.kill();
  if (vite) await vite.close();
  // Only remove the fresh, task-owned temporary browser profile.
  if (profile && path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('stationery-dashboard-test-')) {
    await delay(300); await fs.rm(profile, { recursive: true, force: true, maxRetries: 4 }).catch(() => {});
  }
}
