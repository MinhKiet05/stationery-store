import test, { before, after } from 'node:test';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
let server, createAdminVerification;
before(async () => {
  server = await createServer({ server: { middlewareMode: true, hmr: false } });
  ({ createAdminVerification } = await server.ssrLoadModule('/src/services/adminVerification.ts'));
});
after(async () => { await server?.close(); });

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function fixture(ttlMs = 300000) {
  let token = 'session-A', time = 1000, visible = true, next = 0;
  const requests = [], timers = new Map();
  const store = createAdminVerification({ readToken: () => token, ttlMs, retryDelayMs: 30000, now: () => time, isVisible: () => visible,
    setTimer(fn, delay) { const id = ++next; timers.set(id, { fn, at: time + delay }); return id; }, clearTimer: id => timers.delete(id),
    verify(token, signal) { return new Promise((resolve, reject) => requests.push({ token, signal, resolve, reject })); },
  });
  return { store, requests, timers, setToken(value) { token = value; store.syncSession(); },
    setVisible(value) { visible = value; store.onActivity(); },
    advance(ms) { time += ms; for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.fn(); } },
    async ready() { await flush(); requests.at(-1).resolve({ role: 'ADMIN', username: token }); await flush(); },
  };
}

test('StrictMode resubscribe and multiple consumers share one initial request', async () => {
  const f = fixture(); const off = f.store.subscribe(() => {}); off(); f.store.subscribe(() => {}); f.store.subscribe(() => {});
  await flush(); assert.equal(f.requests.length, 1); assert.equal(f.requests[0].signal.aborted, false);
  assert.equal(f.store.getSnapshot().status, 'initial'); await f.ready(); assert.equal(f.store.getSnapshot().status, 'ready');
});
test('Fresh cache survives route-like resubscriptions, renders and repeated focus with no requests', async () => {
  const f = fixture(); let off = f.store.subscribe(() => {}); await f.ready(); const admin = f.store.getSnapshot().admin;
  for (let i = 0; i < 30; i++) { off(); off = f.store.subscribe(() => {}); f.store.onActivity(); f.store.syncSession(); }
  await flush(); assert.equal(f.requests.length, 1); assert.equal(f.store.getSnapshot().admin, admin); assert.equal(f.timers.size, 1);
});
test('One TTL deadline starts background verification without dropping the last verified identity', async () => {
  const f = fixture(100); f.store.subscribe(() => {}); await f.ready(); const first = f.store.getSnapshot();
  f.advance(100); f.store.onActivity(); f.store.onActivity(); await flush();
  assert.equal(f.requests.length, 2); assert.equal(f.store.getSnapshot().status, 'ready'); assert.equal(f.store.getSnapshot().admin, first.admin);
  assert.equal(f.store.getSnapshot().checking, true); await f.ready(); assert.equal(f.store.getSnapshot().verifiedAt, 1100); assert.equal(f.timers.size, 1);
});
test('Hidden tab suspends the deadline and visible plus focus coalesce into one stale revalidation', async () => {
  const f = fixture(100); f.store.subscribe(() => {}); await f.ready(); f.setVisible(false); f.advance(1000); await flush(); assert.equal(f.requests.length, 1);
  f.setVisible(true); f.store.onActivity(); f.store.onActivity(); await flush(); assert.equal(f.requests.length, 2); await f.ready();
});
test('Logout clears cache even without Dashboard subscribers; logging in with the same token verifies again', async () => {
  const f = fixture(); const off = f.store.subscribe(() => {}); await f.ready(); off(); assert.equal(f.timers.size, 0);
  f.setToken(null); assert.equal(f.store.getSnapshot().admin, null); f.setToken('session-A'); f.store.subscribe(() => {}); await flush();
  assert.equal(f.requests.length, 2); assert.equal(f.store.getSnapshot().status, 'initial');
});
test('Account switch aborts old request and ignores its late success and failure', async () => {
  const f = fixture(); f.store.subscribe(() => {}); await flush(); const old = f.requests[0]; f.setToken('session-B'); await flush();
  assert.equal(old.signal.aborted, true); assert.equal(f.store.getSnapshot().admin, null); await f.ready(); old.resolve({ role: 'ADMIN', username: 'old' }); await flush();
  assert.equal(f.store.getSnapshot().admin.username, 'session-B');
  const g = fixture(); g.store.subscribe(() => {}); await flush(); const stale = g.requests[0]; g.setToken('session-B'); await g.ready(); stale.reject({ status: 401 }); await flush();
  assert.equal(g.store.getSnapshot().status, 'ready'); assert.equal(g.store.getSnapshot().admin.username, 'session-B');
});
test('A reused token after account switching cannot accept an earlier generation response', async () => {
  const f = fixture(); f.store.subscribe(() => {}); await flush(); const old = f.requests[0]; f.setToken('session-B'); f.setToken('session-A'); await f.ready();
  old.resolve({ role: 'CUSTOMER' }); await flush(); assert.equal(f.store.getSnapshot().status, 'ready'); assert.equal(f.requests.length, 2);
});
test('Backend 401 and 403 revoke cached ADMIN without an automatic retry loop', async () => {
  for (const code of [401, 403]) {
    const f = fixture(100); f.store.subscribe(() => {}); await f.ready(); f.advance(100); await flush(); f.requests[1].reject({ status: code }); await flush();
    assert.equal(f.store.getSnapshot().status, code === 401 ? 'unauthorized' : 'forbidden'); assert.equal(f.store.getSnapshot().admin, null);
    for (let i = 0; i < 20; i++) f.store.onActivity(); await flush(); assert.equal(f.requests.length, 2); assert.equal(f.timers.size, 0);
  }
});
test('A CUSTOMER identity is never promoted by cached or client-side declarations', async () => {
  const f = fixture(); f.store.subscribe(() => {}); await flush(); f.requests[0].resolve({ role: 'CUSTOMER' }); await flush();
  assert.equal(f.store.getSnapshot().status, 'forbidden'); assert.equal(f.store.getSnapshot().admin, null);
});
test('Initial network failure remains unverified; retry is explicit and never invents ADMIN', async () => {
  const f = fixture(); f.store.subscribe(() => {}); await flush(); f.requests[0].reject(new TypeError('network')); await flush();
  assert.equal(f.store.getSnapshot().status, 'error'); assert.equal(f.store.getSnapshot().verifiedAt, 0);
  const retry = f.store.retry(); await f.ready(); await retry; assert.equal(f.store.getSnapshot().status, 'ready');
});
test('Background network failure preserves only the old proof, does not renew TTL or poll, and throttles focus retries', async () => {
  const f = fixture(100); f.store.subscribe(() => {}); await f.ready(); const verifiedAt = f.store.getSnapshot().verifiedAt;
  f.advance(100); await flush(); f.requests[1].reject(new TypeError('timeout')); await flush();
  assert.equal(f.store.getSnapshot().status, 'ready'); assert.equal(f.store.getSnapshot().error, 'network'); assert.equal(f.store.getSnapshot().verifiedAt, verifiedAt); assert.equal(f.timers.size, 0);
  for (let i = 0; i < 20; i++) f.store.onActivity(); await flush(); assert.equal(f.requests.length, 2);
  f.advance(30000); f.store.onActivity(); await f.ready(); assert.equal(f.requests.length, 3); assert.equal(f.store.getSnapshot().error, null);
});
test('Business 403 triggers a deduplicated identity read, retains ADMIN if confirmed, and revokes only on backend role change', async () => {
  const f = fixture(); f.store.subscribe(() => {}); await f.ready();
  const checks = [f.store.checkAccess('session-A'), f.store.checkAccess('session-A'), f.store.checkAccess('session-A')]; await f.ready();
  assert.deepEqual(await Promise.all(checks), [true, false, false]); assert.equal(f.requests.length, 2); assert.equal(f.store.getSnapshot().status, 'ready');
  f.advance(1001); const revoke = f.store.checkAccess('session-A'); await flush(); f.requests.at(-1).resolve({ role: 'CUSTOMER' }); await revoke;
  assert.equal(f.store.getSnapshot().status, 'forbidden'); assert.equal(await f.store.checkAccess('old-session'), false);
});
