import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Synthetic fixtures are confined to this headless test. Every API request is intercepted.
function installApi() {
  const realFetch = window.fetch.bind(window), picture = location.origin + '/__test__/evidence.png';
  if (!sessionStorage.getItem('returns-test-init')) { localStorage.setItem('accessToken', 'test-return-token'); sessionStorage.setItem('returns-test-init', 'true'); }
  window.__rows = Array.from({ length: 24 }, (_, i) => ({ returnID: i + 1, orderID: i + 101, userID: i % 2 + 1, username: i % 2 ? 'bob' : 'alice', customerName: i % 2 ? 'Trần Bình' : 'Nguyễn An',
    reason: `Lý do kiểm thử yêu cầu ${i + 1}. ` + 'Sản phẩm cần được kiểm tra khi nhận lại hàng. '.repeat(12), status: ['PENDING', 'APPROVED', 'REJECTED'][i % 3],
    createdAt: `2026-11-${String(i + 1).padStart(2, '0')}T14:30:00`, processedAt: i % 3 ? '2026-11-24T10:00:00' : null, adminNote: i % 3 ? 'Ghi chú đã xử lý' : null, receipt: null }));
  window.__inventory = { 1: 8, 2: 5 }; window.__requests = []; window.__unexpected = []; window.__failure = null; window.__delay = 0; window.__downloads = []; window.__afterDecisionReadFailure = false;
  window.__items = row => [{ returnItemID: row.returnID * 10 + 1, orderDetailID: row.returnID * 100 + 1, variantID: 1, productTitle: 'Hộp bút kiểm thử', imageUrl: picture, sku: 'TEST-PEN', variantTitle: 'Màu xanh', purchasedQuantity: 3, quantity: 3, unitPrice: 100000 },
    { returnItemID: row.returnID * 10 + 2, orderDetailID: row.returnID * 100 + 2, variantID: 2, productTitle: 'Sổ tay kiểm thử', imageUrl: picture, sku: 'TEST-NOTE', variantTitle: 'A5', purchasedQuantity: 2, quantity: 1, unitPrice: 50000 }];
  window.__makeReceipt = row => ({ receivedAt: '2026-11-24T11:00:00', receivedBy: 'another-admin', inspectedAt: null, inspectedBy: null, inspectionNote: null,
    items: window.__items(row).map(item => ({ returnItemID: item.returnItemID, variantID: item.variantID, receivedQuantity: item.quantity, goodQuantity: null, damagedQuantity: null, stockBefore: null, stockAfter: null })) });
  const detail = row => ({ request: Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'receipt')), receipt: row.receipt,
    order: { orderDate: '2026-11-01T10:00:00', status: row.status === 'PENDING' ? 'RETURN_PENDING' : 'DELIVERED', isPaid: true, paymentMethod: 'COD', totalAmount: 300000, contactPhone: '0900000000', shippingAddress: 'Địa chỉ kiểm thử', deliveredAt: '2026-11-20T10:00:00' },
    items: window.__items(row), evidenceUrls: [picture, picture + '?second', location.origin + '/__test__/evidence.mp4'] });
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__downloads.push({ filename: this.download, href: this.href }); return; } return click.call(this); };
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (!url.pathname.startsWith('/api/')) return realFetch(input, options);
    const route = url.pathname, method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : null;
    window.__requests.push({ route, method, query: Object.fromEntries(url.searchParams), auth: new Headers(options.headers).get('Authorization'), body }); options.signal?.throwIfAborted();
    if (route === '/api/auth/me') return Response.json({ username: 'return-admin', fullName: 'Quản trị kiểm thử', email: 'admin@example.test', role: (window.__failure?.status === 403 ? 'CUSTOMER' : sessionStorage.getItem('test-role') || 'ADMIN') });
    if (window.__failure?.route === route && (!window.__failure.method || window.__failure.method === method)) return Response.json({ detail: 'SQL password=private-diagnostic' }, { status: window.__failure.status });
    const match = route.match(/^\/api\/admin\/returns\/(\d+)(?:\/(status|receive|restock))?$/);
    if (match) {
      await new Promise(resolve => setTimeout(resolve, window.__delay)); options.signal?.throwIfAborted();
      const row = window.__rows.find(item => item.returnID === Number(match[1])); if (!row) return Response.json({}, { status: 404 });
      if (method === 'PATCH' && match[2] === 'status') {
        if (row.status !== 'PENDING') return Response.json({}, { status: 409 });
        row.status = body.status; row.adminNote = body.adminNote; row.processedAt = '2026-11-24T10:30:00';
        if (window.__afterDecisionReadFailure) window.__failure = { route: `/api/admin/returns/${row.returnID}`, method: 'GET', status: 500 };
        return Response.json(row);
      }
      if (method === 'POST' && match[2] === 'receive') {
        if (row.status !== 'APPROVED' || row.receipt) return Response.json({}, { status: 409 });
        row.receipt = window.__makeReceipt(row); row.receipt.receivedBy = 'return-admin';
        row.receipt.items.forEach(item => { item.receivedQuantity = body.items.find(value => value.returnItemID === item.returnItemID).receivedQuantity; });
      }
      if (method === 'POST' && match[2] === 'restock') {
        if (row.status !== 'APPROVED' || !row.receipt || row.receipt.inspectedAt) return Response.json({}, { status: 409 });
        if (row.receipt.items.some(item => { const result = body.items.find(value => value.returnItemID === item.returnItemID); return !result || result.goodQuantity + result.damagedQuantity !== item.receivedQuantity; })) return Response.json({}, { status: 400 });
        row.receipt.items.forEach(item => { const result = body.items.find(value => value.returnItemID === item.returnItemID); Object.assign(item, result, { stockBefore: window.__inventory[item.variantID], stockAfter: window.__inventory[item.variantID] + result.goodQuantity }); window.__inventory[item.variantID] += result.goodQuantity; });
        row.receipt.inspectedAt = '2026-11-24T12:00:00'; row.receipt.inspectedBy = 'return-admin'; row.receipt.inspectionNote = body.inspectionNote;
      }
      return Response.json(detail(row));
    }
    if (route.startsWith('/api/admin/returns')) {
      const p = url.searchParams, search = (p.get('search') || '').replace(/^#/, '').toLowerCase();
      const rows = window.__rows.filter(row => (!search || `RET-${row.returnID} ORD-${row.orderID} ${row.username} ${row.customerName}`.toLowerCase().includes(search)) && (!p.get('status') || row.status === p.get('status'))
        && (!p.get('startDate') || row.createdAt.slice(0, 10) >= p.get('startDate')) && (!p.get('endDate') || row.createdAt.slice(0, 10) <= p.get('endDate')))
        .sort((a, b) => (p.get('sort') === 'OLDEST' ? 1 : -1) * (a.returnID - b.returnID));
      if (route.endsWith('/statistics')) return Response.json({ totalRequests: rows.length, pendingRequests: rows.filter(row => row.status === 'PENDING').length, approvedRequests: rows.filter(row => row.status === 'APPROVED').length, rejectedRequests: rows.filter(row => row.status === 'REJECTED').length });
      if (route.endsWith('/export')) { if (!rows.length) return Response.json({}, { status: 404 }); return new Response(new Uint8Array([80,75,3,4]), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="stationery-returns-2026-11-23.xlsx"' } }); }
      if (route === '/api/admin/returns') { const page = Number(p.get('page') || 0), size = Number(p.get('size') || 10); return Response.json({ content: rows.slice(page * size, (page + 1) * size), totalElements: rows.length, totalPages: Math.ceil(rows.length / size) }); }
    }
    if (route === '/api/cart/items') return Response.json({ items: [], subtotal: 0 }); if (route === '/api/product-types') return Response.json([]);
    window.__unexpected.push(route); return Response.json({}, { status: 500 });
  };
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let vite, browser, profile, socket, send, evaluate;
const pending = new Map(), exceptions = [];
const artifacts = fileURLToPath(new URL('../../.cache/admin-returns/', import.meta.url));
let passed = 0;
async function until(check, label) { for (let i = 0; i < 150; i++) { if (await check()) return; await delay(80); } throw new Error(`Timed out: ${label}`); }
async function test(label, run) { await run(); passed++; console.log(`PASS ${label}`); }

try {
  const testAsset = (request, response, next) => {
    if (!request.url?.startsWith('/__test__/evidence.png')) { next(); return; }
    response.setHeader('Content-Type', 'image/svg+xml');
    response.end('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#e1e9fa"/><path d="m50 110 60-60" stroke="#a64c12" stroke-width="15"/></svg>');
  };
  vite = await createServer({ plugins: [{ name: 'returns-test-assets', configureServer(server) { server.middlewares.use(testAsset); } }], server: { host: '127.0.0.1', port: 0, open: false } }); await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const executable = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(value => value && existsSync(value));
  assert.ok(executable, 'Set CHROME_PATH to an installed Chromium browser');
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'stationery-returns-test-'));
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
  const navigate = async () => { await send('Page.navigate', { url: base + '/dashboard/returns' }); await until(() => evaluate('!!window.__requests'), 'page loaded'); };
  const loaded = () => until(() => evaluate("document.querySelectorAll('.returns-table tbody tr').length===10 && document.querySelectorAll('.returns-kpi-grid .dashboard-stat').length===4"), 'review data');
  const click = async selector => { assert.equal(await evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled)return false;n.focus();n.click();return true;})()`), true, selector); };
  const button = async (text, selector = 'document') => { await evaluate(`(() => {const n=[...${selector}.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!n||n.disabled)throw new Error('Button unavailable');n.focus();n.click()})()`); };
  const input = async (selector, value) => { await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor((n.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement).prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const select = async (selector, value) => { await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const screenshot = async name => { await evaluate("document.querySelectorAll('.store-notice-close').forEach(n=>n.click())"); await delay(350); await fs.mkdir(artifacts, { recursive: true }); const { data } = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, name), Buffer.from(data, 'base64')); };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await navigate(); await loaded();
  const top = "[...document.querySelectorAll('dialog[open]')].at(-1)";
  const closeDetail = () => click('dialog[open] [aria-label="Đóng hộp thoại"]');
  const open = async id => { await click(`[aria-label="Xem chi tiết yêu cầu #${id}"]`); await until(() => evaluate("!!document.querySelector('dialog[open] .returns-full-reason')"), 'detail ready'); };
  await test('ADMIN direct route and refresh reuse layout, active menu and server aggregates', async () => {
    assert.equal(await evaluate("document.querySelectorAll('header').length"),1); assert.equal(await evaluate("document.querySelector('.dashboard-nav-link.active').textContent"),'Trả hàng');
    assert.equal(await evaluate("document.querySelector('.returns-kpi-grid .dashboard-stat-value').textContent"),'24');
    assert.equal(await evaluate("window.__requests.filter(r=>r.route.startsWith('/api/admin/')).every(r=>r.auth==='Bearer test-return-token')"),true);
    await evaluate('window.__reloadMarker=true'); await send('Page.reload'); await until(()=>evaluate('!window.__reloadMarker && !!window.__requests'),'refresh'); await loaded(); await screenshot('desktop.png');
  });
  await test('Pagination, status, search, dates and sorting are server filters; Excel uses every active filter', async () => {
    await click('[aria-label="Trang yêu cầu tiếp theo"]'); await until(()=>evaluate("document.querySelector('.dashboard-pagination')?.textContent.includes('Trang 2')"),'page2');
    await click('[data-return-status=PENDING]'); await until(()=>evaluate("document.querySelectorAll('.returns-table tbody tr').length===8"),'pending');
    await input('[aria-label="Tìm yêu cầu trả hàng"]','alice'); await until(()=>evaluate("document.querySelectorAll('.returns-table tbody tr').length===4"),'search');
    await input('[aria-label="Ngày bắt đầu yêu cầu"]','2026-11-01'); await input('[aria-label="Ngày kết thúc yêu cầu"]','2026-11-13'); await button('Áp dụng ngày');
    await select('[aria-label="Sắp xếp yêu cầu trả hàng"]','OLDEST'); await until(()=>evaluate("document.querySelectorAll('.returns-table tbody tr').length===3"),'dates');
    await button('Xuất Excel'); await until(()=>evaluate('window.__downloads.length===1'),'export');
    const request=await evaluate("window.__requests.findLast(r=>r.route.endsWith('/export'))"); assert.deepEqual(request.query,{search:'alice',status:'PENDING',startDate:'2026-11-01',endDate:'2026-11-13',sort:'OLDEST'});
    assert.equal(await evaluate('window.__downloads[0].filename'),'stationery-returns-2026-11-23.xlsx'); await button('Đặt lại'); await loaded();
  });
  await test('Detail has loading, actual items, evidence viewer, original payment and no refund action', async () => {
    await evaluate('window.__delay=400'); await click('[aria-label="Xem chi tiết yêu cầu #24"]'); await until(()=>evaluate("document.querySelector('dialog[open] [role=status]')?.textContent.includes('Đang tải')"),'loading');
    await until(()=>evaluate("!!document.querySelector('.returns-full-reason')"),'loaded'); assert.equal(await evaluate("document.querySelectorAll('.returns-items li').length"),2);
    assert.equal(await evaluate("[...document.querySelector('dialog[open]').querySelectorAll('button')].some(n=>/Hoàn tiền|Chấp thuận trả hàng/.test(n.textContent))"),false);
    assert.equal(await evaluate("document.querySelectorAll('.returns-evidence-grid button').length"),3); await screenshot('detail.png');
    await until(()=>evaluate("[...document.querySelectorAll('.returns-evidence-grid img')].every(n=>n.complete&&n.naturalWidth>0)"),'actual local evidence images');
    await click('[aria-label="Xem bằng chứng 1"]'); await until(()=>evaluate("document.querySelectorAll('dialog[open]').length===2"),'viewer');
    await click('[aria-label="Bằng chứng tiếp theo"]'); await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await until(()=>evaluate("document.querySelectorAll('dialog[open]').length===1"),'close viewer'); await closeDetail(); await evaluate('window.__delay=0');
  });
  await test('Approval confirms, blocks duplicate clicks and busy Escape, refreshes modal/KPIs without stock or refund changes', async () => {
    await open(22); await input('[aria-label="Ghi chú xử lý trả hàng"]','Đồng ý kiểm tra hàng trả'); await button('Chấp thuận trả hàng',"document.querySelector('dialog[open]')");
    await evaluate('window.__delay=500'); await button('Xác nhận',top); await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27}); assert.equal(await evaluate("document.querySelectorAll('dialog[open]').length"),2);
    await until(()=>evaluate("document.querySelector('dialog[open] .dashboard-badge')?.textContent==='Đã chấp thuận'"),'approved');
    assert.deepEqual(await evaluate('window.__inventory'),{1:8,2:5}); assert.equal(await evaluate("window.__requests.filter(r=>r.method==='PATCH').length"),1);
    await until(()=>evaluate("document.querySelectorAll('.returns-kpi-grid .dashboard-stat-value')[1]?.textContent==='7'"),'KPI'); await evaluate('window.__delay=0');
  });
  await test('Receipt validates actual counts and records receipt without changing inventory', async () => {
    await button('Xác nhận đã nhận hàng',"document.querySelector('dialog[open]')"); await input('[aria-label="Thực nhận mục 221"]','4'); await input('[aria-label="Thực nhận mục 222"]','1'); await button('Xác nhận đã nhận hàng',top);
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Thực nhận mục 221\"]').validity.valid"),false);
    await input('[aria-label="Thực nhận mục 221"]','0'); await input('[aria-label="Thực nhận mục 222"]','0'); await button('Xác nhận đã nhận hàng',top); await until(()=>evaluate("!!document.querySelector('.return-inventory-form [role=alert]')"),'zero rejected');
    await input('[aria-label="Thực nhận mục 221"]','3'); await input('[aria-label="Thực nhận mục 222"]','1'); await button('Xác nhận đã nhận hàng',top); await until(()=>evaluate("document.querySelectorAll('dialog[open]').length===3"),'confirm receipt');
    await button('Xác nhận',top); await until(()=>evaluate("document.querySelectorAll('dialog[open]').length===1 && document.querySelector('.returns-receipt-section')?.textContent.includes('chờ kiểm tra')"),'received');
    assert.deepEqual(await evaluate('window.__inventory'),{1:8,2:5}); assert.equal(await evaluate("window.__requests.filter(r=>r.route.endsWith('/receive')).length"),1);
  });
  await test('Inspection requires complete classification; adds only two good items and locks completed results', async () => {
    await button('Kiểm tra & nhập lại kho',"document.querySelector('dialog[open]')");
    for(const [label,value] of [['Hàng tốt mục 221','2'],['Hàng hỏng mục 221','0'],['Hàng tốt mục 222','0'],['Hàng hỏng mục 222','1']]) await input(`[aria-label="${label}"]`,value);
    await button('Xác nhận nhập kho',top); await until(()=>evaluate("document.querySelector('.return-inventory-form [role=alert]')?.textContent.includes('phân loại đầy đủ')"),'classification');
    await input('[aria-label="Hàng hỏng mục 221"]','1'); await input('[aria-label="Ghi chú kiểm tra hàng trả"]','Hai hộp còn tốt'); assert.equal(await evaluate("document.querySelector('.return-inventory-preview strong').textContent"),'+2');
    await screenshot('inspection.png'); await button('Xác nhận nhập kho',top); await evaluate('window.__delay=500');
    await evaluate("(()=>{const dialog=[...document.querySelectorAll('dialog[open]')].at(-1);const n=[...dialog.querySelectorAll('button')].find(n=>n.textContent.trim()==='Xác nhận');n.focus();n.click();n.click()})()");
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27}); assert.equal(await evaluate("document.querySelectorAll('dialog[open]').length"),3);
    await until(()=>evaluate("document.querySelectorAll('dialog[open]').length===1 && document.querySelector('.returns-receipt-section')?.textContent.includes('Đã kiểm tra')"),'inspected');
    assert.deepEqual(await evaluate('window.__inventory'),{1:10,2:5}); assert.equal(await evaluate("window.__requests.filter(r=>r.route.endsWith('/restock')).length"),1);
    assert.equal(await evaluate("[...document.querySelector('dialog[open]').querySelectorAll('button')].some(n=>n.textContent==='Kiểm tra & nhập lại kho'||n.textContent==='Xác nhận đã nhận hàng')"),false);
    await closeDetail(); await evaluate('window.__delay=0'); await open(22); assert.equal(await evaluate("document.querySelector('.returns-receipt-section').textContent.includes('Nhập lại kho: +2')"),true); await closeDetail();
  });
  await test('Rejection confirms, retains notes and never changes inventory', async () => {
    await open(19); await input('[aria-label="Ghi chú xử lý trả hàng"]','Không đủ điều kiện'); await button('Từ chối',"document.querySelector('dialog[open]')"); await button('Xác nhận',top);
    await until(()=>evaluate("document.querySelector('dialog[open] .dashboard-badge')?.textContent==='Đã từ chối'"),'rejected'); assert.deepEqual(await evaluate('window.__inventory'),{1:10,2:5}); await closeDetail();
  });
  await test('409 during receipt keeps main modal open and automatically loads another admin result', async () => {
    await open(23); await button('Xác nhận đã nhận hàng',"document.querySelector('dialog[open]')"); await input('[aria-label="Thực nhận mục 231"]','3'); await input('[aria-label="Thực nhận mục 232"]','1'); await button('Xác nhận đã nhận hàng',top);
    await evaluate("window.__rows.find(r=>r.returnID===23).receipt=window.__makeReceipt(window.__rows.find(r=>r.returnID===23))"); await button('Xác nhận',top);
    await until(()=>evaluate("document.querySelectorAll('dialog[open]').length===1 && document.querySelector('.returns-receipt-section')?.textContent.includes('another-admin')"),'conflict fresh read');
    assert.equal(await evaluate("!!document.querySelector('dialog[open] [role=alert]')"),true); assert.deepEqual(await evaluate('window.__inventory'),{1:10,2:5}); await closeDetail();
  });
  await test('Inventory request failure leaves form open and prevents unsafe blind retry', async () => {
    await open(23); await button('Kiểm tra & nhập lại kho',"document.querySelector('dialog[open]')");
    for(const [label,value] of [['Hàng tốt mục 231','2'],['Hàng hỏng mục 231','1'],['Hàng tốt mục 232','0'],['Hàng hỏng mục 232','1']]) await input(`[aria-label="${label}"]`,value);
    await evaluate("window.__failure={route:'/api/admin/returns/23/restock',status:500,method:'POST'}"); await button('Xác nhận nhập kho',top); await button('Xác nhận',top);
    await until(()=>evaluate("!!document.querySelector('.return-inventory-form [role=alert]')"),'inventory failure'); assert.equal(await evaluate("[...[...document.querySelectorAll('dialog[open]')].at(-1).querySelectorAll('button')].find(n=>n.textContent==='Xác nhận nhập kho').disabled"),true);
    assert.deepEqual(await evaluate('window.__inventory'),{1:10,2:5}); await evaluate('window.__failure=null'); await button('Hủy',top); await until(()=>evaluate("!!document.querySelector('.returns-receipt-section')"),'reload'); await closeDetail();
  });
  await test('A successful decision followed by detail read failure remains saved and exposes retry separately', async () => {
    await open(16); await evaluate('window.__afterDecisionReadFailure=true'); await button('Chấp thuận trả hàng',"document.querySelector('dialog[open]')"); await button('Xác nhận',top);
    await until(()=>evaluate("document.querySelectorAll('dialog[open]').length===1 && !!document.querySelector('dialog[open] [role=alert]')"),'read failure');
    assert.equal(await evaluate('window.__rows.find(r=>r.returnID===16).status'),'APPROVED'); assert.equal(await evaluate("document.querySelector('dialog[open]').textContent.includes('private-diagnostic')"),false);
    await evaluate('window.__afterDecisionReadFailure=false;window.__failure=null'); await button('Thử lại',"document.querySelector('dialog[open]')"); await until(()=>evaluate("!!document.querySelector('.returns-full-reason')"),'retry'); await closeDetail();
  });
  await test('Restock conflict refetches a completed inspection and hides further restock actions', async () => {
    await evaluate("window.__rows.find(r=>r.returnID===20).receipt=window.__makeReceipt(window.__rows.find(r=>r.returnID===20))"); await open(20);
    await button('Kiểm tra & nhập lại kho',"document.querySelector('dialog[open]')");
    for(const [label,value] of [['Hàng tốt mục 201','2'],['Hàng hỏng mục 201','1'],['Hàng tốt mục 202','0'],['Hàng hỏng mục 202','1']]) await input(`[aria-label="${label}"]`,value);
    await button('Xác nhận nhập kho',top);
    await evaluate("(()=>{const r=window.__rows.find(r=>r.returnID===20).receipt;r.inspectedAt='2026-11-24T12:00:00';r.inspectedBy='another-admin';r.items.forEach((item,index)=>{item.goodQuantity=index?0:2;item.damagedQuantity=1;item.stockBefore=window.__inventory[item.variantID];item.stockAfter=item.stockBefore+item.goodQuantity;window.__inventory[item.variantID]+=item.goodQuantity})})()");
    const before=await evaluate('window.__inventory'); await button('Xác nhận',top);
    await until(()=>evaluate("document.querySelectorAll('dialog[open]').length===1&&document.querySelector('.returns-receipt-section')?.textContent.includes('Đã kiểm tra')"),'conflict inspection reload');
    assert.deepEqual(await evaluate('window.__inventory'),before);
    assert.equal(await evaluate("[...document.querySelector('dialog[open]').querySelectorAll('button')].some(n=>n.textContent==='Kiểm tra & nhập lại kho')"),false); await closeDetail();
  });
  await test('List errors retry, empty filters and export errors never fabricate values or expose diagnostics', async () => {
    await input('[aria-label="Tìm yêu cầu trả hàng"]','NOT_FOUND'); await until(()=>evaluate("document.querySelector('.returns-kpi-grid .dashboard-stat-value')?.textContent==='0'"),'empty'); assert.equal(await evaluate("document.querySelectorAll('.returns-table tbody tr').length"),0);
    await button('Xuất Excel'); await until(()=>evaluate("document.body.textContent.includes('Không có yêu cầu phù hợp để xuất.')"),'empty export'); await button('Đặt lại'); await loaded();
    await evaluate("window.__failure={route:'/api/admin/returns',status:500}"); await select('[aria-label="Sắp xếp yêu cầu trả hàng"]','OLDEST'); await until(()=>evaluate("!!document.querySelector('.returns-list-panel [role=alert]')"),'list error');
    await evaluate('window.__failure=null'); await button('Thử lại',"document.querySelector('.returns-list-panel [role=alert]')"); await loaded(); await button('Đặt lại'); await loaded();
    await evaluate("window.__failure={route:'/api/admin/returns/24',status:404}"); await click('[aria-label="Xem chi tiết yêu cầu #24"]'); await until(()=>evaluate("!!document.querySelector('dialog[open] [role=alert]')"),'404'); await closeDetail();
    await evaluate("window.__failure={route:'/api/admin/returns/export',status:413}"); await button('Xuất Excel'); await until(()=>evaluate("document.body.textContent.includes('Hãy thu hẹp bộ lọc')"),'export bound'); await evaluate('window.__failure=null');
  });
  await test('Page, evidence and receipt/inspection forms fit desktop, tablet and mobile viewport', async () => {
    for(const width of [320,390,768,1440]) { await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<=800}); await delay(250); assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`width ${width}`); }
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true}); await screenshot('mobile.png'); await open(23); await screenshot('mobile-detail.png');
    await button('Kiểm tra & nhập lại kho',"document.querySelector('dialog[open]')"); assert.equal(await evaluate("(()=>{const r=[...document.querySelectorAll('dialog[open]')].at(-1).getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()"),true);
    await screenshot('mobile-inspection.png'); await button('Hủy',top); await until(()=>evaluate("!!document.querySelector('.returns-full-reason')"),'return detail'); await closeDetail();
  });
  await test('403 revokes protected data; CUSTOMER and anonymous cannot access the route', async () => {
    await evaluate("window.__failure={route:'/api/admin/returns/export',status:403}"); await button('Xuất Excel'); await until(()=>evaluate("document.body.textContent.includes('403')"),'revoked'); assert.equal(await evaluate("!!document.querySelector('.returns-page')"),false);
    await evaluate("sessionStorage.setItem('test-role','CUSTOMER');localStorage.setItem('role','ADMIN')"); await navigate(); await until(()=>evaluate("document.body.textContent.includes('403')"),'customer'); assert.equal(await evaluate("window.__requests.some(r=>r.route.startsWith('/api/admin/'))"),false);
    await evaluate("localStorage.removeItem('accessToken')"); await navigate(); await until(()=>evaluate("location.pathname==='/login'"),'anonymous');
  });
  assert.deepEqual(exceptions, [], 'No browser runtime exceptions');
  assert.deepEqual(await evaluate('window.__unexpected'), [], 'All backend calls remain mocked');
  console.log(`${passed} admin returns browser checks passed.`);
} catch (error) {
  console.error(error); process.exitCode = 1;
  if (send) { const { data } = await send('Page.captureScreenshot', { format: 'png' }).catch(() => ({})); if (data) { await fs.mkdir(artifacts, { recursive: true }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(data, 'base64')); } }
} finally {
  if (send) await send('Browser.close').catch(() => {}); socket?.close(); browser?.kill(); if (vite) await vite.close();
  if (profile && path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('stationery-returns-test-')) { await delay(300); await fs.rm(profile, { recursive: true, force: true, maxRetries: 4 }).catch(() => {}); }
}
