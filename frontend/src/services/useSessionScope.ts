import { useSyncExternalStore } from 'react';
import { sessionScope, subscribeSession, type SessionScope } from './queryCache';
export default function useSessionScope(): SessionScope {
  return useSyncExternalStore(subscribeSession, sessionScope, sessionScope);
}
