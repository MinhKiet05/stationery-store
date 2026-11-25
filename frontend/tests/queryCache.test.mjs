import { test, before, after, afterEach } from 'node:test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
let server, client, keys, sessionScope, clearAdminQueries, retryRead, invalidateBusiness, schedulePrefetch, cancelPrefetch;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false } });
  ({ queryClient: client, queryKeys: keys, sessionScope, clearAdminQueries, retryRead, invalidateBusiness, schedulePrefetch, cancelPrefetch } = await server.ssrLoadModule('/src/services/queryCache.ts'));
});
after(async () => { await server?.close(); });
let token = 'A'; globalThis.localStorage = { getItem: () => token };
afterEach(() => client.clear());
test('fresh identical keys deduplicate concurrent reads and reuse cache; parameters stay isolated', async () => {
  let calls = 0;
  const options = { queryKey: keys.public('products', { page: 0, size: 12, sort: 'price,asc' }), queryFn: async () => { calls++; return ['real-result']; } };
  await Promise.all([client.fetchQuery(options), client.fetchQuery(options)]);
  await client.fetchQuery(options); assert.equal(calls, 1);
  await client.fetchQuery({ ...options, queryKey: keys.public('products', { page: 1, size: 12, sort: 'price,asc' }) });
  assert.equal(calls, 2);
});
test('401/403/404/validation/conflict never retry; transient retries at most once', () => {
  for (const status of [400,401,403,404,409,422]) assert.equal(retryRead(0,{ status }), false);
  for (const status of [408,429,502,503,504]) { assert.equal(retryRead(0,{ status }), true); assert.equal(retryRead(1,{ status }), false); }
  assert.equal(retryRead(0,{ name: 'AbortError' }), false);
});
test('session switch aborts old private request, removes private data and rejects late hydration', async () => {
  const before = sessionScope(), key = keys.private('orders', {}, before); let finish, aborted = false;
  client.setQueryData(keys.private('profile'), { name: 'A' });
  client.setQueryData(keys.public('categories'), ['public']);
  const pending = client.fetchQuery({ queryKey: key, queryFn: ({ signal }) => new Promise(resolve => {
    finish = resolve; signal.addEventListener('abort', () => { aborted = true; });
  }) }).catch(() => null);
  token = 'B'; const after = sessionScope();
  finish(['old private']); await pending;
  assert.notEqual(after, before); assert.equal(aborted, true); assert.equal(client.getQueryData(key), undefined);
  assert.deepEqual(client.getQueryData(keys.public('categories')), ['public']);
  assert.equal(JSON.stringify(client.getQueryCache().getAll().map(q=>q.queryKey)).includes('accessToken'), false);
  token = null; sessionScope(); token = 'B'; assert.notEqual(sessionScope(), after);
});
test('role revocation clears only admin data while keeping customer/public scopes', () => {
  const admin = keys.admin('/api/admin/orders?page=0&size=10'); client.setQueryData(admin, ['private']);
  const cart = keys.private('cart'); client.setQueryData(cart, ['cart']);
  clearAdminQueries(); assert.equal(client.getQueryData(admin), undefined); assert.deepEqual(client.getQueryData(cart), ['cart']);
});
test('write invalidation follows business dependencies, including inactive pages, without blanket eviction', () => {
  const product = keys.public('products', { page: 4 }), inventory = keys.public('inventory', { id: 8 });
  const category = keys.public('categories'), order = keys.admin('/api/admin/orders?page=5');
  const vouchers = keys.admin('/api/admin/promotions?page=0');
  for (const key of [product,inventory,category,order,vouchers]) client.setQueryData(key, ['existing']);
  invalidateBusiness('/api/admin/returns/2/status');
  assert.equal(client.getQueryState(order).isInvalidated, true);
  assert.equal(client.getQueryState(inventory).isInvalidated, false);
  assert.equal(client.getQueryState(category).isInvalidated, false);
  assert.equal(client.getQueryState(vouchers).isInvalidated, false);
  invalidateBusiness('/api/admin/returns/2/restock'); assert.equal(client.getQueryState(inventory).isInvalidated, true);
  invalidateBusiness('/api/coupons/1'); assert.equal(client.getQueryState(vouchers).isInvalidated, true);
});
test('canonical admin paths share cache independent of parameter order, with range and pagination isolation', () => {
  assert.deepEqual(keys.admin('/api/admin/orders?size=10&page=0'),keys.admin('/api/admin/orders?page=0&size=10'));
  assert.notDeepEqual(keys.admin('/api/admin/orders?page=0'),keys.admin('/api/admin/orders?page=1'));
});

test('taxonomy writes invalidate catalog labels and related products without clearing unrelated data', () => {
  const categories = keys.public('categories'), vendors = keys.public('vendors');
  const products = keys.public('products'), detail = keys.public('productDetail', { id: 1 });
  for (const key of [categories, vendors, products, detail]) client.setQueryData(key, ['old']);
  invalidateBusiness('/api/product-types/1');
  for (const key of [categories, products, detail]) assert.equal(client.getQueryState(key).isInvalidated, true);
  assert.equal(client.getQueryState(vendors).isInvalidated, false);
  invalidateBusiness('/api/vendors/2');
  assert.equal(client.getQueryState(vendors).isInvalidated, true);
});

test('hover prefetch coalesces rapid intents, reuses fresh data and checks access before fetching', async () => {
  let reads=0; const options={queryKey:keys.public('products',{prefetch:true}), queryFn:async()=>{reads++;return ['server'];}};
  for(let i=0;i<30;i++) schedulePrefetch(options);
  await new Promise(resolve=>setTimeout(resolve,230)); assert.equal(reads,1);
  schedulePrefetch(options); await new Promise(resolve=>setTimeout(resolve,230)); assert.equal(reads,1);
  schedulePrefetch({...options,queryKey:keys.admin('/api/admin/orders')},()=>false);
  await new Promise(resolve=>setTimeout(resolve,230)); assert.equal(reads,1); cancelPrefetch();
});
