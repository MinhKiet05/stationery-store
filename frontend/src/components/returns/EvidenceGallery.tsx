import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Film, ImageOff, X } from 'lucide-react';
import styles from './EvidenceGallery.module.css';

function safeUrl(value: string, local: boolean) {
  try { const url = new URL(value); return (local && url.protocol === 'blob:') || ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
function Picture({ url, large = false }: { url: string; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className={styles.fallback}><ImageOff />Không thể tải ảnh</span>
    : <img className={large ? styles.large : undefined} src={url} alt="Ảnh minh chứng" referrerPolicy="no-referrer" loading={large ? 'eager' : 'lazy'} onError={() => setFailed(true)} />;
}
function Viewer({ urls, initial, onClose }: { urls: string[]; initial: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(initial), [failedVideo, setFailedVideo] = useState(false);
  const url = urls[index];
  const video = /\.(mp4|webm|mov)(?:[?#]|$)|\/video\/upload\//i.test(url);
  useEffect(() => {
    const node = dialog.current, previous = document.activeElement;
    const overflow = document.body.style.overflow;
    node?.showModal(); document.body.style.overflow = 'hidden';
    return () => { node?.close(); document.body.style.overflow = overflow; if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  const change = (next: number) => { setFailedVideo(false); setIndex(next); };
  return <dialog ref={dialog} tabIndex={-1} className={styles.dialog} aria-label="Xem ảnh minh chứng" onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key === 'ArrowLeft' && index > 0) change(index - 1);
    if (event.key === 'ArrowRight' && index < urls.length - 1) change(index + 1);
  }}>
    <header><strong>Minh chứng {index + 1}/{urls.length}</strong><button type="button" aria-label="Đóng ảnh minh chứng" onClick={onClose}><X /></button></header>
    <div className={styles.stage}>{video ? failedVideo ? <p>Không thể phát video minh chứng cũ.</p> : <video key={url} src={url} controls playsInline preload="metadata" onError={() => setFailedVideo(true)} /> : <Picture key={url} url={url} large />}</div>
    <footer><button type="button" disabled={index === 0} aria-label="Bằng chứng trước" onClick={() => change(index - 1)}><ChevronLeft />Trước</button><button type="button" disabled={index === urls.length - 1} aria-label="Bằng chứng tiếp theo" onClick={() => change(index + 1)}>Tiếp theo<ChevronRight /></button></footer>
  </dialog>;
}
export default function EvidenceGallery({ urls, local = false, onRemove }: { urls: string[]; local?: boolean; onRemove?: (index: number) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const files = urls.map((url, index) => ({ url, index })).filter(file => safeUrl(file.url, local));
  return <><div className={`returns-evidence-grid ${styles.grid}`}>{files.map((file, index) => <div className={styles.thumbnail} key={file.url}>
    <button type="button" aria-label={`Xem bằng chứng ${index + 1}`} onClick={() => setSelected(index)}>{/\.(mp4|webm|mov)(?:[?#]|$)|\/video\/upload\//i.test(file.url) ? <Film /> : <Picture url={file.url} />}</button>
    {onRemove && <button type="button" className={styles.remove} aria-label={`Xóa ảnh minh chứng ${index + 1}`} onClick={() => { setSelected(null); onRemove(file.index); }}><X size={15} /></button>}
  </div>)}</div>{selected !== null && files[selected] && <Viewer urls={files.map(file => file.url)} initial={selected} onClose={() => setSelected(null)} />}</>;
}
