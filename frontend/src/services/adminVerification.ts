import type { AdminIdentity } from './adminTypes';
import { errorStatus } from './apiError';

export type VerificationStatus = 'initial' | 'anonymous' | 'ready' | 'forbidden' | 'unauthorized' | 'error';
export type VerificationState<TIdentity> = {
  token: string | null; status: VerificationStatus; admin: TIdentity | null;
  verifiedAt: number; checking: boolean; error: 'network' | null;
};
type TimerHandle = ReturnType<typeof setTimeout> | number;
export type AdminVerificationOptions<TIdentity> = {
  readToken: () => string | null;
  verify: (token: string, signal: AbortSignal) => Promise<TIdentity>;
  ttlMs?: number; retryDelayMs?: number; now?: () => number; isVisible?: () => boolean;
  setTimer?: (callback: () => void, delay: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
};
type PendingVerification = {
  token: string; generation: number; controller: AbortController; promise: Promise<void> | null;
};

// One in-memory result and one request per login session. Never trust a stored role.
export const DEFAULT_ADMIN_VERIFICATION_TTL_MS = 300000;
export function createAdminVerification<TIdentity extends { role: string } = AdminIdentity>({ readToken, verify, ttlMs = DEFAULT_ADMIN_VERIFICATION_TTL_MS, retryDelayMs = 30000,
  now = Date.now, isVisible = () => true, setTimer = setTimeout, clearTimer = clearTimeout }: AdminVerificationOptions<TIdentity>) {
  const initial = (token: string | null): VerificationState<TIdentity> => ({ token, status: token ? 'initial' : 'anonymous', admin: null, verifiedAt: 0, checking: false, error: null });
  let state = initial(readToken());
  let request: PendingVerification | null = null;
  let timer: TimerHandle | null = null;
  let generation = 0, retryAt = 0, denialAt = -Infinity;
  const listeners = new Set<() => void>();
  const clearDeadline = () => { if (timer != null) clearTimer(timer); timer = null; };
  function arm() {
    clearDeadline();
    if (!listeners.size || !isVisible() || state.status !== 'ready' || state.checking || state.error) return;
    timer = setTimer(() => { timer = null; ensure(); }, Math.max(1, state.verifiedAt + ttlMs - now()));
  }
  function publish(next: VerificationState<TIdentity>): void { state = next; for (const listener of listeners) listener(); arm(); }
  function synchronize() {
    const token = readToken();
    if (token === state.token) return;
    generation++; request?.controller.abort(); request = null; retryAt = 0; denialAt = -Infinity;
    publish(initial(token));
  }
  function current(pending: PendingVerification): boolean {
    const changed = readToken() !== state.token;
    synchronize();
    if (changed && listeners.size) ensure();
    return request === pending && pending.generation === generation && pending.token === state.token;
  }
  function ensure(force = false): Promise<VerificationState<TIdentity> | void> | null {
    synchronize();
    if (!state.token) return Promise.resolve(state);
    if (request) return request.promise;
    if (!force && (['forbidden', 'unauthorized'].includes(state.status) || now() < retryAt ||
      state.status === 'ready' && now() - state.verifiedAt < ttlMs)) { arm(); return Promise.resolve(state); }
    const pending: PendingVerification = { token: state.token, generation, controller: new AbortController(), promise: null };
    request = pending;
    publish({ ...state, status: state.admin ? 'ready' : 'initial', checking: true, error: null });
    pending.promise = Promise.resolve().then(() => {
      pending.controller.signal.throwIfAborted();
      return verify(pending.token, pending.controller.signal);
    }).then(admin => {
      if (!current(pending)) return;
      retryAt = 0;
      publish({ ...state, status: admin.role === 'ADMIN' ? 'ready' : 'forbidden', admin: admin.role === 'ADMIN' ? admin : null,
        verifiedAt: now(), checking: false, error: null });
    }).catch((error: unknown) => {
      if (!current(pending) || pending.controller.signal.aborted) return;
      const status = errorStatus(error);
      if (status === 401 || status === 403) {
        publish({ ...state, status: status === 401 ? 'unauthorized' : 'forbidden', admin: null, verifiedAt: 0, checking: false, error: null });
      } else {
        // A failed read never renews the last confirmed identity's timestamp.
        // No polling after failure; retry on a later activity event or explicit retry.
        retryAt = now() + retryDelayMs;
        publish({ ...state, status: state.admin ? 'ready' : 'error', checking: false, error: 'network' });
      }
    }).finally(() => { if (current(pending)) { request = null; arm(); } });
    return pending.promise;
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener); ensure(); arm();
      return () => { listeners.delete(listener); if (!listeners.size) clearDeadline(); };
    },
    syncSession() { synchronize(); if (listeners.size) ensure(); },
    onActivity() { synchronize(); if (listeners.size && isVisible()) ensure(); else arm(); },
    retry: () => ensure(true),
    async checkAccess(token: string | null): Promise<boolean> {
      synchronize();
      if (token !== state.token || !token || now() - denialAt < 1000) return false;
      denialAt = now();
      await ensure(true);
      return state.token === token && state.status === 'ready' && !state.error;
    },
  };
}
