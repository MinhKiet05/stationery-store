import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

function installApi() {
  const nativeFetch=window.fetch.bind(window);
  window.__requests=[]; window.__unexpected=[]; window.__status=200; window.__delay=150; window.__clock=0;
  const now=Date.now.bind(Date); Date.now=()=>now()+window.__clock;
  window.fetch=async(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(!url.pathname.startsWith('/api/')) return nativeFetch(input,options);
    const route=url.pathname;
    if(route==='/api/auth/forgot-password'||route==='/api/auth/reset-password'){
      window.__requests.push({route,body:JSON.parse(options.body),headers:options.headers});
      await new Promise(resolve=>setTimeout(resolve,window.__delay));
      if(window.__status!==200)return Response.json({detail:'private mail diagnostic'},{status:window.__status,headers:{'Retry-After':'120'}});
      return Response.json({message:'ok'});
    }
    if(route==='/api/auth/me')return Response.json({userID:1,username:'test',role:'CUSTOMER',fullName:'Test',email:'test@example.test'});
    if(route==='/api/cart')return Response.json({items:[],subtotal:0});
    window.__unexpected.push(route); return Response.json({}, {status:404});
  };
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let vite, browser, profile, socket, send, evaluate;
const pending = new Map(), exceptions = [];
const artifacts = fileURLToPath(new URL('../../.cache/password-recovery/', import.meta.url));
let passed = 0;
async function until(check, label) { for (let i = 0; i < 150; i++) { if (await check()) return; await delay(80); } throw new Error(`Timed out: ${label}`); }
async function test(label, run) { await run(); passed++; console.log(`PASS ${label}`); }

try {
  vite = await createServer({server:{host:'127.0.0.1',port:0,open:false}}); await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const executable = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(value => value && existsSync(value));
  assert.ok(executable, 'Set CHROME_PATH to an installed Chromium browser');
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'stationery-password-recovery-test-'));
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });


  const ready=()=>until(()=>evaluate('!!document.querySelector("form")'),'form');
  const field=async(selector,value)=>evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const submit=()=>click('form button[type="submit"]');
  const count=()=>evaluate('window.__requests.length');
  await test('Forgot request stays on confirmation; no reset/token fields, cooldown and duplicate prevention',async()=>{
    await navigate('/forgot-password'); await ready();
    assert.equal(await evaluate('document.querySelectorAll("input").length'),1);
    await field('input[type="email"]','reset@example.test');
    await submit(); await evaluate('document.querySelector("form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))');
    assert.equal(await evaluate('document.querySelector("form button[type=submit]").disabled'),true);
    await until(()=>evaluate('!!document.querySelector("[role=status] strong")'),'email confirmation');
    assert.equal(await count(),1); assert.equal(await evaluate('location.pathname'),'/forgot-password');
    assert.equal(await evaluate('!!document.querySelector("input[type=password]")'),false);
    assert.equal(await evaluate('document.querySelector("form button[type=submit]").disabled'),true);
    await evaluate('window.__clock+=61000'); await delay(1100);
    await submit(); await until(async()=>await count()===2,'resend');
    await delay(250);
  });
  await test('Forgot failure stays on email form, safe message and no automatic retry',async()=>{
    await navigate('/forgot-password'); await ready(); await evaluate('window.__status=503');
    await field('input[type="email"]','reset@example.test'); await submit();
    await until(()=>evaluate('!!document.querySelector("main [role=alert]")'),'safe error'); await delay(400);
    assert.equal(await count(),1); assert.equal(await evaluate('!!document.querySelector("input[type=email]")'),true);
    assert.equal(await evaluate('document.body.textContent.includes("private mail diagnostic")'),false);
  });
  const fillPasswords=async()=>{await field('input[autocomplete="new-password"]','new-password');await field('label:last-of-type input','new-password');};
  await test('Reset reads/scrubs token, submits once from memory and returns to login without storing it',async()=>{
    await navigate('/reset-password?token=fixture-token'); await ready();
    await until(()=>evaluate('!location.search.includes("token")'),'scrubbed URL');
    assert.equal(await evaluate('document.querySelectorAll("input").length'),2);
    assert.equal(await evaluate('document.querySelectorAll("input[type=password]").length'),2);
    await fillPasswords(); await submit();
    await until(()=>evaluate('location.pathname==="/login"'),'login redirect');
    assert.equal(await evaluate('window.__requests[0].body.token'),'fixture-token');
    assert.equal(await count(),1);
    assert.equal(await evaluate('JSON.stringify({...localStorage,...sessionStorage}).includes("fixture-token")'),false);
    assert.equal(await evaluate('!!localStorage.getItem("accessToken")'),false);
  });
  await test('Legacy link uses reset route and keeps token only in memory',async()=>{
    await navigate('/forgot-password?token=legacy-fixture'); await ready();
    await until(()=>evaluate('location.pathname==="/reset-password" && !location.search'),'legacy scrub');
    await fillPasswords(); await submit(); await until(()=>evaluate('location.pathname==="/login"'),'legacy success');
    assert.equal(await evaluate('window.__requests[0].body.token'),'legacy-fixture');
  });
  await test('Expired/used token is rejected with request-new-link action; reload needs original email',async()=>{
    await navigate('/reset-password?token=expired-fixture'); await ready(); await evaluate('window.__status=400');
    await fillPasswords(); await submit();
    await until(()=>evaluate(`!!document.querySelector('main a[href="/forgot-password"]')`),'new link action');
    assert.equal(await evaluate('!!document.querySelector("form")'),false); assert.equal(await count(),1);
    await send('Page.reload'); await until(()=>evaluate('!!document.querySelector("main [role=alert]")'),'missing token');
    assert.equal(await evaluate('!!document.querySelector("form")'),false);
  });
  assert.deepEqual(exceptions,[]);
  assert.deepEqual(await evaluate('window.__unexpected'),[]);
  console.log(`${passed} targeted password recovery browser checks passed.`);

} catch (error) {
  console.error(error); process.exitCode = 1;
  if (send) { const { data } = await send('Page.captureScreenshot', { format: 'png' }).catch(() => ({})); if (data) { await fs.mkdir(artifacts, { recursive: true }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(data, 'base64')); } }
} finally {
  if (send) await send('Browser.close').catch(() => {}); socket?.close(); browser?.kill(); if (vite) await vite.close();
  if (profile && path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('stationery-password-recovery-test-')) { await delay(300); await fs.rm(profile, { recursive: true, force: true, maxRetries: 4 }).catch(() => {}); }
}
