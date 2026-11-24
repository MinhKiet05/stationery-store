import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// All API traffic is intercepted before React loads. No production data or Cloudinary calls.
function installApi() {
  const realFetch = window.fetch.bind(window);
  const picture = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="160"%3E%3Crect width="160" height="160" fill="%23e1e9fa"/%3E%3Cpath d="m50 110 60-60" stroke="%23a64c12" stroke-width="15"/%3E%3C/svg%3E';
  if (!sessionStorage.getItem('reviews-test-init')) { localStorage.setItem('accessToken', 'test-review-token'); sessionStorage.setItem('reviews-test-init', 'true'); }
  window.__rows = Array.from({ length: 24 }, (_, index) => ({ review: { reviewID: index + 1, productID: index % 2 + 1,
    productTitle: index % 2 ? 'Sổ tay kiểm thử' : 'Bút gel kiểm thử', productImage: index % 2 ? null : picture,
    username: index % 2 ? 'bob' : 'alice', fullName: index % 2 ? 'Trần Bình' : 'Nguyễn An', userID: index % 2 + 1,
    rating: index % 5 + 1, comment: `Nội dung đánh giá kiểm thử số ${index + 1}. ` + 'Sản phẩm được nhận xét bằng tiếng Việt. '.repeat(8),
    reviewDate: `2026-11-${String(index + 1).padStart(2, '0')}T14:30:00` },
    images: index % 2 ? [] : [{ imageUrl: picture, imagePosition: 0 }, { imageUrl: picture, imagePosition: 1 }] }));
  window.__requests = []; window.__unexpected = []; window.__failure = null; window.__delay = 0; window.__downloads = [];
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__downloads.push({ filename: this.download, href: this.href }); return; } return click.call(this); };
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (!url.pathname.startsWith('/api/')) return realFetch(input, options);
    const route = url.pathname, method = options.method || 'GET';
    window.__requests.push({ route, method, query: Object.fromEntries(url.searchParams), auth: new Headers(options.headers).get('Authorization') });
    options.signal?.throwIfAborted();
    if (route === '/api/auth/me') return Response.json({ username: 'review-admin', fullName: 'Quản trị kiểm thử', email: 'admin@example.test', role: (window.__failure?.status === 403 ? 'CUSTOMER' : sessionStorage.getItem('test-role') || 'ADMIN') });
    if (window.__failure?.route === route && (!window.__failure.method || window.__failure.method === method)) return Response.json({ detail: 'SQL password=private-diagnostic' }, { status: window.__failure.status });
    const match = route.match(/^\/api\/admin\/reviews\/(\d+)$/);
    if (match) {
      await new Promise(resolve => setTimeout(resolve, window.__delay)); options.signal?.throwIfAborted();
      const id = Number(match[1]); const row = window.__rows.find(item => item.review.reviewID === id);
      if (!row) return Response.json({}, { status: 404 });
      if (method === 'DELETE') { window.__rows = window.__rows.filter(item => item !== row); return new Response(null, { status: 204 }); }
      return Response.json(row);
    }
    if (route.startsWith('/api/admin/reviews')) {
      let rows = window.__rows.filter(({ review: row }) => {
        const p = url.searchParams, search = (p.get('search') || '').toLowerCase();
        return (!search || `${row.productTitle} ${row.username} ${row.fullName}`.toLowerCase().includes(search))
          && (!p.get('rating') || row.rating === Number(p.get('rating')))
          && (!p.get('startDate') || row.reviewDate.slice(0, 10) >= p.get('startDate'))
          && (!p.get('endDate') || row.reviewDate.slice(0, 10) <= p.get('endDate'));
      }).sort((a, b) => (url.searchParams.get('sort') === 'OLDEST' ? 1 : -1) * (a.review.reviewID - b.review.reviewID));
      if (route.endsWith('/statistics')) return Response.json({ totalReviews: rows.length,
        averageRating: rows.length ? rows.reduce((sum, row) => sum + row.review.rating, 0) / rows.length : null,
        fiveStarReviews: rows.filter(row => row.review.rating === 5).length, lowStarReviews: rows.filter(row => row.review.rating <= 2).length });
      if (route.endsWith('/export')) {
        // Binary delivery fixture only; real workbook format/formula safety is verified by POI backend tests.
        if (!rows.length) return Response.json({}, { status: 404 });
        return new Response(new Uint8Array([80, 75, 3, 4]), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="stationery-reviews-2026-11-23.xlsx"' } });
      }
      if (route === '/api/admin/reviews') {
        const page = Number(url.searchParams.get('page') || 0), size = Number(url.searchParams.get('size') || 10);
        return Response.json({ content: rows.slice(page * size, (page + 1) * size), totalElements: rows.length, totalPages: Math.ceil(rows.length / size) });
      }
    }
    if (route === '/api/cart/items') return Response.json({ items: [], subtotal: 0 });
    if (route === '/api/product-types') return Response.json([]);
    window.__unexpected.push(route); return Response.json({}, { status: 500 });
  };
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let vite, browser, profile, socket, send, evaluate;
const pending = new Map(), exceptions = [];
const artifacts = fileURLToPath(new URL('../../.cache/admin-reviews/', import.meta.url));
let passed = 0;
async function until(check, label) { for (let i = 0; i < 150; i++) { if (await check()) return; await delay(80); } throw new Error(`Timed out: ${label}`); }
async function test(label, run) { await run(); passed++; console.log(`PASS ${label}`); }

try {
  vite = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } }); await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const executable = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(value => value && existsSync(value));
  assert.ok(executable, 'Set CHROME_PATH to an installed Chromium browser');
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'stationery-reviews-test-'));
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
  const navigate = async () => { await send('Page.navigate', { url: base + '/dashboard/reviews' }); await until(() => evaluate('!!window.__requests'), 'page loaded'); };
  const loaded = () => until(() => evaluate("document.querySelectorAll('.reviews-table tbody tr').length===10 && document.querySelectorAll('.reviews-kpi-grid .dashboard-stat').length===4"), 'review data');
  const click = async selector => { assert.equal(await evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled)return false;n.focus();n.click();return true;})()`), true, selector); };
  const button = async (text, selector = 'document') => { await evaluate(`(() => {const n=[...${selector}.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!n||n.disabled)throw new Error('Button unavailable');n.focus();n.click()})()`); };
  const input = async (selector, value) => { await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const select = async (selector, value) => { await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const screenshot = async name => { await evaluate("document.querySelectorAll('.store-notice-close').forEach(n=>n.click())"); await delay(350); await fs.mkdir(artifacts, { recursive: true }); const { data } = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, name), Buffer.from(data, 'base64')); };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await navigate(); await loaded();
  await test('Direct ADMIN route reuses dashboard layout, active menu and real response metrics', async () => {
    assert.equal(await evaluate("document.querySelectorAll('header').length"), 1);
    assert.equal(await evaluate("document.querySelector('.dashboard-nav-link.active').textContent"), 'Đánh giá');
    assert.equal(await evaluate("document.querySelector('.reviews-kpi-grid .dashboard-stat-value').textContent"), '24');
    assert.equal(await evaluate("document.querySelectorAll('.reviews-table tbody tr').length"), 10);
    assert.equal(await evaluate("document.querySelector('.dashboard-management-breadcrumb [aria-current=page]').textContent"), 'Đánh giá sản phẩm');
    assert.equal(await evaluate("document.querySelector('.dashboard-management-list-heading').textContent.includes('1–10')"), true);
    assert.equal(await evaluate("document.querySelector('.dashboard-management-ratio').textContent"), '16,7%');
    assert.equal(await evaluate("[...document.querySelectorAll('.reviews-date')].every(n=>n.hasAttribute('datetime'))"), true);
    assert.equal(await evaluate("document.querySelectorAll('.dashboard-management-filters .reviews-toolbar').length"), 1);
    assert.equal(await evaluate("window.__requests.filter(r=>r.route.startsWith('/api/admin/')).every(r=>r.auth==='Bearer test-review-token')"), true);
    await screenshot('desktop.png');
  });
  await test('Server pagination, star filtering and sort reset page and match results', async () => {
    await click('[aria-label="Trang đánh giá tiếp theo"]'); await until(() => evaluate("document.querySelector('.dashboard-pagination')?.textContent.includes('Trang 2')"), 'page 2');
    await select('[aria-label="Lọc số sao"]', '5'); await until(() => evaluate("document.querySelectorAll('.reviews-table tbody tr').length===4"), 'five stars');
    assert.equal(await evaluate("document.querySelector('.dashboard-pagination').textContent.includes('Trang 1')"), true);
    assert.equal(await evaluate("[...document.querySelectorAll('.reviews-table .reviews-stars')].every(n=>n.getAttribute('aria-label')==='5 trên 5 sao')"), true);
    await select('[aria-label="Sắp xếp đánh giá"]', 'OLDEST');
    await until(() => evaluate("document.querySelector('.reviews-table tbody button')?.getAttribute('aria-label')==='Xem chi tiết đánh giá #5'"), 'oldest');
  });
  await test('Search is debounced and date filters reach backend; Excel uses all active filters', async () => {
    await button('Đặt lại'); await loaded();
    const before = await evaluate("window.__requests.filter(r=>r.route==='/api/admin/reviews').length");
    await input('[aria-label="Tìm sản phẩm hoặc người đánh giá"]', 'B'); await input('[aria-label="Tìm sản phẩm hoặc người đánh giá"]', 'Bút');
    await delay(500); await until(() => evaluate("document.querySelector('.dashboard-pagination')?.textContent.includes('12 đánh giá')"), 'search');
    assert.ok(await evaluate("window.__requests.filter(r=>r.route==='/api/admin/reviews').length") <= before + 2);
    await input('[aria-label="Ngày bắt đầu đánh giá"]', '2026-11-01'); await input('[aria-label="Ngày kết thúc đánh giá"]', '2026-11-09'); await button('Áp dụng ngày');
    await until(() => evaluate("document.querySelectorAll('.reviews-table tbody tr').length===5"), 'date range');
    await button('Xuất Excel'); await until(() => evaluate('window.__downloads.length===1'), 'xlsx download');
    assert.equal(await evaluate('window.__downloads[0].filename'), 'stationery-reviews-2026-11-23.xlsx');
    assert.deepEqual(await evaluate("window.__requests.find(r=>r.route.endsWith('/export')).query"), { search: 'Bút', startDate: '2026-11-01', endDate: '2026-11-09', sort: 'NEWEST' });
    assert.equal(await evaluate('location.pathname'), '/dashboard/reviews');
    await button('Đặt lại'); await loaded();
  });
  await test('Detail loads full text and actual images; image viewer supports multiple pictures', async () => {
    await click('[aria-label="Xem chi tiết đánh giá #23"]'); await until(() => evaluate("document.querySelector('dialog[open]')?.textContent.includes('Nguyễn An')"), 'detail');
    assert.equal(await evaluate("document.querySelector('.reviews-full-comment').textContent.length>250"), true);
    assert.equal(await evaluate("document.querySelectorAll('.reviews-image-grid img').length"), 2);
    await screenshot('detail.png');
    await click('[aria-label="Phóng to ảnh đánh giá 1"]'); await until(() => evaluate("document.querySelectorAll('dialog[open]').length===2"), 'image viewer');
    await click('[aria-label="Ảnh đánh giá tiếp theo"]');
    assert.equal(await evaluate("document.querySelector('.reviews-image-expanded').getAttribute('alt')"), 'Ảnh đánh giá 2');
    assert.equal(await evaluate("[...document.querySelectorAll('dialog[open]')].at(-1).contains(document.activeElement)"), true, 'Disabling the last-image button retains modal focus');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await until(() => evaluate("document.querySelectorAll('dialog[open]').length===1"), 'close viewer');
    await click('dialog[open] [aria-label="Đóng hộp thoại"]');
  });
  await test('Deletion requires confirmation, prevents duplicate requests and refreshes list plus KPI', async () => {
    await evaluate('window.__delay=700'); await click('[aria-label="Xem chi tiết đánh giá #23"]');
    await until(() => evaluate("document.querySelector('dialog[open]')?.textContent.includes('Đang tải chi tiết')"), 'detail loading');
    await until(() => evaluate("!!document.querySelector('.reviews-full-comment')"), 'detail ready');
    await button('Xóa đánh giá', "document.querySelector('dialog[open]')");
    await until(() => evaluate("document.querySelectorAll('dialog[open]').length===2"), 'confirm delete');
    await button('Xác nhận', "[...document.querySelectorAll('dialog[open]')].at(-1)");
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    assert.equal(await evaluate("document.querySelectorAll('dialog[open]').length"), 2);
    await until(() => evaluate("!!document.querySelector('.reviews-deleted')"), 'deleted detail');
    await until(() => evaluate("document.querySelector('.reviews-kpi-grid .dashboard-stat-value')?.textContent==='23'"), 'refreshed KPI');
    assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Xem chi tiết đánh giá #23\"]')"), false);
    assert.equal(await evaluate("window.__requests.filter(r=>r.method==='DELETE').length"), 1);
    await click('dialog[open] [aria-label="Đóng hộp thoại"]'); await evaluate('window.__delay=0');
  });
  await test('Delete failure preserves detail and blocks retry until a fresh read', async () => {
    await click('[aria-label="Xem chi tiết đánh giá #24"]'); await until(() => evaluate("!!document.querySelector('.reviews-full-comment')"), 'failure detail');
    await evaluate("window.__failure={route:'/api/admin/reviews/24',method:'DELETE',status:409}");
    await button('Xóa đánh giá', "document.querySelector('dialog[open]')");
    await until(() => evaluate("document.querySelectorAll('dialog[open]').length===2"), 'failure confirm');
    await button('Xác nhận', "[...document.querySelectorAll('dialog[open]')].at(-1)");
    await until(() => evaluate("!!document.querySelector('dialog[open] .admin-modal-error')"), 'delete error');
    assert.equal(await evaluate("!!document.querySelector('.reviews-full-comment')"), true);
    assert.equal(await evaluate("[...document.querySelector('dialog[open]').querySelectorAll('button')].find(n=>n.textContent==='Xóa đánh giá').disabled"), true);
    await evaluate('window.__failure=null'); await click('dialog[open] [aria-label="Đóng hộp thoại"]');
  });
  await test('Empty filters produce true zero KPIs and no average; export failure has clear toast', async () => {
    await input('[aria-label="Tìm sản phẩm hoặc người đánh giá"]', 'Không tồn tại');
    await until(() => evaluate("document.body.textContent.includes('Không có đánh giá phù hợp với bộ lọc.')"), 'empty state');
    assert.equal(await evaluate("document.querySelector('.reviews-kpi-grid .dashboard-stat-value').textContent"), '0');
    assert.equal(await evaluate("document.querySelectorAll('.reviews-kpi-grid .dashboard-stat-value')[1].textContent"), '—');
    await button('Xuất Excel'); await until(() => evaluate("document.body.textContent.includes('Không có đánh giá phù hợp với bộ lọc để xuất.')"), 'empty export notice');
    await button('Đặt lại'); await loaded();
  });
  await test('List, statistics, detail and export errors do not leak diagnostics or invent values', async () => {
    await evaluate("window.__failure={route:'/api/admin/reviews',status:500}"); await select('[aria-label="Lọc số sao"]', '1');
    await until(() => evaluate("!!document.querySelector('.reviews-list-panel [role=alert]')"), 'list error');
    assert.equal(await evaluate("document.querySelectorAll('.reviews-table tbody tr').length"), 0);
    await evaluate('window.__failure=null'); await button('Thử lại', "document.querySelector('.reviews-list-panel [role=alert]')");
    await until(() => evaluate("document.querySelectorAll('.reviews-table tbody tr').length===5"), 'list retry');
    await button('Đặt lại'); await loaded();
    await evaluate("window.__failure={route:'/api/admin/reviews/statistics',status:500}"); await select('[aria-label="Sắp xếp đánh giá"]', 'OLDEST');
    await until(() => evaluate("document.querySelectorAll('.reviews-kpi-grid').length===0"), 'KPI error');
    await evaluate('window.__failure=null'); await button('Đặt lại'); await loaded();
    await evaluate("window.__failure={route:'/api/admin/reviews/24',status:404}"); await click('[aria-label="Xem chi tiết đánh giá #24"]');
    await until(() => evaluate("!!document.querySelector('dialog[open] [role=alert]')"), 'detail error');
    assert.equal(await evaluate("document.body.textContent.includes('private-diagnostic')"), false);
    await click('dialog[open] [aria-label="Đóng hộp thoại"]');
    await evaluate("window.__failure={route:'/api/admin/reviews/export',status:413}"); await button('Xuất Excel');
    await until(() => evaluate("document.body.textContent.includes('Hãy thu hẹp bộ lọc')"), 'oversized export notice'); await evaluate('window.__failure=null');
  });
  await test('Mobile/tablet page and detail fit viewport and reuse existing drawer', async () => {
    for (const width of [320, 390, 768, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width <= 800 }); await delay(100);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, `width ${width}`);
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await screenshot('mobile.png'); await click('[aria-label="Xem chi tiết đánh giá #24"]');
    await until(() => evaluate("!!document.querySelector('.reviews-full-comment')"), 'mobile detail');
    assert.equal(await evaluate("(() => {const r=document.querySelector('dialog[open]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()"), true);
    await screenshot('mobile-detail.png'); await click('dialog[open] [aria-label="Đóng hộp thoại"]');
    await click('[aria-controls="dashboard-sidebar"]'); assert.equal(await evaluate("!!document.querySelector('.dashboard-overlay')"), true);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  });
  await test('Forbidden API removes protected content; CUSTOMER and anonymous cannot access direct route', async () => {
    await evaluate("window.__failure={route:'/api/admin/reviews/export',status:403}"); await button('Xuất Excel');
    await until(() => evaluate("document.body.textContent.includes('403')"), 'revoked admin');
    assert.equal(await evaluate("!!document.querySelector('.reviews-page')"), false);
    await evaluate("sessionStorage.setItem('test-role','CUSTOMER');localStorage.setItem('role','ADMIN')"); await navigate();
    await until(() => evaluate("document.body.textContent.includes('403')"), 'customer denied');
    assert.equal(await evaluate("window.__requests.some(r=>r.route.startsWith('/api/admin/'))"), false);
    await evaluate("localStorage.removeItem('accessToken')"); await navigate();
    await until(() => evaluate("location.pathname==='/login'"), 'anonymous redirect');
  });
  assert.deepEqual(exceptions, [], 'No browser runtime exceptions');
  assert.deepEqual(await evaluate('window.__unexpected'), [], 'All backend calls remain mocked');
  console.log(`${passed} admin review browser checks passed.`);
} catch (error) {
  console.error(error); process.exitCode = 1;
  if (send) { const { data } = await send('Page.captureScreenshot', { format: 'png' }).catch(() => ({})); if (data) { await fs.mkdir(artifacts, { recursive: true }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(data, 'base64')); } }
} finally {
  if (send) await send('Browser.close').catch(() => {}); socket?.close(); browser?.kill(); if (vite) await vite.close();
  if (profile && path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('stationery-reviews-test-')) { await delay(300); await fs.rm(profile, { recursive: true, force: true, maxRetries: 4 }).catch(() => {}); }
}
