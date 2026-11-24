import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminErrorMessage } from '../../services/dashboardApi';
import useSessionScope from '../../services/useSessionScope';
const loaders = new WeakMap();
let loaderID = 0;
export default function useAdminDetail(id, load, onAccessDenied) {
  const scope = useSessionScope(), client = useQueryClient();
  if (!loaders.has(load)) loaders.set(load, ++loaderID);
  const queryKey = ['session', scope, 'admin', 'detail', loaders.get(load), id];
  // Business decisions always load a fresh snapshot on open, never a cached stock/version.
  const query = useQuery({ queryKey, queryFn: ({ signal }) => load(id, signal), staleTime: 0, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const alive = useRef(false), mutation = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if ([401, 403].includes(query.error?.status)) onAccessDenied(); }, [query.error, onAccessDenied]);
  return { status: query.isFetching ? 'loading' : query.isError ? 'error' : query.data ? 'ready' : 'loading', data: query.isError || query.isFetching ? null : query.data,
    error: query.error ? adminErrorMessage(query.error) : '', alive, mutation,
    reload: () => query.refetch(), replace: data => client.setQueryData(queryKey, data) };
}
