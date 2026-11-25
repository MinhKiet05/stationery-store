import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { createAdminVerification, DEFAULT_ADMIN_VERIFICATION_TTL_MS } from './adminVerification';
import { dashboardIdentity } from './dashboardApi';
import { notify } from '../utils/notifications';
import { sessionScope, clearAdminQueries } from './queryCache';

const configuredTtl = Number(import.meta.env.VITE_ADMIN_VERIFICATION_TTL_MS ?? DEFAULT_ADMIN_VERIFICATION_TTL_MS);
export const ADMIN_VERIFICATION_TTL_MS = Number.isFinite(configuredTtl) && configuredTtl >= 1000 && configuredTtl <= 2147483647 ? configuredTtl : DEFAULT_ADMIN_VERIFICATION_TTL_MS;
export const adminSession = createAdminVerification({
  readToken: () => localStorage.getItem('accessToken'),
  verify: (_token, signal) => dashboardIdentity(signal),
  ttlMs: ADMIN_VERIFICATION_TTL_MS,
  isVisible: () => document.visibilityState === 'visible',
});

// App lifetime listeners also clear the cache on logout outside Dashboard.
export function useAdminSessionEvents() {
  useEffect(() => {
    const sync = () => { sessionScope(); adminSession.syncSession(); };
    const storage = event => { if (event.key === 'accessToken' || event.key === null) sync(); };
    const activity = () => { sessionScope(); adminSession.onActivity(); };
    window.addEventListener('auth-changed', sync);
    window.addEventListener('storage', storage);
    window.addEventListener('focus', activity);
    document.addEventListener('visibilitychange', activity);
    sync();
    return () => {
      window.removeEventListener('auth-changed', sync);
      window.removeEventListener('storage', storage);
      window.removeEventListener('focus', activity);
      document.removeEventListener('visibilitychange', activity);
    };
  }, []);
}

export function useAdminVerification() {
  const state = useSyncExternalStore(adminSession.subscribe, adminSession.getSnapshot);
  const token = state.token;
  useEffect(() => { if (['forbidden', 'unauthorized', 'anonymous'].includes(state.status)) clearAdminQueries(); }, [state.status]);
  const onAccessDenied = useCallback(() => {
    // A business endpoint's 403 is not proof that the ADMIN role was revoked.
    adminSession.checkAccess(token).then(stillAdmin => {
      if (stillAdmin) notify.error('Bạn không có quyền thực hiện thao tác này.', 'Bạn không có quyền thực hiện thao tác này.');
    });
  }, [token]);
  useEffect(() => {
    if (state.status === 'ready' && state.error) notify.warning('Chưa thể xác minh lại quyền quản trị. Vui lòng kiểm tra kết nối.');
  }, [state.status, state.error]);
  return { ...state, onAccessDenied, retry: adminSession.retry };
}
