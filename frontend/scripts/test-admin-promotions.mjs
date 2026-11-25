import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// All backend requests are intercepted; fixtures exist only in this test process.
function installApi() {
  const realFetch = window.fetch.bind(window);
  if (!sessionStorage.getItem('promotions-test-init')) { localStorage.setItem('accessToken', 'test-promotion-token'); sessionStorage.setItem('promotions-test-init', 'true'); }
  window.__rows = Array.from({ length: 24 }, (_, i) => ({ couponID: i + 1, code: `TEST_${String(i + 1).padStart(2, '0')}`, discountType: i % 2 ? 'FIXED_AMOUNT' : 'PERCENTAGE',
    discountValue: i % 2 ? 10000 : 10, minOrderValue: 100000, startDate: '2026-11-01', endDate: '2026-12-31', usageLimit: 100,
    usedCount: i, isActive: true, status: i % 4 ? 'ACTIVE' : 'EXPIRED', stateToken: `snapshot-${i}` }));
  window.__requests = []; window.__unexpected = []; window.__failure = null; window.__delay = 0; window.__downloads = [];
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__downloads.push({ filename: this.download, href: this.href }); return; } return click.call(this); };
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (!url.pathname.startsWith('/api/')) return realFetch(input, options);
    const route = url.pathname, method = options.method || 'GET';
    window.__requests.push({ route, method, query: Object.fromEntries(url.searchParams), auth: new Headers(options.headers).get('Authorization'), body: options.body ? JSON.parse(options.body) : null });
    options.signal?.throwIfAborted();
    if (route === '/api/auth/me') return Response.json({ username: 'promotion-admin', fullName: 'Quản trị kiểm thử', email: 'admin@example.test', role: (window.__failure?.status === 403 ? 'CUSTOMER' : sessionStorage.getItem('test-role') || 'ADMIN') });
    if (window.__failure?.route === route && (!window.__failure.method || window.__failure.method === method)) return Response.json({ detail: 'SQL password=private-diagnostic' }, { status: window.__failure.status });
    const match = route.match(/^\/api\/coupons\/(\d+)$/);
    if (match) {
      await new Promise(resolve => setTimeout(resolve, window.__delay)); options.signal?.throwIfAborted();
      const row = window.__rows.find(item => item.couponID === Number(match[1]));
      if (!row) return Response.json({}, { status: 404 });
      if (method === 'PUT') {
        const values = JSON.parse(options.body); if (values.expectedState !== row.stateToken) return Response.json({}, { status: 409 });
        Object.assign(row, values, { stateToken: row.stateToken + '-updated', status: values.isActive ? 'ACTIVE' : 'DISABLED' });
      }
      return Response.json(row);
    }
    if (route === '/api/coupons' && method === 'POST') {
      await new Promise(resolve => setTimeout(resolve, window.__delay));
      const values = JSON.parse(options.body);
      if (window.__rows.some(row => row.code === values.code)) return Response.json({}, { status: 409 });
      const row = { ...values, couponID: Math.max(...window.__rows.map(row => row.couponID), 0) + 1, usedCount: 0, status: values.isActive ? 'ACTIVE' : 'DISABLED', stateToken: 'created' };
      window.__rows.push(row); return Response.json(row, { status: 201 });
    }
    if (route.startsWith('/api/admin/promotions')) {
      const p = url.searchParams;
      const rows = window.__rows.filter(row => (!p.get('search') || row.code.toLowerCase().includes(p.get('search').toLowerCase()))
        && (!p.get('status') || row.status === p.get('status')) && (!p.get('discountType') || row.discountType === p.get('discountType')))
        .sort((a, b) => p.get('sort') === 'CODE_ASC' ? a.code.localeCompare(b.code) : p.get('sort') === 'CODE_DESC' ? b.code.localeCompare(a.code) : (p.get('sort') === 'ID_ASC' ? 1 : -1) * (a.couponID - b.couponID));
      if (route.endsWith('/statistics')) return Response.json({ totalCoupons: rows.length, activeCoupons: rows.filter(row => row.status === 'ACTIVE').length, expiredCoupons: rows.filter(row => row.status === 'EXPIRED').length, totalUses: rows.reduce((sum, row) => sum + row.usedCount, 0) });
      if (route.endsWith('/export')) {
        if (!rows.length) return Response.json({}, { status: 404 });
        // Binary delivery only. Real workbook contents and formatting are checked with POI in backend tests.
        return new Response(new Uint8Array([80, 75, 3, 4]), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="stationery-promotions-2026-11-23.xlsx"' } });
      }
      if (route === '/api/admin/promotions') { const page = Number(p.get('page') || 0), size = Number(p.get('size') || 10); return Response.json({ content: rows.slice(page * size, (page + 1) * size), totalElements: rows.length, totalPages: Math.ceil(rows.length / size) }); }
    }
    if (route === '/api/cart/items') return Response.json({ items: [], subtotal: 0 });
    if (route === '/api/product-types') return Response.json([]);
    window.__unexpected.push(route); return Response.json({}, { status: 500 });
  };
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let vite, browser, profile, socket, send, evaluate;
const pending = new Map(), exceptions = [];
const artifacts = fileURLToPath(new URL('../../.cache/admin-promotions/', import.meta.url));
let passed = 0;
async function until(check, label) { for (let i = 0; i < 150; i++) { if (await check()) return; await delay(80); } throw new Error(`Timed out: ${label}`); }
async function test(label, run) { await run(); passed++; console.log(`PASS ${label}`); }

try {
  vite = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } }); await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const executable = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(value => value && existsSync(value));
  assert.ok(executable, 'Set CHROME_PATH to an installed Chromium browser');
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'stationery-promotions-test-'));
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  await until(() => existsSync(path.join(profile, 'DevToolsActivePort')), 'browser startup');
  const port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
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
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installApi.toString()})()` });
  const navigate = async () => { await send('Page.navigate', { url: base + '/dashboard/promotions' }); await until(() => evaluate('!!window.__requests'), 'page loaded'); };
  const loaded = () => until(() => evaluate("document.querySelectorAll('.promotions-table tbody tr').length===10 && document.querySelectorAll('.promotions-kpi-grid .dashboard-stat').length===4"), 'review data');
  const click = async selector => { assert.equal(await evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled)return false;n.focus();n.click();return true;})()`), true, selector); };
  const button = async (text, selector = 'document') => { await evaluate(`(() => {const n=[...${selector}.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!n||n.disabled)throw new Error('Button unavailable');n.focus();n.click()})()`); };
  const input = async (selector, value) => { await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const select = async (selector, value) => { await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const screenshot = async name => { await evaluate("document.querySelectorAll('.store-notice-close').forEach(n=>n.click())"); await delay(350); await fs.mkdir(artifacts, { recursive: true }); const { data } = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, name), Buffer.from(data, 'base64')); };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await navigate(); await loaded();
  await test('Direct ADMIN route, refresh, sidebar, server KPIs and existing layout', async () => {
    assert.equal(await evaluate("document.querySelectorAll('header').length"), 1);
    assert.equal(await evaluate("document.querySelector('.dashboard-nav-link.active').textContent"), 'Khuyến mãi & Voucher');
    assert.equal(await evaluate("document.querySelector('.promotions-kpi-grid .dashboard-stat-value').textContent"), '24');
    assert.equal(await evaluate("document.querySelector('.dashboard-management-breadcrumb [aria-current=page]').textContent"), 'Khuyến mãi & Voucher');
    assert.equal(await evaluate("document.querySelector('.dashboard-management-list-heading').textContent.includes('1–10')"), true);
    assert.equal(await evaluate("document.querySelector('.voucher-usage progress').value"), 23);
    assert.equal(await evaluate("document.querySelector('.voucher-usage progress').max"), 100);
    assert.equal(await evaluate("document.querySelector('.voucher-usage small').textContent"), '23% hạn mức');
    assert.equal(await evaluate("document.querySelectorAll('.promotions-status-chip[aria-pressed=true]').length"), 1);
    assert.equal(await evaluate("window.__requests.filter(r=>r.route.startsWith('/api/admin/')).every(r=>r.auth==='Bearer test-promotion-token')"), true);
    await evaluate('window.__reloadMarker=true'); await send('Page.reload');
    await until(() => evaluate('!window.__reloadMarker && !!window.__requests'), 'reload finished');
    await loaded(); await screenshot('desktop.png');
  });
  await test('Server pagination, status/type filters, sort and debounce search', async () => {
    await click('[aria-label="Trang voucher tiếp theo"]'); await until(() => evaluate("document.querySelector('.dashboard-pagination')?.textContent.includes('Trang 2')"), 'page2');
    await click('[data-voucher-status="EXPIRED"]'); await until(() => evaluate("document.querySelectorAll('.promotions-table tbody tr').length===6"), 'expired');
    assert.equal(await evaluate("document.querySelector('[data-voucher-status=EXPIRED]').getAttribute('aria-pressed')"), 'true');
    assert.equal(await evaluate("document.querySelector('.dashboard-management-list-heading').textContent.includes('1–6')"), true);
    await select('[aria-label="Lọc loại giảm giá"]', 'PERCENTAGE'); await select('[aria-label="Sắp xếp voucher"]', 'CODE_ASC');
    await until(() => evaluate("document.querySelector('.promotions-table tbody button')?.getAttribute('aria-label')==='Xem chi tiết voucher #1'"), 'sort');
    await input('[aria-label="Tìm mã voucher"]', 'TEST_0'); await until(() => evaluate("document.querySelectorAll('.promotions-table tbody tr').length===3"), 'search');
    assert.equal(await evaluate("document.querySelector('.dashboard-pagination').textContent.includes('Trang 1')"), true);
  });
  await test('Excel uses every active filter and existing authenticated binary client', async () => {
    await button('Xuất Excel'); await until(() => evaluate('window.__downloads.length===1'), 'download');
    assert.equal(await evaluate('window.__downloads[0].filename'), 'stationery-promotions-2026-11-23.xlsx');
    const request = await evaluate("window.__requests.findLast(r=>r.route.endsWith('/export'))");
    assert.deepEqual(request.query, { search: 'TEST_0', status: 'EXPIRED', discountType: 'PERCENTAGE', sort: 'CODE_ASC' });
    assert.equal(request.auth, 'Bearer test-promotion-token');
    await button('Đặt lại'); await loaded();
  });
  await test('Detail loading, real fields, focus trap, Escape and focus restoration', async () => {
    await evaluate('window.__delay=500'); await click('[aria-label="Xem chi tiết voucher #24"]');
    await until(() => evaluate("document.querySelector('dialog[open] [role=status]')?.textContent.includes('Đang tải')"), 'detail loading');
    await until(() => evaluate("document.querySelector('dialog[open] .voucher-code')?.textContent==='TEST_24'"), 'detail');
    for (let i = 0; i < 12; i++) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); assert.equal(await evaluate("!!document.activeElement.closest('dialog[open]')"), true, `Tab step ${i}`); }
    await screenshot('detail.png');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await until(() => evaluate("!document.querySelector('dialog[open]')"), 'escape');
    assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"), 'Xem chi tiết voucher #24'); await evaluate('window.__delay=0');
  });
  await test('Create form validates and creates through existing API; refreshes table and KPIs', async () => {
    await button('Tạo mã giảm giá'); await button('Lưu voucher');
    assert.equal(await evaluate("window.__requests.filter(r=>r.method==='POST').length"), 0);
    await input('input[name=code]', 'NEW_TEST'); await input('input[name=discountValue]', '101'); await button('Lưu voucher');
    assert.equal(await evaluate("document.querySelector('input[name=discountValue]').validity.valid"), false);
    await input('input[name=discountValue]', '15'); await button('Lưu voucher');
    await until(() => evaluate("!document.querySelector('dialog[open]')&&document.querySelector('.promotions-kpi-grid .dashboard-stat-value')?.textContent==='25'"), 'created');
    assert.equal(await evaluate("document.querySelector('.promotions-table tbody .voucher-code').textContent"), 'NEW_TEST');
    assert.equal(await evaluate("document.querySelector('.promotions-table tbody tr .voucher-usage').textContent.includes('Không giới hạn')"), true);
    assert.equal(await evaluate("document.querySelector('.promotions-table tbody tr:first-child .voucher-usage progress')===null"), true);
  });
  await test('Duplicate creation reports conflict and leaves editable form open', async () => {
    await button('Tạo mã giảm giá'); await input('input[name=code]', 'NEW_TEST'); await input('input[name=discountValue]', '10'); await button('Lưu voucher');
    await until(() => evaluate("document.querySelector('dialog[open] [role=alert]')?.textContent.includes('đã tồn tại')"), 'duplicate');
    assert.equal(await evaluate("document.querySelector('input[name=code]').disabled"), false); await button('Hủy', "document.querySelector('dialog[open]')");
  });
  await test('Editing requires confirmation, preserves usage, updates modal/list/KPIs and locks busy Escape', async () => {
    await click('[aria-label="Xem chi tiết voucher #24"]'); await until(() => evaluate("!!document.querySelector('dialog[open] .voucher-code')"), 'detail');
    await button('Chỉnh sửa', "document.querySelector('dialog[open]')"); await input('input[name=discountValue]', '20000');
    assert.equal(await evaluate("document.querySelector('input[name=usedCount]')===null"), true);
    await button('Lưu voucher'); await until(() => evaluate("document.querySelectorAll('dialog[open]').length===3"), 'confirmation');
    await evaluate('window.__delay=600'); await button('Xác nhận', "[...document.querySelectorAll('dialog[open]')].at(-1)");
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    assert.equal(await evaluate("document.querySelectorAll('dialog[open]').length"), 3);
    await until(() => evaluate("document.querySelectorAll('dialog[open]').length===1"), 'saved');
    const request = await evaluate("window.__requests.findLast(r=>r.method==='PUT')"); assert.equal(request.body.expectedState, 'snapshot-23'); assert.equal('usedCount' in request.body, false);
    assert.equal(await evaluate('window.__rows.find(r=>r.couponID===24).usedCount'), 23);
    assert.equal(await evaluate("document.querySelector('dialog[open]').textContent.includes('20.000')"), true); await evaluate('window.__delay=0');
  });
  await test('Disable and enable confirm, retain history and refresh detail and aggregates', async () => {
    await button('Vô hiệu hóa', "document.querySelector('dialog[open]')"); await button('Xác nhận', "[...document.querySelectorAll('dialog[open]')].at(-1)");
    await until(() => evaluate("document.querySelector('dialog[open] .dashboard-badge')?.textContent==='Đã vô hiệu hóa'"), 'disabled');
    assert.equal(await evaluate('window.__rows.find(r=>r.couponID===24).usedCount'), 23);
    await button('Kích hoạt', "document.querySelector('dialog[open]')"); await button('Xác nhận', "[...document.querySelectorAll('dialog[open]')].at(-1)");
    await until(() => evaluate("document.querySelector('dialog[open] .dashboard-badge')?.textContent==='Đang hoạt động'"), 'enabled');
    await click('dialog[open] [aria-label="Đóng hộp thoại"]');
  });
  await test('Stale update returns 409, retains modal and requires reloading without false success', async () => {
    await click('[aria-label="Xem chi tiết voucher #24"]'); await until(() => evaluate("!!document.querySelector('dialog[open] .voucher-code')"), 'detail');
    await evaluate("window.__rows.find(r=>r.couponID===24).stateToken='another-admin'");
    await button('Vô hiệu hóa', "document.querySelector('dialog[open]')"); await button('Xác nhận', "[...document.querySelectorAll('dialog[open]')].at(-1)");
    await until(() => evaluate("!!document.querySelector('dialog[open] [role=alert]')"), 'conflict');
    assert.equal(await evaluate("[...document.querySelector('dialog[open]').querySelectorAll('button')].find(n=>n.textContent==='Chỉnh sửa').disabled"), true);
    assert.equal(await evaluate('window.__rows.find(r=>r.couponID===24).isActive'), true);
    await button('Tải lại chi tiết', "document.querySelector('dialog[open]')"); await until(() => evaluate("!!document.querySelector('dialog[open] .voucher-code')"), 'fresh detail');
    await click('dialog[open] [aria-label="Đóng hộp thoại"]');
  });
  await test('Empty results, list retry, detail 404 and export errors do not fabricate or leak data', async () => {
    await input('[aria-label="Tìm mã voucher"]', 'NOT_FOUND'); await until(() => evaluate("document.querySelector('.promotions-kpi-grid .dashboard-stat-value')?.textContent==='0'"), 'empty');
    assert.equal(await evaluate("document.querySelectorAll('.promotions-table tbody tr').length"), 0);
    await button('Xuất Excel'); await until(() => evaluate("document.body.textContent.includes('Không có voucher phù hợp để xuất.')"), 'empty export');
    await button('Đặt lại'); await loaded();
    await evaluate("window.__failure={route:'/api/admin/promotions',status:500}"); await select('[aria-label="Sắp xếp voucher"]','ID_ASC');
    await until(() => evaluate("!!document.querySelector('.promotions-list-panel [role=alert]')"), 'list error');
    await evaluate('window.__failure=null'); await button('Thử lại',"document.querySelector('.promotions-list-panel [role=alert]')"); await loaded();
    await evaluate("window.__failure={route:'/api/coupons/1',status:404}"); await click('[aria-label="Xem chi tiết voucher #1"]');
    await until(() => evaluate("!!document.querySelector('dialog[open] [role=alert]')"), 'not found'); assert.equal(await evaluate("document.body.textContent.includes('private-diagnostic')"),false);
    await click('dialog[open] [aria-label="Đóng hộp thoại"]'); await evaluate('window.__failure=null');
  });
  await test('Desktop/tablet/mobile page, detail and create form fit viewport', async () => {
    for (const width of [320,390,768,1440]) { await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<=800}); await delay(100); assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`width ${width}`); }
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true}); await screenshot('mobile.png');
    await click('[aria-label="Xem chi tiết voucher #1"]'); await until(() => evaluate("!!document.querySelector('dialog[open] .voucher-code')"),'mobile detail'); await screenshot('mobile-detail.png');
    assert.equal(await evaluate("(()=>{const r=document.querySelector('dialog[open]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()"),true);
    await click('dialog[open] [aria-label="Đóng hộp thoại"]'); await button('Tạo mã giảm giá');
    assert.equal(await evaluate("(()=>{const r=document.querySelector('dialog[open]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&document.querySelector('.voucher-form').scrollWidth<=r.width})()"),true); await screenshot('mobile-create.png'); await button('Hủy',"document.querySelector('dialog[open]')");
  });
  await test('API 403 removes protected content; CUSTOMER and anonymous blocked on direct route', async () => {
    await evaluate("window.__failure={route:'/api/admin/promotions/export',status:403}"); await button('Xuất Excel'); await until(()=>evaluate("document.body.textContent.includes('403')"),'revoked');
    assert.equal(await evaluate("!!document.querySelector('.promotions-page')"),false);
    await evaluate("sessionStorage.setItem('test-role','CUSTOMER');localStorage.setItem('role','ADMIN')"); await navigate(); await until(()=>evaluate("document.body.textContent.includes('403')"),'customer');
    assert.equal(await evaluate("window.__requests.some(r=>r.route.startsWith('/api/admin/'))"),false);
    await evaluate("localStorage.removeItem('accessToken')"); await navigate(); await until(()=>evaluate("location.pathname==='/login'"),'anonymous');
  });
  assert.deepEqual(exceptions, [], 'No browser runtime exceptions');
  assert.deepEqual(await evaluate('window.__unexpected'), [], 'All backend calls remain mocked');
  console.log(`${passed} admin promotions browser checks passed.`);
} catch (error) {
  console.error(error); process.exitCode = 1;
  if (send) { const { data } = await send('Page.captureScreenshot', { format: 'png' }).catch(() => ({})); if (data) { await fs.mkdir(artifacts, { recursive: true }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(data, 'base64')); } }
} finally {
  if (send) await send('Browser.close').catch(() => {}); socket?.close(); browser?.kill(); if (vite) await vite.close();
  if (profile && path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('stationery-promotions-test-')) { await delay(300); await fs.rm(profile, { recursive: true, force: true, maxRetries: 4 }).catch(() => {}); }
}
