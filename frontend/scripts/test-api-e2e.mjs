import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { openTestBrowser, until } from './browser-test.mjs';

const backend = process.env.E2E_API_URL;
assert.ok(backend && /^http:\/\/127\.0\.0\.1:\d+$/.test(backend), 'Only an explicitly supplied loopback test backend is allowed');
process.env.VITE_API_BASE_URL = '';
process.env.DEV_API_PROXY_TARGET = backend;
const vite = await createServer({ server: { host: '127.0.0.1', port: 5199, strictPort: true, open: false } });
let browser;
let passed = 0;
const password = 'Audit-only-Password123!'; // Synthetic local fixture, never a real account.
async function request(path, token, options = {}) {
  const response = await fetch(backend + path, { ...options, headers: { 'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  return { response, data };
}
try {
  await vite.listen(); browser = await openTestBrowser();
  const { send, evaluate, click, type } = browser;
  const base = 'http://127.0.0.1:5199';
  const ready = expression => until(async () => { try { return await evaluate(`Boolean(${expression})`); } catch { return false; } }, expression);
  const button = async label => {
    await ready(`[...document.querySelectorAll('button')].some(n=>n.getClientRects().length && !n.disabled && n.textContent.trim()===${JSON.stringify(label)})`);
    await evaluate(`(() => {const n=[...document.querySelectorAll('button')].find(n=>n.getClientRects().length && !n.disabled && n.textContent.trim()===${JSON.stringify(label)});n.click()})()`);
  };
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__e2eDocument = Math.random()' });
  async function test(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
  await send('Page.navigate', { url: base + '/products/e2e-but' });
  await ready('document.querySelector("main h1")?.textContent === "E2E Bút"');
  await test('Real product API, variants and guest cart link work', async () => {
    await button('Thêm vào giỏ hàng');
    await ready('localStorage.getItem("stationery_guest_cart")');
    await ready('document.querySelector(".Toastify__toast")');
    assert.equal(await evaluate(`(() => { const link=document.querySelector('header a[href="/cart"]');const r=link.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('a')===link; })()`), true, 'Success notice leaves the cart link clickable');
    await click('header a[href="/cart"]'); await ready('location.pathname === "/cart" && document.querySelector("main li")');
    await ready('document.querySelector("main li").textContent.includes("E2E Bút")');
  });
  await test('Real login merges the guest cart and restores checkout destination', async () => {
    await click('main a[href="/login"]'); await ready('document.querySelector("input[autocomplete=username]")');
    await type('input[autocomplete=username]', 'e2e-customer'); await type('input[autocomplete=current-password]', password);
    await click('main form button[class*=submitBtn]');
    await ready('location.pathname === "/cart" && document.querySelector("main textarea[name=address]")');
    assert.equal(await evaluate('localStorage.getItem("stationery_guest_cart")'), null);
  });
  let customerToken;
  await test('Real authenticated checkout creates a local order and clears the cart', async () => {
    await type('main textarea[name=address]', '123 Đường kiểm thử cục bộ'); await type('main input[name=phone]', '0901234567');
    await click('main button[type=submit]'); await ready('document.querySelector("main").textContent.includes("Đặt hàng thành công")');
    customerToken = await evaluate('localStorage.getItem("accessToken")');
    const cart = await request('/api/cart', customerToken); assert.equal(cart.response.status, 200); assert.equal(cart.data.items.length, 0);
    await click('main a[href="/my-profile/orders"]'); await ready('document.querySelectorAll("article").length === 2');
  });
  await test('Real review modal submits an authorized purchased-product review', async () => {
    await button('Đánh giá'); await ready(`document.querySelector('dialog[open] form[aria-label="Đánh giá sản phẩm"]')`);
    await type('dialog[open] textarea', 'Đánh giá tổng hợp từ kiểm thử E2E cục bộ.');
    await click('dialog[open] button[type=submit]'); await ready('!document.querySelector("dialog[open]")');
    const reviews = await request('/api/products/1/reviews', customerToken); assert.equal(reviews.response.status, 200); assert.equal(reviews.data.length, 1);
  });
  await test('Order filters survive refresh and use the real server page', async () => {
    await type('input[aria-label="Tìm đơn hàng"]', 'E2E');
    await evaluate(`document.querySelector('input[aria-label="Tìm đơn hàng"]').form.requestSubmit()`);
    await ready('new URLSearchParams(location.search).get("search") === "E2E" && document.querySelectorAll("article").length === 2');
    const previous = await evaluate('window.__e2eDocument');
    await send('Page.reload'); await ready(`window.__e2eDocument !== ${previous} && document.readyState === 'complete'`);
    await ready(`document.querySelector('input[aria-label="Tìm đơn hàng"]')?.value === "E2E" && document.querySelectorAll('article').length === 2`);
  });
  await test('Existing review can be edited through the real owner-authorized endpoint', async () => {
    await button('Đánh giá'); await ready('document.querySelector("dialog[open]")');
    await button('Chỉnh sửa đánh giá'); await ready('document.querySelector("dialog[open] textarea")');
    await type('dialog[open] textarea', 'Đã cập nhật nhận xét qua E2E cục bộ.');
    await click('dialog[open] button[type=submit]'); await ready('!document.querySelector("dialog[open]")');
    const reviews = await request('/api/products/1/reviews', customerToken);
    assert.equal(reviews.data.length, 1); assert.equal(reviews.data[0].comment, 'Đã cập nhật nhận xét qua E2E cục bộ.');
  });
  await test('A real return request is accepted for the delivered local fixture', async () => {
    await button('Yêu cầu trả hàng'); await ready('document.querySelector("#return-order")');
    await ready(`document.querySelector('#return-order').value === ${JSON.stringify(process.env.E2E_DELIVERED_ORDER_ID)}`);
    await click('main input[aria-label^="Trả "]');
    await evaluate(`const select=document.querySelector('#return-reason');select.value=select.options[1].value;select.dispatchEvent(new Event('change',{bubbles:true}))`);
    await type('#return-description', 'Sản phẩm kiểm thử cần được hỗ trợ đổi trả.');
    await type('#evidence-0', 'https://example.test/synthetic-evidence.jpg'); await click('#return-confirmed');
    await click('main button[type=submit]'); await ready('document.querySelector("main section[role=status] h2")?.textContent.includes("đã được gửi thành công")');
    const result = await request('/api/returns/my-requests', customerToken); assert.equal(result.response.status, 200); assert.equal(result.data.length, 1);
  });
  await test('Real customer/admin JWTs enforce permissions and admin 404 stays inside dashboard', async () => {
    assert.equal((await request('/api/admin/users', customerToken)).response.status, 403);
    const { data: admin } = await request('/api/auth/login', null, { method: 'POST', body: JSON.stringify({ username: 'e2e-admin', password }) });
    assert.ok(admin.accessToken);
    assert.equal((await request('/api/admin/products?page=0&size=2', admin.accessToken)).response.status, 200);
    await evaluate(`localStorage.setItem('accessToken', ${JSON.stringify(admin.accessToken)});window.dispatchEvent(new Event('auth-changed'))`);
    await send('Page.navigate', { url: base + '/dashboard/unknown-e2e' }); await ready('document.querySelector("#not-found-title") && document.querySelector(".dashboard-sidebar")');
    assert.match(await evaluate('document.title'), /404/);
  });
  assert.deepEqual(browser.exceptions, [], 'No real E2E runtime exceptions');
  assert.deepEqual(browser.consoleErrors, [], 'No real E2E console errors');
  assert.deepEqual(browser.failedRequests, [], 'No failed real E2E network requests');
  console.log(`${passed} real HTTP/browser E2E checks passed against isolated H2. No API mocks.`);
} catch (error) {
  if (browser) console.error('Local E2E state:', await browser.evaluate(`JSON.stringify({path:location.pathname+location.search,search:document.querySelector('input[aria-label="Tìm đơn hàng"]')?.value,body:document.body.innerText.slice(0,3500)})`).catch(() => 'unavailable'));
  throw error;
} finally { await browser?.close(); await vite.close(); }
