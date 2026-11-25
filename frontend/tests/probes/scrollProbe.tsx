import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, useLocation } from 'react-router-dom';
import ScrollToTop from '../../src/components/ScrollToTop';

export default function Probe() {
  const location = useLocation();
  const [readyPath, setReadyPath] = useState<string | null>(null);
  const ready = readyPath === location.pathname;
  const [modal, setModal] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReadyPath(location.pathname), 180);
    return () => clearTimeout(timer);
  }, [location.pathname]);
  return <>
    <nav style={{ position: 'fixed', top: 0 }}>
      <Link id="search" to="/scroll-probe/search?sort=price">Search</Link>
      <Link id="detail" to="/scroll-probe/products/one">Detail</Link>
      <Link id="admin" to="/scroll-probe/dashboard">Admin</Link>
      <Link id="query" to={location.pathname + '?sort=name'}>Filter</Link>
      <Link id="anchor" to={location.pathname + '?sort=name#section'}>Anchor</Link>
      <Link id="cross-anchor" to="/scroll-probe/other#section">Cross anchor</Link>
      <button id="toggle" onClick={() => setModal(v => !v)}>Modal</button>
    </nav>
    {ready ? <main data-ready={location.pathname} style={{ height: 3500 }}>
      <h1>{location.pathname}</h1>
      <div id="section" style={{ position: 'absolute', top: 1800 }}>Section</div>
    </main> : <p>Loading</p>}
    {modal && <div role="dialog" style={{ position: 'fixed', top: 100 }}>Modal</div>}
  </>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><ScrollToTop /><Probe /></BrowserRouter></StrictMode>);
