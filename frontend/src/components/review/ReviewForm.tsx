import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Check, ImagePlus, Package, Send, Star, X } from 'lucide-react';
import type { OrderItem } from '../../services/orderService';
import { createProductReview, updateProductReview, purchasedReviewsOptions, validateReviewInput, type Review } from '../../services/reviewService';
import useSessionScope from '../../services/useSessionScope';
import { notify } from '../../utils/notifications';
import styles from './ReviewModal.module.css';

const baseSuggestions = ['Chất lượng tuyệt vời', 'Dễ sử dụng', 'Đóng gói cẩn thận', 'Giao hàng nhanh chóng', 'Đúng như mô tả'];
const ratingLabels = ['Rất tệ', 'Chưa hài lòng', 'Bình thường', 'Hài lòng', 'Tuyệt vời'];
const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
type Attachment = { id: string; url: string; name: string; file: File };

export default function ReviewForm({ item, review, onClose, onBusyChange }: {
  item: OrderItem; review?: Review; onClose: () => void; onBusyChange: (busy: boolean) => void;
}) {
  const client = useQueryClient();
  const scope = useSessionScope();
  const fieldID = useId();
  const suggestions = baseSuggestions.map((text, index) => index === 1 && /bút|mực/i.test(item.productTitle) ? 'Mực ra đều & êm tay' : text);
  const [rating, setRating] = useState(review?.rating ?? 5);
  const [selected, setSelected] = useState<string[]>([]);
  const [comment, setComment] = useState(review?.comment ?? '');
  const [removedPositions, setRemovedPositions] = useState<number[]>([]);
  const keptImages = (review?.images ?? []).filter(image => !removedPositions.includes(image.imagePosition));
  const [media, setMedia] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mediaError, setMediaError] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const urls = useRef(new Set<string>());
  const request = useRef<AbortController | null>(null);
  const commentCount = Array.from(comment).length;


  useEffect(() => {
    const ownedUrls = urls.current;
    return () => { ownedUrls.forEach(url => URL.revokeObjectURL(url)); request.current?.abort(); };
  }, []);
  useEffect(() => { if (error) errorBox.current?.focus(); }, [error]);

  function toggleSuggestion(text: string) {
    setSelected(current => current.includes(text) ? current.filter(value => value !== text) : [...current, text]);
  }
  function addMedia(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    const added: Attachment[] = [];
    const issues: string[] = [];
    for (const file of files) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        issues.push('Chỉ nhận ảnh JPG, PNG hoặc WebP.'); continue;
      }
      if (keptImages.length + media.length + added.length >= 5) { issues.push('Mỗi đánh giá được thêm tối đa 5 ảnh.'); continue; }
      if (file.size === 0 || file.size > 5 * 1024 * 1024) {
        issues.push('Mỗi ảnh phải có dung lượng từ 1 byte đến 5 MB.'); continue;
      }
      const url = URL.createObjectURL(file);
      urls.current.add(url);
      added.push({ id: crypto.randomUUID(), url, name: file.name, file });
    }
    setMedia(current => [...current, ...added]);
    const message = [...new Set(issues)].join(' ');
    setMediaError(message);
    if (message) notify.warning(message);
  }
  function removeMedia(attachment: Attachment) {
    if (urls.current.delete(attachment.url)) URL.revokeObjectURL(attachment.url);
    setMedia(current => current.filter(value => value.id !== attachment.id));
    setMediaError('');
    setError('');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current || busy) return;
    setError('');
    const payload = { rating, comment: comment.trim(), images: media.map(attachment => attachment.file) };
    const validation = validateReviewInput(payload);
    if (validation) { setError(validation); notify.warning(validation); return; }
    if (keptImages.length + media.length > 5) { setError('Mỗi đánh giá được thêm tối đa 5 ảnh.'); return; }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    onBusyChange(true);
    try {
      const saved = review
        ? await updateProductReview(review.reviewID, payload, removedPositions, controller.signal)
        : await createProductReview(item.productID, payload, controller.signal);
      client.setQueryData<Review[]>(purchasedReviewsOptions(item.productID, scope).queryKey,
        current => [...(current ?? []).filter(review => review.reviewID !== saved.reviewID), saved]);
      notify.success(review ? 'Đánh giá đã được cập nhật.' : 'Cảm ơn bạn! Đánh giá đã được gửi thành công.');
      onClose();
      void client.invalidateQueries({ queryKey: ['session', scope, 'orders'] });
      void client.invalidateQueries({
        predicate: query => query.queryKey[0] === 'public' && ['reviews', 'products', 'productDetail'].includes(String(query.queryKey[1]))
          || query.queryKey[0] === 'session' && query.queryKey[1] === scope && query.queryKey[2] === 'reviews',
        refetchType: 'none',
      });
    } catch (failure) {
      if (controller.signal.aborted) return;
      const status = failure && typeof failure === 'object' && 'status' in failure ? failure.status : null;
      const message = status === 409 ? 'Sản phẩm này đã được đánh giá. Mỗi tài khoản chỉ được đánh giá một lần.'
        : status === 403 ? 'Bạn chỉ có thể đánh giá sản phẩm đã mua trong đơn hàng đã giao của mình.'
        : status === 401 ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
        : status === 413 ? 'Ảnh vượt quá dung lượng cho phép. Mỗi ảnh tối đa 5 MB.'
        : status === 400 ? 'Ảnh hoặc nội dung chưa hợp lệ. Hãy kiểm tra định dạng, dung lượng ảnh và nhận xét.'
        : 'Chưa gửi được đánh giá. Nội dung vẫn được giữ lại, bạn có thể thử gửi lại.';
      setError(message);
      notify.error(status === 401 ? failure : null, message);
      if (status === 409) void client.invalidateQueries({ queryKey: purchasedReviewsOptions(item.productID, scope).queryKey });
    } finally { request.current = null; setBusy(false); onBusyChange(false); }
  }

  return <form className={styles.card} onSubmit={submit} noValidate aria-label="Đánh giá sản phẩm" aria-busy={busy}>
      <div className={styles.product}>
        <div className={styles.productPicture}>
          {item.productImage && !imageFailed ? <img src={item.productImage} alt={item.productTitle} onError={() => setImageFailed(true)} /> : <Package size={32} aria-label="Chưa có ảnh sản phẩm" />}
        </div>
        <div className={styles.productInfo}><h3>{item.productTitle || item.variantTitle}</h3><p>Phân loại: {item.variantTitle} <span>•</span> Số lượng: {item.quantity}</p></div>
        <strong className={styles.price}>{money(item.unitPrice)}</strong>
      </div>
      <fieldset disabled={busy} className={styles.fields}>
        <div className={styles.ratingRow}>
          <span id={fieldID + "-quality"} className={styles.label}>Chất lượng sản phẩm</span>
          <div className={styles.stars} role="radiogroup" aria-labelledby={fieldID + "-quality"}>
            {[1, 2, 3, 4, 5].map(value => <label key={value} className={styles.star}>
              <input type="radio" name={fieldID + "-rating"} value={value} checked={rating === value} onChange={() => setRating(value)} aria-label={`${value} sao`} />
              <Star size={30} fill={value <= rating ? 'currentColor' : 'none'} aria-hidden="true" />
            </label>)}
          </div>
          <span className={styles.ratingBadge} aria-live="polite">{ratingLabels[rating - 1]} ({rating}/5 sao)</span>
        </div>
        <section className={styles.section} aria-labelledby={fieldID + "-suggestions"}>
          <h3 id={fieldID + "-suggestions"}>Gợi ý đánh giá nhanh</h3>
          <div className={styles.chips}>{suggestions.map(text => <button key={text} type="button" aria-pressed={selected.includes(text)} className={`${styles.chip} ${selected.includes(text) ? styles.chipSelected : ''}`} onClick={() => toggleSuggestion(text)}>
            {selected.includes(text) && <Check size={14} aria-hidden="true" />}{text}
          </button>)}</div>
          {selected.length > 0 && <button className={styles.useSuggestions} type="button" onClick={() => {
            const additions = selected.filter(text => !comment.includes(text));
            const text = [comment.trim(), additions.length ? additions.join('. ') + '.' : ''].filter(Boolean).join(' ');
            if (Array.from(text).length > 500) { setError('Không đủ chỗ để thêm gợi ý. Nhận xét tối đa 500 ký tự.'); return; }
            setComment(text); setError('');
          }}>Thêm gợi ý đã chọn vào nhận xét</button>}
        </section>
        <section className={styles.section}>
          <label className={styles.label} htmlFor={fieldID + "-comment"}>Nhận xét chi tiết <span className={styles.required}>*</span></label>
          <div className={styles.commentBox}>
            <textarea id={fieldID + "-comment"} value={comment} onChange={event => {
              setComment(Array.from(event.target.value).slice(0, 500).join(''));
            }} placeholder="Chia sẻ trải nghiệm thực tế của bạn về chất lượng, cách sử dụng sản phẩm…" aria-describedby={fieldID + "-counter"} required maxLength={500} />
            <span id={fieldID + "-counter"} className={styles.counter} aria-live="polite">{commentCount}/500 ký tự</span>
          </div>
        </section>
        <section className={styles.section} aria-labelledby={fieldID + "-media"}>
          <div className={styles.sectionHeading}><h3 id={fieldID + "-media"}>Hình ảnh thực tế</h3><span>({keptImages.length + media.length}/5)</span></div>
          <p className={styles.hint}>Tối đa 5 ảnh JPG, PNG, WebP, mỗi ảnh không quá 5 MB.</p>
          <div className={styles.mediaList}>
            {keptImages.map(image => <div className={styles.preview} key={`existing-${image.imagePosition}`}>
              <img src={image.imageUrl} alt={`Ảnh đánh giá ${image.imagePosition + 1}`} />
              <button type="button" className={styles.removeMedia} aria-label={`Xóa ảnh hiện có ${image.imagePosition + 1}`}
                onClick={() => { setRemovedPositions(current => [...current, image.imagePosition]); setError(''); setMediaError(''); }}><X size={14} aria-hidden="true" /></button>
            </div>)}
            {media.map(attachment => <div className={styles.preview} key={attachment.id}>
              <img src={attachment.url} alt={attachment.name} />
              <button type="button" className={styles.removeMedia} aria-label={`Xóa ${attachment.name}`} onClick={() => removeMedia(attachment)}><X size={14} aria-hidden="true" /></button>
            </div>)}
            {keptImages.length + media.length < 5 && <button className={styles.upload} type="button" onClick={() => fileInput.current?.click()}><ImagePlus size={26} aria-hidden="true" /><span>Thêm ảnh</span></button>}
          </div>
          <input ref={fileInput} className={styles.fileInput} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addMedia} aria-label="Chọn ảnh đánh giá" />
          {mediaError && <p className={styles.inlineError} role="alert">{mediaError}</p>}
        </section>
      </fieldset>
      {error && <div ref={errorBox} className={styles.error} role="alert" tabIndex={-1}>{error}</div>}
      <div className={styles.formActions}>
        <button type="button" className={styles.secondary} disabled={busy} onClick={onClose}>Để sau</button>
        <button className={styles.primary} type="submit" disabled={busy}><Send size={18} aria-hidden="true" />{busy ? 'Đang gửi đánh giá…' : review ? 'Lưu chỉnh sửa' : 'Gửi đánh giá ngay'}</button>
      </div>
  </form>;
}
