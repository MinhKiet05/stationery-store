import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'vite';

// Exercise the real order page and modal; intercept every API request before React loads.
function installApi() {
  const realFetch = window.fetch.bind(window);
  window.__orderReviewDocument = Math.random();
  localStorage.setItem('accessToken', 'order-review-test');
  const user = { userID: 9, username: 'buyer', fullName: 'Khách hàng', email: 'buyer@example.test', role: 'CUSTOMER' };
  const item = (productID, orderDetailID, variantTitle) => ({ productID, orderDetailID, variantID: orderDetailID,
    productTitle: productID === 11 ? 'Bút gel Deli' : 'Sổ tay A5', variantTitle, unitPrice: orderDetailID === 112 ? 75000 : 65000,
    productImage: '/src/assets/butgel.webp', productHandle: 'san-pham-' + productID, quantity: 1, subTotal: 65000 });
  const order = (orderID, status, items) => ({ orderID, userID: 9, status, items, orderDate: '2026-11-20T12:00:00',
    deliveredAt: status === 'DELIVERED' ? '2026-11-23T12:00:00' : null, totalAmount: 195000, subTotal: 195000,
    paymentMethod: 'COD', isPaid: true, shippingAddress: 'Địa chỉ kiểm thử', contactPhone: '0900000000', discountAmount: 0 });
  window.__orders = [order(71, 'DELIVERED', [item(11, 111, 'Mực đen'), item(11, 112, 'Mực xanh'), item(12, 121, 'Bìa xanh')]),
    order(72, 'SHIPPED', [item(14, 141, 'Chưa nhận hàng')])];
  window.__reviews = [{ reviewID: 80, productID: 12, userID: 9, username: 'buyer', rating: 5, comment: 'Sổ dùng tốt.', images: [] },
    { reviewID: 81, productID: 11, userID: 18, username: 'another-buyer', rating: 4, comment: 'Đánh giá của người khác.', images: [] }];
  window.__requests = []; window.__posts = []; window.__updates = []; window.__unexpected = [];
  window.__failure = 0; window.__orderMode = ''; window.__delay = 0;
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (!url.pathname.startsWith('/api/')) return realFetch(input, options);
    const route = url.pathname, method = options.method || 'GET';
    window.__requests.push({ route, method });
    if (route === '/api/auth/me' || route === '/api/users/me') return Response.json(user);
    if (route === '/api/cart') return Response.json({ items: [], subtotal: 0 });
    if (route === '/api/product-types') return Response.json([]);
    if (route === '/api/returns/my-requests') return Response.json([]);
    if (route === '/api/orders/my-orders') return Response.json(url.search ? { content: window.__orders, totalElements: 2, totalPages: 1, statusCounts: { DELIVERED: 1, SHIPPED: 1 } } : window.__orders);
    if (/^\/api\/products\/\d+$/.test(route)) return Response.json({ productID: Number(route.split('/').at(-1)), images: [], title: 'Sản phẩm kiểm thử' });
    if (route === '/api/orders/71') {
      if (window.__orderMode === 'forbidden') return Response.json({}, { status: 403 });
      return Response.json({ ...window.__orders[0], ...(window.__orderMode === 'foreign' ? { userID: 99 }
        : window.__orderMode === 'undelivered' ? { status: 'SHIPPED' } : {}) });
    }
    const update = route.match(/^\/api\/reviews\/(\d+)$/);
    if (update && method === 'PUT') {
      const multipart = options.body instanceof FormData;
      const body = multipart ? JSON.parse(await options.body.get('review').text()) : JSON.parse(options.body);
      const removed = multipart && options.body.has('removeImagePositions') ? JSON.parse(await options.body.get('removeImagePositions').text()) : [];
      const files = multipart ? options.body.getAll('images') : [];
      window.__updates.push({ reviewID: Number(update[1]), body, removed, images: files.map(file => file.name), multipart, auth: new Headers(options.headers).get('Authorization') });
      await new Promise(resolve => setTimeout(resolve, window.__delay)); options.signal?.throwIfAborted();
      if (window.__failure) return Response.json({}, { status: window.__failure });
      const saved = window.__reviews.find(review => review.reviewID === Number(update[1]));
      Object.assign(saved, body, { images: [...(saved.images || []).filter(image => !removed.includes(image.imagePosition)),
        ...files.map(() => ({ imageUrl: '/src/assets/butgel.webp' }))].map((image, imagePosition) => ({ ...image, imagePosition })) });
      return Response.json(saved);
    }
    const match = route.match(/^\/api\/products\/(\d+)\/reviews$/);
    if (match && method === 'GET') return Response.json(window.__reviews.filter(review => review.productID === Number(match[1])));
    if (match && method === 'POST') {
      const multipart = options.body instanceof FormData;
      const body = multipart ? JSON.parse(await options.body.get('review').text()) : JSON.parse(options.body);
      const images = multipart ? options.body.getAll('images').map(file => file.name) : [];
      window.__posts.push({ productID: Number(match[1]), body, images, multipart, auth: new Headers(options.headers).get('Authorization') });
      await new Promise(resolve => setTimeout(resolve, window.__delay));
      options.signal?.throwIfAborted();
      if (window.__failure === 409) window.__reviews.push({ reviewID: 90, productID: Number(match[1]), userID: 9, username: 'buyer', ...body, images: [] });
      if (window.__failure) return Response.json({ message: 'private database diagnostic' }, { status: window.__failure });
      const saved = { reviewID: 90, productID: Number(match[1]), userID: 9, username: 'buyer', ...body, images: [] };
      window.__reviews.push(saved);
      return Response.json(saved, { status: 201 });
    }
    window.__unexpected.push(route); return Response.json({}, { status: 500 });
  };
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const artifacts = process.env.REVIEW_ARTIFACT_DIR || path.join(os.tmpdir(), 'stationery-review-modal-qa');
let vite, browser, profile, socket, send, evaluate;
const pending = new Map(), exceptions = [];
let passed = 0;
async function until(check, label) { for (let i = 0; i < 150; i++) { if (await check()) return; await delay(80); } throw new Error('Timed out: ' + label); }
async function test(label, run) { await run(); passed++; console.log('PASS ' + label); }
try {
  vite = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } }); await vite.listen();
  const base = 'http://127.0.0.1:' + vite.httpServer.address().port;
  const executable = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(value => value && existsSync(value));
  assert.ok(executable, 'Set CHROME_PATH to an installed Chromium browser');
  profile = await fs.mkdtemp(path.join(os.tmpdir(), 'stationery-order-review-'));
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  await until(() => existsSync(path.join(profile, 'DevToolsActivePort')), 'browser startup');
  const port = (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
  const tab = await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' }).then(response => response.json());
  socket = new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let next = 0;
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
    const entry = pending.get(message.id);
    if (entry) { clearTimeout(entry.timer); pending.delete(message.id); message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result); }
  };
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next, timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout ' + method)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + installApi.toString() + ')()' });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const navigate = async () => {
    const previous = await evaluate('window.__orderReviewDocument').catch(() => null);
    await send('Page.navigate', { url: base + '/my-profile/orders' });
    await until(() => evaluate(`window.__orderReviewDocument !== ${JSON.stringify(previous)} && !!document.querySelector('article button')`), 'order history');
  };
  const activeForm = '[...document.querySelectorAll("dialog[open] form")].find(node=>node.getClientRects().length)';
  const read = expression => evaluate('(()=>{const f=' + activeForm + ';return (' + expression + ')})()');
  const button = async (label, context = 'document') => {
    await until(() => evaluate(`[...${context}.querySelectorAll('button')].some(n=>n.getClientRects().length && !n.disabled && n.textContent.trim()===${JSON.stringify(label)})`), `button ${label}`);
    await evaluate('(()=>{const n=[...' + context + '.querySelectorAll("button")].find(n=>n.textContent.trim()===' + JSON.stringify(label)
      + '&&n.getClientRects().length);if(!n||n.disabled)throw new Error("Unavailable button");n.focus();n.click()})()');
  };
  const open = async () => { await button('Đánh giá'); await until(() => read('!!f'), 'review form'); };
  const input = value => evaluate('(()=>{const n=(' + activeForm + ').querySelector("textarea");Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(n,'
    + JSON.stringify(value) + ');n.dispatchEvent(new Event("input",{bubbles:true}))})()');
  const select = async value => {
    await evaluate('(()=>{const n=document.querySelector("dialog[open] select");n.value=' + JSON.stringify(String(value)) + ';n.dispatchEvent(new Event("change",{bubbles:true}))})()');
    await delay(30);
  };
  const submit = () => button('Gửi đánh giá ngay', '(' + activeForm + ')');
  const close = () => evaluate('document.querySelector(\'[aria-label="Đóng đánh giá"]\').click()');
  const screenshot = async name => {
    await evaluate('document.querySelectorAll(".store-notice-close").forEach(n=>n.click())'); await delay(350);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    await fs.mkdir(artifacts, { recursive: true }); await fs.writeFile(path.join(artifacts, name), Buffer.from(data, 'base64'));
  };

  await navigate();
  await test('Order actions stay ordered, only delivered orders expose review, return/details still work', async () => {
    assert.deepEqual(await evaluate('[...document.querySelector("article").querySelectorAll("button")].map(n=>n.textContent.trim())'), ['Yêu cầu trả hàng', 'Đánh giá', 'Xem chi tiết']);
    assert.equal(await evaluate('document.querySelectorAll(\'a[href^="/review"]\').length'), 0);
    assert.equal(await evaluate('[...document.querySelectorAll("article")][1].textContent.includes("Đánh giá")'), false);
    assert.equal(await evaluate('window.__requests.some(r=>r.route.includes("/reviews"))'), false);
    await button('Yêu cầu trả hàng');
    await until(() => evaluate('location.pathname === "/returns/new" && new URLSearchParams(location.search).get("orderId") === "71"'), 'return request route');
    await until(() => evaluate('Boolean(document.querySelector("#return-order"))'), 'return request form');
    await evaluate('history.back()');
    await until(() => evaluate('location.pathname === "/my-profile/orders" && Boolean(document.querySelector("article"))'), 'return to orders');
    await button('Xem chi tiết');
    await until(() => evaluate('!!document.querySelector("dialog[open]")'), 'order details');
    assert.equal(await evaluate('document.querySelector("dialog[open]").textContent.includes("Chi tiết đơn hàng #ST-71")'), true);
    await evaluate('document.querySelector(\'dialog[open] [aria-label="Đóng"]\').click()');
  });
  await test('Review opens without navigation, supports product/variant choice and marks reviewed products', async () => {
    await open();
    assert.equal(await evaluate('location.pathname+location.search'), '/my-profile/orders');
    assert.equal(await evaluate('document.body.style.overflow'), 'hidden');
    assert.equal(await evaluate('document.querySelectorAll("dialog[open] option").length'), 3);
    assert.equal(await read('f.querySelector("h3").textContent'), 'Bút gel Deli');
    await input('Bản nháp của phân loại mực đen.');
    await select(112);
    assert.equal(await read('f.textContent.includes("Mực xanh") && f.textContent.includes("75.000")'), true);
    assert.equal(await read('f.querySelector("textarea").value'), '');
    await select(121);
    assert.equal(await evaluate('document.querySelector("dialog[open]").textContent.includes("Sản phẩm đã được đánh giá")'), true);
    assert.equal(await read('!!f'), false);
    await select(111);
    assert.equal(await read('f.querySelector("textarea").value'), 'Bản nháp của phân loại mực đen.');
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 5, y: 5, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 5, button: 'left', clickCount: 1 });
    assert.equal(await read('f.querySelector("textarea").value'), 'Bản nháp của phân loại mực đen.');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await until(() => evaluate('!document.querySelector("dialog[open]")'), 'Escape closes review');
    assert.equal(await evaluate('document.body.style.overflow'), '');
  });
  await test('Validation, image previews and API failure preserve the selected draft and show notices', async () => {
    await open(); await select(112); await input('   '); await submit();
    assert.equal(await evaluate('window.__posts.length'), 0);
    await input('a'.repeat(510)); assert.equal(await read('f.querySelector("textarea").value.length'), 500);
    await input('Bút mực xanh viết êm tay.');
    await evaluate('('+ activeForm + ').querySelector(\'input[value="4"]\').click()');
    await evaluate('(async()=>{const blob=await fetch("/src/assets/butgel.webp").then(r=>r.blob());const d=new DataTransfer();d.items.add(new File([blob],"review.webp",{type:"image/webp"}));const n=('
      + activeForm + ').querySelector("input[type=file]");n.files=d.files;n.dispatchEvent(new Event("change",{bubbles:true}))})()');
    await until(() => read('!!f.querySelector(\'button[aria-label="Xóa review.webp"]\')'), 'image preview');
    await evaluate('window.__failure=500'); await submit();
    await until(() => read('f.textContent.includes("Nội dung vẫn được giữ lại")'), 'submission error');
    assert.equal(await read('f.querySelector("textarea").value'), 'Bút mực xanh viết êm tay.');
    assert.equal(await read('!!f.querySelector(\'button[aria-label="Xóa review.webp"]\')'), true);
    assert.equal(await evaluate('!!document.querySelector(".store-notice")'), true);
    await screenshot('desktop.png');
  });
  await test('One authenticated request on double click; success closes modal, refreshes orders and marks all variants reviewed', async () => {
    const before = await evaluate('window.__posts.length');
    const reads = await evaluate('window.__requests.filter(r=>r.route==="/api/orders/my-orders").length');
    await evaluate('window.__failure=0;window.__delay=400'); await submit();
    assert.equal(await read('f.querySelector("button[type=submit]").disabled'), true);
    await evaluate('(' + activeForm + ').dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))');
    await until(() => evaluate('!document.querySelector("dialog[open]")'), 'successful close');
    assert.equal(await evaluate('window.__posts.length'), before + 1);
    const saved = await evaluate('window.__posts.at(-1)');
    assert.deepEqual(saved, { productID: 11, body: { rating: 4, comment: 'Bút mực xanh viết êm tay.' }, images: ['review.webp'], multipart: true, auth: 'Bearer order-review-test' });
    await until(() => evaluate('[...document.querySelector("article").querySelectorAll("button")].some(n=>n.textContent==="Xem đánh giá"&&!n.disabled)'), 'reviewed products retain access to view/edit');
    assert.equal(await evaluate('document.body.style.overflow'), '');
    assert.equal(await evaluate('location.pathname+location.search'), '/my-profile/orders');
    assert.ok(await evaluate('window.__requests.filter(r=>r.route==="/api/orders/my-orders").length') > reads);
  });
  await test('Fresh server checks reject undelivered/foreign orders; duplicate response cannot create a second review', async () => {
    await navigate();
    for (const mode of ['foreign', 'undelivered', 'forbidden']) {
      await evaluate('window.__orderMode=' + JSON.stringify(mode)); await button('Đánh giá');
      await until(() => evaluate('!!document.querySelector(\'dialog[open] [role="alert"]\')'), mode);
      assert.equal(await read('!!f'), false); assert.equal(await evaluate('window.__posts.length'), 0);
      await close();
    }
    await evaluate('window.__orderMode=""'); await open(); await input('Sản phẩm đã mua.');
    await evaluate('window.__failure=403'); await submit();
    await until(() => read('f.textContent.includes("đơn hàng đã giao của mình")'), 'server refuses unauthorized submission');
    assert.equal(await read('f.querySelector("textarea").value'), 'Sản phẩm đã mua.');
    await evaluate('window.__failure=409'); await submit();
    await until(() => read('!f'), 'existing review is reloaded');
    assert.equal(await evaluate('document.querySelector("dialog[open]").textContent.includes("Sản phẩm đã được đánh giá")'), true);
    await close();
  });
  await test('Mobile modal fits the viewport, scrolls internally and X restores background scrolling', async () => {
    await navigate();
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    await open();
    assert.equal(await evaluate('(()=>{const d=document.querySelector("dialog[open]"),r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&r.height<=innerHeight*.91})()'), true);
    assert.equal(await evaluate('document.querySelector("dialog[open]").scrollWidth<=document.querySelector("dialog[open]").clientWidth'), true);
    assert.equal(await evaluate('getComputedStyle(document.querySelector("dialog[open] > div")).overflowY'), 'auto');
    await screenshot('mobile.png'); await close();
    assert.equal(await evaluate('document.body.style.overflow'), '');
  });
  await test('Review editing counts retained photos, replaces explicitly removed media and preserves drafts on failure', async () => {
    await navigate();
    await evaluate(`window.__reviews.find(review=>review.reviewID===80).images=Array.from({length:5},(_,imagePosition)=>({imagePosition,imageUrl:'/src/assets/butgel.webp'}))`);
    await open(); await select(121); await button('Chỉnh sửa đánh giá');
    await until(() => read('!!f'), 'edit form');
    assert.equal(await read('f.querySelector("textarea").value'), 'Sổ dùng tốt.');
    assert.equal(await read(`f.querySelectorAll('button[aria-label^="Xóa ảnh hiện có"]').length`), 5);
    const upload = () => evaluate('(async()=>{const blob=await fetch("/src/assets/butgel.webp").then(r=>r.blob());const d=new DataTransfer();d.items.add(new File([blob],"replacement.webp",{type:"image/webp"}));const n=('
      + activeForm + ').querySelector("input[type=file]");n.files=d.files;n.dispatchEvent(new Event("change",{bubbles:true}))})()');
    await upload();
    assert.equal(await read(`!!f.querySelector('button[aria-label="Xóa replacement.webp"]')`), false, 'five retained photos leave no upload slot');
    await read(`f.querySelector('button[aria-label="Xóa ảnh hiện có 1"]').click()`);
    await upload(); await until(() => read(`!!f.querySelector('button[aria-label="Xóa replacement.webp"]')`), 'replacement preview');
    assert.equal(await read(`f.querySelectorAll('button[aria-label^="Xóa ảnh hiện có"]').length`), 4);
    await input('Đã sửa nội dung và thay một ảnh.');
    await evaluate('window.__failure=500'); await button('Lưu chỉnh sửa');
    await until(() => read('f.textContent.includes("Nội dung vẫn được giữ lại")'), 'edit error preserves draft');
    assert.equal(await read('f.querySelector("textarea").value'), 'Đã sửa nội dung và thay một ảnh.');
    await evaluate('window.__failure=0;window.__delay=250'); await button('Lưu chỉnh sửa');
    await evaluate('(' + activeForm + ').dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))');
    await until(() => evaluate('!document.querySelector("dialog[open]")'), 'edited review closes');
    assert.equal(await evaluate('window.__updates.length'), 2, 'one failed attempt and one explicit retry');
    assert.deepEqual(await evaluate('window.__updates.at(-1)'), { reviewID: 80, body: { rating: 5, comment: 'Đã sửa nội dung và thay một ảnh.' }, removed: [0], images: ['replacement.webp'], multipart: true, auth: 'Bearer order-review-test' });
    assert.equal(await evaluate('window.__reviews.find(review=>review.reviewID===80).images.length'), 5);
    assert.equal(await evaluate('window.__posts.length'), 0, 'editing never creates a duplicate review');
  });
  assert.deepEqual(exceptions, [], 'No browser runtime exceptions');
  assert.deepEqual(await evaluate('window.__unexpected'), [], 'No unmocked API calls');
  console.log(passed + ' order review browser scenarios passed. Screenshots: ' + artifacts);
} catch (error) {
  console.error(error); process.exitCode = 1;
  if (send) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' }).catch(() => ({}));
    if (data) { await fs.mkdir(artifacts, { recursive: true }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(data, 'base64')); }
  }
} finally {
  if (send) await send('Browser.close').catch(() => {});
  socket?.close(); browser?.kill(); if (vite) await vite.close();
  if (profile && path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('stationery-order-review-')) {
    await delay(300); await fs.rm(profile, { recursive: true, force: true, maxRetries: 4 }).catch(() => {});
  }
}
