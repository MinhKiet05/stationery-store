import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// These fixtures replace every backend request, including authentication. No production calls.
function installApi() {
  const nativeFetch=window.fetch.bind(window), realNow=Date.now;
  window.__clockOffset=0;Date.now=()=>realNow()+window.__clockOffset;
  if(!sessionStorage.getItem('admin-route-init')){if(!localStorage.getItem('accessToken'))localStorage.setItem('accessToken','session-A');sessionStorage.setItem('admin-route-init','true');}
  window.__requests=[];window.__unexpected=[];window.__identityCalls=0;window.__identityDelay=Number(sessionStorage.getItem('identity-delay')||0);window.__identityFailure=null;
  window.__roles={};window.__identityFailures={};window.__identityDelays={};window.__ignoreIdentityAbort=false;window.__businessFailure=null;
  window.fetch=async(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href);if(!url.pathname.startsWith('/api/'))return nativeFetch(input,options);
    const route=url.pathname,token=new Headers(options.headers).get('Authorization')?.replace(/^Bearer /,'');
    window.__requests.push({route,token,method:options.method||'GET'});options.signal?.throwIfAborted();
    if(route==='/api/auth/me'){
      window.__identityCalls++;const role=window.__roles[token]||'ADMIN',failure=window.__identityFailures[token]||window.__identityFailure;
      await new Promise(resolve=>setTimeout(resolve,window.__identityDelays[token]??window.__identityDelay));if(!window.__ignoreIdentityAbort)options.signal?.throwIfAborted();
      if(failure==='network')throw new TypeError('Simulated network failure');if(failure)return Response.json({detail:'private SQL diagnostic'},{status:failure});
      return Response.json({userID:1,username:token,fullName:`Admin ${token}`,email:'admin@example.test',role});
    }
    if(window.__businessFailure?.route===route)return Response.json({detail:'private SQL diagnostic'},{status:window.__businessFailure.status});
    if(route.startsWith('/api/admin/')){
      if(window.__roles[token]==='CUSTOMER')return Response.json({},{status:403});
      if(route==='/api/admin/products/options')return Response.json({categories:[],vendors:[],tags:[]});
      if(route==='/api/admin/statistics/overview')return Response.json({totalOrders:0,successfulOrders:0,totalRevenue:0,newCustomers:0,totalCustomers:0});
      if(route==='/api/admin/statistics/revenue')return Response.json({periods:[],totalRevenue:0});
      if(route==='/api/admin/statistics/orders')return Response.json({statusCounts:{PENDING:0},returnRequestCounts:{PENDING:0}});
      if(route.endsWith('/statistics'))return Response.json({totalUsers:0,customers:0,admins:0,lockedUsers:0,totalOrders:0,pendingOrders:0,shippedOrders:0,deliveredOrders:0,totalProducts:0,sellingProducts:0,hiddenProducts:0,lowStockProducts:0,lowStockThreshold:10,totalReviews:0,averageRating:null,fiveStarReviews:0,lowStarReviews:0,totalCoupons:0,activeCoupons:0,expiredCoupons:0,totalUses:0,totalRequests:0,pendingRequests:0,approvedRequests:0,rejectedRequests:0});
      return Response.json({content:[],totalElements:0,totalPages:0});
    }
    if(route==='/api/cart/items')return Response.json({items:[],subtotal:0});if(route==='/api/product-types')return Response.json([]);
    if(route.startsWith('/api/recommendations/'))return Response.json({products:[],source:'POPULAR'});
    if(route.startsWith('/api/products'))return Response.json({content:[],totalElements:0,totalPages:0});
    window.__unexpected.push(route);return Response.json({},{status:500});
  };
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let vite, browser, profile, socket, send, evaluate;
const pending = new Map(), exceptions = [];
const artifacts = fileURLToPath(new URL('../../.cache/admin-route/', import.meta.url));
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
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'stationery-admin-route-test-'));
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
  const loaded = () => until(() => evaluate("!!document.querySelector('.dashboard-shell') && !document.querySelector('.dashboard-gate')"), 'verified dashboard');
  const click = async selector => { assert.equal(await evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled)return false;n.focus();n.click();return true;})()`), true, selector); };
  const button = async (text, selector = 'document') => { await evaluate(`(() => {const n=[...${selector}.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!n||n.disabled)throw new Error('Button unavailable');n.focus();n.click()})()`); };
  const input = async (selector, value) => { await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor((n.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement).prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const select = async (selector, value) => { await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const screenshot = async name => { await evaluate("document.querySelectorAll('.store-notice-close').forEach(n=>n.click())"); await delay(350); await fs.mkdir(artifacts, { recursive: true }); const { data } = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, name), Buffer.from(data, 'base64')); };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await navigate(); await loaded();
  const top = "[...document.querySelectorAll('dialog[open]')].at(-1)";
  const closeDetail = () => click('dialog[open] [aria-label="Đóng hộp thoại"]');
  const identityCalls=()=>evaluate('window.__identityCalls');
  const focus=()=>evaluate("window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'))");
  const go=async route=>{await evaluate(`history.pushState({},'',${JSON.stringify(route)});window.dispatchEvent(new PopStateEvent('popstate'))`);await until(()=>evaluate(`location.pathname===${JSON.stringify(route)}`),'SPA route');};
  const signIn=async token=>{await evaluate(`localStorage.setItem('accessToken',${JSON.stringify(token)});window.dispatchEvent(new Event('auth-changed'))`);};
  await test('Initial ADMIN verification is single-flight even under StrictMode',async()=>{assert.equal(await identityCalls(),1);assert.equal(await evaluate("document.querySelector('.dashboard-account-name').textContent.includes('session-A')"),true);});
  await test('Every nested route keeps the same header/sidebar/layout and never repeats the auth gate or identity request',async()=>{
    await evaluate("window.__shell=document.querySelector('.dashboard-shell');window.__header=document.querySelector('.dashboard-header');window.__sidebar=document.querySelector('.dashboard-sidebar');window.__gates=0;window.__observer=new MutationObserver(()=>{if(document.querySelector('.dashboard-gate'))window.__gates++});window.__observer.observe(document.body,{childList:true,subtree:true})");
    await click('[aria-controls="dashboard-sidebar"]');
    for(let round=0;round<2;round++)for(const suffix of ['', '/reviews','/promotions','/returns','/orders','/products','/users']){
      await click(`.dashboard-sidebar a[href="/dashboard${suffix}"]`);await until(()=>evaluate(`location.pathname==='/dashboard${suffix}' && !document.querySelector('#dashboard-content > [role=status]')`),'nested route');
      assert.equal(await evaluate("window.__shell===document.querySelector('.dashboard-shell')&&window.__header===document.querySelector('.dashboard-header')&&window.__sidebar===document.querySelector('.dashboard-sidebar')&&getComputedStyle(window.__header).display!=='none'"),true,suffix);
    }
    assert.equal(await evaluate('window.__gates'),0);assert.equal(await identityCalls(),1);assert.equal(await evaluate("document.querySelector('.dashboard-shell').classList.contains('is-collapsed')"),true);await evaluate('window.__observer.disconnect()');
  });
  await test('Fresh focus/visibility, same-token auth events and unrelated storage events add zero verification requests',async()=>{
    for(let i=0;i<20;i++)await focus();await evaluate("window.dispatchEvent(new Event('auth-changed'));window.dispatchEvent(new StorageEvent('storage',{key:'guestCart'}))");await delay(150);assert.equal(await identityCalls(),1);assert.equal(await evaluate("!!document.querySelector('.dashboard-gate')"),false);
    console.log('MEASURE: 14 sidebar navigations + 40 focus/visibility events: 1 initial /auth/me, 0 extra.');
  });
  await test('Expired cache revalidates in background, preserving a draft modal and business resource state',async()=>{
    await click('.dashboard-sidebar a[href="/dashboard/products"]');await until(()=>evaluate("!!document.querySelector('.products-page')"),'products');await button('+ Thêm sản phẩm');await input('[aria-label="Tên sản phẩm"]','Bản nháp đang soạn');
    const before=await identityCalls(),business=await evaluate("window.__requests.filter(r=>r.route.startsWith('/api/admin/')).length");
    await evaluate("window.__draft=document.querySelector('#admin-product-form');window.__identityDelay=400;window.__clockOffset+=300001");await focus();await focus();await delay(80);
    assert.equal(await evaluate("!!document.querySelector('.dashboard-shell')&&!!document.querySelector('dialog[open]')&&!document.querySelector('.dashboard-gate')"),true);
    assert.equal(await evaluate("window.__draft===document.querySelector('#admin-product-form')&&document.querySelector('[aria-label=\"Tên sản phẩm\"]').value==='Bản nháp đang soạn'"),true);
    await until(async()=>await identityCalls()===before+1,'one revalidation');await delay(450);assert.equal(await evaluate("window.__requests.filter(r=>r.route.startsWith('/api/admin/')).length"),business);
    assert.equal(await evaluate("window.__header===document.querySelector('.dashboard-header')"),true);await button('Hủy',top);await evaluate('window.__identityDelay=0');
  });
  await test('Business 403 checks the backend identity and retains a confirmed ADMIN instead of revoking the role',async()=>{
    const before=await identityCalls();await evaluate("window.__businessFailure={route:'/api/admin/products/export',status:403}");await button('Xuất Excel');await until(async()=>await identityCalls()===before+1,'role check');await delay(150);
    assert.equal(await evaluate("!!document.querySelector('.products-page')&&!document.querySelector('.dashboard-gate')"),true);assert.equal(await evaluate("document.body.textContent.includes('Bạn không có quyền thực hiện thao tác này.')"),true);await evaluate('window.__businessFailure=null');
  });
  await test('Background network failure does not fabricate fresh verification or unmount the layout, and has no focus request loop',async()=>{
    const before=await identityCalls();await evaluate("window.__clockOffset+=300001;window.__identityFailure='network'");await focus();await until(async()=>await identityCalls()===before+1,'failed revalidation');await delay(100);
    assert.equal(await evaluate("!!document.querySelector('.dashboard-shell')"),true);for(let i=0;i<10;i++)await focus();assert.equal(await identityCalls(),before+1);
    await evaluate("window.__identityFailure=null;window.__clockOffset+=30001");await focus();await until(async()=>await identityCalls()===before+2,'recovered');await delay(100);
  });
  await test('Leaving Dashboard and re-entering within TTL reuses memory; F5 starts one new safe verification',async()=>{
    const before=await identityCalls();await go('/login');await go('/dashboard/users');await loaded();assert.equal(await identityCalls(),before);
    await evaluate("sessionStorage.setItem('identity-delay','300');window.__reloadMarker=true");await send('Page.reload');await until(()=>evaluate('!window.__reloadMarker&&!!window.__requests'),'new document');await until(()=>evaluate("!!document.querySelector('.dashboard-gate')"),'initial F5 gate');assert.equal(await evaluate("!!document.querySelector('.dashboard-shell')"),false);await loaded();assert.equal(await identityCalls(),1);await evaluate("sessionStorage.removeItem('identity-delay');window.__identityDelay=0");
  });
  await test('A new browser tab has its own memory cache and verifies the current shared login',async()=>{
    const target=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'}).then(r=>r.json());const secondary=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{secondary.onopen=resolve;secondary.onerror=reject;});
    let id=0;const entries=new Map();secondary.onmessage=({data})=>{const msg=JSON.parse(data);const item=entries.get(msg.id);if(item){entries.delete(msg.id);msg.error?item.reject(msg.error):item.resolve(msg.result);}};
    const request=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;entries.set(key,{resolve,reject});secondary.send(JSON.stringify({id:key,method,params}));});
    const read=async source=>(await request('Runtime.evaluate',{expression:source,returnByValue:true})).result.value;
    try{await request('Page.enable');await request('Page.addScriptToEvaluateOnNewDocument',{source:`(${installApi.toString()})()`});await request('Page.navigate',{url:base+'/dashboard/users'});await until(()=>read("!!document.querySelector('.dashboard-shell')"),'new tab');assert.equal(await read('window.__identityCalls'),1);assert.equal(await read("localStorage.getItem('accessToken')"),'session-A');}finally{await request('Page.close').catch(()=>{});secondary.close();}
  });
  await test('Logout clears the cache and re-login with the same token cannot reuse the previous ADMIN proof',async()=>{
    await click('.dashboard-account summary');await click('.dashboard-account-menu button');await until(()=>evaluate("location.pathname==='/login'"),'logout');const before=await identityCalls();
    await signIn('session-A');await go('/dashboard/users');await loaded();assert.equal(await identityCalls(),before+1);
  });
  await test('Changing accounts drops protected content and late old-session 401 cannot log out the new account',async()=>{
    await evaluate("import('/src/services/authService.ts').then(module=>{window.__profileApi=module})");
    await evaluate("window.__ignoreIdentityAbort=true;window.__identityDelays['session-A']=700;window.__identityFailures['session-A']=401;window.__clockOffset+=300001");await focus();await delay(80);
    await evaluate("window.__profileDone=false;void window.__profileApi.getCurrentUser(location.origin).then(()=>{window.__profileDone=true})");
    await evaluate("window.__identityDelays['session-B']=250");await signIn('session-B');await until(()=>evaluate("!!document.querySelector('.dashboard-gate')"),'new session gate');assert.equal(await evaluate("!!document.querySelector('.dashboard-shell')"),false);
    await loaded();await delay(800);assert.equal(await evaluate('window.__profileDone'),true);assert.equal(await evaluate("localStorage.getItem('accessToken')"),'session-B');assert.equal(await evaluate("document.querySelector('.dashboard-account-name').textContent.includes('session-B')"),true);
    await evaluate("window.__ignoreIdentityAbort=false;window.__identityFailures={};window.__identityDelays={}");
  });
  await test('Revoked ADMIN role is removed as soon as background verification detects the database role change',async()=>{
    await evaluate("window.__roles['session-B']='CUSTOMER';window.__clockOffset+=300001");await focus();await until(()=>evaluate("document.body.textContent.includes('403')"),'role revoked');assert.equal(await evaluate("!!document.querySelector('.dashboard-shell')"),false);
    const before=await identityCalls();for(let i=0;i<10;i++)await focus();assert.equal(await identityCalls(),before);
  });
  await test('Initial network failure stays unverified; retry succeeds, while forged local role cannot grant ADMIN',async()=>{
    await evaluate("window.__identityFailure='network'");await signIn('session-network');await until(()=>evaluate("document.querySelector('.dashboard-gate [role=alert]')?.textContent.includes('Chưa thể xác minh')"),'initial failure');assert.equal(await evaluate("!!document.querySelector('.dashboard-shell')"),false);
    await evaluate('window.__identityFailure=null');await button('Thử lại');await loaded();
    const mark=await evaluate('window.__requests.length');await evaluate("localStorage.setItem('role','ADMIN');window.__roles['session-customer']='CUSTOMER'");await signIn('session-customer');await until(()=>evaluate("document.body.textContent.includes('403')"),'customer');assert.equal(await evaluate(`window.__requests.slice(${mark}).some(r=>r.route.startsWith('/api/admin/'))`),false);
  });
  await test('Cached ADMIN never bypasses a business API 401, and anonymous users cannot enter Dashboard',async()=>{
    await signIn('session-expiring');await go('/dashboard/products');await loaded();await until(()=>evaluate("!!document.querySelector('.products-page')"),'products');await evaluate("window.__businessFailure={route:'/api/admin/products/export',status:401}");await button('Xuất Excel');await until(()=>evaluate("location.pathname==='/login'"),'expired login');assert.equal(await evaluate("localStorage.getItem('accessToken')"),null);
    const mark=await evaluate('window.__requests.length');await evaluate("history.pushState({},'', '/dashboard/orders');window.dispatchEvent(new PopStateEvent('popstate'))");await until(()=>evaluate("location.pathname==='/login'"),'anonymous');assert.equal(await evaluate(`window.__requests.slice(${mark}).some(r=>r.route.startsWith('/api/admin/'))`),false);
  });
  assert.deepEqual(exceptions,[],'No browser exceptions');assert.deepEqual(await evaluate('window.__unexpected'),[],'No production API calls');console.log(`${passed} admin route browser checks passed.`);
} catch (error) {
  console.error(error); process.exitCode = 1;
  if (send) { const { data } = await send('Page.captureScreenshot', { format: 'png' }).catch(() => ({})); if (data) { await fs.mkdir(artifacts, { recursive: true }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(data, 'base64')); } }
} finally {
  if (send) await send('Browser.close').catch(() => {}); socket?.close(); browser?.kill(); if (vite) await vite.close();
  if (profile && path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('stationery-admin-route-test-')) { await delay(300); await fs.rm(profile, { recursive: true, force: true, maxRetries: 4 }).catch(() => {}); }
}
