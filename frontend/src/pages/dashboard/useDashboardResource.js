import { useEffect, useState } from 'react';
import { dashboardRequest } from '../../services/dashboardApi';

export default function useDashboardResource(path, onAccessDenied, keepPreviousData = false) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ path: '', attempt: -1, status: 'loading', data: null });
  useEffect(() => {
    const controller = new AbortController();
    dashboardRequest(path, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ path, attempt, owner: onAccessDenied, status: 'ready', data });
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (error.status === 401 || error.status === 403) onAccessDenied();
      setState(previous => ({ path, attempt, owner: onAccessDenied, status: 'error', data: keepPreviousData && previous.path === path && previous.owner === onAccessDenied ? previous.data : null }));
    });
    return () => controller.abort();
  }, [path, attempt, onAccessDenied, keepPreviousData]);
  if (keepPreviousData && state.path === path && state.owner === onAccessDenied && state.data) {
    return { ...state, status: 'ready', refreshing: state.attempt !== attempt, refreshError: state.status === 'error', retry: () => setAttempt(value => value + 1) };
  }
  return { ...(state.path === path && state.attempt === attempt && state.owner === onAccessDenied ? state : { status: 'loading', data: null }), retry: () => setAttempt(value => value + 1) };
}
