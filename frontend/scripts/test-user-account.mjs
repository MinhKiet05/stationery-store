import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

function installApi() {
  localStorage.setItem('accessToken','account-test'); window.__meReads=0; window.__requests=[];
  const original=window.fetch.bind(window);
  window.fetch=async(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(url.pathname==='/api/auth/me') {window.__meReads++; return Response.json({userID:1,username:'admin',fullName:'Minh Kiet',email:'test@example.test',role:'ADMIN',phoneNumber:null});}
    if(url.pathname==='/api/cart')return Response.json({items:[],subtotal:0});
    if(url.pathname.startsWith('/api/'))throw new Error('Unexpected API: '+url.pathname);
    return original(input,options);
  };
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let vite, browser, profile, socket, send, evaluate;
const pending = new Map(), exceptions = [];
const artifacts = fileURLToPath(new URL('../../.cache/user-account/', import.meta.url));
let passed = 0;
async function until(check, label) { for (let i = 0; i < 150; i++) { if (await check()) return; await delay(80); } throw new Error(`Timed out: ${label}`); }
async function test(label, run) { await run(); passed++; console.log(`PASS ${label}`); }

try {
  vite = await createServer({ plugins: [{ name: 'account-probe', configureServer(server) {
    server.middlewares.use((req,res,next)=>{
      if (!req.url?.startsWith('/account-probe')) return next();
      const html='<html><body><div id="root"></div><script type="module" src="/tests/probes/userAccountProbe.tsx"></script></body></html>';
      server.transformIndexHtml(req.url,html).then(page=>{res.setHeader('Content-Type','text/html');res.end(page);}).catch(next);
    });
  } }], server: { host: '127.0.0.1', port: 0, open: false } }); await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const executable = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(value => value && existsSync(value));
  assert.ok(executable, 'Set CHROME_PATH to an installed Chromium browser');
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'stationery-account-test-'));
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

  const store='header:not(.dashboard-header)', admin='.dashboard-header';
  const trigger=area=>`${area} [data-user-account-trigger]`;
  const popup=area=>`${area} [data-user-account-menu]`;
  await navigate('/account-probe');
  await until(()=>evaluate('document.querySelectorAll("[data-user-account-trigger]").length===2'),'both account buttons');
  const initialReads=await evaluate('window.__meReads');
  await test('Both headers use identical initials, role, dropdown actions and red logout without extra identity calls',async()=>{
    await evaluate('window.accountUpdateIdentity({fullName:"Minh Kiệt"})');
    await click(trigger(store));
    assert.equal(await evaluate(`document.querySelector('${trigger(store)}').textContent.startsWith('MK')`),true);
    assert.deepEqual(await evaluate(`Array.from(document.querySelector('${popup(store)} nav').children).map(n=>n.textContent.trim())`),['Tài khoản','Quản trị','Đăng xuất']);
    const colors=await evaluate(`(()=>{const n=document.querySelector('${popup(store)} button');return [getComputedStyle(n).color,getComputedStyle(n.querySelector('svg')).color]})()`);
    await click(trigger(admin));
    assert.equal(await evaluate(`document.querySelector('${trigger(admin)}').textContent.startsWith('MK')`),true);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('${popup(admin)} button')).color`),colors[0]);
    assert.equal(colors[0],colors[1]); assert.equal(colors[0],'rgb(196, 66, 87)');
    assert.equal(await evaluate(`document.querySelector('${popup(store)}')`),null);
    assert.equal(await evaluate('window.__meReads'),initialReads);
  });
  await test('ADMIN navigation uses SPA links; Escape/outside/route changes close both dropdowns',async()=>{
    await evaluate('window.__spaMarker=1');
    await click(`${popup(admin)} a[href="/dashboard"]`);
    await until(()=>evaluate('location.pathname==="/dashboard"'),'dashboard link');
    assert.equal(await evaluate('window.__spaMarker'),1);
    assert.equal(await evaluate('document.querySelectorAll("[data-user-account-menu]").length'),0);
    await click(trigger(store)); await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
    assert.equal(await evaluate(`document.querySelector('${trigger(store)}').getAttribute('aria-expanded')`),'false');
    assert.equal(await evaluate(`document.activeElement===document.querySelector('${trigger(store)}')`),true);
    await click(trigger(admin)); await evaluate('document.body.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true}))');
    assert.equal(await evaluate('document.querySelectorAll("[data-user-account-menu]").length'),0);
    await click(trigger(store)); await evaluate('history.pushState({},"","/other");window.dispatchEvent(new PopStateEvent("popstate"))');
    await until(()=>evaluate('document.querySelectorAll("[data-user-account-menu]").length===0'),'route closes popup');
  });
  await test('Updated profile is shared without fetching or changing authorization; CUSTOMER has no admin link',async()=>{
    await evaluate('window.accountUpdateProfile({userID:1,username:"admin",fullName:"Trần Huỳnh Minh Kiệt",email:"updated@example.test",role:"CUSTOMER"})');
    await until(()=>evaluate('Array.from(document.querySelectorAll("[data-user-account-trigger]")).every(n=>n.textContent.startsWith("TK"))'),'updated initials');
    await click(trigger(admin));
    assert.equal(await evaluate(`document.querySelector('${popup(admin)}').textContent.includes('updated@example.test')`),true);
    assert.equal(await evaluate(`!!document.querySelector('${popup(admin)} a[href="/dashboard"]')`),true,'profile does not supply role');
    await evaluate('window.accountUpdateIdentity({role:"CUSTOMER"})');
    await click(trigger(store));
    assert.equal(await evaluate(`document.querySelector('${trigger(store)}').textContent.includes('Khách hàng')`),true);
    assert.equal(await evaluate(`!!document.querySelector('${popup(store)} a[href="/dashboard"]')`),false);
    assert.equal(await evaluate('window.__meReads'),initialReads);
  });
  await test('Shared mobile popup stays inside viewport; logout clears private session data using existing events',async()=>{
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
    await click(trigger(admin));
    const bounds=await evaluate(`(()=>{const r=document.querySelector('${popup(admin)}').getBoundingClientRect();return [r.left,r.right,innerWidth]})()`);
    assert.ok(bounds[0]>=0&&bounds[1]<=bounds[2]);
    await click(`${popup(admin)} button`);
    await until(()=>evaluate('location.pathname==="/login"'),'dashboard logout');
    assert.equal(await evaluate('localStorage.getItem("accessToken")'),null);
    assert.equal(await evaluate('window.accountPrivateCount()'),0);
    assert.equal(await evaluate('document.querySelectorAll("[data-user-account-trigger]").length'),0);
  });
  const utilities = await vite.ssrLoadModule('/src/utils/userDisplay.ts');
  for(const [name,expected] of [['Minh Kiệt','MK'],[' Trần  Huỳnh Minh Kiệt ','TK'],['Nguyễn Văn An','NA'],['Lê Thị Hoàng Yến','LY'],['Kiệt','K'],['','U'],['---','U']]) assert.equal(utilities.accountInitials(name),expected);
  assert.deepEqual(exceptions,[]);
  console.log(`${passed} user account browser checks and initials cases passed.`);

} catch (error) {
  console.error(error); process.exitCode = 1;
  if (send) { const { data } = await send('Page.captureScreenshot', { format: 'png' }).catch(() => ({})); if (data) { await fs.mkdir(artifacts, { recursive: true }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(data, 'base64')); } }
} finally {
  if (send) await send('Browser.close').catch(() => {}); socket?.close(); browser?.kill(); if (vite) await vite.close();
  if (profile && path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('stationery-account-test-')) { await delay(300); await fs.rm(profile, { recursive: true, force: true, maxRetries: 4 }).catch(() => {}); }
}
