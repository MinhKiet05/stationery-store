import { before, after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let vite, redirect, api, auth, cache, orders;
const saved = { fetch: globalThis.fetch, localStorage: globalThis.localStorage, window: globalThis.window };
const storage = new Map();
before(async () => {
  process.env.VITE_API_BASE_URL = '';
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  };
  globalThis.window = new EventTarget();
  vite = await createServer({ server: { middlewareMode: true } });
  redirect = await vite.ssrLoadModule('/src/utils/loginRedirect.ts');
  api = await vite.ssrLoadModule('/src/services/api.ts');
  auth = await vite.ssrLoadModule('/src/services/authService.ts');
  cache = await vite.ssrLoadModule('/src/services/queryCache.ts');
  orders = await vite.ssrLoadModule('/src/services/orderService.ts');
});
afterEach(() => { storage.clear(); cache.queryClient.clear(); globalThis.fetch = saved.fetch; });
after(async () => { await vite?.close(); Object.assign(globalThis, saved); });

test('login restores router state (object or string) before query, preserving order, search and hash', () => {
  const { loginRedirect } = redirect;
  assert.equal(loginRedirect({ pathname: '/orders/42/return', search: '?source=history', hash: '#items' }, '?redirect=/'), '/orders/42/return?source=history#items');
  assert.equal(loginRedirect('/returns/new?orderId=42', ''), '/returns/new?orderId=42');
  assert.equal(loginRedirect(null, '?redirect=%2Freturns%2Fnew%3ForderId%3D42'), '/returns/new?orderId=42');
  assert.equal(loginRedirect(undefined, ''), '/');
});
test('login rejects external schemes, protocol-relative URLs, backslashes and control characters from both sources', () => {
  for (const target of ['https://evil.test', '//evil.test', '/\\evil.test', '/\n/evil.test', '/\t/evil.test', 'javascript:alert(1)']) {
    assert.equal(redirect.loginRedirect(target, ''), '/');
    assert.equal(redirect.loginRedirect({ pathname: target }, ''), '/');
    assert.equal(redirect.loginRedirect(null, `?redirect=${encodeURIComponent(target)}`), '/');
  }
  assert.equal(redirect.loginRedirect({ pathname: '//evil.test' }, '?redirect=/returns'), '/returns');
});
test('order history omits absent optional parameters instead of serializing undefined', async () => {
  globalThis.fetch = async path => {
    assert.equal(path, '/api/orders/my-orders?page=0&size=4');
    return Response.json({ content: [], totalElements: 0, totalPages: 0 });
  };
  await orders.getMyOrderHistory({ page: 0, size: 4, status: '', search: undefined });
});
for (const status of [400, 401, 403, 409, 429]) {
  test(`return API preserves ApiError contract for HTTP ${status}`, async () => {
    storage.set('accessToken', 'token');
    globalThis.fetch = async (_path, options) => {
      assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer token');
      return Response.json({ detail: 'So luong tra vuot qua so luong con lai' }, { status });
    };
    await assert.rejects(api.api('/api/returns', { method: 'POST', body: '{}' }), error => {
      assert.ok(error instanceof api.ApiError);
      assert.equal(error.status, status);
      assert.equal(error.detail, 'So luong tra vuot qua so luong con lai');
      assert.equal(error.notificationHandled, status === 401);
      return true;
    });
    assert.equal(storage.get('accessToken'), status === 401 ? undefined : 'token');
  });
}
for (const success of [true, false]) {
  test(`login ${success ? 'merges then clears' : 'retains'} guest cart when merge ${success ? 'succeeds' : 'fails'}`, async () => {
    const guest = [{ variantID: 101, quantity: 2 }];
    storage.set('stationery_guest_cart', JSON.stringify(guest));
    const merged = { items: [{ variantID: 101, quantity: 3 }], subtotal: 300 };
    globalThis.fetch = async (path, options) => {
      if (path === '/api/auth/login') {
        assert.equal(new Headers(options.headers).has('Authorization'), false);
        return Response.json({ accessToken: 'new-session', user: { userID: 24 } });
      }
      assert.equal(path, '/api/cart/merge');
      assert.deepEqual(JSON.parse(options.body), { items: guest });
      assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer new-session');
      assert.equal(storage.has('stationery_guest_cart'), true, 'cart must survive until server confirms');
      return Response.json(merged, { status: success ? 200 : 409 });
    };
    assert.equal((await auth.login('customer', 'password')).cartSynced, success);
    assert.equal(storage.get('accessToken'), 'new-session');
    assert.equal(storage.get('stationery_guest_cart'), success ? undefined : JSON.stringify(guest));
    if (success) assert.deepEqual(cache.queryClient.getQueryData(cache.queryKeys.private('cart')), merged);
  });
}
