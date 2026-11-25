import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

type Position = { left: number; top: number };

/** Both layouts scroll the window; leave sidebar and modal scroll containers alone. */
export default function ScrollToTop() {
  const location = useLocation();
  const navigation = useNavigationType();
  const positions = useRef(new Map<string, Position>());
  const previousPath = useRef(location.pathname);
  const previousHash = useRef<string | null>(null);

  useLayoutEffect(() => {
    const prior = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = prior; };
  }, []);

  useLayoutEffect(() => {
    const changedPath = previousPath.current !== location.pathname;
    const storedPositions = positions.current;
    const anchor = location.hash && (changedPath || previousHash.current !== location.hash);
    previousPath.current = location.pathname;
    previousHash.current = location.hash;
    const saved = navigation === 'POP' ? storedPositions.get(location.key) : undefined;
    let pending = Boolean(saved || anchor);
    let current = saved ?? { left: window.scrollX, top: window.scrollY };
    let observer: MutationObserver | undefined;
    let resize: ResizeObserver | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      pending = false;
      observer?.disconnect();
      resize?.disconnect();
      clearTimeout(timer);
      clearTimeout(settled);
    };
    const remember = () => {
      if (!pending) current = { left: window.scrollX, top: window.scrollY };
    };
    const restore = () => {
      if (!pending) return;
      clearTimeout(settled);
      if (saved) {
        window.scrollTo({ ...saved, behavior: 'instant' });
        // Allow the destination's loading state to commit before declaring success.
        if (Math.abs(window.scrollY - saved.top) < 1 && Math.abs(window.scrollX - saved.left) < 1) settled = setTimeout(stop, 100);
      } else if (location.hash) {
        let id = location.hash.slice(1);
        try { id = decodeURIComponent(id); } catch { /* Keep malformed anchors harmless. */ }
        const target = document.getElementById(id) ?? document.getElementsByName(id)[0];
        if (target) {
          target.scrollIntoView({ behavior: 'instant' });
          current = { left: window.scrollX, top: window.scrollY };
          settled = setTimeout(stop, 100);
        }
      }
    };
    const interrupt = () => { stop(); remember(); };
    const onKey = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) interrupt();
    };
    if (pending) {
      // Suspense and query loading may temporarily make the document too short.
      observer = new MutationObserver(restore);
      observer.observe(document.body, { childList: true, subtree: true });
      resize = new ResizeObserver(restore);
      resize.observe(document.body);
      timer = setTimeout(interrupt, 10000);
      restore();
    } else if (changedPath) {
      window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
      remember();
    }
    window.addEventListener('scroll', remember, { passive: true });
    window.addEventListener('wheel', interrupt, { passive: true });
    window.addEventListener('touchstart', interrupt, { passive: true });
    window.addEventListener('pointerdown', interrupt, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      // Keep the intended position if navigation interrupts an unfinished restore.
      storedPositions.delete(location.key);
      storedPositions.set(location.key, current);
      if (storedPositions.size > 50) storedPositions.delete(storedPositions.keys().next().value!);
      stop();
      window.removeEventListener('scroll', remember);
      window.removeEventListener('wheel', interrupt);
      window.removeEventListener('touchstart', interrupt);
      window.removeEventListener('pointerdown', interrupt);
      window.removeEventListener('keydown', onKey);
    };
  }, [location.key, location.pathname, location.hash, navigation]);

  return null;
}
