import { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Upload, Download, Trash2, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import AdminModal, { ConfirmAdminAction } from './AdminModal';
import { downloadImportTemplate, previewExcelImport, confirmExcelImport, saveExcelDownload } from '../../services/excelImportApi';
import { number } from '../../services/dashboardApi';
import { notify } from '../../utils/notifications';
import './ImportExcelModal.css';

const statuses = { VALID: ['Hợp lệ', 'green'], INVALID: ['Không hợp lệ', 'red'], DUPLICATE: ['Trùng lặp', 'orange'] };
const MAX_BYTES = 5 * 1024 * 1024;
export default function ImportExcelModal({ kind, onClose, onChanged, onAccessDenied }) {
  const [file, setFile] = useState(null), [preview, setPreview] = useState(null), [result, setResult] = useState(null);
  const [job, setJob] = useState(''), [error, setError] = useState(''), [page, setPage] = useState(0), [confirm, setConfirm] = useState(false), [uncertain, setUncertain] = useState(false), [dragging, setDragging] = useState(false);
  const pending = useRef(null), generation = useRef(0), alive = useRef(false), input = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; pending.current?.abort(); }; }, []);
  const busy = Boolean(job), noun = kind === 'products' ? 'sản phẩm' : 'voucher';
  async function pick(next) {
    if (pending.current) return;
    const selection = ++generation.current;
    setFile(null); setPreview(null); setResult(null); setError(''); setUncertain(false); setPage(0);
    if (!next) return;
    let message = '';
    if (!/\.xlsx$/i.test(next.name) || next.size === 0) message = 'Chọn file Excel .xlsx không rỗng.';
    else if (next.size > MAX_BYTES) message = 'File vượt quá dung lượng tối đa 5 MB.';
    else {
      try { const bytes = new Uint8Array(await next.slice(0, 4).arrayBuffer()); if (bytes[0] !== 80 || bytes[1] !== 75) message = 'Nội dung file không phải định dạng .xlsx hợp lệ.'; }
      catch { message = 'Không đọc được file. Vui lòng chọn lại.'; }
    }
    if (!alive.current || selection !== generation.current) return;
    if (message) { setError(message); return; }
    setFile(next);
  }
  async function run(operation) {
    if (pending.current || operation !== 'template' && !file) return;
    const controller = new AbortController(); pending.current = controller; setJob(operation); setError('');
    if (operation === 'preview') setPreview(null);
    try {
      if (operation === 'template') {
        const download = await downloadImportTemplate(kind, controller.signal);
        if (!alive.current || controller.signal.aborted) return;
        saveExcelDownload(download); notify.success('Đã tải file Excel mẫu.');
      } else if (operation === 'preview') {
        const data = await previewExcelImport(kind, file, controller.signal);
        if (!alive.current || controller.signal.aborted) return;
        setPreview(data); setUncertain(false); setPage(0);
      } else {
        if (!preview?.canImport || !preview.importToken || uncertain) return;
        const data = await confirmExcelImport(kind, file, preview.importToken, controller.signal);
        if (!alive.current || controller.signal.aborted) return;
        setResult(data); setConfirm(false); setPreview(null); notify.success(`Import ${noun} thành công.`); onChanged();
      }
    } catch (failure) {
      if (!alive.current || controller.signal.aborted) return;
      if (failure.status === 401 || failure.status === 403) { onAccessDenied(); return; }
      const message = failure.status === 413 ? 'File vượt quá giới hạn dung lượng hoặc số dòng. Hãy chia nhỏ file.'
        : failure.status === 409 ? 'File, dữ liệu hoặc phiên kiểm tra đã thay đổi. Hãy kiểm tra dữ liệu lại; dữ liệu cũ sẽ không bị ghi đè.'
          : failure.status === 400 ? 'File không hợp lệ. Kiểm tra định dạng, sheet và header theo template; không dùng macro hoặc liên kết ngoài.'
            : failure.status === 403 ? 'Bạn không có quyền import dữ liệu.'
              : operation === 'confirm' ? 'Chưa xác định được kết quả import. Hãy tải lại danh sách và kiểm tra file trước khi thực hiện tiếp; không gửi lại yêu cầu xác nhận.'
                : 'Không thể xử lý file. Vui lòng thử lại.';
      setError(message); notify.error(message, message, failure);
      if (operation === 'confirm') { setUncertain(true); setConfirm(false); }
    } finally { if (pending.current === controller) pending.current = null; if (alive.current) setJob(''); }
  }
  const rows = preview?.rows || [], pageRows = rows.slice(page * 10, (page + 1) * 10);
  return <><AdminModal title={`Import Excel ${noun}`} busy={busy} onClose={onClose} footer={<>
    <button className="dashboard-button" disabled={busy} onClick={onClose}>{result ? 'Hoàn tất' : 'Đóng'}</button>
    {!result && <button className="dashboard-button" disabled={busy || !file} onClick={() => run('preview')}>{job === 'preview' ? 'Đang kiểm tra…' : 'Kiểm tra dữ liệu'}</button>}
    {!result && <button className="dashboard-button dashboard-button-primary" disabled={busy || uncertain || !preview?.canImport || !preview?.importToken} onClick={() => setConfirm(true)}>{job === 'confirm' ? 'Đang import…' : 'Xác nhận Import'}</button>}
  </>}>
    {error && <p className="admin-modal-error" role="alert">{error}</p>}
    {result ? <section className="excel-import-result" role="status"><CheckCircle2 size={34} /><h3>Import thành công</h3>
      <p>Đã tạo {number(result.createdRecords)} bản ghi{kind === 'products' ? `: ${number(result.createdProducts)} sản phẩm và ${number(result.createdVariants)} biến thể` : ` voucher`}.</p>
      {result.aiStatus === 'SCHEDULED' && <p>Sản phẩm đã được lưu. Đồng bộ AI sẽ được hệ thống xử lý theo lịch; hiện chưa xác nhận hoàn tất đồng bộ.</p>}
      {result.aiStatus === 'DISABLED' && <p>Sản phẩm đã được lưu. Đồng bộ AI hiện chưa được bật.</p>}
    </section> : <>
      <div className="excel-import-intro"><p>Chỉ tạo mới, không ghi đè mã voucher, giá hoặc tồn kho đã có. Toàn bộ file phải hợp lệ trước khi import.</p><button className="dashboard-button" disabled={busy} onClick={() => run('template')}><Download size={17} />{job === 'template' ? 'Đang tải…' : 'Tải file Excel mẫu'}</button></div>
      <div className={`excel-import-drop ${dragging ? 'is-dragging' : ''}`} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={event => { event.preventDefault(); setDragging(false); if (!busy) { if (event.dataTransfer.files.length !== 1) { pick(null); setError('Chỉ chọn một file mỗi lần import.'); } else pick(event.dataTransfer.files[0]); } }}>
        <FileSpreadsheet size={30} aria-hidden="true" /><p>Kéo thả file Excel vào đây</p><small>.xlsx · tối đa 5 MB · mặc định tối đa 1.000 dòng dữ liệu</small>
        <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} className="dashboard-sr-only" aria-label="Chọn file Excel import" onChange={event => { const selected = event.target.files?.[0]; event.target.value = ''; pick(selected); }} />
        <button className="dashboard-button" disabled={busy} onClick={() => input.current?.click()}><Upload size={16} />{file ? 'Thay thế file' : 'Chọn file từ máy tính'}</button>
      </div>
      {file && <div className="excel-import-file"><span><strong>{file.name}</strong><small>{number(Math.ceil(file.size / 1024))} KB</small></span><button className="dashboard-icon-button" aria-label="Xóa file đã chọn" disabled={busy} onClick={() => pick(null)}><Trash2 size={18} /></button></div>}
      <p className="admin-modal-note">Giữ nguyên header trong template. Dòng trống được bỏ qua. Mã và SKU phải dùng ô Text; ngày voucher theo yyyy-MM-dd. Không dùng công thức, macro hay liên kết ngoài.</p>
      {job && <p role="status" className="admin-modal-note">{job === 'confirm' ? 'Đang import. Vui lòng chờ kết quả và không gửi lại yêu cầu.' : job === 'preview' ? 'Đang kiểm tra toàn bộ file…' : 'Đang tải file mẫu…'}</p>}
      {preview && <section className="excel-import-preview" aria-label="Kết quả kiểm tra Excel"><div className="excel-import-counts">
        <span>Tổng dòng <strong>{number(preview.totalRows)}</strong></span><span className="tone-green">Hợp lệ <strong>{number(preview.validRows)}</strong></span><span className="tone-red">Không hợp lệ <strong>{number(preview.invalidRows)}</strong></span><span className="tone-orange">Trùng lặp <strong>{number(preview.duplicateRows)}</strong></span>
      </div><p className="admin-modal-note">{preview.canImport ? 'Dữ liệu hợp lệ tại thời điểm kiểm tra. Hệ thống sẽ kiểm tra lại khi xác nhận.' : 'Sửa tất cả dòng lỗi hoặc trùng lặp trong file rồi chọn lại và kiểm tra.'}</p>
        <div className="dashboard-table-scroll" tabIndex={0} role="region" aria-label="Bảng xem trước Excel"><table className="dashboard-table excel-import-table"><thead><tr><th>Sheet / Dòng</th><th>Dữ liệu</th><th>Kết quả</th><th>Lỗi cần sửa</th></tr></thead><tbody>{pageRows.map(row => <tr key={`${row.sheet}-${row.rowNumber}`}><td>{row.sheet}<small>Dòng {row.rowNumber}</small></td><td><details><summary>{row.values.code || row.values.sku || row.values.title || row.values.productKey || 'Xem dữ liệu'}</summary><dl>{Object.entries(row.values).filter(([, value]) => value !== '').map(([field, value]) => <div key={field}><dt>{field}</dt><dd>{value}</dd></div>)}</dl></details></td>
          <td><span className={`dashboard-badge tone-${statuses[row.status]?.[1] || 'red'}`}>{statuses[row.status]?.[0] || 'Không hợp lệ'}</span></td><td>{row.errors.length ? <ul>{row.errors.map((issue, index) => <li key={index}><strong>{issue.field}</strong>: {issue.message}</li>)}</ul> : '—'}</td></tr>)}</tbody></table></div>
        <div className="dashboard-pagination"><span>{number(Math.min(page * 10 + 1, rows.length))}–{number(Math.min((page + 1) * 10, rows.length))} / {number(rows.length)} dòng đã kiểm tra</span><div><button className="dashboard-icon-button" aria-label="Trang preview trước" disabled={busy || page === 0} onClick={() => setPage(page - 1)}><ChevronLeft size={18} /></button><span>{page + 1} / {Math.max(1, Math.ceil(rows.length / 10))}</span><button className="dashboard-icon-button" aria-label="Trang preview tiếp theo" disabled={busy || (page + 1) * 10 >= rows.length} onClick={() => setPage(page + 1)}><ChevronRight size={18} /></button></div></div>
      </section>}
    </>}
  </AdminModal>{confirm && <ConfirmAdminAction title={`Xác nhận import ${noun}`} message={`Tạo dữ liệu từ ${file.name}? Toàn bộ ${number(preview.totalRows)} dòng đã được kiểm tra. Chỉ tạo mới; nếu có lỗi, toàn bộ lần import sẽ được hoàn tác.`} busy={busy} onClose={() => setConfirm(false)} onConfirm={() => run('confirm')} />}</>;
}
