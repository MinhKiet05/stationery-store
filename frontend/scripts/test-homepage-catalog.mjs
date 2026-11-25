import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Synthetic fixtures intercept every API; no production traffic.
function installApi() {
  const nativeFetch = window.fetch.bind(window);
  localStorage.removeItem('accessToken');
  window.__requests = []; window.__unexpected = []; window.__failMore = false; window.__searchDelay = 0;
  const names = ['COMBO', 'Tập học sinh', 'Bút lông màu', 'Balo học sinh', 'Bút gel', 'Bút cao cấp'];
  const types = names.map((name, i) => ({productTypeID: 77 + i, name, isActive: true}));
  const products = Array.from({length: 300}, (_, i) => ({productID: i+1, title: `Sản phẩm ${i+1}`, handle: `product-${i+1}`,
    description: 'Sản phẩm kiểm thử', price: 120000, priceMin: 120000, compareAtPrice: 150000, available: true, isActive: true,
    ratingAverage: 4, reviewCount: 1, vendorID: i%3+1, vendorName: `Nhãn ${i%3+1}`, productTypeID: 77+i%6, productTypeName: names[i%6], images: []}));
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input==='string'? input:input.url, location.href);
    if (!url.pathname.startsWith('/api/')) return nativeFetch(input, options);
    const record={route:url.pathname, query:Object.fromEntries(url.searchParams), aborted:false};
    window.__requests.push(record);
    options.signal?.addEventListener('abort',()=>{record.aborted=true;},{once:true});
    options.signal?.throwIfAborted();
    if (url.pathname==='/api/product-types') return Response.json(types);
    if (url.pathname==='/api/vendors') return Response.json([{vendorID:1,name:'Nhãn 1'}]);
    if (url.pathname.startsWith('/api/recommendations/')) return Response.json({products: products.slice(39,42), source:'FALLBACK'});
    if (url.pathname==='/api/products' || url.pathname==='/api/products/search') {
      const page=Number(url.searchParams.get('page')||0), size=Number(url.searchParams.get('size')||10);
      if (url.pathname==='/api/products' && size===10 && page===1) {
        await new Promise(r=>setTimeout(r,200));
        if (window.__failMore) return Response.json({}, {status:500});
      }
      if (url.pathname==='/api/products/search') await new Promise(r=>setTimeout(r,window.__searchDelay));
      options.signal?.throwIfAborted();
      let result=[...products];
      const id=url.searchParams.get('productTypeID'); if (id) result=result.filter(p=>p.productTypeID===Number(id));
      if(url.searchParams.get('sort')==='productID,desc') result.reverse();
      return Response.json({content:result.slice(page*size,(page+1)*size),totalElements:result.length,totalPages:Math.ceil(result.length/size)});
    }
    window.__unexpected.push(url.pathname); return Response.json({}, {status:500});
  };
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let vite, browser, profile, socket, send, evaluate;
const pending = new Map(), exceptions = [];
const artifacts = fileURLToPath(new URL('../../.cache/homepage/', import.meta.url));
let passed = 0;
async function until(check, label) { for (let i = 0; i < 150; i++) { if (await check()) return; await delay(80); } throw new Error(`Timed out: ${label}`); }
async function test(label, run) { await run(); passed++; console.log(`PASS ${label}`); }

try {
  vite = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } }); await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const executable = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(value => value && existsSync(value));
  assert.ok(executable, 'Set CHROME_PATH to an installed Chromium browser');
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'stationery-homepage-test-'));
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  await until(() => existsSync(path.join(profile, 'DevToolsActivePort')), 'browser startup');
  let port;
  await until(async () => { try {
    port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
    return /^\d+$/.test(port);
  } catch { return false; } }, 'readable browser port');
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
  const navigate = async (route = '/') => { await send('Page.navigate', { url: base + route }); await until(() => evaluate('!!window.__requests'), 'page loaded'); };
  const click = async selector => { assert.equal(await evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled)return false;n.focus();n.click();return true;})()`), true, selector); };
  const button = async (text, selector = 'document') => { await evaluate(`(() => {const n=[...${selector}.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!n||n.disabled)throw new Error('Button unavailable');n.focus();n.click()})()`); };
  const select = async (selector, value) => { await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const screenshot = async name => { await evaluate("document.querySelectorAll('.store-notice-close').forEach(n=>n.click())"); await delay(350); await fs.mkdir(artifacts, { recursive: true }); const { data } = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, name), Buffer.from(data, 'base64')); };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  const featured='section[aria-label="Sản phẩm nổi bật"]', discovery='section[aria-label="Khám phá thêm sản phẩm"]';
  const cards=section=>evaluate(`document.querySelectorAll('${section} h3').length`);
  const searchReady=()=>until(()=>evaluate(`(async () => {
    if (!document.querySelector('main[aria-busy="false"] #catalog-results article')) return false;
    const {queryClient} = await import('/src/services/queryCache.ts');
    const params = new URLSearchParams(location.search), category = params.get('category') || '';
    const expectedCategory = /^\\d+$/.test(category) ? category : '';
    return queryClient.getQueryCache().getAll().some(q => {
      const [scope, resource, filters] = q.queryKey;
      return scope === 'public' && resource === 'products' && q.getObserversCount() > 0 &&
        filters.productTypeID === expectedCategory && filters.page === Number(params.get('page') || 1) - 1 &&
        filters.size === Number(params.get('size') || 24) &&
        q.state.status === 'success' && q.state.fetchStatus === 'idle';
    });
  })()`), 'catalog ready for current URL');
  const go=route=>evaluate(`history.pushState({},'',${JSON.stringify(route)});window.dispatchEvent(new PopStateEvent('popstate'))`);
  await navigate();
  await until(()=>cards(featured).then(n=>n===10),'ten featured products');
  await until(()=>cards(discovery).then(n=>n===10),'ten discovery products');
  await test('Homepage shows 10 featured, 6 newest and 10 distinct discovery products with one recommendation fetch',async()=>{
    assert.equal(await evaluate(`document.querySelectorAll('a[aria-label^="Xem chi tiết"]').length`),6);
    assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('a[aria-label^="Xem chi tiết"]')).map(n=>n.getAttribute('href'))`),
      [300,299,298,297,296,295].map(id=>'/products/product-'+id));
    assert.equal(await evaluate(`!!document.querySelector('a[href="/search?sort=newest"]')`),true);
    assert.equal(await evaluate("window.__requests.filter(r=>r.route.startsWith('/api/recommendations/')&&!r.aborted).length"),1);
    assert.equal(await evaluate("window.__requests.filter(r=>r.route==='/api/products/search').length"),0,'no eager category prefetch');
    const ids=await evaluate(`Array.from(document.querySelectorAll('${discovery} a:has(h3)')).map(n=>n.getAttribute('href'))`);
    assert.equal(new Set(ids).size,10);
    for(const id of [40,41,42]) assert.ok(!ids.includes('/products/product-'+id));
  });
  await test('Load More failure retains products; retry appends 10, then caps at 30 without duplicates',async()=>{
    await evaluate('window.__failMore=true'); await button('Xem thêm sản phẩm',`document.querySelector('${featured}')`);
    await until(()=>evaluate(`!!document.querySelector('${featured} [role=alert]')`),'load more error');
    assert.equal(await cards(featured),10);
    await evaluate('window.__failMore=false'); await button('Thử lại',`document.querySelector('${featured}')`);
    await until(()=>cards(featured).then(n=>n===20),'twenty products');
    await button('Xem thêm sản phẩm',`document.querySelector('${featured}')`);
    await until(()=>cards(featured).then(n=>n===30),'thirty products');
    assert.equal(await evaluate(`!!document.querySelector('${featured} a[href="/search"]')`),true);
    assert.equal(await evaluate(`new Set([...document.querySelectorAll('${featured} a:has(h3)')].map(n=>n.getAttribute('href'))).size`),30);
  });
  await test('Six category cards use actual IDs; focus prefetch is reused by category navigation',async()=>{
    for(let id=77;id<=82;id++) assert.equal(await evaluate(`!!document.querySelector('a[href="/search?category=${id}"]')`),true);
    await evaluate('window.__spaMarker=123');
    await evaluate(`document.querySelector('a[href="/search?category=80"]').focus()`);
    await delay(450);
    const before=await evaluate("window.__requests.filter(r=>r.route==='/api/products/search'&&r.query.productTypeID==='80').length");
    assert.equal(before,1);
    await click('a[href="/search?category=80"]'); await searchReady();
    assert.equal(await evaluate('window.__spaMarker'),123,'no document reload');
    assert.equal(await evaluate("window.__requests.filter(r=>r.route==='/api/products/search'&&r.query.productTypeID==='80').length"),before);
    assert.equal(await evaluate("document.querySelector('#catalog-filters button[aria-pressed=true]').textContent.trim()"),'Balo học sinh');
    assert.equal(await evaluate("document.querySelectorAll('#catalog-results article').length"),24);
    for (const id of [77,78,79,81,82]) {
      await go('/'); await until(()=>cards(featured).then(n=>n===30),'cached home');
      await click(`a[href="/search?category=${id}"]`); await searchReady();
      assert.equal(await evaluate('new URLSearchParams(location.search).get("category")'),String(id));
      assert.equal(await evaluate(`window.__requests.some(r=>r.route==='/api/products/search'&&r.query.productTypeID==='${id}')`),true);
      const titles = await evaluate(`Array.from(document.querySelectorAll('#catalog-results article a[class*="productTitle"]')).map(n=>n.textContent.trim())`);
      assert.equal(titles.length,24);
      assert.ok(titles.every(title => (Number(title.split(' ').at(-1))-1)%6+77===id));
    }
    await go('/'); await until(()=>cards(featured).then(n=>n===30),'cached home');
    await click('a[href="/search?category=80"]'); await searchReady();
  });
  await test('URL/category/chip remain synchronized; page size and category changes reset pagination',async()=>{
    await click('button[aria-label="Trang sau"]'); await until(()=>evaluate('new URLSearchParams(location.search).get("page")==="2"'),'page two'); await searchReady();
    await select('select[aria-label="Số sản phẩm mỗi trang"]','48'); await searchReady();
    await until(()=>evaluate('document.querySelectorAll("#catalog-results article").length===48'),'48 rows');
    assert.equal(await evaluate('new URLSearchParams(location.search).has("page")'),false);
    await button('Bút gel','document.querySelector("#catalog-filters")'); await searchReady();
    assert.equal(await evaluate('new URLSearchParams(location.search).get("category")'),'81');
    await until(()=>evaluate('!!document.querySelector(\'button[aria-label="Bỏ lọc Bút gel"]\')'), 'category chip ready');
    await click('button[aria-label="Bỏ lọc Bút gel"]');
    await until(()=>evaluate('!new URLSearchParams(location.search).has("category")'),'chip clears category');
  });
  await test('Search URL survives refresh, Back/Forward, preserves other params and rejects malformed category safely',async()=>{
    await navigate('/search?search=but&category=80&sort=newest&size=12&campaign=keep'); await searchReady();
    assert.equal(await evaluate('document.querySelector("#catalog-sort").value'),'newest');
    await button('Bút gel','document.querySelector("#catalog-filters")'); await searchReady();
    assert.equal(await evaluate('new URLSearchParams(location.search).get("search")'),'but');
    assert.equal(await evaluate('new URLSearchParams(location.search).get("campaign")'),'keep');
    await evaluate('history.back()'); await until(()=>evaluate('new URLSearchParams(location.search).get("category")==="80"'),'back category'); await searchReady();
    assert.equal(await evaluate("document.querySelector('#catalog-filters button[aria-pressed=true]').textContent.trim()"),'Balo học sinh');
    await evaluate('history.forward()'); await until(()=>evaluate('new URLSearchParams(location.search).get("category")==="81"'),'forward category'); await searchReady();
    assert.equal(await evaluate("document.querySelector('#catalog-filters button[aria-pressed=true]').textContent.trim()"),'Bút gel');
    await button('Xoá tất cả','document.querySelector("#catalog-filters")');
    await until(()=>evaluate('!new URLSearchParams(location.search).has("category")'),'reset removes category');
    assert.equal(await evaluate('new URLSearchParams(location.search).get("search")'),'but');
    await navigate('/search?category=invalid'); await searchReady();
    assert.equal(await evaluate('document.body.textContent.includes("Danh mục không hợp lệ")'),true);
    await navigate('/search?category=9999');
    await until(()=>evaluate('document.body.textContent.includes("Chưa tìm thấy sản phẩm")'),'unknown category empty');
  });
  await test('Category switch hides the old products while a new server-filtered query is pending',async()=>{
    await navigate('/search?category=80&sort=price-asc'); await searchReady();
    await evaluate('window.__searchDelay=600'); await button('Bút gel','document.querySelector("#catalog-filters")');
    await until(()=>evaluate('new URLSearchParams(location.search).get("category")==="81"'),'new category committed');
    assert.equal(await evaluate('document.querySelectorAll("#catalog-results article").length'),0);
    await searchReady();
  });
  await test('Homepage grid has 5/4/3/2 columns and no horizontal overflow',async()=>{
    await navigate(); await until(()=>cards(featured).then(n=>n===10),'fresh homepage');
    for(const [width,columns] of [[1440,5],[1100,4],[900,3],[390,2],[320,2]]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:width<768}); await delay(150);
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('${featured} h3').parentElement.parentElement.parentElement.parentElement).gridTemplateColumns.split(' ').length`),columns);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`overflow at ${width}`);
      if(width===1440||width===390) {
        await evaluate(`document.querySelector('${featured}').scrollIntoView()`);
        await screenshot(`homepage-${width}.png`);
      }
    }
  });
  assert.deepEqual(exceptions,[]); assert.deepEqual(await evaluate('window.__unexpected'),[]);
  console.log(`${passed} homepage/catalog browser checks passed.`);

} catch (error) {
  console.error(error); process.exitCode = 1;
  if (send) { const { data } = await send('Page.captureScreenshot', { format: 'png' }).catch(() => ({})); if (data) { await fs.mkdir(artifacts, { recursive: true }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(data, 'base64')); } }
} finally {
  if (send) await send('Browser.close').catch(() => {}); socket?.close(); browser?.kill(); if (vite) await vite.close();
  if (profile && path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('stationery-homepage-test-')) { await delay(300); await fs.rm(profile, { recursive: true, force: true, maxRetries: 4 }).catch(() => {}); }
}
