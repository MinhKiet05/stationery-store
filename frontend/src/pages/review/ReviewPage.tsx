import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { BadgeCheck, Check, ChevronLeft, ImagePlus, Package, Send, ShieldCheck, Star, X } from 'lucide-react';
import { api } from '../../services/api';
import { getMyOrders, type Order, type OrderItem } from '../../services/orderService';
import { createProductReview, getProductReviews, updateProductReview, type Review } from '../../services/reviewService';
import { cacheTimes, queryKeys } from '../../services/queryCache';
import { useCurrentUser } from '../../services/storeQueries';
import useSessionScope from '../../services/useSessionScope';
import { notify } from '../../utils/notifications';
import styles from './ReviewPage.module.css';

const baseSuggestions = ['Chất lượng tuyệt vời', 'Dễ sử dụng', 'Đóng gói cẩn thận', 'Giao hàng nhanh chóng', 'Đúng như mô tả'];
const ratingLabels = ['Rất tệ', 'Chưa hài lòng', 'Bình thường', 'Hài lòng', 'Tuyệt vời'];
const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
const positiveID = (value: string | null) => value !== null && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;

export default function ReviewPage() {
  const scope = useSessionScope();
  const [params] = useSearchParams();
  const location = useLocation();
  const productID = positiveID(params.get('productId'));
  const orderID = positiveID(params.get('orderId'));
  const orderDetailID = positiveID(params.get('orderDetailId'));
  useEffect(() => {
    const previous = document.title;
    document.title = 'Đánh giá sản phẩm đã mua | StationeryStore';
    return () => { document.title = previous; };
  }, []);
  if (!localStorage.getItem('accessToken')) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!productID || (params.has('orderId') && !orderID) || (params.has('orderDetailId') && (!orderDetailID || !orderID))) return <ReviewState title="Chọn sản phẩm bạn muốn đánh giá">
    <p>Mở lịch sử đơn hàng và chọn một sản phẩm đã giao thành công để viết đánh giá.</p>
    <Link className={styles.primary} to="/my-profile/orders">Xem sản phẩm đã mua</Link>
  </ReviewState>;
  return <PurchasedReview key={`${scope}:${orderID}:${productID}:${orderDetailID}`} orderID={orderID} productID={productID} orderDetailID={orderDetailID} />;
}

function ReviewState({ title, children }: { title: string; children: ReactNode }) {
  return <main className={styles.page}><div className={styles.container}>
    <h1>Đánh giá sản phẩm đã mua</h1>
    <section className={styles.state}><Package size={36} aria-hidden="true" /><h2>{title}</h2>{children}</section>
  </div></main>;
}

function PurchasedReview({ orderID, productID, orderDetailID }: { orderID: number | null; productID: number; orderDetailID: number | null }) {
  const scope = useSessionScope();
  const identity = useCurrentUser();
  const purchase = useQuery({
    queryKey: queryKeys.private('orders', { reviewOrder: orderID, productID, orderDetailID }, scope),
    queryFn: async ({ signal }) => {
      const orders = orderID ? [await api<Order>(`/api/orders/${orderID}`, { signal })] : await getMyOrders(signal);
      const matches = (item: OrderItem) => item.productID === productID && (!orderDetailID || item.orderDetailID === orderDetailID);
      const order = orders.find(candidate => candidate.status === 'DELIVERED' && candidate.items.some(matches));
      const item = order?.items.find(matches);
      return order && item ? { order, item } : null;
    },
    staleTime: 0,
  });
  const reviews = useQuery({
    queryKey: queryKeys.private('reviews', { productID }, scope),
    queryFn: ({ signal }) => getProductReviews(productID, signal),
    enabled: !!purchase.data && !!identity.data,
    staleTime: cacheTimes.reviews,
  });
  if (purchase.isPending || identity.isPending) return <ReviewState title="Đang kiểm tra sản phẩm đã mua"><p role="status">Đang tải thông tin đơn hàng…</p></ReviewState>;
  if (purchase.isError || identity.isError || !identity.data) return <ReviewState title="Chưa tải được thông tin đơn hàng">
    <p role="alert">Vui lòng thử lại để kiểm tra sản phẩm và tài khoản của bạn.</p>
    <button className={styles.primary} onClick={() => { void purchase.refetch(); void identity.refetch(); }}>Thử lại</button>
    <Link className={styles.backLink} to="/my-profile/orders">Quay lại đơn hàng</Link>
  </ReviewState>;
  if (!purchase.data) return <ReviewState title="Sản phẩm chưa đủ điều kiện đánh giá">
    <p role="alert">Bạn chỉ có thể đánh giá sản phẩm đã mua trong đơn hàng của mình và đã giao thành công.</p>
    <Link className={styles.primary} to="/my-profile/orders">Xem đơn hàng của tôi</Link>
  </ReviewState>;
  if (reviews.isPending) return <ReviewState title="Đang tải đánh giá của bạn"><p role="status">Vui lòng chờ trong giây lát…</p></ReviewState>;
  if (reviews.isError) return <ReviewState title="Chưa tải được đánh giá">
    <p role="alert">Vui lòng thử lại trước khi viết đánh giá để tránh gửi trùng.</p>
    <button className={styles.primary} onClick={() => void reviews.refetch()}>Thử lại</button>
  </ReviewState>;
  const user = identity.data;
  const existing = reviews.data.find(review => review.userID === user.userID || review.username === user.username);
  return <ReviewForm key={existing?.reviewID ?? 'new'} order={purchase.data.order} item={purchase.data.item} existing={existing} />;
}

type Attachment = { id: string; url: string; kind: 'image' | 'video'; name: string; file?: File; position?: number };

function ReviewForm({ order, item, existing }: { order: Order; item: OrderItem; existing?: Review }) {
  const suggestions = baseSuggestions.map((text, index) => index === 1 && /bút|mực/i.test(item.productTitle) ? 'Mực ra đều & êm tay' : text);
  const [rating, setRating] = useState(existing?.rating ?? 5);
  const [selected, setSelected] = useState<string[]>([]);
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [media, setMedia] = useState<Attachment[]>(() => (existing?.images ?? []).map(image => ({
    id: `saved-${image.imagePosition}`, url: image.imageUrl, name: `Ảnh đánh giá ${image.imagePosition + 1}`,
    kind: 'image', position: image.imagePosition,
  })));
  const [anonymous, setAnonymous] = useState(false);
  const [community, setCommunity] = useState(true);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [mediaError, setMediaError] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const urls = useRef(new Set<string>());
  const request = useRef<AbortController | null>(null);
  const commentCount = Array.from(comment).length;
  const productHref = item.productHandle ? '/products/' + encodeURIComponent(item.productHandle) : '/search';
  const reviewHref = item.productHandle ? productHref + '#reviews' : productHref;

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
      const video = ['video/mp4', 'video/webm'].includes(file.type);
      if (!video && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        issues.push('Chỉ nhận ảnh JPG, PNG, WebP hoặc video MP4, WebM.'); continue;
      }
      if (media.length + added.length >= 5) { issues.push('Mỗi đánh giá được thêm tối đa 5 tệp.'); continue; }
      if (video && [...media, ...added].some(attachment => attachment.kind === 'video')) { issues.push('Mỗi đánh giá chỉ được thêm 1 video.'); continue; }
      if (file.size === 0 || file.size > (video ? 20 : 5) * 1024 * 1024) {
        issues.push(video ? 'Video phải có dung lượng từ 1 byte đến 20 MB.' : 'Ảnh phải có dung lượng từ 1 byte đến 5 MB.'); continue;
      }
      const url = URL.createObjectURL(file);
      urls.current.add(url);
      added.push({ id: crypto.randomUUID(), url, kind: video ? 'video' : 'image', name: file.name, file });
    }
    setMedia(current => [...current, ...added]);
    setMediaError([...new Set(issues)].join(' '));
  }
  function removeMedia(attachment: Attachment) {
    if (urls.current.delete(attachment.url)) URL.revokeObjectURL(attachment.url);
    setMedia(current => current.filter(value => value.id !== attachment.id));
    setMediaError('');
    setError('');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current || busy || submitted) return;
    setError('');
    if (!comment.trim() || commentCount > 500) { setError('Hãy viết nhận xét từ 1 đến 500 ký tự.'); return; }
    if (media.some(attachment => attachment.kind === 'video')) {
      setError('Cửa hàng hiện hỗ trợ gửi đánh giá kèm ảnh. Video mới chỉ xem trước; vui lòng xóa video để tiếp tục gửi.'); return;
    }
    if (anonymous || !community) {
      setError('Cửa hàng hiện chỉ hỗ trợ đánh giá công khai dưới tên tài khoản. Vui lòng bỏ chọn ẩn danh và bật chia sẻ đánh giá để tiếp tục.'); return;
    }
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const payload = { rating, comment: comment.trim(), images: media.flatMap(attachment => attachment.file ? [attachment.file] : []) };
      if (existing) {
        const retained = new Set(media.flatMap(attachment => attachment.position === undefined ? [] : [attachment.position]));
        const removed = (existing.images ?? []).filter(image => !retained.has(image.imagePosition)).map(image => image.imagePosition);
        await updateProductReview(existing.reviewID, payload, removed, controller.signal);
      } else await createProductReview(item.productID, payload, controller.signal);
      setSubmitted(true);
      notify.success(existing ? 'Đã cập nhật đánh giá của bạn.' : 'Cảm ơn bạn! Đánh giá đã được gửi thành công.');
    } catch (failure) {
      if (controller.signal.aborted) return;
      const status = failure && typeof failure === 'object' && 'status' in failure ? failure.status : null;
      setError(status === 409 ? 'Bạn đã đánh giá sản phẩm này. Tải lại trang để xem hoặc sửa đánh giá đã gửi.'
        : status === 403 ? 'Bạn chỉ có thể đánh giá sản phẩm đã mua trong đơn hàng đã giao của mình.'
        : status === 401 ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
        : status === 413 ? 'Ảnh vượt quá dung lượng cho phép. Mỗi ảnh tối đa 5 MB.'
        : status === 400 ? 'Ảnh hoặc nội dung chưa hợp lệ. Hãy kiểm tra định dạng, dung lượng ảnh và nhận xét.'
        : 'Chưa gửi được đánh giá. Nội dung vẫn được giữ lại, bạn có thể thử gửi lại.');
    } finally { request.current = null; setBusy(false); }
  }

  return <main className={styles.page}><div className={styles.container}>
    <h1>Đánh giá sản phẩm đã mua</h1>
    <div className={styles.orderBar}>
      <span>Đơn hàng <strong>#ST-{order.orderID}</strong></span>
      <span className={styles.delivered}><BadgeCheck size={15} aria-hidden="true" />Giao hàng thành công</span>
      {order.deliveredAt && <span className={styles.deliveryDate}>Ngày nhận: {new Date(order.deliveredAt).toLocaleDateString('vi-VN')}</span>}
    </div>
    {submitted ? <section className={styles.state} role="status">
      <BadgeCheck size={48} className={styles.successIcon} aria-hidden="true" />
      <h2>{existing ? 'Đã cập nhật đánh giá' : 'Cảm ơn bạn đã đánh giá!'}</h2>
      <p>Đánh giá của bạn về <strong>{item.productTitle}</strong> đã được lưu thành công.</p>
      <div className={styles.successActions}><Link className={styles.primary} to={reviewHref}>Xem đánh giá sản phẩm</Link><Link className={styles.backLink} to="/my-profile/orders">Quay lại đơn hàng</Link></div>
    </section> : <form className={styles.card} onSubmit={submit} aria-label="Đánh giá sản phẩm" aria-busy={busy}>
      <div className={styles.product}>
        <div className={styles.productPicture}>
          {item.productImage && !imageFailed ? <img src={item.productImage} alt={item.productTitle} onError={() => setImageFailed(true)} /> : <Package size={32} aria-label="Chưa có ảnh sản phẩm" />}
        </div>
        <div className={styles.productInfo}><h2>{item.productTitle || item.variantTitle}</h2><p>Phân loại: {item.variantTitle} <span>•</span> Số lượng: {item.quantity}</p></div>
        <strong className={styles.price}>{money(item.unitPrice)}</strong>
      </div>
      {existing && <p className={styles.editNotice} role="status">Bạn đã đánh giá sản phẩm này. Bạn có thể cập nhật nội dung và hình ảnh bên dưới.</p>}
      <fieldset disabled={busy} className={styles.fields}>
        <div className={styles.ratingRow}>
          <span id="quality-label" className={styles.label}>Chất lượng sản phẩm</span>
          <div className={styles.stars} role="radiogroup" aria-labelledby="quality-label">
            {[1, 2, 3, 4, 5].map(value => <label key={value} className={styles.star}>
              <input type="radio" name="rating" value={value} checked={rating === value} onChange={() => setRating(value)} aria-label={`${value} sao`} />
              <Star size={30} fill={value <= rating ? 'currentColor' : 'none'} aria-hidden="true" />
            </label>)}
          </div>
          <span className={styles.ratingBadge} aria-live="polite">{ratingLabels[rating - 1]} ({rating}/5 sao)</span>
        </div>
        <section className={styles.section} aria-labelledby="suggestions-label">
          <h3 id="suggestions-label">Gợi ý đánh giá nhanh</h3>
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
          <label className={styles.label} htmlFor="review-comment">Nhận xét chi tiết <span className={styles.required}>*</span></label>
          <div className={styles.commentBox}>
            <textarea id="review-comment" value={comment} onChange={event => {
              setComment(Array.from(event.target.value).slice(0, 500).join(''));
            }} placeholder="Chia sẻ trải nghiệm thực tế của bạn về chất lượng, cách sử dụng sản phẩm…" aria-describedby="review-counter" required maxLength={500} />
            <span id="review-counter" className={styles.counter} aria-live="polite">{commentCount}/500 ký tự</span>
          </div>
        </section>
        <section className={styles.section} aria-labelledby="media-label">
          <div className={styles.sectionHeading}><h3 id="media-label">Hình ảnh &amp; Video thực tế</h3><span>({media.length}/5)</span></div>
          <p className={styles.hint}>Tối đa 5 tệp: ảnh JPG, PNG, WebP (5 MB/ảnh), tối đa 1 video MP4, WebM (20 MB).</p>
          <div className={styles.mediaList}>
            {media.map(attachment => <div className={styles.preview} key={attachment.id}>
              {attachment.kind === 'video' ? <video src={attachment.url} controls preload="metadata" aria-label={attachment.name} /> : <img src={attachment.url} alt={attachment.name} />}
              <button type="button" className={styles.removeMedia} aria-label={`Xóa ${attachment.name}`} onClick={() => removeMedia(attachment)}><X size={14} aria-hidden="true" /></button>
            </div>)}
            {media.length < 5 && <button className={styles.upload} type="button" onClick={() => fileInput.current?.click()}><ImagePlus size={26} aria-hidden="true" /><span>Thêm ảnh / video</span></button>}
          </div>
          <input ref={fileInput} className={styles.fileInput} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple onChange={addMedia} aria-label="Chọn ảnh hoặc video" />
          {mediaError && <p className={styles.inlineError} role="alert">{mediaError}</p>}
          {media.some(attachment => attachment.kind === 'video') && <p className={styles.inlineError} role="status">Video hiện chỉ xem trước, chưa hỗ trợ gửi lên cửa hàng.</p>}
        </section>
        <section className={styles.privacy} aria-labelledby="privacy-label">
          <h3 id="privacy-label">Thiết lập quyền riêng tư &amp; Cộng đồng</h3>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={anonymous} onChange={event => { setAnonymous(event.target.checked); setError(''); }} />
            <span><strong>Đánh giá ẩn danh</strong><small>Ẩn tên tài khoản khi hiển thị đánh giá của bạn.</small></span>
          </label>
          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={community} onChange={event => { setCommunity(event.target.checked); setError(''); }} />
            <span><strong>Chia sẻ đánh giá với cộng đồng</strong><small>Giúp những người mua khác lựa chọn sản phẩm phù hợp hơn.</small></span>
            <span className={styles.points} title="Chương trình tích điểm chưa được kích hoạt">+50 điểm</span>
          </label>
          <p className={styles.hint}>Hiện hỗ trợ đánh giá công khai dưới tên tài khoản. Chế độ ẩn danh và tích điểm chưa được kích hoạt.</p>
        </section>
        <aside className={styles.policy}>
          <ShieldCheck size={21} aria-hidden="true" />
          <div><h3>Chính sách kiểm duyệt chất lượng</h3><p>Vui lòng chia sẻ đánh giá trung thực về sản phẩm đã mua, không chứa nội dung xúc phạm, thông tin cá nhân hoặc quảng cáo. Đánh giá giúp cộng đồng mua sắm tốt hơn.</p></div>
        </aside>
      </fieldset>
      {error && <div ref={errorBox} className={styles.error} role="alert" tabIndex={-1}>{error}</div>}
      <div className={styles.formActions}>
        <Link to="/my-profile/orders" className={styles.backLink} aria-disabled={busy} onClick={event => { if (busy) event.preventDefault(); }}><ChevronLeft size={17} aria-hidden="true" />Quay lại / Để sau</Link>
        <button className={styles.primary} type="submit" disabled={busy}><Send size={18} aria-hidden="true" />{busy ? 'Đang gửi đánh giá…' : existing ? 'Cập nhật đánh giá' : 'Gửi đánh giá ngay'}</button>
      </div>
    </form>}
  </div></main>;
}
