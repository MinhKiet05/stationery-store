import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { openTestBrowser, until, delay } from './browser-test.mjs';

type PreviewInput = { shippingMethod: string; couponCode: string | null };
type FixtureState = { mode: string; previews: PreviewInput[]; orders: unknown[]; cancelled: number };
declare global { interface Window { __checkoutErrors: FixtureState } }

// Every API request is local and mocked. Never send checkout writes to a real server.
function installApi() {
  localStorage.setItem('accessToken', 'synthetic-checkout-test');
  const original = window.fetch.bind(window);
  const state = window.__checkoutErrors = { mode: '', previews: [], orders: [], cancelled: 0 } as FixtureState;
  window.fetch = async (input: RequestInfo | URL, options: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.origin);
    if (!url.pathname.startsWith('/api/')) return original(input, options);
    const json = (body: unknown, status = 200) => Response.json(body, { status });
    const user = { userID: 1, username: 'synthetic', role: 'CUSTOMER', fullName: 'Khách kiểm thử', phoneNumber: '0900000000', email: 'test@example.test' };
    if (url.pathname === '/api/auth/me' || url.pathname === '/api/users/me') return json(user);
    if (url.pathname === '/api/cart') return json({ items: [{ cartItemID: 1, variantID: 1, productID: 1, productTitle: 'Sổ kiểm thử', variantTitle: 'Mặc định', quantity: 1, lineTotal: 14800, stockQuantity: 10, available: true }], subtotal: 14800 });
    if (url.pathname === '/api/checkout/options') return json({ shipping: ['STANDARD', 'EXPRESS'].map(code => ({ code, label: code, description: '', fee: code === 'STANDARD' ? 25000 : 40000 })), payments: [{ code: 'COD', label: 'COD', enabled: true, demo: false, description: '' }], freeShippingThreshold: 200000 });
    if (url.pathname === '/api/checkout/preview') {
      const body = JSON.parse(String(options.body)) as PreviewInput; state.previews.push(body);
      const slow = body.couponCode === 'SLOW' || state.mode === 'race' && body.shippingMethod === 'STANDARD';
      if (slow) await new Promise(resolve => setTimeout(resolve, 600));
      if (options.signal?.aborted) { state.cancelled++; throw new DOMException('Cancelled', 'AbortError'); }
      if (state.mode === 'timeout') throw new DOMException('Timed out', 'TimeoutError');
      if (state.mode === 'network') throw new TypeError('Failed to fetch');
      if (state.mode === 'empty502') return new Response(null, { status: 502 });
      if (state.mode === 'server500') return json({ message: 'SQL secret=do-not-display' }, 500);
      if (state.mode === 'legacy400') return json({ timestamp: 'synthetic', status: 400, error: 'Bad Request', path: '/api/checkout/preview' }, 400);
      const codes: Record<string, string> = { MIN: 'COUPON_MINIMUM_NOT_MET', EXPIRED: 'COUPON_EXPIRED', MISSING: 'COUPON_NOT_FOUND', PRODUCT: 'COUPON_PRODUCT_NOT_ELIGIBLE', USER: 'COUPON_USER_NOT_ELIGIBLE', USED: 'COUPON_EXHAUSTED' };
      if (body.couponCode && codes[body.couponCode]) return json({ code: codes[body.couponCode], detail: 'SQL secret=do-not-display' }, body.couponCode === 'USED' ? 409 : 400);
      const discountAmount = body.couponCode ? 1000 : 0, shippingFee = body.shippingMethod === 'EXPRESS' ? 40000 : 25000;
      return json({ subTotal: 14800, discountAmount, shippingFee, totalAmount: 14800 - discountAmount + shippingFee, shippingMethod: body.shippingMethod, couponCode: body.couponCode });
    }
    if (url.pathname === '/api/orders' && options.method === 'POST') {
      state.orders.push(JSON.parse(String(options.body)));
      if (state.mode === 'order502') return new Response(null, { status: 502 });
      return json({ detail: 'SQL secret=do-not-display' }, 400);
    }
    if (url.pathname.startsWith('/api/products/')) return json({ productID: 1, title: 'Sổ kiểm thử', images: [] });
    if (url.pathname.includes('recommendations')) return json({ products: [], source: 'POPULAR' });
    return json([]);
  };
}

const vite = await createServer({ server: { host: '127.0.0.1', port: 0, open: false } });
await vite.listen();
const base = `http://127.0.0.1:${vite.httpServer!.address() && (vite.httpServer!.address() as { port: number }).port}`;
const browser = await openTestBrowser();
const evaluate = async <T>(source: string): Promise<T> => await browser.evaluate(source) as T;
let passed = 0;
async function test(name: string, run: () => Promise<void>) { await run(); passed++; console.log(`PASS ${name}`); }
const text = () => evaluate<string>('document.querySelector("main").textContent');
const enabled = () => evaluate<boolean>('!document.querySelector("#checkout-form button[type=submit]").disabled');
async function clearNotices() {
  await evaluate('document.querySelectorAll(".store-notice-close").forEach(button=>button.click())');
  await until(() => evaluate('!document.querySelector(".Toastify__toast")'), 'notices closed');
}
async function input(selector: string, value: string) {
  await evaluate(`(() => { const input=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
}
async function button(label: string) {
  await evaluate(`(() => { const button=[...document.querySelectorAll('main button')].find(button=>button.textContent.trim()===${JSON.stringify(label)}); if(!button || button.disabled) throw new Error('Unavailable button'); button.click(); })()`);
}
async function apply(code: string) {
  await input('#coupon', code); await button('Sử dụng');
  await until(() => evaluate('!![...document.querySelectorAll("main button")].find(button=>button.textContent.trim()==="Sử dụng" && !button.disabled)'), 'coupon settled');
}
async function ready() { await until(enabled, 'valid quote'); }
async function reload() {
  await browser.send('Page.navigate', { url: base + '/checkout' });
  await until(() => evaluate('!!document.querySelector("#checkout-form")'), 'checkout loaded'); await ready();
}

try {
  await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installApi.toString()})()` });
  await reload();
  await test('No coupon: real quote, no false loading or automatic toast', async () => {
    assert.ok((await text()).includes('39.800')); assert.equal(await evaluate('document.querySelectorAll(".Toastify__toast").length'), 0);
    const count = await evaluate<number>('window.__checkoutErrors.previews.length');
    await input('#coupon', 'typing-only'); await delay(250);
    assert.equal(await evaluate('window.__checkoutErrors.previews.length'), count);
  });
  for (const [code, message] of [['MIN', 'giá trị tối thiểu'], ['EXPIRED', 'đã hết hạn'], ['MISSING', 'không tồn tại'], ['PRODUCT', 'sản phẩm đã chọn'], ['USER', 'tài khoản'], ['USED', 'hết lượt']]) {
    await test(`${code}: safe specific error, draft retained, no applied badge, no retry loop`, async () => {
      await apply(code);
      assert.ok((await text()).includes(message));
      assert.equal(await evaluate('document.querySelector("#coupon").value'), code);
      assert.equal(await evaluate('document.querySelectorAll(".Toastify__toast--error").length'), 1);
      assert.equal((await text()).includes('SQL secret'), false); await ready();
      const count = await evaluate<number>('window.__checkoutErrors.previews.length'); await delay(100);
      assert.equal(await evaluate('window.__checkoutErrors.previews.length'), count);
      assert.equal(await evaluate('window.__checkoutErrors.orders.length'), 0);
      await clearNotices(); await button('Xóa mã'); await clearNotices(); await ready();
    });
  }
  await test('Valid coupon is confirmed; invalid replacement preserves previous valid code', async () => {
    await apply('GOOD'); assert.ok((await text()).includes('38.800')); await clearNotices();
    await apply('MIN'); assert.ok((await text()).includes('GOOD')); assert.ok((await text()).includes('38.800'));
    await clearNotices(); await button('Xóa mã'); await clearNotices(); await ready(); assert.ok((await text()).includes('39.800'));
  });
  for (const [mode, expected] of [['legacy400', 'chưa hợp lệ'], ['server500', 'Máy chủ gặp lỗi'], ['empty502', 'gateway'], ['timeout', 'thời gian chờ'], ['network', 'kết nối']]) {
    await test(`${mode}: actionable failure without false coupon success or stuck loading`, async () => {
      await evaluate(`window.__checkoutErrors.mode=${JSON.stringify(mode)}`); await apply('GOOD');
      assert.ok((await text()).includes(expected)); assert.equal((await text()).includes('SQL secret'), false);
      await clearNotices(); await evaluate('window.__checkoutErrors.mode=""'); await button('Xóa mã'); await clearNotices(); await ready();
    });
  }
  await test('Editing draft cancels old validation, clears old field errors and preserves the new text', async () => {
    await input('#coupon', 'SLOW'); await button('Sử dụng'); await input('#coupon', 'GOOD');
    await delay(700); await ready();
    assert.equal(await evaluate('document.querySelector("#coupon").value'), 'GOOD');
    assert.equal(await evaluate('document.querySelectorAll(".Toastify__toast").length'), 0);
    assert.equal((await text()).includes('SLOW'), false);
  });
  await test('Shipping cancellation makes slow coupon response silent and ineffective', async () => {
    await evaluate('window.__checkoutErrors.cancelled=0');
    await input('#coupon', 'SLOW'); await button('Sử dụng');
    await evaluate('document.querySelector("input[name=shipping][value=EXPRESS]").click()'); await delay(700); await ready();
    assert.ok((await text()).includes('54.800')); assert.equal(await evaluate('document.querySelectorAll(".Toastify__toast").length'), 0);
    assert.equal(await evaluate('window.__checkoutErrors.cancelled'), 1);
  });
  await test('Failed base preview ends loading, hides old total and blocks even programmatic submit', async () => {
    await evaluate("import('/src/services/queryCache.ts').then(({queryClient})=>queryClient.invalidateQueries({predicate:q=>q.queryKey[2]==='checkoutQuote',refetchType:'none'}))");
    await evaluate('window.__checkoutErrors.mode="empty502";document.querySelector("input[name=shipping][value=STANDARD]").click()');
    await until(async () => (await text()).includes('Chưa tính được'), 'preview error');
    assert.equal((await text()).includes('Đang tính…'), false); assert.equal((await text()).includes('54.800'), false);
    await evaluate('document.querySelector("#checkout-form").requestSubmit()'); assert.equal(await evaluate('window.__checkoutErrors.orders.length'), 0);
    await evaluate('window.__checkoutErrors.mode=""'); await button('Thử lại'); await ready();
  });
  await test('Rapid shipping changes cannot overwrite the newest quote', async () => {
    await evaluate("import('/src/services/queryCache.ts').then(({queryClient})=>queryClient.invalidateQueries({predicate:q=>q.queryKey[2]==='checkoutQuote',refetchType:'none'}))");
    await evaluate('window.__checkoutErrors.mode="race";document.querySelector("input[name=shipping][value=EXPRESS]").click()'); await ready();
    await evaluate('document.querySelector("input[name=shipping][value=STANDARD]").click()'); await delay(30);
    await evaluate('document.querySelector("input[name=shipping][value=EXPRESS]").click()'); await delay(700); await ready();
    assert.ok((await text()).includes('54.800')); await evaluate('window.__checkoutErrors.mode=""');
  });
  for (const width of [320, 390, 768, 1440]) {
    await test(`Responsive summary at ${width}px`, async () => {
      await browser.send('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: width < 768 });
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
    });
  }
  await test('Address validation stays inline; order 400 preserves draft; 502 locks duplicate writes', async () => {
    await evaluate('document.querySelector("#checkout-form").requestSubmit()'); assert.equal(await evaluate('window.__checkoutErrors.orders.length'), 0);
    for (const [field, value] of [['address-level1', 'HCM'], ['address-level3', 'Phường kiểm thử'], ['street-address', 'Địa chỉ kiểm thử']]) await input(`[autocomplete="${field}"]`, value);
    await evaluate('document.querySelector("#checkout-form").requestSubmit()');
    await until(() => evaluate('window.__checkoutErrors.orders.length===1 && !!document.querySelector(".Toastify__toast--error")'), 'definite failure');
    assert.equal(await evaluate('document.querySelector("[autocomplete=street-address]").value'), 'Địa chỉ kiểm thử'); await ready(); await clearNotices();
    await evaluate('window.__checkoutErrors.mode="order502";document.querySelector("#checkout-form").requestSubmit()');
    await until(() => evaluate('!!document.querySelector(".Toastify__toast--warning")'), 'uncertain order warning');
    await evaluate('document.querySelector("#checkout-form").requestSubmit()'); assert.equal(await evaluate('window.__checkoutErrors.orders.length'), 2);
    assert.equal(await enabled(), false); assert.ok((await text()).includes('Kiểm tra lịch sử đơn hàng'));
  });
  assert.deepEqual(browser.exceptions, []);
  console.log(`${passed} checkout error browser checks passed (mock API only).`);
} finally { await browser.close(); await vite.close(); }
