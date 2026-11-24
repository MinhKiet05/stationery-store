import { useEffect, useRef, useState } from 'react';
import { adminErrorMessage } from '../../services/dashboardApi';

export default function useAdminDetail(id, load, onAccessDenied) {
  const [state, setState] = useState({ status: 'loading', data: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  const alive = useRef(false);
  const mutation = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    load(id, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ status: 'ready', data, error: '' });
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (error.status === 401 || error.status === 403) { onAccessDenied(); return; }
      setState({ status: 'error', data: null, error: adminErrorMessage(error) });
    });
    return () => controller.abort();
  }, [id, load, attempt, onAccessDenied]);
  return { ...state, alive, mutation,
    reload: () => { setState({ status: 'loading', data: null, error: '' }); setAttempt(value => value + 1); },
    replace: data => setState({ status: 'ready', data, error: '' }),
  };
}
