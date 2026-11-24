import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

function installProductApi() {
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
    if(route==='/api/cart'||route==='/api/cart/items')return Response.json({items:[],subtotal:0});if(route==='/api/product-types')return Response.json([]);
    window.__unexpected.push(route);return Response.json({},{status:500});
  };
}
function installApi(){
  installProductApi();
  const original=window.fetch;
  window.__imports=[];window.__importDelay=0;window.__importFailure=null;window.__previewInvalid=false;window.__importDone={};
  window.__coupons=Array.from({length:2},(_,i)=>({couponID:i+1,code:`TEST-BASE-${i+1}`,discountType:'PERCENTAGE',discountValue:10,minOrderValue:0,usedCount:0,usageLimit:100,startDate:'2020-01-01',endDate:'2099-12-31',isActive:true,status:'ACTIVE'}));
  window.fetch=async(input,options={})=>{
    const u=new URL(typeof input==='string'?input:input.url,location.href),route=u.pathname;
    const match=route.match(/^\/api\/admin\/(products|promotions)\/import\/(template|preview|confirm)$/);
    if(match){
      const [,kind,op]=match,file=options.body instanceof FormData?options.body.get('file'):null;
      window.__imports.push({route,kind,op,filename:file?.name,contentType:new Headers(options.headers).get('Content-Type'),auth:new Headers(options.headers).get('Authorization'),token:options.body instanceof FormData?options.body.get('importToken'):null});
      await new Promise(resolve=>setTimeout(resolve,window.__importDelay));options.signal?.throwIfAborted();
      if(window.__importFailure)return Response.json({detail:'SQL password=private-import-diagnostic'},{status:window.__importFailure});
      if(op==='template')return new Response(new Uint8Array([80,75,3,4]),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
      if(op==='preview'){
        const bad=window.__previewInvalid||window.__importDone[kind];
        const rows=Array.from({length:25},(_,i)=>({sheet:kind==='products'?'Products':'Vouchers',rowNumber:i+2,values:kind==='products'?{productKey:`P${i}`,title:`Sản phẩm ${i}`,price:'20000'}:{code:`TEST-${i}`,discountType:'PERCENTAGE',discountValue:'10'},status:bad&&i===24?'DUPLICATE':'VALID',errors:bad&&i===24?[{field:kind==='products'?'sku':'code',code:'DUPLICATE',message:'Giá trị đã tồn tại trong database; CREATE_ONLY không ghi đè.'}]:[]}));
        return Response.json({totalRows:25,validRows:bad?24:25,invalidRows:0,duplicateRows:bad?1:0,canImport:!bad,rows,importToken:bad?null:`receipt-${kind}-${file.name}`});
      }
      if(window.__importDone[kind])return Response.json({},{status:409});
      if(options.body.get('importToken')!==`receipt-${kind}-${file.name}`)return Response.json({},{status:409});
      window.__importDone[kind]=true;
      if(kind==='products')for(let i=25;i<=34;i++)window.__products.push({...window.__products[0],productID:i,title:`Import ${i}`,handle:`import-${i}`,variants:[{...window.__products[0].variants[0],variantID:i*10+1,sku:`TEST-IMPORT-${i}`}]});
      else for(let i=3;i<=12;i++)window.__coupons.push({...window.__coupons[0],couponID:i,code:`TEST-IMPORT-${i}`});
      if(window.__uncertain){window.__uncertain=false;throw new TypeError('Network after commit');}
      return Response.json({status:'CREATED',createdRecords:kind==='products'?25:10,createdProducts:kind==='products'?10:0,createdVariants:kind==='products'?15:0,createdVouchers:kind==='promotions'?10:0,aiStatus:kind==='products'?'SCHEDULED':'NOT_APPLICABLE'});
    }
    if(route==='/api/admin/promotions')return Response.json({content:window.__coupons.slice(0,10),totalElements:window.__coupons.length,totalPages:Math.ceil(window.__coupons.length/10)});
    if(route==='/api/admin/promotions/statistics')return Response.json({totalCoupons:window.__coupons.length,activeCoupons:window.__coupons.length,expiredCoupons:0,totalUses:0});
    if(route==='/api/admin/promotions/export')return new Response(new Uint8Array([80,75,3,4]),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
    return original(input,options);
  };
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let vite, browser, profile, socket, send, evaluate;
const pending = new Map(), exceptions = [];
const artifacts = fileURLToPath(new URL('../../.cache/excel-import/', import.meta.url));
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
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'stationery-import-test-'));
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
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `const installProductApi=${installProductApi.toString()};(${installApi.toString()})()` });
  const navigate = async () => { await send('Page.navigate', { url: base + '/dashboard/products' }); await until(() => evaluate('!!window.__requests'), 'page loaded'); };
  const loaded = () => until(() => evaluate("document.querySelectorAll('.products-table tbody tr').length===10 && document.querySelectorAll('.products-kpi-grid .dashboard-stat').length===4"), 'review data');
  const click = async selector => { assert.equal(await evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled)return false;n.focus();n.click();return true;})()`), true, selector); };
  const button = async (text, selector = 'document') => { await evaluate(`(() => {const n=[...${selector}.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!n||n.disabled)throw new Error('Button unavailable');n.focus();n.click()})()`); };
  const input = async (selector, value) => { await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor((n.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement).prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const select = async (selector, value) => { await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const screenshot = async name => { await evaluate("document.querySelectorAll('.store-notice-close').forEach(n=>n.click())"); await delay(350); await fs.mkdir(artifacts, { recursive: true }); const { data } = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, name), Buffer.from(data, 'base64')); };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await navigate();await loaded();
  const top="[...document.querySelectorAll('dialog[open]')].at(-1)";
  const open=async()=>{await button('Import Excel');await until(()=>evaluate("!!document.querySelector('.excel-import-drop')"),'import modal');};
  const choose=async name=>{const {root}=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'input[type=file][aria-label="Chọn file Excel import"]'});await send('DOM.setFileInputFiles',{nodeId,files:[fileURLToPath(new URL(`../../docs/import-samples/${name}`,import.meta.url))]});await until(()=>evaluate(`document.querySelector('.excel-import-file')?.textContent.includes(${JSON.stringify(name)})`),'selected');};
  const preview=async()=>{await button('Kiểm tra dữ liệu');await until(()=>evaluate("!!document.querySelector('.excel-import-counts')&&!document.querySelector('dialog[open][aria-busy=true]')"),'preview');};
  const close=async()=>{await button('Đóng',top);await until(()=>evaluate("!document.querySelector('dialog[open]')"),'closed');};
  await test('Both page actions open shared modal and authenticated template downloads without re-verifying ADMIN',async()=>{
    await open();await button('Tải file Excel mẫu');await until(()=>evaluate("window.__downloads.length===1&&!document.querySelector('dialog[open][aria-busy=true]')"),'template');assert.equal(await evaluate('window.__downloads[0].filename'),'stationery-products-import-template.xlsx');
    assert.equal(await evaluate("window.__imports[0].auth"),'Bearer test-product-token');assert.equal(await evaluate("window.__requests.filter(r=>r.route==='/api/auth/me').length"),1);await screenshot('choose-file.png');await close();
  });
  await test('Rejects XLS, corrupt XLSX, empty and oversized files before upload; drag/drop accepts a real XLSX',async()=>{
    await open();
    for(const [name,bytes,message] of [['bad.xls',[80,75],'Chọn file Excel'],['bad.xlsx',[1,2,3],'không phải định dạng'],['empty.xlsx',[],'Chọn file Excel'],['large.xlsx',null,'vượt quá']]){
      await evaluate(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${bytes===null?'new Uint8Array(5*1024*1024+1)':`new Uint8Array(${JSON.stringify(bytes)})`}],${JSON.stringify(name)}));document.querySelector('.excel-import-drop').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:dt}));})()`);await until(()=>evaluate(`document.querySelector('dialog[open] [role=alert]')?.textContent.includes(${JSON.stringify(message)})`),'invalid file');
    }
    assert.equal(await evaluate("window.__imports.filter(r=>r.op==='preview').length"),0);
    await choose('products-import-test.xlsx');await evaluate("(()=>{const source=document.querySelector('input[type=file]');const dt=new DataTransfer();dt.items.add(new File([new Uint8Array([80,75,3,4])],'dropped.xlsx'));document.querySelector('.excel-import-drop').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:dt}));})()");await until(()=>evaluate("document.querySelector('.excel-import-file')?.textContent.includes('dropped.xlsx')"),'drop');
    await choose('products-import-test.xlsx');await close();
  });
  await test('Full preview paginates row-specific duplicate errors and prevents confirm; replacing file clears receipt',async()=>{
    await open();await choose('products-import-test.xlsx');await evaluate('window.__previewInvalid=true');await preview();
    assert.equal(await evaluate("[...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent==='Xác nhận Import').disabled"),true);
    await click('[aria-label="Trang preview tiếp theo"]');await click('[aria-label="Trang preview tiếp theo"]');assert.ok((await evaluate("document.querySelector('.excel-import-table').textContent")).includes('Dòng 26'));assert.ok((await evaluate("document.querySelector('.excel-import-table').textContent")).includes('đã tồn tại'));await screenshot('preview-errors.png');
    await evaluate('window.__previewInvalid=false');await choose('products-import-test.xlsx');assert.equal(await evaluate("!!document.querySelector('.excel-import-counts')"),false);await preview();
    assert.equal(await evaluate("window.__imports.findLast(r=>r.op==='preview').contentType"),null,'Multipart must not be sent as JSON');
    await click('[aria-label="Xóa file đã chọn"]');assert.equal(await evaluate("!!document.querySelector('.excel-import-counts')"),false);await close();
  });
  await test('Product confirmation has no optimistic success, blocks duplicates/Escape, refreshes list/KPI and reports AI pending',async()=>{
    await open();await choose('products-import-test.xlsx');await preview();await evaluate("window.__header=document.querySelector('.dashboard-header');window.__sidebar=document.querySelector('.dashboard-sidebar');window.__importDelay=500");
    await button('Xác nhận Import');await until(()=>evaluate("document.querySelectorAll('dialog[open]').length===2"),'confirm');await button('Xác nhận',top);await delay(50);
    assert.equal(await evaluate(`${top}.querySelector('.dashboard-button-primary').disabled`),true);assert.equal(await evaluate("document.body.textContent.includes('Import thành công')"),false);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});assert.equal(await evaluate("document.querySelectorAll('dialog[open]').length"),2);
    await until(()=>evaluate("!!document.querySelector('.excel-import-result')"),'success');assert.ok((await evaluate("document.querySelector('.excel-import-result').textContent")).includes('10 sản phẩm và 15 biến thể'));assert.ok((await evaluate("document.querySelector('.excel-import-result').textContent")).includes('chưa xác nhận'));
    assert.equal(await evaluate("window.__imports.filter(r=>r.op==='confirm'&&r.kind==='products').length"),1);await until(()=>evaluate("document.querySelector('.products-kpi-grid .dashboard-stat-value')?.textContent==='34'"),'refreshed');
    assert.equal(await evaluate("window.__header===document.querySelector('.dashboard-header')&&window.__sidebar===document.querySelector('.dashboard-sidebar')"),true);await screenshot('result-products.png');await button('Hoàn tất');await evaluate('window.__importDelay=0');
  });
  await test('Failed confirm keeps modal open, hides diagnostics and requires validation before retry',async()=>{
    await evaluate('window.__importDone.products=false');await open();await choose('products-import-test.xlsx');await preview();await evaluate('window.__importFailure=409');await button('Xác nhận Import');await button('Xác nhận',top);await until(()=>evaluate("document.querySelectorAll('dialog[open]').length===1&&!!document.querySelector('dialog[open] [role=alert]')"),'conflict');
    assert.equal(await evaluate("[...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent==='Xác nhận Import').disabled"),true);assert.equal(await evaluate("document.body.textContent.includes('private-import-diagnostic')"),false);await evaluate('window.__importFailure=null');await close();
  });
  await test('Voucher import uses correct API, supports backend error/retry, template, busy states and actual KPI refresh',async()=>{
    await evaluate("history.pushState({},'','/dashboard/promotions');window.dispatchEvent(new PopStateEvent('popstate'))");await until(()=>evaluate("document.querySelectorAll('.promotions-table tbody tr').length===2"),'vouchers');await open();await button('Tải file Excel mẫu');await until(()=>evaluate("window.__downloads.some(d=>d.filename==='stationery-promotions-import-template.xlsx')&&!document.querySelector('dialog[open][aria-busy=true]')"),'voucher template');
    await choose('vouchers-import-test.xlsx');await evaluate('window.__importFailure=400');await button('Kiểm tra dữ liệu');await until(()=>evaluate("!!document.querySelector('dialog[open] [role=alert]')"),'400');await evaluate('window.__importFailure=null');await preview();
    await button('Xác nhận Import');await button('Xác nhận',top);await until(()=>evaluate("!!document.querySelector('.excel-import-result')"),'voucher success');await until(()=>evaluate("document.querySelector('.promotions-kpi-grid .dashboard-stat-value')?.textContent==='12'"),'KPI');await button('Hoàn tất');
    assert.equal(await evaluate("window.__requests.filter(r=>r.route==='/api/auth/me').length"),1);
  });
  await test('Network failure after commit never retries confirmation automatically; preview detects duplicate receipt',async()=>{
    await evaluate('window.__importDone.promotions=false');await open();await choose('vouchers-import-test.xlsx');await preview();await evaluate('window.__uncertain=true;window.__before=window.__imports.filter(r=>r.op==="confirm").length');await button('Xác nhận Import');await button('Xác nhận',top);
    await until(()=>evaluate("document.querySelector('dialog[open] [role=alert]')?.textContent.includes('Chưa xác định')"),'uncertain');assert.equal(await evaluate("[...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent==='Xác nhận Import').disabled"),true);await delay(500);assert.equal(await evaluate('window.__imports.filter(r=>r.op==="confirm").length-window.__before'),1);
    await preview();assert.equal(await evaluate("[...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent==='Xác nhận Import').disabled"),true);await close();
  });
  await test('Desktop/tablet/mobile modal fits viewport with keyboard focus and independent horizontal preview scroll',async()=>{
    await open();await choose('vouchers-import-test.xlsx');await preview();
    for(const width of [1440,768,320,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<600});await delay(350);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`overflow ${width}`);assert.equal(await evaluate("(()=>{const r=document.querySelector('dialog[open]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()"),true);}
    await screenshot('mobile-import.png');for(let i=0;i<12;i++){await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});assert.equal(await evaluate("document.querySelector('dialog[open]').contains(document.activeElement)"),true);}
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await until(()=>evaluate("!document.querySelector('dialog[open]')"),'Escape');
  });
  await test('Import 403 invokes shared authorization check and 401 clears expired authentication',async()=>{
    await open();await evaluate('window.__importFailure=403');await button('Tải file Excel mẫu');await until(()=>evaluate("document.querySelector('dialog[open] [role=alert]')?.textContent.includes('không có quyền')"),'403');assert.equal(await evaluate("!!document.querySelector('.dashboard-shell')"),true);await evaluate('window.__importFailure=401');await button('Tải file Excel mẫu');await until(()=>evaluate("location.pathname==='/login'"),'401');assert.equal(await evaluate("localStorage.getItem('accessToken')"),null);
  });
  assert.deepEqual(exceptions,[],'No browser exceptions');assert.deepEqual(await evaluate('window.__unexpected'),[],'All backend calls intercepted');console.log(`${passed} Excel import browser checks passed.`);
} catch (error) {
  console.error(error); process.exitCode = 1;
  if (send) { const { data } = await send('Page.captureScreenshot', { format: 'png' }).catch(() => ({})); if (data) { await fs.mkdir(artifacts, { recursive: true }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(data, 'base64')); } }
} finally {
  if (send) await send('Browser.close').catch(() => {}); socket?.close(); browser?.kill(); if (vite) await vite.close();
  if (profile && path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('stationery-import-test-')) { await delay(300); await fs.rm(profile, { recursive: true, force: true, maxRetries: 4 }).catch(() => {}); }
}
