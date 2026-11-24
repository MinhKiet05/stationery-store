import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Fixtures exist only in tests. All API calls are intercepted; no production data is changed.
function installApi() {
  const realFetch=window.fetch.bind(window);
  if(!sessionStorage.getItem('orders-test-init')) {localStorage.setItem('accessToken','test-order-token');sessionStorage.setItem('orders-test-init','true');}
  window.__rows=Array.from({length:24},(_,i)=>({orderID:i+1,username:i%2?'bob':'alice',customerName:i%2?'Trần Bình':'Nguyễn An',
    orderDate:`2026-11-${String(i+1).padStart(2,'0')}T14:30:00`,status:['PENDING','PROCESSING','SHIPPED','DELIVERED','CANCELLED','RETURN_PENDING'][i%6],
    isPaid:i%2===1,paymentMethod:i%2?'BANK_TRANSFER':'COD',subTotal:200000,discountAmount:20000,totalAmount:180000}));
  window.__requests=[];window.__unexpected=[];window.__downloads=[];window.__delay=0;
  const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.__downloads.push({filename:this.download});return;}return click.call(this);};
  const detail=row=>({order:{...row,contactPhone:'0900000000',shippingAddress:'Địa chỉ kiểm thử',couponCode:'TEST20',deliveredAt:row.status==='DELIVERED'?'2026-11-24T10:00:00':null,
    items:[{orderDetailID:row.orderID*10,variantID:1,quantity:2,unitPrice:100000,subTotal:200000,variantTitle:'Màu xanh',productTitle:'Bút kiểm thử',productImage:location.origin+'/__test__/evidence.png'}]},
    customerName:row.customerName,username:row.username,email:'customer@example.test',variantSkus:{1:'ORDER-SKU'},returns:row.status==='RETURN_PENDING'?[{returnID:1,status:'PENDING',reason:'Kiểm thử yêu cầu trả hàng',createdAt:row.orderDate}]:[]});
  window.fetch=async(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href);if(!url.pathname.startsWith('/api/'))return realFetch(input,options);
    const route=url.pathname,method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
    window.__requests.push({route,method,query:Object.fromEntries(url.searchParams),auth:new Headers(options.headers).get('Authorization'),body});options.signal?.throwIfAborted();
    if(route==='/api/auth/me')return Response.json({username:'admin',fullName:'Quản trị kiểm thử',role: (window.__failure?.status === 403 ? 'CUSTOMER' : sessionStorage.getItem('test-role') || 'ADMIN')});
    if(window.__failure?.route===route&&(!window.__failure.method||window.__failure.method===method))return Response.json({detail:'SQL password=private-diagnostic'},{status:window.__failure.status});
    if(route.startsWith('/api/admin/orders')) {await new Promise(resolve=>setTimeout(resolve,window.__delay));options.signal?.throwIfAborted();}
    const match=route.match(/^\/api\/admin\/orders\/(\d+)(?:\/(status))?$/);
    if(match){const row=window.__rows.find(r=>r.orderID===Number(match[1]));if(!row)return Response.json({},{status:404});
      if(method==='PATCH'){
        if(body.expectedStatus!==row.status||body.expectedPaid!==row.isPaid)return Response.json({},{status:409});
        if(body.status==='CANCELLED' ? row.isPaid||!['PENDING','PROCESSING'].includes(row.status) : ({PENDING:'PROCESSING',PROCESSING:'SHIPPED',SHIPPED:'DELIVERED'})[row.status]!==body.status)return Response.json({},{status:409});
        row.status=body.status;return Response.json(detail(row).order);
      }return Response.json(detail(row));
    }
    if(route.startsWith('/api/admin/orders')) {
      const p=url.searchParams,search=(p.get('search')||'').replace(/^#/,'').toLowerCase();
      const rows=window.__rows.filter(row=>(!search||`ORD-${row.orderID} ${row.username} ${row.customerName}`.toLowerCase().includes(search))&&(!p.get('status')||row.status===p.get('status'))&&(!p.get('paid')||String(row.isPaid)===p.get('paid'))&&(!p.get('startDate')||row.orderDate.slice(0,10)>=p.get('startDate'))&&(!p.get('endDate')||row.orderDate.slice(0,10)<=p.get('endDate'))).sort((a,b)=>(p.get('sort')==='OLDEST'?1:-1)*(a.orderID-b.orderID));
      if(route.endsWith('/statistics'))return Response.json({totalOrders:rows.length,pendingOrders:rows.filter(r=>r.status==='PENDING').length,shippedOrders:rows.filter(r=>r.status==='SHIPPED').length,deliveredOrders:rows.filter(r=>r.status==='DELIVERED').length});
      if(route.endsWith('/export')){if(!rows.length)return Response.json({},{status:404});return new Response(new Uint8Array([80,75,3,4]),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="stationery-orders-2026-11-23.xlsx"'}});}
      if(route==='/api/admin/orders'){const page=Number(p.get('page')||0);return Response.json({content:rows.slice(page*10,(page+1)*10),totalElements:rows.length,totalPages:Math.ceil(rows.length/10)});}
    }
    if(route==='/api/cart/items')return Response.json({items:[],subtotal:0});if(route==='/api/product-types')return Response.json([]);
    window.__unexpected.push(route);return Response.json({},{status:500});
  };
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let vite, browser, profile, socket, send, evaluate;
const pending = new Map(), exceptions = [];
const artifacts = fileURLToPath(new URL('../../.cache/admin-orders/', import.meta.url));
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
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'stationery-orders-test-'));
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
  const navigate = async () => { await send('Page.navigate', { url: base + '/dashboard/orders' }); await until(() => evaluate('!!window.__requests'), 'page loaded'); };
  const loaded = () => until(() => evaluate("document.querySelectorAll('.orders-table tbody tr').length===10 && document.querySelectorAll('.orders-kpi-grid .dashboard-stat').length===4"), 'review data');
  const click = async selector => { assert.equal(await evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled)return false;n.focus();n.click();return true;})()`), true, selector); };
  const button = async (text, selector = 'document') => { await evaluate(`(() => {const n=[...${selector}.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!n||n.disabled)throw new Error('Button unavailable');n.focus();n.click()})()`); };
  const input = async (selector, value) => { await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor((n.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement).prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const select = async (selector, value) => { await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const screenshot = async name => { await evaluate("document.querySelectorAll('.store-notice-close').forEach(n=>n.click())"); await delay(350); await fs.mkdir(artifacts, { recursive: true }); const { data } = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, name), Buffer.from(data, 'base64')); };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await navigate(); await loaded();
  const top = "[...document.querySelectorAll('dialog[open]')].at(-1)";
  const closeDetail = () => click('dialog[open] [aria-label="Đóng hộp thoại"]');
  const open = async id => {await until(()=>evaluate(`!!document.querySelector('[aria-label="Xem chi tiết đơn hàng #${id}"]')`),'list refreshed');await click(`[aria-label="Xem chi tiết đơn hàng #${id}"]`);await until(()=>evaluate("!!document.querySelector('dialog[open] .admin-order-items')"),'order detail');};
  await test('ADMIN route refresh, shared layout, active navigation, four server KPI and bearer auth',async()=>{
    assert.equal(await evaluate("document.querySelectorAll('header').length"),1);assert.match(await evaluate("document.querySelector('.dashboard-nav-link.active').textContent"),/Đơn hàng/);
    assert.equal(await evaluate("document.querySelector('.orders-kpi-grid .dashboard-stat-value').textContent"),'24');
    assert.equal(await evaluate("window.__requests.filter(r=>r.route.startsWith('/api/admin/')).every(r=>r.auth==='Bearer test-order-token')"),true);
    await evaluate('window.__reloadMarker=true');await send('Page.reload');await until(()=>evaluate('!window.__reloadMarker&&!!window.__requests'),'reload');await loaded();await screenshot('desktop.png');
  });
  await test('Server pagination, status/payment/search/date/sort filters and full filtered Excel',async()=>{
    await click('[aria-label="Trang đơn hàng tiếp theo"]');await until(()=>evaluate("document.querySelector('.dashboard-pagination')?.textContent.includes('Trang 2')"),'page2');
    await click('[data-order-status=PENDING]');await until(()=>evaluate("document.querySelectorAll('.orders-table tbody tr').length===4"),'status');
    await input('[aria-label="Tìm đơn hàng"]','alice');await select('[aria-label="Lọc thanh toán"]','false');
    await input('[aria-label="Ngày bắt đầu đơn hàng"]','2026-11-01');await input('[aria-label="Ngày kết thúc đơn hàng"]','2026-11-13');await button('Áp dụng ngày');await select('[aria-label="Sắp xếp đơn hàng"]','OLDEST');
    await until(()=>evaluate("document.querySelectorAll('.orders-table tbody tr').length===3 && window.__requests.at(-1).query.search==='alice'"),'filtered');
    await button('Xuất Excel');await until(()=>evaluate('window.__downloads.length===1'),'download');
    assert.deepEqual((await evaluate("window.__requests.findLast(r=>r.route.endsWith('/export'))")).query,{search:'alice',status:'PENDING',paid:'false',startDate:'2026-11-01',endDate:'2026-11-13',sort:'OLDEST'});
    assert.equal(await evaluate('window.__downloads[0].filename'),'stationery-orders-2026-11-23.xlsx');await button('Đặt lại');await loaded();
  });
  await test('Detail loads historical amounts, customer, SKU, shipping address and separate payment state',async()=>{
    await evaluate('window.__delay=400');await click('[aria-label="Xem chi tiết đơn hàng #19"]');await until(()=>evaluate("document.querySelector('dialog[open] [role=status]')?.textContent.includes('Đang tải')"),'loading');
    await until(()=>evaluate("!!document.querySelector('.admin-order-items')"),'detail');const text=await evaluate("document.querySelector('dialog[open]').textContent");
    for(const value of ['ORDER-SKU','Địa chỉ kiểm thử','customer@example.test','100.000','200.000','20.000','180.000','Chưa thanh toán'])assert.ok(text.includes(value),value);
    assert.equal(await evaluate("document.querySelector('dialog[open] img').complete&&document.querySelector('dialog[open] img').naturalWidth>0"),true);await screenshot('detail.png');await closeDetail();await evaluate('window.__delay=0');
  });
  await test('Confirmation prevents duplicates and busy dismissal, updates modal, table and KPI without payment changes',async()=>{
    await open(19);await button('Xác nhận đơn hàng',"document.querySelector('dialog[open]')");await evaluate('window.__delay=500');
    await evaluate(`(()=>{const n=${top}.querySelector('.dashboard-button-primary');n.click();n.click()})()`);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});assert.equal(await evaluate("document.querySelectorAll('dialog[open]').length"),2);
    await until(()=>evaluate("document.querySelector('dialog[open] .dashboard-badge')?.textContent==='Đang xử lý'"),'updated');
    assert.equal(await evaluate("window.__requests.filter(r=>r.method==='PATCH').length"),1);assert.equal(await evaluate('window.__rows.find(r=>r.orderID===19).isPaid'),false);
    await until(()=>evaluate("document.querySelectorAll('.orders-kpi-grid .dashboard-stat-value')[1]?.textContent==='3'"),'KPI refreshed');
    assert.deepEqual(await evaluate("window.__requests.find(r=>r.method==='PATCH').body"),{status:'PROCESSING',expectedStatus:'PENDING',expectedPaid:false});await closeDetail();await evaluate('window.__delay=0');
  });
  await test('Cancel is confirmed and paid orders never offer cancel or automatic refund',async()=>{
    await open(19);await button('Hủy đơn hàng',"document.querySelector('dialog[open]')");await button('Xác nhận',top);await until(()=>evaluate("document.querySelector('dialog[open] .dashboard-badge')?.textContent==='Đã hủy'"),'cancelled');await closeDetail();
    await open(20);assert.equal(await evaluate("[...document.querySelector('dialog[open]').querySelectorAll('button')].some(n=>/Hủy đơn|Hoàn tiền/.test(n.textContent))"),false);await closeDetail();
  });
  await test('409 and server failure retain modal and disable stale mutations until fresh detail',async()=>{
    await open(21);await evaluate("window.__rows.find(r=>r.orderID===21).status='DELIVERED'");await button('Xác nhận đã giao',"document.querySelector('dialog[open]')");await button('Xác nhận',top);
    await until(()=>evaluate("!!document.querySelector('dialog[open] [role=alert]')"),'conflict');assert.equal(await evaluate("[...document.querySelector('dialog[open]').querySelectorAll('button')].find(n=>n.textContent==='Xác nhận đã giao').disabled"),true);
    await button('Tải lại chi tiết',"document.querySelector('dialog[open]')");await until(()=>evaluate("document.querySelector('dialog[open] .dashboard-badge')?.textContent==='Đã giao'"),'fresh');await closeDetail();
    await open(20);await evaluate("window.__failure={route:'/api/admin/orders/20/status',status:500}");await button('Xác nhận giao vận chuyển',"document.querySelector('dialog[open]')");await button('Xác nhận',top);
    await until(()=>evaluate("!!document.querySelector('dialog[open] [role=alert]')"),'server failure');
    assert.equal(await evaluate("[...document.querySelector('dialog[open]').querySelectorAll('button')].find(n=>n.textContent==='Xác nhận giao vận chuyển').disabled"),true);
    assert.equal(await evaluate('window.__rows.find(r=>r.orderID===20).status'),'PROCESSING');assert.equal(await evaluate("document.body.textContent.includes('private-diagnostic')"),false);await closeDetail();await evaluate('window.__failure=null');
  });
  await test('Empty, date validation, list error retry, detail404 and export errors are safe',async()=>{
    await input('[aria-label="Tìm đơn hàng"]','not-found');await until(()=>evaluate("document.querySelector('.orders-list-panel')?.textContent.includes('Không có đơn hàng')"),'empty');await button('Đặt lại');await loaded();
    await input('[aria-label="Ngày bắt đầu đơn hàng"]','2026-11-24');await input('[aria-label="Ngày kết thúc đơn hàng"]','2026-11-01');await button('Áp dụng ngày');assert.equal(await evaluate("!!document.querySelector('.orders-date-error')"),true);await button('Đặt lại');
    await evaluate("window.__failure={route:'/api/admin/orders',status:500}");await click('[data-order-status=PENDING]');await until(()=>evaluate("!!document.querySelector('.orders-list-panel [role=alert]')"),'list error');await evaluate('window.__failure=null');await button('Thử lại',"document.querySelector('.orders-list-panel')");await until(()=>evaluate("document.querySelectorAll('.orders-table tbody tr').length===3"),'retry');await button('Đặt lại');await loaded();
    await evaluate("window.__failure={route:'/api/admin/orders/24',status:404}");await click('[aria-label="Xem chi tiết đơn hàng #24"]');await until(()=>evaluate("!!document.querySelector('dialog[open] [role=alert]')"),'detail404');assert.equal(await evaluate("document.body.textContent.includes('private-diagnostic')"),false);await closeDetail();
    await evaluate("window.__failure={route:'/api/admin/orders/export',status:413}");await button('Xuất Excel');await until(()=>evaluate("document.body.textContent.includes('thu hẹp bộ lọc')"),'export413');await evaluate('window.__failure=null');
  });
  await test('Responsive 320,390,768,1440 with focus, Escape and viewport-bounded modal',async()=>{
    for(const width of [1440,768,320,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<600});await delay(350);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`overflow ${width}`);}
    await screenshot('mobile.png');await open(24);await screenshot('mobile-detail.png');assert.equal(await evaluate("(()=>{const r=document.querySelector('dialog[open]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()"),true);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until(()=>evaluate("!document.querySelector('dialog[open]')"),'Escape');assert.equal(await evaluate("document.activeElement.getAttribute('aria-label')"),'Xem chi tiết đơn hàng #24');
  });
  await test('403 revokes protected screen; forged local role cannot grant CUSTOMER or anonymous access',async()=>{
    await evaluate("window.__failure={route:'/api/admin/orders/export',status:403}");await button('Xuất Excel');await until(()=>evaluate("document.body.textContent.includes('403')"),'403');assert.equal(await evaluate("!!document.querySelector('.orders-page')"),false);
    await evaluate("sessionStorage.setItem('test-role','CUSTOMER');localStorage.setItem('role','ADMIN')");await navigate();await until(()=>evaluate("document.body.textContent.includes('403')"),'customer');assert.equal(await evaluate("window.__requests.some(r=>r.route.startsWith('/api/admin/'))"),false);
    await evaluate("localStorage.removeItem('accessToken')");await navigate();await until(()=>evaluate("location.pathname==='/login'"),'anonymous');
  });
  assert.deepEqual(exceptions,[],'No browser runtime exceptions');assert.deepEqual(await evaluate('window.__unexpected'),[],'All API calls are mocked');console.log(`${passed} admin orders browser checks passed.`);
} catch (error) {
  console.error(error); process.exitCode = 1;
  if (send) { const { data } = await send('Page.captureScreenshot', { format: 'png' }).catch(() => ({})); if (data) { await fs.mkdir(artifacts, { recursive: true }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(data, 'base64')); } }
} finally {
  if (send) await send('Browser.close').catch(() => {}); socket?.close(); browser?.kill(); if (vite) await vite.close();
  if (profile && path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('stationery-orders-test-')) { await delay(300); await fs.rm(profile, { recursive: true, force: true, maxRetries: 4 }).catch(() => {}); }
}
