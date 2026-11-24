import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// All synthetic fixtures stay inside this runner. No API request reaches production.
function installApi() {
  const realFetch=window.fetch.bind(window);
  if(!sessionStorage.getItem('users-test-init')){localStorage.setItem('accessToken','test-user-token');sessionStorage.setItem('users-test-init','true');}
  window.__users=Array.from({length:24},(_,i)=>({userID:i+1,username:`user${i+1}`,fullName:`Người dùng ${i+1}`,email:`user${i+1}@example.test`,phoneNumber:'0901234567',role:i===0?'ADMIN':'CUSTOMER',isActive:(i+1)%5!==0,createdAt:`2026-11-${String(i+1).padStart(2,'0')}T08:30:00`}));
  window.__users[23].address='Địa chỉ kiểm thử';
  window.__users[23].email='very.long.email.account.for.layout.checking@example.test';
  window.__requests=[];window.__unexpected=[];window.__downloads=[];window.__delay=0;
  const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.__downloads.push(this.download);return;}return click.call(this);};
  window.fetch=async(input,options={})=>{
    const u=new URL(typeof input==='string'?input:input.url,location.href);if(!u.pathname.startsWith('/api/'))return realFetch(input,options);
    const route=u.pathname,method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
    window.__requests.push({route,method,query:Object.fromEntries(u.searchParams),auth:new Headers(options.headers).get('Authorization'),body});options.signal?.throwIfAborted();
    if(route==='/api/auth/me')return Response.json({userID:1,username:'user1',fullName:'Quản trị kiểm thử',role:window.__failure?.status===403?'CUSTOMER':sessionStorage.getItem('test-role')||'ADMIN'});
    if(route.startsWith('/api/admin/users')||route.startsWith('/api/users/')){await new Promise(resolve=>setTimeout(resolve,window.__delay));options.signal?.throwIfAborted();}
    if(window.__failure?.route===route&&(!window.__failure.method||window.__failure.method===method))return Response.json({detail:'SQL password=private-diagnostic'},{status:window.__failure.status});
    const match=route.match(/^\/api\/(?:admin\/)?users\/(\d+)$/);
    if(match){const user=window.__users.find(user=>user.userID===Number(match[1]));if(!user)return Response.json({},{status:404});
      if(method==='PATCH'){
        if(user.role!==body.expectedRole||user.isActive!==body.expectedActive)return Response.json({},{status:409});
        if(body.role)user.role=body.role;if(body.isActive!=null)user.isActive=body.isActive;
        if(window.__commitThrow){window.__commitThrow=false;throw new TypeError('Network failure after server commit');}
      }return Response.json(method==='PATCH'?Object.fromEntries(Object.entries(user).filter(([key])=>key!=='address')):user);
    }
    if(route.startsWith('/api/admin/users')){
      const q=u.searchParams,search=(q.get('search')||'').toLowerCase();
      const rows=window.__users.filter(user=>(!search||`${user.fullName} ${user.username} ${user.email} ${user.phoneNumber} USR-${user.userID}`.toLowerCase().includes(search))&&(!q.get('role')||user.role===q.get('role'))&&(!q.get('active')||String(user.isActive)===q.get('active'))).sort((a,b)=>q.get('sort')==='NAME_ASC'?a.fullName.localeCompare(b.fullName):(q.get('sort')==='OLDEST'?1:-1)*(a.userID-b.userID));
      if(route.endsWith('/statistics'))return Response.json({totalUsers:rows.length,customers:rows.filter(u=>u.role==='CUSTOMER').length,admins:rows.filter(u=>u.role==='ADMIN').length,lockedUsers:rows.filter(u=>!u.isActive).length});
      if(route.endsWith('/export'))return rows.length?new Response(new Uint8Array([80,75,3,4]),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="stationery-users-2026-11-24.xlsx"'}}):Response.json({},{status:404});
      const page=Number(q.get('page')||0),size=Number(q.get('size')||10);return Response.json({content:rows.slice(page*size,(page+1)*size),totalElements:rows.length,totalPages:Math.ceil(rows.length/size)});
    }
    if(route==='/api/cart'||route==='/api/cart/items')return Response.json({items:[],subtotal:0});if(route==='/api/product-types')return Response.json([]);
    window.__unexpected.push(route);return Response.json({},{status:500});
  };
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let vite, browser, profile, socket, send, evaluate;
const pending = new Map(), exceptions = [];
const artifacts = fileURLToPath(new URL('../../.cache/admin-users/', import.meta.url));
let passed = 0;
async function until(check, label) { for (let i = 0; i < 150; i++) { if (await check()) return; await delay(80); } throw new Error(`Timed out: ${label}`); }
async function test(label, run) { await run(); passed++; console.log(`PASS ${label}`); }

try {
  const testAsset = (request, response, next) => {
    if (request.url?.startsWith('/__test__/broken.png')) { response.statusCode=404; response.end(); return; }
    if (!request.url?.startsWith('/__test__/evidence.png')) { next(); return; }
    response.setHeader('Content-Type', 'image/svg+xml');
    response.end('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#e1e9fa"/><path d="m50 110 60-60" stroke="#a64c12" stroke-width="15"/></svg>');
  };
  vite = await createServer({ plugins: [{ name: 'returns-test-assets', configureServer(server) { server.middlewares.use(testAsset); } }], server: { host: '127.0.0.1', port: 0, open: false } }); await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const executable = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(value => value && existsSync(value));
  assert.ok(executable, 'Set CHROME_PATH to an installed Chromium browser');
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'stationery-users-test-'));
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
  const navigate = async () => { await send('Page.navigate', { url: base + '/dashboard/users' }); await until(() => evaluate('!!window.__requests'), 'page loaded'); };
  const loaded = () => until(() => evaluate("document.querySelectorAll('.users-table tbody tr').length===10 && document.querySelectorAll('.users-kpi-grid .dashboard-stat').length===4"), 'user data');
  const click = async selector => { assert.equal(await evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled)return false;n.focus();n.click();return true;})()`), true, selector); };
  const button = async (text, selector = 'document') => { await evaluate(`(() => {const n=[...${selector}.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!n||n.disabled)throw new Error('Button unavailable');n.focus();n.click()})()`); };
  const input = async (selector, value) => { await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor((n.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement).prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const select = async (selector, value) => { await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const screenshot = async name => { await evaluate("document.querySelectorAll('.store-notice-close').forEach(n=>n.click())"); await delay(350); await fs.mkdir(artifacts, { recursive: true }); const { data } = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, name), Buffer.from(data, 'base64')); };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await navigate(); await loaded();
  const top="[...document.querySelectorAll('dialog[open]')].at(-1)";
  const closeDetail=()=>click('dialog[open] [aria-label="Đóng hộp thoại"]');
  const open=async id=>{await click(`[aria-label="Xem chi tiết người dùng user${id}"]`);await until(()=>evaluate("!!document.querySelector('.users-detail-person')"),'detail');};
  const confirm=async()=>{await until(()=>evaluate("document.querySelectorAll('dialog[open]').length===2"),'confirm dialog');await button('Xác nhận',top);await until(()=>evaluate("document.querySelectorAll('dialog[open]').length===1&&!document.querySelector('dialog[open][aria-busy=true]')"),'saved');};
  const changeRole=async role=>{await select('[aria-label="Vai trò mới"]',role);await button('Thay đổi vai trò',"document.querySelector('dialog[open]')");await confirm();};
  await test('ADMIN page uses existing shell, active menu, backend KPI and safe initials',async()=>{
    assert.equal(await evaluate("document.querySelector('.users-kpi-grid .dashboard-stat-value').textContent"),'24');
    assert.equal(await evaluate("document.querySelectorAll('.users-kpi-grid .dashboard-stat-value')[1].textContent"),'23');
    assert.match(await evaluate("document.querySelector('.dashboard-nav-link.active').textContent"),/Người dùng/);
    assert.equal(await evaluate("document.querySelectorAll('.users-table img').length"),0);
    assert.equal(await evaluate("window.__requests.filter(r=>r.route==='/api/auth/me').length"),1);
    await screenshot('desktop.png');
    await evaluate("window.__header=document.querySelector('.dashboard-header');window.__sidebar=document.querySelector('.dashboard-sidebar');history.pushState({},'','/dashboard/unused');window.dispatchEvent(new PopStateEvent('popstate'))");
    await until(()=>evaluate("!document.querySelector('.users-page')"),'leave');
    await evaluate("history.pushState({},'','/dashboard/users');window.dispatchEvent(new PopStateEvent('popstate'))");await loaded();
    assert.equal(await evaluate("window.__header===document.querySelector('.dashboard-header')&&window.__sidebar===document.querySelector('.dashboard-sidebar')"),true);
    assert.equal(await evaluate("window.__requests.filter(r=>r.route==='/api/auth/me').length"),1);
  });
  await test('Server pagination, role/status/sort filters, debounce and complete-filter Excel',async()=>{
    await click('[aria-label="Trang người dùng tiếp theo"]');await until(()=>evaluate("document.querySelector('.dashboard-pagination')?.textContent.includes('Trang 2')"),'page 2');
    await select('[aria-label="Lọc vai trò"]','CUSTOMER');await select('[aria-label="Lọc trạng thái tài khoản"]','false');await select('[aria-label="Sắp xếp người dùng"]','NAME_ASC');
    await until(()=>evaluate("document.querySelectorAll('.users-table tbody tr').length===4"),'filtered');
    await evaluate('window.__searchCount=window.__requests.filter(r=>r.route==="/api/admin/users").length');
    await input('[aria-label="Tìm người dùng"]','user2');await input('[aria-label="Tìm người dùng"]','user20');await delay(150);
    assert.equal(await evaluate('window.__requests.filter(r=>r.route==="/api/admin/users").length===window.__searchCount'),true);
    await until(()=>evaluate("document.querySelectorAll('.users-table tbody tr').length===1&&document.querySelector('.users-table tbody').textContent.includes('USR-20')"),'search');
    await button('Xuất Excel');await until(()=>evaluate('window.__downloads.length===1'),'download');
    assert.deepEqual((await evaluate("window.__requests.findLast(r=>r.route.endsWith('/export'))")).query,{search:'user20',role:'CUSTOMER',active:'false',sort:'NAME_ASC'});
    assert.equal(await evaluate('window.__downloads[0]'),'stationery-users-2026-11-24.xlsx');
    await button('Đặt lại');await loaded();await select('[aria-label="Số dòng người dùng"]','20');await until(()=>evaluate("document.querySelectorAll('.users-table tbody tr').length===20"),'size20');await select('[aria-label="Số dòng người dùng"]','10');await loaded();
  });
  await test('Detail loads on demand with loading state and identity fields; self protection',async()=>{
    assert.equal(await evaluate("window.__requests.some(r=>/^\\/api\\/users\\/\\d+$/.test(r.route))"),false);
    await evaluate('window.__delay=300');await click('[aria-label="Xem chi tiết người dùng user24"]');await until(()=>evaluate("document.querySelector('dialog[open] [role=status]')?.textContent.includes('Đang tải')"),'detail loading');await until(()=>evaluate("!!document.querySelector('.users-detail-person')"),'detail');await evaluate('window.__delay=0');
    const text=await evaluate("document.querySelector('dialog[open]').textContent");for(const value of ['USR-24','Người dùng 24','example.test','0901234567','24/11/2026'])assert.ok(text.includes(value),value);
    assert.equal(text.includes('password'),false);await screenshot('detail.png');await closeDetail();
    await select('[aria-label="Lọc vai trò"]','ADMIN');await until(()=>evaluate("document.querySelectorAll('.users-table tbody tr').length===1"),'admin filter');await open(1);
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Vai trò mới\"]').disabled"),true);
    assert.equal(await evaluate("[...document.querySelector('dialog[open]').querySelectorAll('button')].find(b=>b.textContent==='Khóa tài khoản').disabled"),true);await closeDetail();await button('Đặt lại');await loaded();
  });
  await test('Role changes require confirmation, refresh detail/list/KPI and do not revoke layout',async()=>{
    await open(24);await select('[aria-label="Vai trò mới"]','ADMIN');await button('Thay đổi vai trò',"document.querySelector('dialog[open]')");
    await until(()=>evaluate("document.querySelectorAll('dialog[open]').length===2"),'confirm');assert.ok((await evaluate(`${top}.textContent`)).includes('quản trị toàn bộ hệ thống'));
    assert.equal(await evaluate("window.__requests.filter(r=>r.method==='PATCH').length"),0);await screenshot('confirm-admin.png');await confirm();
    await until(()=>evaluate("document.querySelectorAll('.users-kpi-grid .dashboard-stat-value')[2].textContent==='2'"),'KPI updated');assert.equal(await evaluate("document.querySelector('[aria-label=\"Vai trò mới\"]').value"),'ADMIN');assert.ok((await evaluate("document.querySelector('dialog[open]').textContent")).includes('Địa chỉ kiểm thử'));
    await changeRole('CUSTOMER');await closeDetail();
  });
  await test('Lock/unlock confirms and updates visible state after backend success',async()=>{
    await open(24);await button('Khóa tài khoản',"document.querySelector('dialog[open]')");await confirm();
    assert.equal(await evaluate("window.__users.find(u=>u.userID===24).isActive"),false);
    await until(()=>evaluate("document.querySelector('.users-table tbody tr').textContent.includes('Bị khóa')"),'locked row');
    await button('Mở khóa tài khoản',"document.querySelector('dialog[open]')");await confirm();await closeDetail();
  });
  await test('409 blocks stale mutations until fresh detail; uncertain network outcome reloads actual state',async()=>{
    await open(24);await evaluate("window.__users.find(u=>u.userID===24).role='ADMIN'");await button('Khóa tài khoản',"document.querySelector('dialog[open]')");await confirm();
    assert.ok((await evaluate("document.querySelector('dialog[open]').textContent")).includes('Dữ liệu đã thay đổi'));assert.equal(await evaluate("window.__users.find(u=>u.userID===24).isActive"),true);
    assert.equal(await evaluate("[...document.querySelector('dialog[open]').querySelectorAll('button')].find(b=>b.textContent==='Khóa tài khoản').disabled"),true);
    await button('Tải lại chi tiết',"document.querySelector('dialog[open]')");await until(()=>evaluate("document.querySelector('[aria-label=\"Vai trò mới\"]')?.value==='ADMIN'"),'fresh');await changeRole('CUSTOMER');
    await evaluate('window.__commitThrow=true');await button('Khóa tài khoản',"document.querySelector('dialog[open]')");await confirm();
    assert.equal(await evaluate("window.__users.find(u=>u.userID===24).isActive"),false);assert.ok((await evaluate("document.querySelector('dialog[open]').textContent")).includes('tải lại chi tiết'));
    await button('Tải lại chi tiết',"document.querySelector('dialog[open]')");await until(()=>evaluate("[...document.querySelectorAll('dialog[open] button')].some(b=>b.textContent==='Mở khóa tài khoản'&&!b.disabled)"),'reload outcome');
    await button('Mở khóa tài khoản',"document.querySelector('dialog[open]')");await confirm();await closeDetail();
  });
  await test('Pending mutation disables repeat submit and Escape, preserving dialog until completion',async()=>{
    await open(24);await evaluate('window.__delay=600;window.__patchCount=window.__requests.filter(r=>r.method==="PATCH").length');await button('Khóa tài khoản',"document.querySelector('dialog[open]')");await button('Xác nhận',top);await delay(60);
    assert.equal(await evaluate(`${top}.querySelector('.dashboard-button-primary,.admin-button-danger').disabled`),true);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});assert.equal(await evaluate("document.querySelectorAll('dialog[open]').length"),2);
    await until(()=>evaluate("document.querySelectorAll('dialog[open]').length===1&&!document.querySelector('dialog[open][aria-busy=true]')"),'mutation done');assert.equal(await evaluate('window.__requests.filter(r=>r.method==="PATCH").length-window.__patchCount'),1);
    await evaluate('window.__delay=0');await button('Mở khóa tài khoản',"document.querySelector('dialog[open]')");await confirm();await closeDetail();
  });
  await test('Background refresh keeps table visible, retries safely without leaking diagnostics',async()=>{
    await evaluate('window.__delay=400');await button('Làm mới dữ liệu');await delay(70);assert.equal(await evaluate("document.querySelectorAll('.users-table tbody tr').length"),10);await until(()=>evaluate("!document.querySelector('.users-refreshing')"),'refresh done');await evaluate('window.__delay=0');
    await evaluate("window.__failure={route:'/api/admin/users',status:500}");await button('Làm mới dữ liệu');await until(()=>evaluate("document.body.textContent.includes('Đang hiển thị kết quả lần tải trước')"),'refresh failure');assert.equal(await evaluate("document.querySelectorAll('.users-table tbody tr').length"),10);assert.equal(await evaluate("document.body.textContent.includes('private-diagnostic')"),false);
    await evaluate('window.__failure=null');await button('Thử lại');await until(()=>evaluate("!document.body.textContent.includes('Đang hiển thị kết quả lần tải trước')"),'retry');
  });
  await test('Empty/list error, detail404, export413 and responsive modal focus/Escape',async()=>{
    await input('[aria-label="Tìm người dùng"]','missing');await until(()=>evaluate("document.querySelector('.users-list-panel')?.textContent.includes('Không có tài khoản')"),'empty');await button('Đặt lại');await loaded();
    await evaluate("window.__failure={route:'/api/admin/users',status:500}");await select('[aria-label="Lọc vai trò"]','CUSTOMER');await until(()=>evaluate("!!document.querySelector('.users-list-panel [role=alert]')"),'list error');await evaluate('window.__failure=null');await button('Thử lại',"document.querySelector('.users-list-panel')");await until(()=>evaluate("document.querySelectorAll('.users-table tbody tr').length===10"),'retry');await button('Đặt lại');await loaded();
    await evaluate("window.__failure={route:'/api/users/24',status:404}");await click('[aria-label="Xem chi tiết người dùng user24"]');await until(()=>evaluate("!!document.querySelector('dialog[open] [role=alert]')"),'404');await closeDetail();
    await evaluate("window.__failure={route:'/api/admin/users/export',status:413}");await button('Xuất Excel');await until(()=>evaluate("document.body.textContent.includes('thu hẹp bộ lọc')"),'413');await evaluate('window.__failure=null');
    for(const width of [1440,768,320,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<600});await delay(350);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`overflow ${width}`);}
    await screenshot('mobile.png');await open(24);await screenshot('mobile-detail.png');assert.equal(await evaluate("(()=>{const r=document.querySelector('dialog[open]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()"),true);
    await button('Khóa tài khoản',"document.querySelector('dialog[open]')");await until(()=>evaluate("document.querySelectorAll('dialog[open]').length===2"),'confirmation');
    for(let i=0;i<7;i++){await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});assert.equal(await evaluate(`${top}.contains(document.activeElement)`),true);}
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until(()=>evaluate("document.querySelectorAll('dialog[open]').length===1"),'nested Escape');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until(()=>evaluate("!document.querySelector('dialog[open]')"),'Escape');
    assert.equal(await evaluate("document.activeElement?.getAttribute('aria-label')"),'Xem chi tiết người dùng user24');
  });
  await test('Backend role withdrawal, forged local role and anonymous access use shared AdminRoute',async()=>{
    await evaluate("window.__failure={route:'/api/admin/users/export',status:403}");await button('Xuất Excel');await until(()=>evaluate("document.body.textContent.includes('403')"),'403');assert.equal(await evaluate("!!document.querySelector('.users-page')"),false);
    await evaluate("sessionStorage.setItem('test-role','CUSTOMER');localStorage.setItem('role','ADMIN')");await navigate();await until(()=>evaluate("document.body.textContent.includes('403')"),'customer');assert.equal(await evaluate("window.__requests.some(r=>r.route.startsWith('/api/admin/'))"),false);
    await evaluate("localStorage.removeItem('accessToken')");await navigate();await until(()=>evaluate("location.pathname==='/login'"),'anonymous');
  });
  assert.deepEqual(exceptions,[],'No browser exceptions');assert.deepEqual(await evaluate('window.__unexpected'),[],'No real API calls');console.log(`${passed} admin users browser checks passed.`);
} catch (error) {
  console.error(error); process.exitCode = 1;
  if (send) { const { data } = await send('Page.captureScreenshot', { format: 'png' }).catch(() => ({})); if (data) { await fs.mkdir(artifacts, { recursive: true }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(data, 'base64')); } }
} finally {
  if (send) await send('Browser.close').catch(() => {}); socket?.close(); browser?.kill(); if (vite) await vite.close();
  if (profile && path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('stationery-users-test-')) { await delay(300); await fs.rm(profile, { recursive: true, force: true, maxRetries: 4 }).catch(() => {}); }
}
