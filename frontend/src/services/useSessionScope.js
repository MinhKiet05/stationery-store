import { useSyncExternalStore } from 'react';
import { sessionScope, subscribeSession } from './queryCache';
export default function useSessionScope() {
  return useSyncExternalStore(subscribeSession, sessionScope, sessionScope);
}
