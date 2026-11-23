import { useEffect, useState } from 'react';
import { dashboardRequest } from '../../services/dashboardApi';

export default function useDashboardResource(path, onAccessDenied) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ path: '', attempt: -1, status: 'loading', data: null });
  useEffect(() => {
    const controller = new AbortController();
    dashboardRequest(path, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ path, attempt, status: 'ready', data });
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (error.status === 401 || error.status === 403) { onAccessDenied(); return; }
      setState({ path, attempt, status: 'error', data: null });
    });
    return () => controller.abort();
  }, [path, attempt, onAccessDenied]);
  return { ...(state.path === path && state.attempt === attempt ? state : { status: 'loading', data: null }), retry: () => setAttempt(value => value + 1) };
}
