import { api, apiResponse } from './api';

const base = kind => `/api/admin/${kind}/import`;
export async function downloadImportTemplate(kind, signal) {
  const response = await apiResponse(`${base(kind)}/template`, { signal });
  return { blob: await response.blob(), filename: `stationery-${kind}-import-template.xlsx` };
}
export function previewExcelImport(kind, file, signal) {
  const body = new FormData(); body.append('file', file);
  return api(`${base(kind)}/preview`, { method: 'POST', body, signal });
}
export function confirmExcelImport(kind, file, token, signal) {
  const body = new FormData(); body.append('file', file); body.append('importToken', token);
  return api(`${base(kind)}/confirm`, { method: 'POST', body, signal });
}
export function saveExcelDownload({ blob, filename }) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
