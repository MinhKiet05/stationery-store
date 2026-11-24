import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardRequest } from '../../services/dashboardApi';
import { queryKeys, resourceTime } from '../../services/queryCache';
import useSessionScope from '../../services/useSessionScope';
export const dashboardQueryOptions = (path, scope) => ({
  queryKey: queryKeys.admin(path, scope), queryFn: ({ signal }) => dashboardRequest(path, signal), staleTime: resourceTime(path),
});
export default function useDashboardResource(path, onAccessDenied) {
  const scope = useSessionScope();
  const query = useQuery(dashboardQueryOptions(path, scope));
  const denied = query.error?.status === 401 || query.error?.status === 403;
  useEffect(() => { if (denied) onAccessDenied(); }, [denied, onAccessDenied]);
  return { status: denied ? 'error' : query.data !== undefined ? 'ready' : query.isError ? 'error' : 'loading',
    data: denied ? null : query.data ?? null, refreshing: query.isFetching && query.data !== undefined,
    refreshError: query.isError && query.data !== undefined, retry: () => query.refetch() };
}
