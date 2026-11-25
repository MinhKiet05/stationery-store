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
  const nativeFetch = window.fetch.bind(window);
  localStorage.setItem('accessToken', 'checkout-fixture');
  window.__orders = []; window.__mode = 'success'; window.__cartError = false;
  window.__payments = 0;
  const quote = request => {
    const discountAmount = request.couponCode ? 20000 : 0;
    const shippingFee = request.shippingMethod === 'EXPRESS' ? 40000 : window.__cart.subtotal - discountAmount >= 200000 ? 0 : 25000;
    return {subTotal:window.__cart.subtotal,discountAmount,shippingFee,totalAmount:window.__cart.subtotal - discountAmount + shippingFee,shippingMethod:request.shippingMethod,couponCode:request.couponCode};
  };
  window.__cart = {items: [
    {cartItemID: 1, productID: 1, variantID: 1, productTitle: 'Hộp 12 Bút Gel Deli 0.5mm Nét Mịn', variantTitle: 'Mực xanh', quantity: 2, lineTotal: 96000, stockQuantity: 12, available: true},
    {cartItemID: 2, productID: 2, variantID: 2, productTitle: 'Sổ Klong A5 Caro 120 trang chống lem', variantTitle: 'Mint Pastel', quantity: 1, lineTotal: 36000, stockQuantity: 10, available: true},
    {cartItemID: 3, productID: 3, variantID: 3, productTitle: 'Bộ 6 Bút Dạ Quang Highpoint Deli Pastel', variantTitle: 'Set 6 màu Pastel', quantity: 1, lineTotal: 38000, stockQuantity: 8, available: true}
  ], subtotal: 170000};
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href), route = url.pathname, method = options.method || 'GET';
    if (!route.startsWith('/api/')) return nativeFetch(input, options);
    if (route === '/api/auth/me') return Response.json({userID: 1, username: 'minh', fullName: 'Trần Huỳnh Minh Kiệt', phoneNumber: '0987654321', email: 'minhkiet@example.test', role: 'CUSTOMER'});
    if (route === '/api/cart') return window.__cartError ? Response.json({detail:'Cart unavailable'}, {status:503}) : Response.json(window.__cart);
    if (route === '/api/checkout/options') return Response.json({shipping:[{code:'STANDARD',label:'Giao hàng tiêu chuẩn',description:'3–5 ngày làm việc',fee:25000},{code:'EXPRESS',label:'Giao hàng nhanh',description:'1–2 ngày làm việc',fee:40000}],payments:['COD','MOMO','VNPAY','BANK_TRANSFER','CARD'].map(code=>({code,label:code,description:code==='COD'?'Trả tiền khi nhận hàng':'Xác nhận thanh toán',enabled:true,demo:code!=='COD'})),freeShippingThreshold:200000});
    if (route === '/api/checkout/preview') return Response.json(quote(JSON.parse(options.body)));
    if (/^\/api\/orders\/\d+\/payments\/demo$/.test(route)) {
      window.__payments++; window.__savedOrder.isPaid=true; window.__savedOrder.paymentReference='TXN-test-payment';
      return Response.json(window.__savedOrder);
    }
    if (route.startsWith('/api/cart/items/')) {
      const id = Number(route.split('/').at(-1));
      if (method === 'DELETE') window.__cart.items = window.__cart.items.filter(item => item.cartItemID !== id);
      else { const item = window.__cart.items.find(item => item.cartItemID === id); const unit = item.lineTotal / item.quantity; item.quantity = JSON.parse(options.body).quantity; item.lineTotal = unit * item.quantity; }
      window.__cart.subtotal = window.__cart.items.reduce((sum,item) => sum + item.lineTotal, 0);
      return Response.json(window.__cart);
    }
    if (route === '/api/orders' && method === 'POST') {
      window.__orders.push(JSON.parse(options.body));
      if (window.__mode === 'uncertain') return Response.json({detail: 'Unknown'}, {status:500});
      const request=JSON.parse(options.body);
      window.__savedOrder={...request,...quote(request),orderID:2026,isPaid:false,paymentMode:request.paymentMethod==='COD'?'LIVE':'DEMO'};
      window.__cart = {items: [], subtotal: 0}; return Response.json(window.__savedOrder, {status:201});
    }
    if (/^\/api\/products\/\d+$/.test(route)) {
      const id = Number(route.split('/').at(-1));
      return Response.json({productID:id, title:'Product', compareAtPrice: id === 1 ? 60000 : 45000, images:[`/src/assets/${['butgel','taphocsinh','butlongmau'][id-1] || 'butgel'}.webp`]});
    }
    if (route === '/api/products') return Response.json({content: [
      {productID:4,handle:'but-gel',title:'Bộ bút gel cho góc học tập',price:15000,compareAtPrice:20000,available:true,isActive:true,vendorName:'Deli',images:['/src/assets/butgel.webp']},
      {productID:5,handle:'so-hoc-sinh',title:'Sổ tay ghi lại những ý tưởng',price:18000,compareAtPrice:22000,available:true,isActive:true,vendorName:'Klong',images:['/src/assets/taphocsinh.webp']},
      {productID:6,handle:'but-mau',title:'Bút màu pastel sáng tạo',price:12000,compareAtPrice:15000,available:true,isActive:true,vendorName:'Deli',images:['/src/assets/butlongmau.webp']},
      {productID:7,handle:'but-cao-cap',title:'Bút viết dành cho mỗi ngày',price:22000,compareAtPrice:28000,available:true,isActive:true,vendorName:'Campus',images:['/src/assets/butcaocap.webp']}
    ],totalPages:1,totalElements:4});
    if (route.includes('vendors') || route.includes('product-types')) return Response.json([]);
    if (route.includes('recommendations')) return Response.json({products:[], source:'FALLBACK'});
    return Response.json({content:[],totalPages:0,totalElements:0});
  };
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let vite, browser, profile, socket, send, evaluate;
const pending = new Map(), exceptions = [];
const artifacts = fileURLToPath(new URL('../../.cache/cart-checkout/', import.meta.url));
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
  browser = spawn(executable, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
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
  const click = async selector => { assert.equal(await evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled)return false;n.focus();n.click();return true;})()`), true, selector); };
  const button = async (text, selector = 'document') => { await evaluate(`(() => {const n=[...${selector}.querySelectorAll('button')].find(n=>n.textContent.trim()===${JSON.stringify(text)});if(!n||n.disabled)throw new Error('Button unavailable');n.focus();n.click()})()`); };
  const input = async (selector, value) => { await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor((n.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement).prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));})()`); };
  const screenshot = async name => { await evaluate("document.querySelectorAll('.store-notice-close').forEach(n=>n.click())"); await delay(350); await fs.mkdir(artifacts, { recursive: true }); const { data } = await send('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, name), Buffer.from(data, 'base64')); };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });

  await send('Page.navigate', {url: base + '/cart'});
  await until(() => evaluate("!!document.querySelector('[aria-label=\"Sản phẩm trong giỏ\"]')"), 'cart page ready');
  await test('Cart selection and quantity controls work before checkout', async () => {
    assert.equal(await evaluate("!!document.querySelector('#checkout-form')"), false);
    await click('[aria-label="Tăng số lượng Hộp 12 Bút Gel Deli 0.5mm Nét Mịn"]');
    await until(() => evaluate('window.__cart.items[0].quantity === 3'), 'cart quantity saved');
    await until(() => evaluate("!document.querySelector('[aria-label=\"Giảm số lượng Hộp 12 Bút Gel Deli 0.5mm Nét Mịn\"]').disabled"), 'cart write completed');
    await click('[aria-label="Giảm số lượng Hộp 12 Bút Gel Deli 0.5mm Nét Mịn"]');
    await until(() => evaluate('window.__cart.items[0].quantity === 2'), 'cart quantity restored');
    await until(() => evaluate("!document.querySelector('[aria-label=\"Chọn Hộp 12 Bút Gel Deli 0.5mm Nét Mịn\"]').disabled"), 'cart controls ready');
    await click('[aria-label="Chọn Hộp 12 Bút Gel Deli 0.5mm Nét Mịn"]');
    assert.equal(await evaluate("[...document.querySelectorAll('main button')].find(n => n.textContent.includes('Tiến hành thanh toán')).disabled"), true);
    await click('[aria-label="Chọn Hộp 12 Bút Gel Deli 0.5mm Nét Mịn"]');
  });
  await screenshot('cart-desktop.png');
  await test('Cart suggestions use catalog data', async () => {
    await until(() => evaluate("document.querySelectorAll('[aria-labelledby=cart-recommendations] a').length === 4"), 'catalog recommendations');
  });
  const layout = await send('Page.getLayoutMetrics');
  const full = await send('Page.captureScreenshot', {format:'png', captureBeyondViewport:true, clip:{x:0,y:0,width:1440,height:layout.cssContentSize.height,scale:1}});
  await fs.writeFile(path.join(artifacts, 'cart-desktop-full.png'), Buffer.from(full.data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', {width:390, height:844, deviceScaleFactor:1, mobile:true});
  await test('Cart mobile has no horizontal overflow', async () => {
    await delay(200); assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  });
  await screenshot('cart-mobile.png');
  await send('Emulation.setDeviceMetricsOverride', {width:1440, height:1100, deviceScaleFactor:1, mobile:false});
  await input('#cart-coupon', 'back2school'); await button('Áp dụng');
  await until(() => evaluate("!![...document.querySelectorAll('main button')].find(n => n.textContent.includes('Tiến hành thanh toán') && !n.disabled)"), 'cart quote ready');
  await button('Tiến hành thanh toán');
  await until(() => evaluate("!!document.querySelector('#checkout-form')"), 'checkout ready');
  await test('Cart coupon passes to the separate checkout page', async () => {
    assert.equal(await evaluate('location.pathname'), '/checkout');
    assert.equal(await evaluate("document.querySelector('#coupon').value"), 'BACK2SCHOOL');
  });
  const fillAddress = async () => {
    await input('[autocomplete="address-level1"]', 'TP. Hồ Chí Minh');
    await input('[autocomplete="address-level2"]', 'Quận 1');
    await input('[autocomplete="address-level3"]', 'Phường Bến Nghé');
    await input('[autocomplete="street-address"]', '123 Nguyễn Huệ');
  };
  await fillAddress();
  await test('Shared layout, server totals and selectable demo methods', async () => {
    assert.equal(await evaluate("document.querySelectorAll('header').length"), 1);
    assert.equal(await evaluate("document.querySelectorAll('footer').length"), 1);
    assert.equal(await evaluate("document.querySelectorAll('input[name=payment]:disabled').length"), 0);
    assert.equal(await evaluate("document.querySelector('#checkout-form').textContent.includes('170.000')"), true);
  });
  await screenshot('checkout-desktop.png');
  await test('Quantity mutation and item removal update cart and totals', async () => {
    await button('Sửa giỏ hàng');
    await click('[aria-label="Tăng số lượng Hộp 12 Bút Gel Deli 0.5mm Nét Mịn"]');
    await until(() => evaluate('window.__cart.items[0].quantity === 3'), 'quantity saved');
    await until(() => evaluate("!document.querySelector('[aria-label=\"Xóa Sổ Klong A5 Caro 120 trang chống lem\"]').disabled"), 'mutation complete');
    await click('[aria-label="Xóa Sổ Klong A5 Caro 120 trang chống lem"]');
    await until(() => evaluate('window.__cart.items.length === 2'), 'item removed');
    await until(() => evaluate("document.querySelector('#checkout-form').textContent.includes('182.000')"), 'totals updated');
    await button('Hoàn tất');
  });
  await send('Emulation.setDeviceMetricsOverride', {width:390, height:844, deviceScaleFactor:1, mobile:true});
  await test('Mobile checkout has no horizontal overflow', async () => {
    await delay(250);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true);
  });
  await screenshot('checkout-mobile.png');
  await test('COD submits recipient address and coupon and displays order result', async () => {
    await input('#coupon', 'back2school'); await button('Sử dụng');
    await evaluate("document.querySelector('#checkout-form').requestSubmit()");
    await until(() => evaluate("document.querySelector('main').textContent.includes('Đặt hàng thành công!')"), 'order success');
    const orders = await evaluate('window.__orders');
    assert.equal(orders.length, 1); assert.equal(orders[0].paymentMethod, 'COD');
    assert.equal(orders[0].couponCode, 'BACK2SCHOOL');
    assert.ok(orders[0].shippingAddress.includes('Trần Huỳnh Minh Kiệt'));
    assert.ok(orders[0].shippingAddress.includes('123 Nguyễn Huệ'));
  });
  await test('Logout hides private checkout data', async () => {
    await send('Page.reload');
    await until(() => evaluate("!!document.querySelector('#checkout-form')"), 'reset checkout');
    await evaluate("window.__cart = {items:[],subtotal:0};window.dispatchEvent(new Event('cart-changed'))");
    // Reloading reinstalls the fixtures; refresh through the existing cart query on focus.
    await send('Emulation.setFocusEmulationEnabled', {enabled:false});
    await evaluate("window.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'))");
    // Logout state is independent of server cache freshness.
    await evaluate("localStorage.removeItem('accessToken');window.dispatchEvent(new Event('auth-changed'))");
    await until(() => evaluate("document.querySelector('main').textContent.includes('Đăng nhập để tiếp tục')"), 'guest state');
  });
  await test('Unknown order result blocks a duplicate submission', async () => {
    await send('Page.reload');
    await until(() => evaluate("!!document.querySelector('#checkout-form')"), 'checkout reloaded');
    await fillAddress(); await evaluate("window.__mode='uncertain';document.querySelector('#checkout-form').requestSubmit()");
    await until(() => evaluate("!!document.querySelector('main [role=alert]')"), 'unknown result visible');
    await evaluate("document.querySelector('#checkout-form').requestSubmit()");
    assert.equal(await evaluate('window.__orders.length'), 1);
    assert.equal(await evaluate("document.querySelector('#checkout-form button[type=submit]').disabled"), true);
  });
  await test('Express shipping changes the quote and demo payment shows spinner then a green success check', async () => {
    await send('Page.reload');
    await until(() => evaluate("!!document.querySelector('#checkout-form input[value=EXPRESS]')"), 'shipping methods ready');
    await fillAddress();
    await click('#checkout-form input[value=EXPRESS]');
    await click('#checkout-form input[value=MOMO]');
    await until(() => evaluate("!document.querySelector('#checkout-form button[type=submit]').disabled"), 'express quote complete');
    await evaluate("document.querySelector('#checkout-form').requestSubmit()");
    await until(() => evaluate("!!document.querySelector('dialog[open] .animate-spin')"), 'payment spinner');
    await screenshot('payment-demo-processing.png');
    await until(() => evaluate("document.querySelector('dialog[open]')?.textContent.includes('Thanh toán thành công!')"), 'green payment success');
    assert.equal(await evaluate("!!document.querySelector('dialog[open] [aria-label=\"Thành công\"]')"), true);
    assert.equal(await evaluate('window.__orders.length'), 1);
    assert.equal(await evaluate('window.__orders[0].shippingMethod'), 'EXPRESS');
    assert.equal(await evaluate('window.__savedOrder.isPaid'), true);
    assert.equal(await evaluate('window.__savedOrder.shippingFee'), 40000);
    assert.equal(await evaluate('window.__payments'), 1);
    assert.equal(await evaluate("/demo|mô phỏng/i.test(document.querySelector('dialog[open]').textContent)"), false);
    await screenshot('payment-demo-success.png');
    await button('Hoàn tất');
    assert.equal(await evaluate("!!document.querySelector('dialog[open]')"), false);
  });
  assert.deepEqual(exceptions, []);
  console.log(passed + ' cart/checkout browser checks passed.');

} catch (error) {
  console.error(error); process.exitCode = 1;
  if (send) { const { data } = await send('Page.captureScreenshot', { format: 'png' }).catch(() => ({})); if (data) { await fs.mkdir(artifacts, { recursive: true }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(data, 'base64')); } }
} finally {
  if (send) await send('Browser.close').catch(() => {}); socket?.close(); browser?.kill(); if (vite) await vite.close();
  if (profile && path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('stationery-admin-route-test-')) { await delay(300); await fs.rm(profile, { recursive: true, force: true, maxRetries: 4 }).catch(() => {}); }
}
