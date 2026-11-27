import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createServer } from 'vite';
import { openTestBrowser, until, delay } from './browser-test.mjs';

// Every API call is intercepted in the isolated browser. No live customer data,
// database, email, payment provider or AI provider is contacted.
function installApi() {
  const native = window.fetch.bind(window);
  const mode = sessionStorage.getItem('audit-mode') || 'guest';
  const customer = mode !== 'guest';
  if (customer) localStorage.setItem('accessToken', mode === 'admin' ? 'audit-admin' : 'audit-customer');
  else localStorage.removeItem('accessToken');
  const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#fff7ed"/></svg>');
  const product = { productID: 1, title: 'Bút kiểm thử', handle: 'but-kiem-thu', description: 'Bút cho bài kiểm thử local',
    price: 10000, priceMin: 10000, priceMax: 10000, compareAtPrice: 15000, available: true, isActive: true,
    productTypeID: 2, productTypeName: 'Bút', vendorID: 3, vendorName: 'Test brand', ratingAverage: 5, reviewCount: 0, images: [image] };
  const variant = { variantID: 11, productID: 1, productTitle: product.title, title: 'Mực xanh', sku: 'TEST-11', price: 10000,
    stockQuantity: 20, available: true, compareAtPrice: 15000, option1: null, option2: null, option3: null };
  let items = [{ cartItemID: 100, variantID: 11, productID: 1, productTitle: product.title, variantTitle: variant.title,
    quantity: 2, unitPrice: 10000, lineTotal: 20000, stockQuantity: 20, available: true }];
  window.__audit = { requests: [], unexpected: [], orders: 0, nonce: Math.random(), failIdentity: false };
  const page = content => ({ content, totalElements: content.length, totalPages: content.length ? 1 : 0,
    number: 0, size: 10, numberOfElements: content.length, first: true, last: true, empty: !content.length });
  const cart = () => ({ items, subtotal: items.reduce((total, item) => total + item.lineTotal, 0) });
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (!url.pathname.startsWith('/api/')) return native(input, options);
    const path = url.pathname, method = options.method || 'GET';
    window.__audit.requests.push({ path, search: url.search, method });
    options.signal?.throwIfAborted();
    if (path === '/api/auth/me') return window.__audit.failIdentity || mode === 'identity-error'
      ? Response.json({ detail: 'private SQL error' }, { status: 503 })
      : Response.json({ userID: 7, username: 'audit-user', fullName: 'Tài khoản kiểm thử', email: 'audit@example.test', role: mode === 'admin' ? 'ADMIN' : 'CUSTOMER' });
    if (path === '/api/auth/login') return Response.json({ accessToken: 'audit-customer', user: { userID: 7, role: 'CUSTOMER' } });
    if (path === '/api/users/me') return Response.json({ userID: 7, username: 'audit-user', fullName: 'Tài khoản kiểm thử', email: 'audit@example.test', role: 'CUSTOMER', isActive: true });
    if (path === '/api/product-types') return Response.json([{ productTypeID: 2, name: 'Bút', isActive: true }]);
    if (path === '/api/vendors') return Response.json([{ vendorID: 3, name: 'Test brand', isActive: true }]);
    if (path === '/api/products' || path === '/api/products/search') return Response.json(page([product]));
    if (path.startsWith('/api/products/') && !path.endsWith('/reviews')) {
      if (mode === 'product-missing') return Response.json({}, { status: 404 });
      if (mode === 'product-error') return Response.json({ detail: 'private SQL error' }, { status: 503 });
      return Response.json(mode === 'render-error' ? { ...product, images: {} } : product);
    }
    if (path.endsWith('/reviews')) return Response.json([]);
    if (path.startsWith('/api/product-variants/product/')) return Response.json([variant]);
    if (path === '/api/product-variants/11') return Response.json(variant);
    if (path.startsWith('/api/recommendations/')) return Response.json({ products: [], source: 'POPULAR' });
    if (path === '/api/tracking/events') return new Response(null, { status: 204 });
    if (path === '/api/ai/chat') {
      await new Promise(resolve => setTimeout(resolve, 150)); options.signal?.throwIfAborted();
      return Response.json({ reply: 'Câu trả lời riêng của phiên hiện tại', products: [product] });
    }
    if (path === '/api/cart/merge') return Response.json(cart());
    if (path === '/api/cart') {
      if (mode === 'cart-error') return Response.json({}, { status: 503 });
      return Response.json(cart());
    }
    if (path === '/api/cart/items/100') {
      await new Promise(resolve => setTimeout(resolve, 120));
      if (mode === 'cart-write-error') return Response.json({}, { status: 409 });
      if (method === 'DELETE') items = [];
      else { items[0].quantity = JSON.parse(options.body).quantity; items[0].lineTotal = items[0].quantity * 10000; }
      return Response.json(cart());
    }
    if (path === '/api/orders' && method === 'POST') {
      window.__audit.orders++; await new Promise(resolve => setTimeout(resolve, 150));
      if (mode === 'checkout-error') return Response.json({}, { status: 503 });
      items = []; return Response.json({ orderID: 42 });
    }
    if (path === '/api/orders/my-orders') return Response.json(url.search ? { ...page([]), statusCounts: {} } : []);
    if (path === '/api/returns/my-requests') return Response.json([]);
    window.__audit.unexpected.push(path); return Response.json({}, { status: 500 });
  };
}

const vite = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
let browser;
let passed = 0;
const artifacts = new URL('../../.cache/fullstack-audit/', import.meta.url);
await fs.mkdir(artifacts, { recursive: true });
try {
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await openTestBrowser();
  const { send, evaluate, click, type } = browser;
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installApi.toString()})();` });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  async function ready(expression) {
    await until(async () => { try { return await evaluate(`Boolean(${expression})`); } catch { return false; } }, expression);
  }
  async function navigate(route, mode = 'guest') {
    const previous = await evaluate('window.__audit?.nonce').catch(() => null);
    try { await evaluate(`sessionStorage.setItem('audit-mode', ${JSON.stringify(mode)})`); } catch { /* initial origin */ }
    await send('Page.navigate', { url: base + route });
    await ready(`window.__audit && window.__audit.nonce !== ${JSON.stringify(previous)} && (document.querySelector('main') || document.querySelector('.page-error')) && document.readyState === 'complete'`);
    await delay(100);
  }
  async function reload() {
    const previous = await evaluate('window.__audit.nonce');
    await send('Page.reload');
    await ready(`window.__audit && window.__audit.nonce !== ${previous} && document.querySelector('main') && document.readyState === 'complete'`);
  }
  async function test(name, run) { await run(); assert.deepEqual(await evaluate('window.__audit.unexpected'), [], 'All API calls intercepted'); passed++; console.log(`PASS ${name}`); }
  const text = () => evaluate('document.querySelector("main").textContent');
  async function noOverflow(label) {
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true, label);
  }
  async function screenshot(name) {
    const result = await send('Page.captureScreenshot', { format: 'png' });
    await fs.writeFile(new URL(name + '.png', artifacts), Buffer.from(result.data, 'base64'));
  }
  await navigate('/unknown-audit-page');
  await test('Storefront 404 keeps invalid URL, header/footer, title and working recovery links', async () => {
    await ready('document.querySelector("#not-found-title")');
    assert.match(await text(), /404.*Không tìm thấy trang/s);
    assert.equal(await evaluate('location.pathname'), '/unknown-audit-page');
    assert.equal(await evaluate('Boolean(document.querySelector("header") && document.querySelector("footer"))'), true);
    assert.match(await evaluate('document.title'), /404/);
    const nonce = await evaluate('window.__audit.nonce');
    await click('main a[href="/search"]'); await ready('location.pathname === "/search" && document.querySelector("main h1")');
    assert.equal(await evaluate('window.__audit.nonce'), nonce, 'SPA navigation keeps the document');
    await evaluate('history.back()'); await ready('document.querySelector("#not-found-title")');
    await evaluate('history.forward()'); await ready('location.pathname === "/search"');
    await reload(); await ready('location.pathname === "/search" && document.querySelector("main")');
  });
  await test('Protected dashboard 404 verifies admin; guest goes to login and customer sees 403', async () => {
    await navigate('/dashboard/missing'); await ready('location.pathname === "/login"');
    await navigate('/dashboard/missing', 'customer'); await ready('document.querySelector("main").textContent.includes("403")');
    assert.equal(await evaluate('Boolean(document.querySelector("#not-found-title"))'), false);
    await navigate('/dashboard/missing', 'admin'); await ready('document.querySelector("#not-found-title")');
    assert.equal(await evaluate('Boolean(document.querySelector(".dashboard-sidebar"))'), true);
    assert.equal(await evaluate('location.pathname'), '/dashboard/missing');
    await screenshot('dashboard-404');
  });
  await test('Aliases preserve query/hash and legacy review links reach order history', async () => {
    await navigate('/products?search=but&category=2&sort=price-asc#results');
    await ready('location.pathname === "/search"');
    assert.equal(await evaluate('location.search + location.hash'), '?search=but&category=2&sort=price-asc#results');
    await navigate('/profile?source=old#details', 'customer'); await ready('location.pathname === "/my-profile"');
    assert.equal(await evaluate('location.search + location.hash'), '?source=old#details');
    await navigate('/orders?search=42#details', 'customer'); await ready('location.pathname === "/my-profile/orders"');
    assert.equal(await evaluate('location.search + location.hash'), '?search=42#details');
    await navigate('/review?orderId=42', 'customer'); await ready('location.pathname === "/my-profile/orders"');
    await navigate('/promotions'); await ready('location.pathname === "/search" && location.search.includes("onSale=true")');
  });
  await test('Header category IDs and search use React Router; search stays in sync after Back', async () => {
    await navigate('/search?search=old');
    const nonce = await evaluate('window.__audit.nonce');
    await type('header input[aria-label="Tìm kiếm sản phẩm"]', 'new'); await click('header button[type="submit"]');
    await ready('location.search === "?search=new"');
    await ready('window.__audit.requests.some(r => r.search.includes("keyword=new"))');
    assert.equal(await evaluate('window.__audit.nonce'), nonce);
    await evaluate('history.back()'); await ready('document.querySelector("header input").value === "old"');
    await click('header a[href="/search?category=2"]'); await ready('location.search === "?category=2"');
    await ready('document.querySelector("header nav a[aria-current=page]")');
    assert.equal(await evaluate('document.querySelector("header nav a[aria-current=page]").textContent.trim()'), 'Bút');
    assert.equal(await evaluate(`document.querySelectorAll('header a[href="/notifications"], footer a[href="#"]').length`), 0);
  });
  await test('Policy quick search is labeled and footer hashes work during SPA navigation', async () => {
    await navigate('/policy#shipping');
    await ready('document.querySelector("#policy-search")');
    await click('footer a[href="/policy#returns"]');
    await ready('document.querySelector("main article").textContent.includes("07 ngày")');
    await evaluate('Array.from(document.querySelectorAll("main button")).find(button => button.textContent === "Đổi trả 7 ngày").click()');
    assert.equal(await evaluate('document.querySelector("#policy-search").value'), 'đổi trả');
    await click('footer a[href="/about#faq"]'); await ready('document.querySelector("#about-faq")');
    await click('footer a[href="/about#contact"]');
    await ready('location.hash === "#contact" && !document.querySelector("#about-faq") && Math.abs(document.querySelector("#contact").getBoundingClientRect().top) < 40');
    await click('footer a[href="/about#faq"]'); await ready('document.querySelector("#about-faq")');
  });
  await test('Product 404 differs from transient errors and percent handles never double-decode', async () => {
    await navigate('/products/missing', 'product-missing'); await ready('document.querySelector("main h1")?.textContent === "Không tìm thấy sản phẩm"');
    await navigate('/products/test', 'product-error'); await ready('document.querySelector("main h1")?.textContent === "Chưa thể tải sản phẩm"');
    assert.equal((await text()).includes('private SQL'), false);
    await navigate('/products/100%25-off'); await ready('document.querySelector("main h1")?.textContent === "Bút kiểm thử"');
    assert.ok(await evaluate('window.__audit.requests.some(r => r.path.includes("100%25-off"))'));
  });
  await test('Cart guest quantities survive refresh, remove works and login returns to cart', async () => {
    await navigate('/cart');
    await evaluate('localStorage.setItem("stationery_guest_cart", JSON.stringify([{variantID:11,quantity:2}])); window.dispatchEvent(new Event("cart-changed"))');
    await ready('document.querySelector("main li a")?.textContent === "Bút kiểm thử"');
    await click('main button[aria-label="Tăng số lượng"]');
    await reload(); await ready(`document.querySelector('main [aria-label="Số lượng"]')?.textContent === "3"`);
    await click('main a[href="/login"]'); await ready('location.pathname === "/login"');
    assert.equal(await evaluate('history.state.usr.from'), '/cart');
    await navigate('/cart'); await ready(`document.querySelector('main button[aria-label="Xóa sản phẩm"]')`);
    await click('main button[aria-label="Xóa sản phẩm"]'); await ready('document.querySelector("main").textContent.includes("Giỏ hàng đang trống")');
  });
  await test('Customer cart serializes double clicks, updates totals and removes items', async () => {
    await navigate('/cart', 'customer'); await ready('document.querySelector("main li")');
    await evaluate(`const button=document.querySelector('main button[aria-label^="Tăng số lượng"]'); button.click(); button.click()`);
    await ready(`document.querySelector('main [aria-label="Số lượng"]').textContent === "3" && !document.querySelector('main button[aria-label^="Tăng"]').disabled`);
    assert.equal(await evaluate('window.__audit.requests.filter(r=>r.path === "/api/cart/items/100" && r.method === "PUT").length'), 1);
    assert.match(await text(), /30[.,]000/);
    await click('main button[aria-label^="Xóa Bút"]'); await ready('document.querySelector("main").textContent.includes("Giỏ hàng đang trống")');
  });
  await test('Cart failure keeps an error/retry state and optimistic writes roll back on conflict', async () => {
    await navigate('/cart', 'cart-error'); await ready('document.querySelector("main [role=alert]")');
    assert.equal((await text()).includes('Giỏ hàng đang trống'), false);
    await navigate('/cart', 'cart-write-error'); await ready('document.querySelector("main li")');
    await click('main button[aria-label^="Tăng số lượng"]');
    await ready('document.querySelector("main [role=alert]")');
    assert.equal(await evaluate(`document.querySelector('main [aria-label="Số lượng"]').textContent`), '2');
  });
  async function checkout() {
    await ready('document.querySelector("main textarea[name=address]")');
    await type('main textarea[name=address]', '123 Đường kiểm thử'); await type('main input[name=phone]', '0901234567');
    await evaluate('const form=document.querySelector("main form"); form.requestSubmit(); form.requestSubmit()');
  }
  await test('Checkout validates required fields, blocks duplicate submit and links to order history', async () => {
    await navigate('/cart', 'customer'); await ready('document.querySelector("main form")');
    await click('main button[type=submit]'); assert.equal(await evaluate('window.__audit.orders'), 0);
    await checkout(); await ready('document.querySelector("main").textContent.includes("Đặt hàng thành công")');
    assert.equal(await evaluate('window.__audit.orders'), 1);
    await click('main a[href="/my-profile/orders"]'); await ready('location.pathname === "/my-profile/orders"');
  });
  await test('Unknown checkout result locks resubmission and directs the customer to history', async () => {
    await navigate('/cart', 'checkout-error'); await checkout();
    await ready('document.querySelector("main [role=alert]")');
    assert.equal(await evaluate('document.querySelector("main button[type=submit]").disabled'), true);
    assert.equal(await evaluate('window.__audit.orders'), 1);
    assert.match(await text(), /kiểm tra lịch sử đơn hàng/);
  });
  await test('Chat sends once, remains in the SPA and clears conversation on session switch', async () => {
    await navigate('/search', 'customer');
    await click('button[aria-label="Mở trợ lý mua sắm"]'); await type('#chat-message', 'Nhu cầu riêng của tôi');
    await evaluate('const form=document.querySelector("#shopping-chat form"); form.requestSubmit(); form.requestSubmit()');
    await ready('document.querySelector("#shopping-chat").textContent.includes("Câu trả lời riêng")');
    assert.equal(await evaluate('window.__audit.requests.filter(r=>r.path === "/api/ai/chat").length'), 1);
    const nonce = await evaluate('window.__audit.nonce');
    await click('#shopping-chat a'); await ready('location.pathname === "/products/but-kiem-thu"');
    assert.equal(await evaluate('window.__audit.nonce'), nonce);
    await evaluate('localStorage.setItem("accessToken", "other-customer"); window.dispatchEvent(new Event("auth-changed"))');
    await ready('!document.querySelector("#shopping-chat")');
    await click('button[aria-label="Mở trợ lý mua sắm"]');
    assert.equal(await evaluate('document.querySelector("#shopping-chat").textContent.includes("Nhu cầu riêng")'), false);
  });
  await test('Transient identity errors show retry and retain the authenticated session', async () => {
    await navigate('/search', 'identity-error'); await ready('document.querySelector("header").textContent.includes("Thử lại tài khoản")');
    assert.equal(await evaluate('localStorage.getItem("accessToken")'), 'audit-customer');
  });
  await test('Storefront/cart/policy/search stay within all required viewport widths', async () => {
    for (const width of [360, 390, 768, 1024, 1440, 1920]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
      for (const route of ['/missing-responsive', '/cart', '/policy', '/search']) {
        await navigate(route, 'customer'); await noOverflow(`${route} at ${width}`);
      }
      if (width === 360) { await navigate('/missing-responsive'); await screenshot('storefront-404-mobile'); }
    }
  });
  assert.deepEqual(await evaluate('window.__audit.unexpected'), []);
  assert.deepEqual(browser.exceptions, [], 'No unexpected browser exceptions in normal flows');
  assert.deepEqual(browser.consoleErrors, [], 'No unexpected console errors in normal flows');
  await test('Render boundary keeps the storefront shell and hides internal diagnostics', async () => {
    await navigate('/products/broken', 'render-error'); await ready('document.querySelector(".page-error")');
    assert.equal(await evaluate('Boolean(document.querySelector("header") && document.querySelector("footer"))'), true);
    assert.equal(await evaluate('document.querySelector(".page-error").textContent.includes("TypeError")'), false);
    await click('.page-error a'); await ready('location.pathname === "/" && !document.querySelector(".page-error")');
  });
  await test('A failed lazy chunk offers explicit reload and recovers after assets become available', async () => {
    await send('Network.setBlockedURLs', { urls: ['*NotFound.tsx*'] });
    await navigate('/missing-lazy-chunk'); await ready('document.querySelector(".page-error")');
    assert.equal(await evaluate('document.querySelector(".page-error").textContent.includes("Có phiên bản mới")'), true);
    assert.equal(await evaluate('location.pathname'), '/missing-lazy-chunk');
    await send('Network.setBlockedURLs', { urls: [] });
    const previous = await evaluate('window.__audit.nonce');
    await click('.page-error button');
    await ready(`window.__audit?.nonce !== ${previous} && document.querySelector('#not-found-title')`);
    assert.equal(await evaluate('location.pathname'), '/missing-lazy-chunk');
  });
  console.log(`${passed} full-stack audit browser checks passed. Screenshots: ${artifacts.pathname}`);
} catch (error) {
  if (browser) {
    console.error('Audit failure state:', await browser.evaluate('JSON.stringify({url:location.href,body:document.body.innerText.slice(0,5000),requests:window.__audit?.requests,unexpected:window.__audit?.unexpected})').catch(() => 'unavailable'));
    console.error('Browser exceptions:', JSON.stringify(browser.exceptions));
    const result = await browser.send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
    if (result) await fs.writeFile(new URL('failure.png', artifacts), Buffer.from(result.data, 'base64'));
  }
  throw error;
} finally { await browser?.close(); await vite.close(); }
