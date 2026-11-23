import { useState } from 'react';
import { ChevronLeft, ChevronRight, Film, ImageOff } from 'lucide-react';
import AdminModal from './AdminModal';

function evidence(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return { url: url.href, video: /\.(mp4|webm|ogv|ogg)$/i.test(url.pathname) };
  } catch { return null; }
}
function EvidenceImage({ url, alt, expanded = false }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="returns-evidence-unavailable"><ImageOff size={24} aria-hidden="true" />Không thể tải ảnh</span>
    : <img className={expanded ? 'returns-evidence-expanded' : ''} src={url} alt={alt} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}
export default function ReturnEvidenceGallery({ urls }) {
  const [selected, setSelected] = useState(null), [videoFailed, setVideoFailed] = useState(false);
  const files = urls.map(evidence).filter(Boolean);
  function select(index) { setVideoFailed(false); setSelected(index); }
  const current = files[selected];
  return <>
    {files.length === 0 ? <p className="admin-modal-note">Không có bằng chứng có thể hiển thị.</p> : <div className="returns-evidence-grid">{files.map((file, index) =>
      <button type="button" key={`${file.url}-${index}`} aria-label={`Xem bằng chứng ${index + 1}`} onClick={() => select(index)}>
        {file.video ? <span><Film size={27} aria-hidden="true" />Video bằng chứng</span> : <EvidenceImage url={file.url} alt={`Ảnh bằng chứng ${index + 1}`} />}
      </button>)}</div>}
    {current && <AdminModal title={`Bằng chứng ${selected + 1} / ${files.length}`} onClose={() => setSelected(null)} footer={<>
      <button className="dashboard-button" aria-label="Bằng chứng trước" disabled={selected === 0} onClick={() => select(selected - 1)}><ChevronLeft size={17} />Trước</button>
      <button className="dashboard-button" aria-label="Bằng chứng tiếp theo" disabled={selected + 1 >= files.length} onClick={() => select(selected + 1)}>Tiếp theo<ChevronRight size={17} /></button>
    </>}>
      {current.video ? videoFailed ? <p className="admin-modal-error" role="alert">Không thể phát video bằng chứng.</p> : <video key={current.url} className="returns-evidence-expanded" controls playsInline preload="metadata" src={current.url} onError={() => setVideoFailed(true)} />
        : <EvidenceImage key={current.url} url={current.url} alt={`Ảnh bằng chứng ${selected + 1}`} expanded />}
    </AdminModal>}
  </>;
}
