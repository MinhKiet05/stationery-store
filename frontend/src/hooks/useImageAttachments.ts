import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { notify } from '../utils/notifications';

export type ImageAttachment = { id: string; url: string; name: string; file: File };

/** Shared local drafts for review and return forms. No network calls before submission. */
export function useImageAttachments(retainedCount = 0) {
  const [media, setMedia] = useState<ImageAttachment[]>([]);
  const [mediaError, setMediaError] = useState('');
  const owned = useRef(new Set<string>());
  const current = useRef<ImageAttachment[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const urls = owned.current;
    return () => { urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); };
  }, []);
  function addMedia(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    const added: ImageAttachment[] = [], issues: string[] = [];
    for (const file of files) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { issues.push('Định dạng ảnh không được hỗ trợ. Chỉ nhận JPG, PNG, WebP.'); continue; }
      if (retainedCount + current.current.length + added.length >= 5) { issues.push('Bạn chỉ được tải lên tối đa 5 ảnh.'); continue; }
      if (!file.size || file.size > 5 * 1024 * 1024) { issues.push('Ảnh không được rỗng; dung lượng mỗi ảnh không được vượt quá 5 MB.'); continue; }
      const url = URL.createObjectURL(file); owned.current.add(url);
      added.push({ id: crypto.randomUUID(), url, name: file.name, file });
    }
    current.current = [...current.current, ...added]; setMedia(current.current);
    const message = [...new Set(issues)].join(' '); setMediaError(message);
    if (message) notify.warning(message);
  }
  function removeMedia(image: ImageAttachment) {
    if (owned.current.delete(image.url)) URL.revokeObjectURL(image.url);
    current.current = current.current.filter(value => value.id !== image.id); setMedia(current.current); setMediaError('');
  }
  function clear() {
    owned.current.forEach(url => URL.revokeObjectURL(url)); owned.current.clear();
    current.current = []; setMedia([]); setMediaError('');
  }
  return { media, mediaError, setMediaError, fileInput, addMedia, removeMedia, clear };
}
