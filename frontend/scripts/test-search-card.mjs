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
  window.__cart={items:[],subtotal:0}; window.__multipleVariants=false;
  const product={productID:1,title:'Sổ kiểm thử',handle:'so-test',description:'Sổ thật từ API kiểm thử',price:20000,priceMin:20000,priceMax:20000,compareAtPrice:25000,available:true,isActive:true,ratingAverage:4,reviewCount:0,vendorID:1,vendorName:'Vendor',productTypeID:1,productTypeName:'Sổ',images:['data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2264%22 height=%2264%22/%3E']};
  window.fetch=async(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href), route=url.pathname, method=options.method||'GET';
    if(!route.startsWith('/api/'))return nativeFetch(input,options);
    const token=new Headers(options.headers).get('Authorization');
    window.__requests.push({route,method,token,body:options.body,query:Object.fromEntries(url.searchParams)}); options.signal?.throwIfAborted();
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
    if(route.startsWith('/api/product-variants/'))return Response.json(window.__multipleVariants ? [{variantID:1,title:'Blue',price:20000,stockQuantity:10,available:true},{variantID:2,title:'Red',price:20000,stockQuantity:10,available:true}] : [{variantID:1,title:'Chuẩn',price:20000,compareAtPrice:25000,stockQuantity:10,available:true}]);
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
const artifacts = fileURLToPath(new URL('../../.cache/search-card/', import.meta.url));
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
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'stationery-search-card-test-'));
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
  const navigate = async () => { await send('Page.navigate', { url: base + '/search?search=so&category=1&sort=price-desc&size=12&brands=Vendor&minPrice=1000&rating=4&inStock=true' }); await until(() => evaluate('!!window.__requests'), 'page loaded'); };
  const loaded = () => until(() => evaluate("!!document.querySelector('.dashboard-shell') && !document.querySelector('.dashboard-gate')"), 'verified dashboard');
  const click = async selector => { assert.equal(await evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled)return false;n.focus();n.click();return true;})()`), true, selector); };
  const button = async (text, selector = 'document') => { await evaluate(`(() => {const n=[...${selector}.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!n||n.disabled)throw new Error('Button unavailable');n.focus();n.click()})()`); };
  const input = async (selector, value) => { await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor((n.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement).prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const select = async (selector, value) => { await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const screenshot = async name => { await evaluate("document.querySelectorAll('.store-notice-close').forEach(n=>n.click())"); await delay(350); await fs.mkdir(artifacts, { recursive: true }); const { data } = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, name), Buffer.from(data, 'base64')); };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });

  const ready=()=>until(()=>evaluate('!!document.querySelector("#catalog-results article")'),'search cards');
  const detail=()=>until(()=>evaluate(`!!document.querySelector('[aria-label="Chi tiết sản phẩm"]')`),'existing detail');
  const back=async()=>{await evaluate('history.back()');await ready();};
  const image='#catalog-results article a[aria-label]';
  const title='#catalog-results article a[class*="productTitle"]';
  const cart='#catalog-results article button[class*="cartButton"]';
  const favorite='#catalog-results article button[class*="favorite"]';
  await navigate(); await ready();
  await test('Image opens existing detail through SPA, reuses hover/focus prefetch and Back preserves all filters/scroll',async()=>{
    await evaluate(`window.__spaMarker=1;document.querySelector('${image}').focus()`); await delay(350);
    const reads=await evaluate("window.__requests.filter(r=>r.route==='/api/products/handle/so-test').length");
    assert.equal(reads,1);
    await evaluate('window.scrollTo(0,400)'); await delay(100);
    const scroll=await evaluate('scrollY'), url=await evaluate('location.search');
    await click(image); await detail();
    assert.equal(await evaluate('location.pathname'),'/products/so-test');
    assert.equal(await evaluate('scrollY'),0);
    assert.equal(await evaluate('window.__spaMarker'),1);
    assert.equal(await evaluate("window.__requests.filter(r=>r.route==='/api/products/handle/so-test').length"),reads);
    assert.equal(await evaluate('!!document.querySelector("#catalog-product-dialog")'),false);
    await back(); await delay(100);
    assert.equal(await evaluate('location.search'),url);
    assert.equal(await evaluate('document.querySelector("#catalog-sort").value'),'price-desc');
    assert.equal(await evaluate(`document.querySelector('input[aria-label="Giá từ"]').value`),'1000');
    assert.equal(await evaluate('document.querySelector("#catalog-filters input[type=checkbox]").checked'),true);
    assert.ok(Math.abs(await evaluate('scrollY')-scroll)<4);
  });
  await test('Title and card content go directly to detail without Quick View or nested button links',async()=>{
    assert.equal(await evaluate('document.querySelectorAll("#catalog-results a button").length'),0);
    await click(title); await detail(); await back();
    await evaluate('document.querySelector("#catalog-results article p").scrollIntoView({block:"center"})');
    const point=await evaluate('(()=>{const r=document.querySelector("#catalog-results article p").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
    await detail(); assert.equal(await evaluate('!!document.querySelector("#catalog-product-dialog")'),false); await back();
  });
  await test('Favorite changes storage/toast while staying on Search',async()=>{
    const before=await evaluate('location.href'); await click(favorite);
    assert.equal(await evaluate('location.href'),before);
    assert.equal(await evaluate('localStorage.getItem("favorite-product-1")'),'true');
    assert.equal(await evaluate(`document.querySelector('${favorite}').getAttribute('aria-pressed')`),'true');
    assert.equal(await evaluate('!!document.querySelector("dialog[open]")'),false);
  });
  await test('Cart action stays on Search, prevents duplicate writes and retains optimistic rollback',async()=>{
    const before=await evaluate('location.href'); await click(cart);
    await until(()=>evaluate(`!!document.querySelector('[aria-label="Giỏ hàng (1 sản phẩm)"]')`),'optimistic cart');
    assert.equal(await evaluate('window.__cart.items.length'),0);
    await evaluate(`document.querySelector('${cart}').click()`);
    await until(()=>evaluate('window.__cart.items.length===1'),'cart saved');
    assert.equal(await evaluate("window.__requests.filter(r=>r.route==='/api/cart/items').length"),1);
    assert.equal(await evaluate('location.href'),before);
    await until(()=>evaluate(`!document.querySelector('${cart}').disabled`),'settled');
    await evaluate('window.__failCart=true'); await click(cart);
    await until(()=>evaluate(`!!document.querySelector('[aria-label="Giỏ hàng (2 sản phẩm)"]')`),'optimistic second item');
    await until(()=>evaluate(`!!document.querySelector('[aria-label="Giỏ hàng (1 sản phẩm)"]')`),'failed add rollback');
    assert.equal(await evaluate('location.href'),before);
    await until(()=>evaluate(`!document.querySelector('${cart}').disabled`),'rollback settled');
  });
  await test('Multiple variants require an explicit choice; guest add uses existing cart without navigation',async()=>{
    const clearVariants=()=>evaluate("import('/src/services/queryCache.js').then(m=>m.queryClient.removeQueries({queryKey:m.queryKeys.public('inventory',{id:1})}))");
    await clearVariants(); await evaluate('window.__failCart=false;window.__multipleVariants=true');
    const writes=await evaluate("window.__requests.filter(r=>r.route==='/api/cart/items').length");
    await click(cart); await until(()=>evaluate('!!document.querySelector("#catalog-results fieldset")'),'variant selection');
    assert.equal(await evaluate("window.__requests.filter(r=>r.route==='/api/cart/items').length"),writes);
    await select('#catalog-results fieldset select','2'); await button('Thêm vào giỏ hàng','document.querySelector("#catalog-results fieldset")');
    await until(()=>evaluate('!document.querySelector("#catalog-results fieldset")'),'variant added');
    const body=await evaluate("JSON.parse(window.__requests.filter(r=>r.route==='/api/cart/items').at(-1).body)");
    assert.equal(body.variantID,2);
    await evaluate('localStorage.removeItem("accessToken");window.dispatchEvent(new Event("auth-changed"));window.__multipleVariants=false');
    await delay(100); await clearVariants(); await click(cart);
    await until(()=>evaluate('JSON.parse(localStorage.getItem("stationery_guest_cart")||"[]").length===1'),'guest cart');
    assert.equal(await evaluate('location.pathname'),'/search');
    assert.equal(await evaluate('!!document.querySelector("dialog[open]")'),false);
  });
  assert.deepEqual(exceptions,[]); assert.deepEqual(await evaluate('window.__unexpected'),[]);
  console.log(`${passed} targeted Search card browser checks passed.`);

} catch (error) {
  console.error(error); process.exitCode = 1;
  if (send) { const { data } = await send('Page.captureScreenshot', { format: 'png' }).catch(() => ({})); if (data) { await fs.mkdir(artifacts, { recursive: true }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(data, 'base64')); } }
} finally {
  if (send) await send('Browser.close').catch(() => {}); socket?.close(); browser?.kill(); if (vite) await vite.close();
  if (profile && path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('stationery-search-card-test-')) { await delay(300); await fs.rm(profile, { recursive: true, force: true, maxRetries: 4 }).catch(() => {}); }
}
