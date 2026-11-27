import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ToastContainer, type CloseButtonProps } from "react-toastify";
import { X } from "lucide-react";
import { showPendingNotice } from "../../utils/notifications";
import "react-toastify/dist/ReactToastify.css";
import "./Notifications.css";

function CloseNotice({ closeToast }: CloseButtonProps) {
  return <button type="button" className="store-notice-close" aria-label="Đóng thông báo" onClick={closeToast}><X size={18} aria-hidden="true" /></button>;
}

export default function AppNotifications() {
  const [host] = useState(() => document.createElement("div"));
  useEffect(() => {
    // Native modal dialogs occupy the browser's top layer. Move the same portal
    // host inside an open dialog so notices remain visible, without remounting
    // ToastContainer or losing its queue when a dialog/route closes.
    const placeHost = () => {
      const dialogs = document.querySelectorAll("dialog[open]");
      const target = dialogs.item(dialogs.length - 1) ?? document.body;
      if (host.parentNode !== target) target.appendChild(host);
      const header = document.querySelector('[data-store-header], .dashboard-header');
      const bottom = header?.getBoundingClientRect().bottom ?? 0;
      host.style.setProperty('--store-notice-top', `${dialogs.length ? 16 : Math.max(16, bottom + 12)}px`);
    };
    placeHost();
    const observer = new MutationObserver(placeHost);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
    window.addEventListener('resize', placeHost);
    window.addEventListener('scroll', placeHost, { passive: true });
    let active = true;
    // Let StrictMode finish its subscription cleanup/remount before consuming
    // the flash notice; otherwise the first container can discard that toast.
    queueMicrotask(() => { if (active) showPendingNotice(); });
    return () => { active = false; observer.disconnect(); window.removeEventListener('resize', placeHost); window.removeEventListener('scroll', placeHost); host.remove(); };
  }, [host]);

  return createPortal(<ToastContainer
    position="top-right" autoClose={3000} pauseOnHover draggable newestOnTop
    closeButton={CloseNotice} className="store-notices" toastClassName="store-notice"
    aria-label="Thông báo cửa hàng" theme="light"
  />, host);
}
