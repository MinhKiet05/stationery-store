import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Synthetic data is confined to this test; all backend calls are intercepted before React mounts.
function installApi() {
  const realFetch=window.fetch.bind(window),picture=location.origin+'/__test__/evidence.png';
  if(!sessionStorage.getItem('products-test-init')){localStorage.setItem('accessToken','test-product-token');sessionStorage.setItem('products-test-init','true');}
  window.__products=Array.from({length:24},(_,i)=>({productID:i+1,title:`Sản phẩm kiểm thử ${i+1}`,handle:`test-${i+1}`,description:'Mô tả sản phẩm kiểm thử',price:20000,compareAtPrice:25000,available:i%4<2,isActive:i%4!==3,vendorID:i%2+1,vendorName:i%2?'Brand B':'Brand A',productTypeID:i%2+1,productTypeName:i%2?'Sổ':'Bút',images:[picture,location.origin+'/__test__/broken.png'],tagIDs:[1],revision:0,
    variants:[{variantID:(i+1)*10+1,productID:i+1,productTitle:`Sản phẩm kiểm thử ${i+1}`,title:'Màu xanh',sku:`SKU-${i+1}-BLUE`,available:true,price:20000,compareAtPrice:25000,option1:'Xanh',stockQuantity:12,version:0},{variantID:(i+1)*10+2,productID:i+1,productTitle:`Sản phẩm kiểm thử ${i+1}`,title:'Màu đỏ',sku:`SKU-${i+1}-RED`,available:true,price:30000,compareAtPrice:null,stockQuantity:3,version:0}]}));
  window.__requests=[];window.__unexpected=[];window.__downloads=[];window.__delay=0;
  const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download){window.__downloads.push({filename:this.download});return;}return click.call(this);};
  const token=p=>`state-${p.productID}-${p.revision}`;
  const detail=p=>({product:p,variants:p.variants,tags:p.tagIDs.map(id=>({id,name:'Học tập',active:true})),stateToken:token(p),lowStockThreshold:10});
  const low=p=>p.available&&p.isActive&&p.variants.some(v=>v.available&&v.stockQuantity<10);
  window.fetch=async(input,options={})=>{
    const u=new URL(typeof input==='string'?input:input.url,location.href);if(!u.pathname.startsWith('/api/'))return realFetch(input,options);
    const route=u.pathname,method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
    window.__requests.push({route,method,query:Object.fromEntries(u.searchParams),auth:new Headers(options.headers).get('Authorization'),body});options.signal?.throwIfAborted();
    if(route==='/api/auth/me')return Response.json({username:'admin',fullName:'Quản trị kiểm thử',role: (window.__failure?.status === 403 ? 'CUSTOMER' : sessionStorage.getItem('test-role') || 'ADMIN')});
    if(window.__failure?.route===route&&(!window.__failure.method||window.__failure.method===method))return Response.json({detail:'SQL password=private-diagnostic'},{status:window.__failure.status});
    if(route.startsWith('/api/admin/products')||route.startsWith('/api/admin/product-variants')){await new Promise(resolve=>setTimeout(resolve,window.__delay));options.signal?.throwIfAborted();}
    if(route==='/api/admin/products/options')return Response.json({categories:[{id:1,name:'Bút',active:true},{id:2,name:'Sổ',active:true}],vendors:[{id:1,name:'Brand A',active:true},{id:2,name:'Brand B',active:true}],tags:[{id:1,name:'Học tập',active:true}]});
    const variantRead=route.match(/^\/api\/product-variants\/(\d+)$/),stock=route.match(/^\/api\/admin\/product-variants\/(\d+)\/stock$/);
    if(variantRead||stock){const v=window.__products.flatMap(p=>p.variants).find(v=>v.variantID===Number((variantRead||stock)[1]));if(!v)return Response.json({},{status:404});if(stock){if(body.version!==v.version)return Response.json({},{status:409});v.stockQuantity=body.stockQuantity;v.version++;}return Response.json(v);}
    const match=route.match(/^\/api\/admin\/products\/(\d+)(?:\/(status|variants)(?:\/(\d+))?)?$/);
    if(match){const p=window.__products.find(p=>p.productID===Number(match[1]));if(!p)return Response.json({},{status:404});
      if(match[2]==='variants'&&method!=='GET'){
        if(match[3]){const v=p.variants.find(v=>v.variantID===Number(match[3]));if(v.version!==body.expectedVersion)return Response.json({},{status:409});const quantity=v.stockQuantity;Object.assign(v,body.variant,{stockQuantity:quantity,version:v.version+1});return Response.json(v);}
        const v={...body.variant,variantID:p.productID*10+p.variants.length+1,stockQuantity:body.initialStock,version:0};p.variants.push(v);return Response.json(v,{status:201});
      }
      if(method==='PUT'||method==='PATCH'||method==='DELETE'){
        if(body.expectedState!==token(p))return Response.json({},{status:409});
        if(method==='DELETE'){p.isActive=false;p.available=false;p.revision++;return new Response(null,{status:204});}
        if(method==='PATCH')p.available=body.available;else Object.assign(p,body.product);p.revision++;
      }return Response.json(detail(p));
    }
    if(route==='/api/admin/products'&&method==='POST'){const p={...body.product,productID:25,variants:[],revision:0,isActive:true};window.__products.push(p);return Response.json(detail(p),{status:201});}
    if(route.startsWith('/api/admin/products')){
      const q=u.searchParams,search=(q.get('search')||'').toLowerCase();const rows=window.__products.filter(p=>(!search||`${p.title} ${p.variants.map(v=>v.sku).join(' ')}`.toLowerCase().includes(search))&&(!q.get('productTypeID')||String(p.productTypeID)===q.get('productTypeID'))&&(!q.get('vendorID')||String(p.vendorID)===q.get('vendorID'))&&(!q.get('status')||(q.get('status')==='SELLING'?p.isActive&&p.available:q.get('status')==='HIDDEN'?p.isActive&&!p.available:!p.isActive))&&(q.get('lowStock')!=='true'||low(p))).sort((a,b)=>(q.get('sort')==='ID_ASC'?1:-1)*(a.productID-b.productID));
      if(route.endsWith('/statistics'))return Response.json({totalProducts:rows.length,sellingProducts:rows.filter(p=>p.isActive&&p.available).length,hiddenProducts:rows.filter(p=>!p.isActive||!p.available).length,lowStockProducts:rows.filter(low).length,lowStockThreshold:10});
      if(route.endsWith('/export'))return rows.length?new Response(new Uint8Array([80,75,3,4]),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="stationery-products-2026-11-24.xlsx"'}}):Response.json({},{status:404});
      if(route==='/api/admin/products'){const page=Number(q.get('page')||0);return Response.json({content:rows.slice(page*10,(page+1)*10).map(p=>({...p,imageUrl:p.images[0],priceMin:p.variants.length?Math.min(...p.variants.map(v=>v.price)):p.price,priceMax:p.variants.length?Math.max(...p.variants.map(v=>v.price)):p.price,totalStock:p.variants.reduce((s,v)=>s+v.stockQuantity,0),variantCount:p.variants.length,lowStockVariants:low(p)?p.variants.filter(v=>v.available&&v.stockQuantity<10).length:0})),totalElements:rows.length,totalPages:Math.ceil(rows.length/10)});}
    }
    if(route==='/api/cart/items')return Response.json({items:[],subtotal:0});if(route==='/api/product-types')return Response.json([]);
    window.__unexpected.push(route);return Response.json({},{status:500});
  };
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let vite, browser, profile, socket, send, evaluate;
const pending = new Map(), exceptions = [];
const artifacts = fileURLToPath(new URL('../../.cache/admin-products/', import.meta.url));
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
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'stationery-products-test-'));
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
  const navigate = async () => { await send('Page.navigate', { url: base + '/dashboard/products' }); await until(() => evaluate('!!window.__requests'), 'page loaded'); };
  const loaded = () => until(() => evaluate("document.querySelectorAll('.products-table tbody tr').length===10 && document.querySelectorAll('.products-kpi-grid .dashboard-stat').length===4"), 'review data');
  const click = async selector => { assert.equal(await evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled)return false;n.focus();n.click();return true;})()`), true, selector); };
  const button = async (text, selector = 'document') => { await evaluate(`(() => {const n=[...${selector}.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!n||n.disabled)throw new Error('Button unavailable');n.focus();n.click()})()`); };
  const input = async (selector, value) => { await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor((n.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement).prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const select = async (selector, value) => { await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const screenshot = async name => { await evaluate("document.querySelectorAll('.store-notice-close').forEach(n=>n.click())"); await delay(350); await fs.mkdir(artifacts, { recursive: true }); const { data } = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, name), Buffer.from(data, 'base64')); };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await navigate(); await loaded();
  const top = "[...document.querySelectorAll('dialog[open]')].at(-1)";
  const closeDetail = () => click('dialog[open] [aria-label="Đóng hộp thoại"]');
  const open=async id=>{await until(()=>evaluate(`!!document.querySelector('[aria-label="Xem chi tiết sản phẩm #${id}"]')`),'list ready');await click(`[aria-label="Xem chi tiết sản phẩm #${id}"]`);await until(()=>evaluate("!!document.querySelector('.product-detail-info')"),'detail');};
  const confirmSave=async()=>{await button('Lưu dữ liệu',top);await until(()=>evaluate("document.querySelectorAll('dialog[open]').length>=2"),'confirm');await button('Xác nhận',top);};
  await test('ADMIN direct refresh reuses layout, active menu and whole-dataset KPI',async()=>{
    assert.equal(await evaluate("document.querySelectorAll('header').length"),1);assert.match(await evaluate("document.querySelector('.dashboard-nav-link.active').textContent"),/Sản phẩm/);
    assert.equal(await evaluate("document.querySelector('.products-kpi-grid .dashboard-stat-value').textContent"),'24');assert.equal(await evaluate("window.__requests.filter(r=>r.route.startsWith('/api/admin/')).every(r=>r.auth==='Bearer test-product-token')"),true);
    await evaluate('window.__reloadMarker=true');await send('Page.reload');await until(()=>evaluate('!window.__reloadMarker&&!!window.__requests'),'reload');await loaded();await screenshot('desktop.png');
  });
  await test('Server pagination, SKU search, category, brand, status, low stock and sort filter full Excel',async()=>{
    await click('[aria-label="Trang sản phẩm tiếp theo"]');await until(()=>evaluate("document.querySelector('.dashboard-pagination')?.textContent.includes('Trang 2')"),'page2');
    await click('[data-product-status=SELLING]');await select('[aria-label="Lọc danh mục sản phẩm"]','2');await select('[aria-label="Lọc thương hiệu"]','2');await click('.products-low-filter input');await select('[aria-label="Sắp xếp sản phẩm"]','ID_ASC');
    await input('[aria-label="Tìm sản phẩm"]','SKU-22');await until(()=>evaluate("document.querySelectorAll('.products-table tbody tr').length===1 && document.querySelector('.products-table tbody')?.textContent.includes('22')"),'filters');
    await button('Xuất Excel');await until(()=>evaluate('window.__downloads.length===1'),'Excel');assert.deepEqual((await evaluate("window.__requests.findLast(r=>r.route.endsWith('/export'))")).query,{search:'SKU-22',status:'SELLING',productTypeID:'2',vendorID:'2',lowStock:'true',sort:'ID_ASC'});assert.equal(await evaluate('window.__downloads[0].filename'),'stationery-products-2026-11-24.xlsx');await button('Đặt lại');await loaded();
  });
  await test('Detail loading, real variants, price range, gallery viewer and broken-image fallback',async()=>{
    await evaluate('window.__delay=350');await click('[aria-label="Xem chi tiết sản phẩm #22"]');await until(()=>evaluate("document.querySelector('dialog[open] [role=status]')?.textContent.includes('Đang tải')"),'loading');await until(()=>evaluate("!!document.querySelector('.product-variants')"),'detail');
    assert.equal(await evaluate("document.querySelectorAll('.product-variants li').length"),2);const content=await evaluate("document.querySelector('dialog[open]').textContent");for(const v of ['SKU-22-BLUE','SKU-22-RED','20.000','30.000','15'])assert.ok(content.includes(v),v);
    await until(()=>evaluate("!!document.querySelector('.product-gallery .product-image-fallback')"),'fallback');await click('[aria-label="Xem ảnh sản phẩm 1"]');await until(()=>evaluate("document.querySelector('dialog[open] .product-expanded-image')?.naturalWidth>0"),'viewer');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until(()=>evaluate("document.querySelectorAll('dialog[open]').length===1"),'close viewer');await screenshot('detail.png');await closeDetail();await evaluate('window.__delay=0');
  });
  await test('Create validates fields and URL, uses backend options, confirms once and opens saved detail',async()=>{
    await button('+ Thêm sản phẩm');await button('Lưu dữ liệu',top);assert.equal(await evaluate("document.querySelector('[aria-label=\"Tên sản phẩm\"]').validity.valid"),false);
    await input('[aria-label="Tên sản phẩm"]','Sản phẩm mới');await input('[aria-label="Giá cơ bản sản phẩm"]','40000');await input('[aria-label="URL ảnh sản phẩm"]','javascript:alert(1)');await button('Lưu dữ liệu',top);await until(()=>evaluate("!!document.querySelector('dialog[open] [role=alert]')"),'invalid URL');
    await input('[aria-label="URL ảnh sản phẩm"]',await evaluate("location.origin+'/__test__/evidence.png'"));await select('[aria-label="Danh mục sản phẩm"]','1');await select('[aria-label="Thương hiệu sản phẩm"]','1');await evaluate('window.__delay=400');await button('Lưu dữ liệu',top);
    await evaluate(`(()=>{const n=${top}.querySelector('.dashboard-button-primary');n.click();n.click()})()`);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});assert.equal(await evaluate("document.querySelectorAll('dialog[open]').length"),2);
    await until(()=>evaluate("document.querySelector('.product-detail-info')?.textContent.includes('Sản phẩm mới')"),'created');assert.equal(await evaluate("window.__requests.filter(r=>r.route==='/api/admin/products'&&r.method==='POST').length"),1);await closeDetail();await evaluate('window.__delay=0');
  });
  await test('Edit product refreshes detail and list; hide/show use snapshot confirmations',async()=>{
    await open(22);await button('Chỉnh sửa',"document.querySelector('dialog[open]')");await input('[aria-label="Tên sản phẩm"]','Sản phẩm đã chỉnh sửa');await input('[aria-label="Giá cơ bản sản phẩm"]','45000');await confirmSave();await until(()=>evaluate("document.querySelectorAll('dialog[open]').length===1&&document.querySelector('.product-detail-info')?.textContent.includes('Sản phẩm đã chỉnh sửa')"),'edited');
    await button('Ẩn sản phẩm',"document.querySelector('dialog[open]')");await button('Xác nhận',top);await until(()=>evaluate("document.querySelector('.product-detail-info .dashboard-badge')?.textContent==='Đang ẩn'"),'hidden');
    await button('Hiện sản phẩm',"document.querySelector('dialog[open]')");await button('Xác nhận',top);await until(()=>evaluate("document.querySelector('.product-detail-info .dashboard-badge')?.textContent==='Đang kinh doanh'"),'shown');await closeDetail();
  });
  await test('Variant creation and metadata price edits preserve current inventory with expected version',async()=>{
    await open(22);await button('Thêm biến thể',"document.querySelector('dialog[open]')");await input('[aria-label="Tên biến thể"]','Màu vàng');await input('[aria-label="SKU"]','SKU-22-YELLOW');await input('[aria-label="Giá bán biến thể"]','35000');await input('[aria-label="Tồn kho ban đầu"]','5');await confirmSave();await until(()=>evaluate("document.querySelectorAll('dialog[open]').length===1&&document.querySelectorAll('.product-variants li').length===3"),'created variant');
    await click('[aria-label="Chỉnh sửa biến thể #221"]');assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Tồn kho ban đầu\"]')"),false);await input('[aria-label="Giá bán biến thể"]','50000');await confirmSave();await until(()=>evaluate("document.querySelectorAll('dialog[open]').length===1&&document.querySelector('.product-variants li')?.textContent.includes('50.000')"),'variant edited');
    assert.equal(await evaluate('window.__products.find(p=>p.productID===22).variants[0].stockQuantity'),12);assert.equal((await evaluate("window.__requests.findLast(r=>r.method==='PUT'&&r.route.includes('/variants/'))")).body.expectedVersion,0);await closeDetail();
  });
  await test('Stock reuses existing versioned API and refreshes actual product totals',async()=>{
    await open(22);await click('[aria-label="Cập nhật tồn kho #221"]');await until(()=>evaluate("!!document.querySelector('[aria-label=\"Số lượng tồn kho mới\"]')"),'stock');await input('[aria-label="Số lượng tồn kho mới"]','-1');assert.equal(await evaluate("[...[...document.querySelectorAll('dialog[open]')].at(-1).querySelectorAll('button')].find(n=>n.textContent==='Cập nhật tồn kho').disabled"),true);
    await input('[aria-label="Số lượng tồn kho mới"]','9');await button('Cập nhật tồn kho',top);await button('Xác nhận',top);await until(()=>evaluate("document.querySelector('.admin-stock-count')?.textContent==='9'"),'stock saved');
    assert.equal((await evaluate("window.__requests.findLast(r=>r.route.endsWith('/stock'))")).body.version,1);await button('Đóng',top);await until(()=>evaluate("document.querySelector('.product-detail-info')?.textContent.includes('17')"),'total refreshed');await closeDetail();
  });
  await test('409 edits keep form open and require a fresh read; failed mutations never claim success',async()=>{
    await open(22);await button('Chỉnh sửa',"document.querySelector('dialog[open]')");await input('[aria-label="Tên sản phẩm"]','Stale overwrite');await evaluate('window.__products.find(p=>p.productID===22).revision++');await confirmSave();await until(()=>evaluate("document.querySelectorAll('dialog[open]').length===2&&!!document.querySelector('#admin-product-form')&&!![...document.querySelectorAll('dialog[open]')].at(-1).querySelector('[role=alert]')"),'conflict');
    assert.equal(await evaluate("[...[...document.querySelectorAll('dialog[open]')].at(-1).querySelectorAll('button')].find(n=>n.textContent==='Lưu dữ liệu').disabled"),true);await button('Tải lại dữ liệu',top);await until(()=>evaluate("document.querySelectorAll('dialog[open]').length===1&&!!document.querySelector('.product-detail-info')"),'fresh');assert.equal(await evaluate("document.body.textContent.includes('Stale overwrite')"),false);await closeDetail();
  });
  await test('Soft deletion confirms and preserves all variants; deleted products have read-only detail',async()=>{
    await open(21);await button('Xóa mềm sản phẩm',"document.querySelector('dialog[open]')");await button('Xác nhận',top);await until(()=>evaluate("!document.querySelector('dialog[open]')"),'deleted');assert.equal(await evaluate('window.__products.find(p=>p.productID===21).variants.length'),2);
    await open(21);assert.equal(await evaluate("[...document.querySelector('dialog[open]').querySelectorAll('button')].some(n=>n.textContent==='Chỉnh sửa'||n.textContent==='Thêm biến thể')"),false);await closeDetail();
  });
  await test('Empty/list error retry/detail404/export413 remain safe and responsive at 320 through 1440',async()=>{
    await input('[aria-label="Tìm sản phẩm"]','missing');await until(()=>evaluate("document.querySelector('.products-list-panel')?.textContent.includes('Không có sản phẩm')"),'empty');await button('Đặt lại');await loaded();
    await evaluate("window.__failure={route:'/api/admin/products',method:'GET',status:500}");await click('[data-product-status=SELLING]');await until(()=>evaluate("!!document.querySelector('.products-list-panel [role=alert]')"),'list error');await evaluate('window.__failure=null');await button('Thử lại',"document.querySelector('.products-list-panel')");await until(()=>evaluate("document.querySelectorAll('.products-table tbody tr').length===10"),'retry');await button('Đặt lại');await loaded();
    await evaluate("window.__failure={route:'/api/admin/products/24',status:404}");await click('[aria-label="Xem chi tiết sản phẩm #24"]');await until(()=>evaluate("!!document.querySelector('dialog[open] [role=alert]')"),'404');await closeDetail();
    await evaluate("window.__failure={route:'/api/admin/products/export',status:413}");await button('Xuất Excel');await until(()=>evaluate("document.body.textContent.includes('thu hẹp bộ lọc')"),'export413');assert.equal(await evaluate("document.body.textContent.includes('private-diagnostic')"),false);await evaluate('window.__failure=null');
    for(const width of [1440,768,320,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<600});await delay(350);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`overflow ${width}`);}
    await screenshot('mobile.png');await open(22);await screenshot('mobile-detail.png');assert.equal(await evaluate("(()=>{const r=document.querySelector('dialog[open]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()"),true);
    await button('Chỉnh sửa',"document.querySelector('dialog[open]')");await screenshot('mobile-edit.png');await button('Hủy',top);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until(()=>evaluate("!document.querySelector('dialog[open]')"),'Escape');
  });
  await test('403 revokes protected screen; forged local role never grants CUSTOMER or anonymous access',async()=>{
    await evaluate("window.__failure={route:'/api/admin/products/export',status:403}");await button('Xuất Excel');await until(()=>evaluate("document.body.textContent.includes('403')"),'403');assert.equal(await evaluate("!!document.querySelector('.products-page')"),false);
    await evaluate("sessionStorage.setItem('test-role','CUSTOMER');localStorage.setItem('role','ADMIN')");await navigate();await until(()=>evaluate("document.body.textContent.includes('403')"),'customer');assert.equal(await evaluate("window.__requests.some(r=>r.route.startsWith('/api/admin/'))"),false);
    await evaluate("localStorage.removeItem('accessToken')");await navigate();await until(()=>evaluate("location.pathname==='/login'"),'anonymous');
  });
  assert.deepEqual(exceptions,[],'No browser runtime exceptions');assert.deepEqual(await evaluate('window.__unexpected'),[],'All API calls are mocked');console.log(`${passed} admin products browser checks passed.`);
} catch (error) {
  console.error(error); process.exitCode = 1;
  if (send) { const { data } = await send('Page.captureScreenshot', { format: 'png' }).catch(() => ({})); if (data) { await fs.mkdir(artifacts, { recursive: true }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(data, 'base64')); } }
} finally {
  if (send) await send('Browser.close').catch(() => {}); socket?.close(); browser?.kill(); if (vite) await vite.close();
  if (profile && path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('stationery-products-test-')) { await delay(300); await fs.rm(profile, { recursive: true, force: true, maxRetries: 4 }).catch(() => {}); }
}
