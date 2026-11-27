import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { createServer } from 'vite';

const original = { fetch: globalThis.fetch, window: globalThis.window, storage: globalThis.localStorage, apiBase: process.env.VITE_API_BASE_URL };
const values = new Map<string, string>();
let vite: Awaited<ReturnType<typeof createServer>>;
let api: typeof import('../src/services/api.ts');
let errors: typeof import('../src/services/apiError.ts');
let notices: typeof import('../src/utils/notifications.ts');
let checkout: typeof import('../src/services/checkoutService.ts');
let cache: typeof import('../src/services/queryCache.ts');
const events = new EventTarget();
before(async () => {
  process.env.VITE_API_BASE_URL = '';
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: events });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } });
  vite = await createServer({ server: { middlewareMode: true } });
  api = await vite.ssrLoadModule('/src/services/api.ts');
  errors = await vite.ssrLoadModule('/src/services/apiError.ts');
  notices = await vite.ssrLoadModule('/src/utils/notifications.ts');
  checkout = await vite.ssrLoadModule('/src/services/checkoutService.ts');
  cache = await vite.ssrLoadModule('/src/services/queryCache.ts');
});
afterEach(() => { cache.queryClient.clear(); values.clear(); globalThis.fetch = original.fetch; });
after(async () => {
  await vite?.close(); globalThis.fetch = original.fetch;
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: original.window });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original.storage });
  if (original.apiBase === undefined) delete process.env.VITE_API_BASE_URL; else process.env.VITE_API_BASE_URL = original.apiBase;
});

for (const status of [400, 401, 403, 404, 408, 409, 413, 422, 429, 500, 502, 503, 504]) {
  test(`HTTP ${status} gets a safe status-specific message, never a fake network error`, async () => {
    globalThis.fetch = async () => Response.json({ status, error: 'SQL secret=hidden', timestamp: 'synthetic' }, { status });
    await assert.rejects(api.api('/api/checkout/preview'), (error: unknown) => {
      assert.ok(error instanceof api.ApiError); assert.equal(error.status, status);
      assert.equal(error.message, errors.httpMessages[status]); assert.equal(error.message.includes('SQL'), false);
      return true;
    });
  });
}
test('Business code wins over unsafe detail and the legacy generic message', async () => {
  globalThis.fetch = async () => Response.json({ code: 'COUPON_MINIMUM_NOT_MET', detail: 'SQL secret=hidden' }, { status: 400 });
  await assert.rejects(api.api('/api/checkout/preview'), (error: unknown) => {
    assert.ok(error instanceof api.ApiError); assert.equal(error.code, 'COUPON_MINIMUM_NOT_MET');
    assert.equal(notices.userMessage(error, 'fallback'), errors.businessMessages.COUPON_MINIMUM_NOT_MET); return true;
  });
  assert.equal(notices.userMessage({ message: 'Không thể kết nối cửa hàng. Vui lòng thử lại.', detail: 'Don hang chua dat gia tri toi thieu' }, 'fallback'), errors.businessMessages.COUPON_MINIMUM_NOT_MET);
  assert.equal(notices.userMessage({ code: 'constructor', detail: 'SQL secret' }, 'fallback'), 'fallback');
});
test('Empty gateway body is handled safely', async () => {
  globalThis.fetch = async () => new Response(null, { status: 502 });
  await assert.rejects(api.api('/api/checkout/preview'), (error: unknown) => error instanceof api.ApiError && error.status === 502 && error.detail === undefined);
});
test('Admin context messages retain the original cancellation/session ownership', () => {
  assert.equal(notices.notify.error('Không thể lưu dữ liệu.', 'Không thể lưu dữ liệu.', new DOMException('Cancelled', 'AbortError')), undefined);
  const handled = new api.ApiError('Vui lòng đăng nhập lại.', 401, undefined, true);
  assert.equal(notices.notify.error('Không thể xuất Excel.', 'Không thể xuất Excel.', handled), undefined);
});
test('Endpoint-specific registration and login messages survive legacy envelopes', async () => {
  globalThis.fetch = async () => Response.json({ status: 400, error: 'Bad Request' }, { status: 400 });
  await assert.rejects(api.api('/api/auth/register'), (error: unknown) => error instanceof api.ApiError && error.message.includes('đăng ký'));
  globalThis.fetch = async () => Response.json({}, { status: 401 });
  await assert.rejects(api.api('/api/auth/login'), (error: unknown) => error instanceof api.ApiError && error.message.includes('mật khẩu không đúng'));
});
test('Network, timeout and intentional cancellation stay distinct; cancellation is silent', async () => {
  for (const error of [new TypeError('Failed to fetch'), new DOMException('Timed out', 'TimeoutError'), new DOMException('Cancelled', 'AbortError')]) {
    globalThis.fetch = async () => { throw error; };
    await assert.rejects(api.api('/api/checkout/preview'), candidate => candidate === error);
    if (error.name === 'AbortError') assert.equal(notices.notify.error(error, 'Unexpected notification'), undefined);
    else assert.ok(notices.userMessage(error, 'fallback').includes(error.name === 'TimeoutError' ? 'thời gian chờ' : 'kết nối'));
  }
});
test('Concurrent 401 responses change session only once and suppress stale action errors', async () => {
  values.set('accessToken', 'synthetic-expired'); let changed = 0;
  const listener = () => changed++; events.addEventListener('auth-changed', listener);
  globalThis.fetch = async () => Response.json({}, { status: 401 });
  const results = await Promise.allSettled([api.api('/api/users/me'), api.api('/api/users/me')]);
  assert.equal(changed, 1); assert.equal(values.has('accessToken'), false);
  for (const result of results) {
    assert.equal(result.status, 'rejected');
    if (result.status === 'rejected') assert.ok(errors.errorName(result.reason) === 'AbortError' || result.reason.notificationHandled === true);
  }
  events.removeEventListener('auth-changed', listener);
});
test('Broken quote contracts never reach summary as NaN or undefined', async () => {
  for (const body of [{}, { subTotal: 14800, discountAmount: 0, shippingFee: '25000', totalAmount: null, couponCode: null, shippingMethod: 'STANDARD' }]) {
    globalThis.fetch = async () => Response.json(body);
    await assert.rejects(checkout.previewCheckout('STANDARD', ''));
  }
});
