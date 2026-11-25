import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, useLocation } from 'react-router-dom';
import ScrollToTop from '../../src/components/ScrollToTop';

function Probe() {
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [modal, setModal] = useState(false);
  useEffect(() => {
    setReady(false);
    const timer = setTimeout(() => setReady(true), 180);
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
