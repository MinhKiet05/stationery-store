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
  const nativeFetch=window.fetch.bind(window);
  localStorage.setItem('accessToken','test-A');
  window.__requests=[]; window.__unexpected=[]; window.__failCart=false; window.__delayCart=500;
  window.__cart={items:[],subtotal:0};
  const product={productID:1,title:'Sổ kiểm thử',handle:'so-test',description:'Sổ thật từ API kiểm thử',price:20000,priceMin:20000,priceMax:20000,compareAtPrice:25000,available:true,isActive:true,ratingAverage:4,reviewCount:0,vendorID:1,vendorName:'Vendor',productTypeID:1,productTypeName:'Sổ',images:[]};
  window.fetch=async(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href), route=url.pathname, method=options.method||'GET';
    if(!route.startsWith('/api/'))return nativeFetch(input,options);
    const token=new Headers(options.headers).get('Authorization');
    window.__requests.push({route,method,token,query:Object.fromEntries(url.searchParams)}); options.signal?.throwIfAborted();
    if(route==='/api/auth/me')return Response.json({userID:1,username:'test',fullName:'Test',email:'test@example.test',role:'CUSTOMER'});
    if(route==='/api/cart')return Response.json(token==='Bearer test-B'?{items:[],subtotal:0}:window.__cart);
    if(route==='/api/orders')return Response.json({}, {status:500});
    if(route==='/api/cart/items'){
      const failure=window.__failCart;
      await new Promise(resolve=>setTimeout(resolve,window.__delayCart));
      if(failure)return Response.json({detail:'Khong du ton kho cho bien the 1'},{status:409});
      const quantity=JSON.parse(options.body).quantity + (window.__cart.items[0]?.quantity||0);
      window.__cart={items:[{cartItemID:1,variantID:1,productTitle:product.title,variantTitle:'Chuẩn',quantity,lineTotal:quantity*20000}],subtotal:quantity*20000};
      return Response.json(window.__cart);
    }
    if(route==='/api/products/search'||route==='/api/products')return Response.json({content:[product],totalPages:1,totalElements:1});
    if(route==='/api/products/1/reviews')return Response.json([]);
    if(route.startsWith('/api/products/'))return Response.json(product);
    if(route.startsWith('/api/product-variants/'))return Response.json([{variantID:1,title:'Chuẩn',price:20000,compareAtPrice:25000,stockQuantity:10,available:true}]);
    if(route==='/api/vendors')return Response.json([{vendorID:1,name:'Vendor'}]);
    if(route==='/api/product-types')return Response.json([{productTypeID:1,name:'Sổ',isActive:true}]);
    if(route.startsWith('/api/recommendations/'))return Response.json({products:[],source:'FALLBACK'});
    if(route.startsWith('/api/tracking/'))return Response.json({});
    window.__unexpected.push(route);return Response.json({}, {status:500});
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
  const navigate = async () => { await send('Page.navigate', { url: base + '/products/so-test' }); await until(() => evaluate('!!window.__requests'), 'page loaded'); };
  const loaded = () => until(() => evaluate("!!document.querySelector('.dashboard-shell') && !document.querySelector('.dashboard-gate')"), 'verified dashboard');
  const click = async selector => { assert.equal(await evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled)return false;n.focus();n.click();return true;})()`), true, selector); };
  const button = async (text, selector = 'document') => { await evaluate(`(() => {const n=[...${selector}.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!n||n.disabled)throw new Error('Button unavailable');n.focus();n.click()})()`); };
  const input = async (selector, value) => { await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor((n.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement).prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const select = async (selector, value) => { await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const screenshot = async name => { await evaluate("document.querySelectorAll('.store-notice-close').forEach(n=>n.click())"); await delay(350); await fs.mkdir(artifacts, { recursive: true }); const { data } = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, name), Buffer.from(data, 'base64')); };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await navigate(); await until(()=>evaluate("!!document.querySelector('[aria-label=\"Chi tiết sản phẩm\"]') && !![...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='Thêm vào giỏ hàng'&&!n.disabled)"),'product ready');
  const top = "[...document.querySelectorAll('dialog[open]')].at(-1)";
  const closeDetail = () => click('dialog[open] [aria-label="Đóng hộp thoại"]');
  const identityCalls=()=>evaluate('window.__identityCalls');
  const focus=()=>evaluate("window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'))");
  const go=async route=>{await evaluate(`history.pushState({},'',${JSON.stringify(route)});window.dispatchEvent(new PopStateEvent('popstate'))`);await until(()=>evaluate(`location.pathname===${JSON.stringify(route)}`),'SPA route');};
  const signIn=async token=>{await evaluate(`localStorage.setItem('accessToken',${JSON.stringify(token)});window.dispatchEvent(new Event('auth-changed'))`);};
  await evaluate("import('/tests/probes/cartProbe.ts').then(m=>m.mount())");
  await until(()=>evaluate('!!window.__otherCartWrite'),'second independent cart widget');
  const badge=quantity=>evaluate(`!!document.querySelector('[aria-label="Giỏ hàng (${quantity} sản phẩm)"]')`);
  await test('Cart add updates shared header immediately, suppresses duplicate writes, then uses server response',async()=>{
    await until(()=>badge(0),'empty cart');
    await button('Thêm vào giỏ hàng'); await until(()=>badge(1),'optimistic badge');
    assert.equal(await evaluate("window.__cart.items.length"),0,'backend has not acknowledged yet');
    assert.match(await evaluate('window.__otherCartWrite()'),/đang cập nhật/);
    assert.equal(await evaluate("window.__requests.some(r=>r.method==='DELETE')"),false,'another widget cannot write or release the active cart lock');
    assert.equal(await evaluate("document.body.textContent.includes('Đã thêm 1 sản phẩm vào giỏ hàng.')"),false);
    await evaluate("[...document.querySelectorAll('button')].find(n=>n.textContent.includes('Đang xử lý')).click()");
    await until(()=>evaluate("window.__cart.items[0]?.quantity===1"),'server committed');
    await until(()=>evaluate("!![...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='Thêm vào giỏ hàng'&&!n.disabled)"),'write complete');
    assert.equal(await evaluate("window.__requests.filter(r=>r.route==='/api/cart/items').length"),1);
  });
  await test('Failed optimistic cart add rolls back and reconciles before another write',async()=>{
    await evaluate('window.__failCart=true'); await button('Thêm vào giỏ hàng');
    await until(()=>badge(2),'optimistic increment'); await until(()=>badge(1),'rollback');
    await until(()=>evaluate("!![...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='Thêm vào giỏ hàng'&&!n.disabled)"),'reconciled');
    await evaluate('window.__failCart=false'); await button('Thêm vào giỏ hàng'); await until(()=>evaluate('window.__cart.items[0]?.quantity===2'),'next confirmed add');
    await until(()=>evaluate("!![...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='Thêm vào giỏ hàng'&&!n.disabled)"),'next write complete'); assert.equal(await badge(2),true);
  });
  await test('Returning to fresh detail reuses product, review and inventory cache',async()=>{
    const before=await evaluate("window.__requests.filter(r=>r.route.startsWith('/api/products/')||r.route.startsWith('/api/product-variants/')).length");
    await go('/');await until(()=>evaluate("!!document.querySelector('header')&&!document.querySelector('[aria-label=\"Chi tiết sản phẩm\"]')"),'home');
    await go('/products/so-test');await until(()=>evaluate("!!document.querySelector('[aria-label=\"Chi tiết sản phẩm\"]')"),'detail return');await delay(100);
    assert.equal(await evaluate("window.__requests.filter(r=>r.route.startsWith('/api/products/')||r.route.startsWith('/api/product-variants/')).length"),before);
  });
  await test('Catalog requests a single server page with complete filter keys',async()=>{
    await go('/search');await until(()=>evaluate("!!document.querySelector('#catalog-sort')"),'search'); await delay(200);
    const requests=await evaluate("window.__requests.filter(r=>r.route==='/api/products/search'&&r.query.catalog==='true')");
    assert.ok(requests.length>=1);assert.deepEqual([...new Set(requests.map(r=>r.query.page))],['0']);assert.ok(requests.every(r=>r.query.size==='24'));
    await select('#catalog-sort','price-desc');await until(()=>evaluate("window.__requests.some(r=>r.query.sort==='price,desc')"),'SQL sort');
  });
  await test('Unknown checkout result blocks another submit until order history is reviewed',async()=>{
    await go('/products/so-test');await until(()=>evaluate("!![...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='Mua ngay'&&!n.disabled)"),'buy button');
    await button('Mua ngay');await until(()=>evaluate("!!document.querySelector('dialog[open] form')"),'checkout');
    await input('dialog textarea[name=address]','Địa chỉ kiểm thử');await input('dialog input[name=phone]','0900000000');
    await evaluate("document.querySelector('dialog form').requestSubmit()");
    await until(()=>evaluate("document.querySelector('dialog').textContent.includes('Chưa xác định được kết quả')"),'uncertain result');
    await evaluate("document.querySelector('dialog form').requestSubmit()");
    assert.equal(await evaluate("window.__requests.filter(r=>r.route==='/api/orders').length"),1);
    assert.equal(await evaluate("[...document.querySelectorAll('dialog button')].find(n=>n.textContent.includes('Xác nhận đặt hàng')).disabled"),true);
    await click('dialog [aria-label="Đóng"]');
  });
  await test('Logout/account switch removes private cart and a late old-session write cannot restore it',async()=>{
    await button('Mua ngay');await until(()=>evaluate("!!document.querySelector('dialog[open] form')"),'private checkout open');
    await evaluate("localStorage.removeItem('accessToken');window.dispatchEvent(new Event('auth-changed'))");
    await until(()=>evaluate("!document.querySelector('dialog[open]')"),'private checkout removed');
    await evaluate("localStorage.setItem('accessToken','test-A');window.dispatchEvent(new Event('auth-changed'))");
    await until(()=>evaluate("!![...document.querySelectorAll('button')].find(n=>n.textContent.trim()==='Thêm vào giỏ hàng'&&!n.disabled)"),'fresh session ready');
    const nextQuantity=await evaluate('window.__cart.items[0].quantity+1');
    await button('Thêm vào giỏ hàng');await until(()=>badge(nextQuantity),'pending optimistic write');
    await evaluate("localStorage.removeItem('accessToken');window.dispatchEvent(new Event('auth-changed'))");
    await until(()=>badge(0),'private cart cleared');
    await evaluate("localStorage.setItem('accessToken','test-B');window.dispatchEvent(new Event('auth-changed'))");
    await delay(750);assert.equal(await badge(0),true);
    assert.equal(await evaluate("window.__requests.some(r=>r.route==='/api/cart'&&r.token==='Bearer test-B')"),true);
  });
  assert.deepEqual(exceptions,[]);assert.deepEqual(await evaluate('window.__unexpected'),[]);
  console.log(`${passed} storefront query browser checks passed.`);
} catch (error) {
  console.error(error); process.exitCode = 1;
  if (send) { const { data } = await send('Page.captureScreenshot', { format: 'png' }).catch(() => ({})); if (data) { await fs.mkdir(artifacts, { recursive: true }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(data, 'base64')); } }
} finally {
  if (send) await send('Browser.close').catch(() => {}); socket?.close(); browser?.kill(); if (vite) await vite.close();
  if (profile && path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('stationery-admin-route-test-')) { await delay(300); await fs.rm(profile, { recursive: true, force: true, maxRetries: 4 }).catch(() => {}); }
}
