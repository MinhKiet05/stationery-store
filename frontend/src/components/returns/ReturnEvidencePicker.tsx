import type { ChangeEvent, RefObject } from 'react';
import { ImagePlus } from 'lucide-react';
import type { ImageAttachment } from '../../hooks/useImageAttachments';
import EvidenceGallery from './EvidenceGallery';
import styles from '../../pages/returnRequest/ReturnRequest.module.css';

export default function ReturnEvidencePicker({ media, error, fileInput, onChange, onRemove }: {
  media: ImageAttachment[]; error: string; fileInput: RefObject<HTMLInputElement | null>;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void; onRemove: (index: number) => void;
}) {
  return <>
    <div className={styles.sectionTitle}><h2><span>3</span>Hình ảnh minh chứng ({media.length}/5)</h2><span className={styles.requiredBadge}>Bắt buộc · Tối đa 5 ảnh</span></div>
    <p className={styles.fieldHelp}>Vui lòng tải lên hình ảnh sản phẩm bị lỗi, bao bì hoặc tình trạng hàng hóa khi nhận. Tối đa 5 ảnh JPG, PNG, WebP, mỗi ảnh không quá 5 MB.</p>
    <div id="return-evidence" tabIndex={-1} className={styles.imagePicker}>
      <EvidenceGallery urls={media.map(image => image.url)} local onRemove={onRemove} />
      {media.length < 5 && <button type="button" className={styles.uploadImage} onClick={() => fileInput.current?.click()}><ImagePlus size={28} />Thêm ảnh</button>}
    </div>
    <input ref={fileInput} className={styles.srOnly} type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Chọn ảnh minh chứng" onChange={onChange} />
    {error && <p role="alert" className={styles.fieldError}>{error}</p>}
  </>;
}
