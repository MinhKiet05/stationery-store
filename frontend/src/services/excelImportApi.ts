import type { Download } from './adminTypes';

export type ImportKind = 'products' | 'promotions';
export type ImportIssue = { field: string; code: string; message: string };
export type ImportRow = { sheet: string; rowNumber: number; values: Record<string, string>; status: 'DUPLICATE' | 'VALID' | 'INVALID'; errors: ImportIssue[] };
export type ImportPreview = { totalRows: number; validRows: number; invalidRows: number; duplicateRows: number; canImport: boolean; rows: ImportRow[]; importToken: string | null; maxFileBytes: number; maxRows: number };
export type ImportResult = { status: 'CREATED'; createdRecords: number; createdProducts: number; createdVariants: number; createdVouchers: number; aiStatus: 'NOT_APPLICABLE' | 'SCHEDULED' | 'DISABLED' };

import { api, apiResponse } from './api';

const base = (kind: ImportKind) => `/api/admin/${kind}/import`;
export async function downloadImportTemplate(kind: ImportKind, signal?: AbortSignal): Promise<Download> {
  const response = await apiResponse(`${base(kind)}/template`, { signal });
  return { blob: await response.blob(), filename: `stationery-${kind}-import-template.xlsx` };
}
export function previewExcelImport(kind: ImportKind, file: File, signal?: AbortSignal): Promise<ImportPreview> {
  const body = new FormData(); body.append('file', file);
  return api<ImportPreview>(`${base(kind)}/preview`, { method: 'POST', body, signal });
}
export function confirmExcelImport(kind: ImportKind, file: File, token: string, signal?: AbortSignal): Promise<ImportResult> {
  const body = new FormData(); body.append('file', file); body.append('importToken', token);
  return api<ImportResult>(`${base(kind)}/confirm`, { method: 'POST', body, signal });
}
export function saveExcelDownload({ blob, filename }: Download): void {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
