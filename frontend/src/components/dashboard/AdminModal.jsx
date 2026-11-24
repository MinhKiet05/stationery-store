import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import './AdminModal.css';

/** Native dialog shares the storefront's focus/top-layer behavior and toast host. */
export default function AdminModal({ title, children, footer, onClose, busy = false, compact = false }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
      else document.getElementById('dashboard-content')?.focus();
    };
  }, []);
  useEffect(() => {
    const dialog = ref.current;
    // Listen on the DOM dialog as toast portals live here but have a different React ancestry.
    const keydown = event => {
      if (event.key === 'Tab') {
        const controls = [...dialog.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
          .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length > 0 && !node.closest('[inert]'));
        const first = controls[0], last = controls.at(-1);
        if (!first) { event.preventDefault(); dialog.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
      }
    };
    dialog.addEventListener('keydown', keydown);
    return () => dialog.removeEventListener('keydown', keydown);
  }, []);
  return <dialog ref={ref} tabIndex={-1} className={`admin-modal ${compact ? 'admin-modal-compact' : ''}`} aria-labelledby={titleId}
    closedby={busy ? 'none' : 'closerequest'} aria-busy={busy}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }
    }}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="admin-modal-header"><h2 id={titleId}>{title}</h2>
      <button className="dashboard-icon-button" aria-label="Đóng hộp thoại" disabled={busy} onClick={onClose}><X size={21} /></button></header>
    <div className="admin-modal-content">{children}</div>
    {footer && <footer className="admin-modal-footer">{footer}</footer>}
  </dialog>;
}

export function ConfirmAdminAction({ title, message, busy, error, onConfirm, onClose, danger = false }) {
  return <AdminModal title={title} compact busy={busy} onClose={onClose} footer={<>
    <button className="dashboard-button" disabled={busy} onClick={onClose}>Quay lại</button>
    <button className={`dashboard-button ${danger ? 'admin-button-danger' : 'dashboard-button-primary'}`} disabled={busy} onClick={onConfirm}>
      {busy ? 'Đang xử lý…' : 'Xác nhận'}</button>
  </>}><p>{message}</p>{error && <p className="admin-modal-error" role="alert">{error}</p>}
    {busy && <p role="status" className="admin-modal-note">Đang xử lý yêu cầu. Vui lòng chờ kết quả.</p>}
  </AdminModal>;
}
