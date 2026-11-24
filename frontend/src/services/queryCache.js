import { QueryClient } from '@tanstack/react-query';
export const cacheTimes = { categories: 900000, vendors: 900000, products: 180000, productDetail: 120000,
  reviews: 120000, vouchers: 60000, cart: 30000, orders: 30000, returns: 30000, inventory: 15000,
  currentUser: 300000, dashboardStatistics: 60000, users: 30000 };
export const retryRead = (count, error) => count < 1 && error?.name !== 'AbortError' &&
  (!error?.status || [408, 429, 502, 503, 504].includes(error.status));
export const queryClient = new QueryClient({ defaultOptions: {
  queries: { staleTime: 60000, gcTime: 900000, refetchOnWindowFocus: true, refetchOnReconnect: true, retry: retryRead },
  mutations: { retry: false },
} });
let token, generation = 0;
const listeners = new Set();
const readToken = () => globalThis.localStorage?.getItem('accessToken') ?? null;
export function sessionScope() {
  const next = readToken();
  if (next !== token) {
    token = next; generation++;
    void queryClient.cancelQueries({ predicate: q => q.queryKey[0] === 'session' });
    queryClient.removeQueries({ predicate: q => q.queryKey[0] === 'session' });
    queryClient.getMutationCache().clear();
    // getSnapshot may detect an external storage change during render. Notify other trees after this render.
    queueMicrotask(() => { for (const listener of listeners) listener(); });
  }
  return `session-${generation}`;
}
export const subscribeSession = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export function clearAdminQueries() {
  const predicate = q => q.queryKey[0] === 'session' && q.queryKey[2] === 'admin';
  void queryClient.cancelQueries({ predicate }); queryClient.removeQueries({ predicate });
}
export const queryKeys = {
  public: (resource, params = {}) => ['public', resource, params],
  private: (resource, params = {}, scope = sessionScope()) => ['session', scope, resource, params],
  admin: (path, scope = sessionScope()) => ['session', scope, 'admin', canonicalPath(path)],
};
export function canonicalPath(path) {
  const [pathname, search = ''] = path.split('?');
  const params = new URLSearchParams(search); params.sort();
  return `${pathname}${params.size ? `?${params}` : ''}`;
}
export function resourceTime(path) {
  if (/statistics/.test(path)) return cacheTimes.dashboardStatistics;
  if (/low-stock|product-variants/.test(path)) return cacheTimes.inventory;
  if (/orders/.test(path)) return cacheTimes.orders;
  if (/returns/.test(path)) return cacheTimes.returns;
  if (/products/.test(path)) return cacheTimes.products;
  if (/reviews/.test(path)) return cacheTimes.reviews;
  if (/users/.test(path)) return cacheTimes.users;
  return 60000;
}
// Inactive pages are marked stale, active widgets refresh through their existing callbacks.
export function invalidateBusiness(path, scope = sessionScope()) {
  if (scope !== sessionScope()) return;
  const category = /\/product-types(?:\/|$)/.test(path), vendor = /\/vendors(?:\/|$)/.test(path);
  const product = /products|product-variants/.test(path) || category || vendor;
  const order = /orders/.test(path), returns = /returns/.test(path);
  const stock = product || /restock/.test(path) || order;
  const resources = new Set([
    ...(category ? ['categories'] : []), ...(vendor ? ['vendors'] : []),
    ...(product || stock ? ['products', 'productDetail', 'inventory'] : []),
    ...(order || returns ? ['orders', 'returns'] : []),
    ...(order || /cart/.test(path) ? ['cart', 'recommendations'] : []),
    ...(/promotions|coupons/.test(path) || order ? ['vouchers'] : []),
    ...(/reviews/.test(path) ? ['reviews', 'products', 'productDetail'] : []),
    ...(/users/.test(path) ? ['users', 'currentUser', 'profile'] : []),
  ]);
  void queryClient.invalidateQueries({ predicate: q => {
    const key = q.queryKey;
    if (key[0] === 'public') return resources.has(key[1]);
    if (key[0] !== 'session' || key[1] !== scope) return false;
    if (key[2] !== 'admin') return resources.has(key[2]);
    const endpoint = key[3];
    const overview = /^\/api\/admin\/statistics\//.test(endpoint) && (product || order || returns || /users/.test(path));
    return overview || [...resources].some(r => endpoint.includes(r === 'vouchers' ? 'promotions' : r)) || stock && /low-stock/.test(endpoint);
  }, refetchType: 'none' });
}
let timer, prefetchBusy = false;
export function schedulePrefetch(options, allowed = () => true) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (prefetchBusy || !allowed()) return;
    prefetchBusy = true;
    try { await queryClient.prefetchQuery(options); } finally { prefetchBusy = false; }
  }, 180);
}
export const cancelPrefetch = () => clearTimeout(timer);
