import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
    if(route==='/api/cart'||route==='/api/cart/items')return Response.json({items:[],subtotal:0});if(route==='/api/product-types')return Response.json([]);
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
  vite = await createServer({ plugins: [{ name: 'baseline-resource', enforce: 'pre', transform(code,id) { if(process.env.QUERY_BASELINE==='1' && id.replaceAll('\\','/').endsWith('/pages/dashboard/useDashboardResource.js')) return execFileSync('git',['show',`${process.env.QUERY_BASELINE_REF || 'ff12c1e0a1bbf571bb2b9b8d1c0582b3d69de1ce'}:frontend/src/pages/dashboard/useDashboardResource.js`],{encoding:'utf8'}) + `\nimport {queryKeys,resourceTime} from '../../services/queryCache';\nexport const dashboardQueryOptions=(path,scope)=>({queryKey:queryKeys.admin(path,scope),queryFn:({signal})=>dashboardRequest(path,signal),staleTime:resourceTime(path)});`; } }, { name: 'returns-test-assets', configureServer(server) { server.middlewares.use(testAsset); } }], server: { host: '127.0.0.1', port: 0, open: false } }); await vite.listen();
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
  const rounds=[];
  for (let round=0;round<2;round++) {
    const before=await evaluate("window.__requests.filter(r=>r.route.startsWith('/api/admin/')).length");
    for (const suffix of ['', '/reviews','/promotions','/returns','/orders','/products','/users']) {
      await click(`.dashboard-sidebar a[href="/dashboard${suffix}"]`);
      await until(()=>evaluate("!!document.querySelector('.dashboard-shell') && !document.querySelector('#dashboard-content > [role=status]') && !document.querySelector('.dashboard-loading')"),'data ready');
      await delay(80);
    }
    rounds.push(await evaluate("window.__requests.filter(r=>r.route.startsWith('/api/admin/')).length")-before);
  }
  console.log(`REQUEST_MEASURE baseline=${process.env.QUERY_BASELINE==='1'} rounds=${JSON.stringify(rounds)}`);
  if(process.env.QUERY_BASELINE!=='1') assert.equal(rounds[1],0,'No fresh business re-fetch when revisiting seven dashboard routes');
  assert.equal(await identityCalls(),1);
  assert.deepEqual(exceptions,[]);
} catch (error) {
  console.error(error); process.exitCode = 1;
  if (send) { const { data } = await send('Page.captureScreenshot', { format: 'png' }).catch(() => ({})); if (data) { await fs.mkdir(artifacts, { recursive: true }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(data, 'base64')); } }
} finally {
  if (send) await send('Browser.close').catch(() => {}); socket?.close(); browser?.kill(); if (vite) await vite.close();
  if (profile && path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('stationery-admin-route-test-')) { await delay(300); await fs.rm(profile, { recursive: true, force: true, maxRetries: 4 }).catch(() => {}); }
}
