import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft, CalendarDays, Check, CheckCheck, ChevronDown,
  CircleAlert, CircleCheck, Headphones, Info, Link2, LoaderCircle,
  Mail, MapPin, Minus, Package, PackageCheck, Plus, RotateCcw, Send,
  ShieldCheck, Truck, Wallet, X,
} from "lucide-react";
import { getMyOrders, getOrder, type Order } from "../../services/orderService";
import {
  createReturn, eligibilityMessage, getMyReturns, getReturnItemPresentations,
  isEvidenceUrl, remainingQuantity, returnDeadline, returnErrorMessage,
  returnStatusLabels, shopDate, type ItemPresentation, type ReturnRequest as ReturnRecord,
} from "../../services/returnService";
import { ApiError } from "../../services/api";
import { Link, useLocation, useNavigate } from "react-router-dom";
import useSessionScope from "../../services/useSessionScope";
import styles from "./ReturnRequest.module.css";

const money = (amount: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(amount);
const dateLabel = (value: string) => new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(shopDate(value));
const reasonOptions = ["Sản phẩm bị lỗi / Hư hỏng do vận chuyển hoặc sản xuất", "Giao sai sản phẩm / Không đúng mô tả", "Giao thiếu sản phẩm / Phụ kiện", "Lý do khác"];
const conditionOptions = ["Bút bị chảy mực / tắc mực", "Hộp bị móp méo / giấy vỡ", "Sai màu so với đơn đặt", "Giao thiếu quà tặng / phụ kiện"];

function initialOrderID() {
  const match = window.location.pathname.match(/^\/orders\/(\d+)\/returns?(?:\/new)?\/?$/);
  const raw = match?.[1] ?? new URLSearchParams(window.location.search).get("orderId");
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function SectionTitle({ number, title, children }: { number: number; title: string; children?: ReactNode }) {
  return <div className={styles.sectionTitle}><h2><span>{number}</span>{title}</h2>{children}</div>;
}

function ProductImage({ image, title }: { image?: string; title: string }) {
  const [failed, setFailed] = useState(false);
  return <div className={styles.productImage}>{image && !failed
    ? <img src={image} alt={title} onError={() => setFailed(true)} />
    : <Package size={27} aria-hidden="true" />}</div>;
}

export default function ReturnRequest() {
  const scope = useSessionScope();
  const { pathname, search } = useLocation();
  return <ReturnRequestForm key={`${scope}:${pathname}:${search}`} />;
}

function ReturnRequestForm() {
  const navigate = useNavigate();
  const token = localStorage.getItem("accessToken");
  const [orderID, setOrderID] = useState<number | null>(initialOrderID);
  const [orders, setOrders] = useState<Order[]>([]);
  const [order, setOrder] = useState<Order | null>(null);
  const [requests, setRequests] = useState<ReturnRecord[]>([]);
  const [presentations, setPresentations] = useState<Record<number, ItemPresentation>>({});
  const [loadedRequest, setLoadedRequest] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const requestKey = `${orderID}:${refresh}`;
  const loading = Boolean(token) && loadedRequest !== requestKey;
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [reason, setReason] = useState("");
  const [conditions, setConditions] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState([""]);
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<ReturnRecord | null>(null);
  const [now, setNow] = useState(Date.now);
  const submitting = useRef(false);
  const submitController = useRef<AbortController | null>(null);

  useEffect(() => {
    const previous = document.title;
    document.title = "Yêu cầu Trả hàng / Hoàn tiền | StationeryStore";
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => {
      document.title = previous;
      window.clearInterval(timer);
      submitController.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void Promise.all([
      getMyOrders(controller.signal), getMyReturns(controller.signal),
      orderID === null ? Promise.resolve(null) : getOrder(orderID, controller.signal),
    ]).then(([myOrders, myReturns, selectedOrder]) => {
      if (controller.signal.aborted) return;
      setLoadError(""); setPresentations({});
      setOrders(myOrders); setRequests(myReturns); setOrder(selectedOrder); setNow(Date.now());
      setCreated(previous => previous ? myReturns.find(request => request.returnID === previous.returnID) ?? previous : null);
      setQuantities(previous => Object.fromEntries(Object.entries(previous)
        .flatMap(([id, quantity]) => {
          const item = selectedOrder?.items.find(candidate => candidate.orderDetailID === Number(id));
          const maximum = item ? remainingQuantity(item, myReturns.filter(request => request.orderID === selectedOrder?.orderID)) : 0;
          return maximum > 0 ? [[id, Math.min(quantity, maximum)]] : [];
        })));
      if (selectedOrder) void getReturnItemPresentations(selectedOrder.items, controller.signal)
        .then(data => { if (!controller.signal.aborted) setPresentations(data); });
    }).catch(error => {
      if (!controller.signal.aborted) { setLoadError(returnErrorMessage(error)); setOrder(null); }
    }).finally(() => { if (!controller.signal.aborted) setLoadedRequest(requestKey); });
    return () => controller.abort();
  }, [token, orderID, refresh, requestKey]);

  const orderRequests = requests.filter(request => request.orderID === orderID);
  const blocked = order ? eligibilityMessage(order, now) : null;
  const deadline = order ? returnDeadline(order) : null;
  const daysLeft = deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 86400000));
  const selectedItems = order?.items.filter(item => quantities[item.orderDetailID] > 0) ?? [];
  const itemValue = selectedItems.reduce((sum, item) => sum + item.unitPrice * quantities[item.orderDetailID], 0);
  const availableItems = order?.items.filter(item => remainingQuantity(item, orderRequests) > 0) ?? [];
  const canRequest = Boolean(order && !blocked && availableItems.length > 0);
  const reviewApproved = created?.status === "APPROVED" || created?.status === "COMPLETED";
  const completed = created?.status === "COMPLETED";
  const loginHref = `/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;

  function clearError(field: string) {
    setErrors(previous => { const next = { ...previous }; delete next[field]; return next; });
    setSubmitError("");
  }

  function selectOrder(value: string) {
    setOrderID(value ? Number(value) : null); setOrder(null); setQuantities({});
    setCreated(null); setReason(""); setDescription(""); setConditions([]);
    setEvidence([""]); setConfirmed(false); setErrors({}); setSubmitError("");
    navigate(value ? `/returns/new?orderId=${value}` : '/returns/new', { replace: true });
  }

  function toggleItem(id: number) {
    setQuantities(previous => {
      const next = { ...previous };
      if (next[id]) delete next[id]; else next[id] = 1;
      return next;
    });
    clearError("items");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !order) return;
    const invalid: Record<string, string> = {};
    const eligibility = eligibilityMessage(order);
    if (eligibility) { setSubmitError(eligibility); return; }
    if (!selectedItems.length) invalid.items = "Vui lòng chọn ít nhất một sản phẩm cần trả.";
    if (selectedItems.some(item => quantities[item.orderDetailID] > remainingQuantity(item, orderRequests))) invalid.items = "Số lượng trả vượt quá số lượng còn lại.";
    if (!reason) invalid.reason = "Vui lòng chọn lý do trả hàng.";
    if (description.trim().length < 10) invalid.description = "Vui lòng mô tả ít nhất 10 ký tự nội dung.";
    if (evidence.length < 1 || evidence.length > 5 || evidence.some(url => !isEvidenceUrl(url))) invalid.evidence = "Vui lòng nhập 1–5 liên kết http:// hoặc https:// hợp lệ, tối đa 500 ký tự mỗi liên kết.";
    if (!confirmed) invalid.confirmed = "Vui lòng xác nhận thông tin trước khi gửi yêu cầu.";
    setErrors(invalid); setSubmitError("");
    if (Object.keys(invalid).length) {
      document.getElementById(`return-${Object.keys(invalid)[0]}`)?.focus();
      return;
    }
    const combinedReason = [reason, conditions.length ? `Tình trạng: ${conditions.join("; ")}` : "", description.trim()].filter(Boolean).join("\n");
    submitting.current = true; setBusy(true);
    submitController.current = new AbortController();
    try {
      const response = await createReturn({
        orderID: order.orderID, reason: combinedReason,
        evidenceUrls: evidence.map(url => url.trim()),
        items: selectedItems.map(item => ({ orderDetailID: item.orderDetailID, quantity: quantities[item.orderDetailID] })),
      }, submitController.current.signal);
      if (localStorage.getItem("accessToken") !== token) return;
      setCreated(response); setRequests(previous => [response, ...previous]);
      setOrder(previous => previous ? { ...previous, status: "RETURN_PENDING" } : null);
      setQuantities({}); window.scrollTo({ top: 0 });
    } catch (error) {
      if (submitController.current.signal.aborted) return;
      setSubmitError(error instanceof ApiError ? returnErrorMessage(error)
        : "Chưa xác nhận được yêu cầu đã gửi hay chưa. Vui lòng tải lại và kiểm tra lịch sử yêu cầu trước khi gửi lại; nội dung bạn nhập vẫn được giữ.");
    } finally { submitting.current = false; setBusy(false); }
  }

  return <main className={styles.page}>
    <div className={styles.container}>
      <header className={styles.pageHeading}>
        <div><div className={styles.meta}>{order?.deliveredAt && <span><CalendarDays size={14} /> Giao thành công: {dateLabel(order.deliveredAt)}</span>}</div><div className={styles.titleRow}><h1>Yêu cầu Trả hàng / Hoàn tiền</h1>{order && <span className={styles.orderCode}>#ST-{String(order.orderID).padStart(6, "0")}</span>}</div></div>
        {order && !blocked && <div className={styles.deadline}><span className={styles.shieldIcon}><ShieldCheck size={23} /></span><div><strong>{daysLeft === 0 ? "Đến hạn trả hàng hôm nay" : `Còn ${daysLeft} ngày để yêu cầu đổi trả`}</strong><p>Gửi yêu cầu trong 7 ngày từ khi nhận hàng</p></div><Info size={13} /></div>}
      </header>

      <ol className={styles.steps} aria-label="Tiến trình trả hàng">
        <li className={!created ? styles.currentStep : styles.doneStep} aria-current={!created ? "step" : undefined}><span>{created ? <Check size={18} /> : "1"}</span><div><strong>Gửi yêu cầu & bằng chứng</strong><p>{created ? "Đã gửi yêu cầu thành công" : "Đang thực hiện (bước hiện tại)"}</p></div></li>
        <li className={reviewApproved ? styles.doneStep : created?.status === "PENDING" ? styles.currentStep : ""} aria-current={created?.status === "PENDING" ? "step" : undefined}><span>{reviewApproved ? <Check size={18} /> : "2"}</span><div><strong>StationeryStore duyệt hồ sơ</strong><p>{created?.status === "REJECTED" ? "Yêu cầu đã bị từ chối" : "Theo dõi kết quả trong lịch sử yêu cầu"}</p></div></li>
        <li className={completed ? styles.doneStep : reviewApproved ? styles.currentStep : ""} aria-current={reviewApproved && !completed ? "step" : undefined}><span>{completed ? <Check size={18} /> : "3"}</span><div><strong>Thu hồi hàng & Hoàn tiền</strong><p>{completed ? "Cửa hàng đánh dấu yêu cầu hoàn tất" : "CSKH xác nhận sau khi xét duyệt"}</p></div></li>
      </ol>

      {!token ? <section className={styles.emptyState}><span className={styles.emptyIcon}><ShieldCheck size={34} /></span><h2>Đăng nhập để gửi yêu cầu trả hàng</h2><p>Chúng tôi cần xác nhận đơn hàng thuộc tài khoản của bạn trước khi tiếp nhận.</p><Link className={styles.primaryButton} to={loginHref}>Đăng nhập & Tiếp tục</Link></section>
        : loading ? <div className={styles.loading} role="status"><LoaderCircle className={styles.spinner} size={26} /> Đang tải đơn hàng và kiểm tra điều kiện trả hàng…</div>
        : loadError ? <section className={styles.emptyState}><CircleAlert size={32} /><h2>Chưa tải được thông tin đơn hàng</h2><p role="alert">{loadError}</p><button className={styles.primaryButton} onClick={() => setRefresh(value => value + 1)}>Thử lại</button><Link to="/returns/new">Chọn đơn hàng khác</Link></section>
        : <>
          {created ? <section className={styles.success} role="status"><CircleCheck size={42} /><div><span className={styles.processTag}>ĐÃ TIẾP NHẬN</span><h2>Yêu cầu #{created.returnID} đã được gửi thành công</h2><p>Trạng thái: <strong>{returnStatusLabels[created.status]}</strong>. Cửa hàng sẽ kiểm tra minh chứng và phản hồi tại lịch sử bên dưới.</p><p>Việc gửi yêu cầu chưa thực hiện hoàn tiền. Vui lòng giữ sản phẩm và bao bì để phối hợp thu hồi.</p></div><button type="button" className={styles.secondaryButton} onClick={() => { setCreated(null); setRefresh(value => value + 1); setReason(""); setDescription(""); setConditions([]); setEvidence([""]); setConfirmed(false); }}>Quay lại đơn hàng</button></section>
            : <section className={styles.orderPicker}><label htmlFor="return-order">Chọn đơn hàng cần hỗ trợ</label><div className={styles.selectWrap}><select id="return-order" value={orderID ?? ""} onChange={event => selectOrder(event.target.value)}><option value="">— Chọn đơn hàng của bạn —</option>{orders.map(candidate => <option key={candidate.orderID} value={candidate.orderID}>#ST-{String(candidate.orderID).padStart(6, "0")} · {dateLabel(candidate.orderDate)} · {money(candidate.totalAmount)}</option>)}</select><ChevronDown size={16} /></div>{orders.length === 0 && <p>Bạn chưa có đơn hàng nào. <Link to="/">Khám phá sản phẩm tại cửa hàng</Link>.</p>}</section>}

          {order && !created && <>
            {blocked && <p className={styles.blocked} role="alert"><CircleAlert size={19} />{blocked}</p>}
            {!blocked && availableItems.length === 0 && <p className={styles.blocked} role="alert"><Info size={19} />Tất cả số lượng trong đơn đã nằm trong các yêu cầu trả hàng. Vui lòng xem lịch sử bên dưới.</p>}
            <form className={styles.formGrid} noValidate onSubmit={submit}>
              <fieldset className={styles.formSections} disabled={busy || !canRequest}>
                <section className={styles.card}>
                  <SectionTitle number={1} title="Chọn sản phẩm bạn muốn hoàn trả"><label className={styles.selectAll}><input type="checkbox" checked={availableItems.length > 0 && selectedItems.length === availableItems.length} onChange={event => { setQuantities(event.target.checked ? Object.fromEntries(availableItems.map(item => [item.orderDetailID, 1])) : {}); clearError("items"); }} />Chọn tất cả ({selectedItems.length}/{order.items.length} món)</label></SectionTitle>
                  <div id="return-items" tabIndex={-1} aria-describedby={errors.items ? "return-items-error" : undefined}>
                    {order.items.map(item => {
                      const maximum = remainingQuantity(item, orderRequests);
                      const quantity = quantities[item.orderDetailID] ?? 0;
                      const presentation = presentations[item.orderDetailID];
                      return <div key={item.orderDetailID} className={`${styles.productRow} ${quantity ? styles.selectedProduct : ""} ${maximum === 0 ? styles.unavailable : ""}`}>
                        <input type="checkbox" aria-label={`Trả ${presentation?.title || item.variantTitle}`} checked={quantity > 0} disabled={maximum === 0} onChange={() => toggleItem(item.orderDetailID)} />
                        <ProductImage key={presentation?.image} image={presentation?.image} title={presentation?.title || item.variantTitle} />
                        <div className={styles.productCopy}><h3>{presentation?.title || item.variantTitle}</h3><p>Phân loại: {item.variantTitle}</p><span><strong>{money(item.unitPrice)}</strong> / món · Đã mua {item.quantity}</span>{maximum < item.quantity && <small>Còn {maximum} món có thể trả</small>}</div>
                        {quantity > 0 && <div className={styles.quantity}><button type="button" aria-label={`Giảm số lượng ${item.variantTitle}`} disabled={quantity <= 1} onClick={() => setQuantities(previous => ({ ...previous, [item.orderDetailID]: quantity - 1 }))}><Minus size={13} /></button><output aria-label={`Số lượng trả ${item.variantTitle}`}>{quantity}</output><button type="button" aria-label={`Tăng số lượng ${item.variantTitle}`} disabled={quantity >= maximum} onClick={() => setQuantities(previous => ({ ...previous, [item.orderDetailID]: quantity + 1 }))}><Plus size={13} /></button></div>}
                        <div className={styles.productAmount}>{maximum === 0 ? <span className={styles.disabledBadge}>Đã yêu cầu trả</span> : quantity > 0 ? <><span>Giá trị trả</span><strong>{money(item.unitPrice * quantity)}</strong></> : <span>Chưa chọn trả</span>}</div>
                      </div>;
                    })}
                  </div>
                  {errors.items && <p id="return-items-error" className={styles.fieldError}>{errors.items}</p>}
                  <p className={styles.note}><Info size={14} />Số lượng đang chờ duyệt, đã chấp thuận hoặc đã hoàn tất sẽ được trừ khỏi số lượng có thể trả.</p>
                </section>

                <section className={styles.card}>
                  <SectionTitle number={2} title="Lý do yêu cầu trả hàng" />
                  <label className={styles.field} htmlFor="return-reason">Lý do chính <span>*</span></label><div className={styles.selectWrap}><select id="return-reason" value={reason} onChange={event => { setReason(event.target.value); clearError("reason"); }} aria-invalid={Boolean(errors.reason)} aria-describedby={errors.reason ? "return-reason-error" : undefined}><option value="">Chọn lý do phù hợp</option>{reasonOptions.map(option => <option key={option}>{option}</option>)}</select><ChevronDown size={16} /></div>
                  {errors.reason && <p id="return-reason-error" className={styles.fieldError}>{errors.reason}</p>}
                  <p className={styles.chipLabel}>Chọn nhanh tình trạng cụ thể:</p><div className={styles.conditions}>{conditionOptions.map(condition => <button key={condition} type="button" aria-pressed={conditions.includes(condition)} className={conditions.includes(condition) ? styles.activeCondition : ""} onClick={() => setConditions(previous => previous.includes(condition) ? previous.filter(value => value !== condition) : [...previous, condition])}>{conditions.includes(condition) && <Check size={12} />}{condition}</button>)}</div>
                  <label className={styles.textareaLabel} htmlFor="return-description">Mô tả chi tiết tình trạng <span>*</span><small>{description.length}/500 ký tự</small></label><textarea id="return-description" placeholder="Mô tả sản phẩm gặp vấn đề gì, tình trạng bao bì khi nhận hàng và mong muốn được hỗ trợ…" value={description} maxLength={500} rows={5} onChange={event => { setDescription(event.target.value); clearError("description"); }} aria-invalid={Boolean(errors.description)} aria-describedby="return-description-help" />
                  <p id="return-description-help" className={errors.description ? styles.fieldError : styles.fieldHelp}>{errors.description || "Tối thiểu 10 ký tự. Vui lòng cung cấp thông tin chân thực để CSKH thẩm định nhanh nhất."}</p>
                </section>

                <section className={styles.card}>
                  <SectionTitle number={3} title="Hình ảnh & Video minh chứng"><span className={styles.requiredBadge}>Bắt buộc · Tối đa 5 liên kết</span></SectionTitle>
                  <div className={styles.evidenceIntro}><span><Link2 size={23} /></span><h3>Thêm liên kết ảnh hoặc video minh chứng</h3><p>Dán liên kết công khai đến ảnh sản phẩm lỗi, bao bì hoặc video mở hộp. Hãy bật quyền xem để cửa hàng có thể kiểm tra.</p></div>
                  <div id="return-evidence" tabIndex={-1}>{evidence.map((url, index) => <div className={styles.evidenceRow} key={index}><span className={styles.linkNumber}><Link2 size={16} /></span><label className={styles.srOnly} htmlFor={`evidence-${index}`}>Liên kết minh chứng {index + 1}</label><input id={`evidence-${index}`} type="url" inputMode="url" maxLength={500} value={url} placeholder={`Liên kết minh chứng ${index + 1} · https://…`} aria-invalid={Boolean(errors.evidence)} onChange={event => { setEvidence(previous => previous.map((value, itemIndex) => itemIndex === index ? event.target.value : value)); clearError("evidence"); }} /><button type="button" aria-label={`Xóa minh chứng ${index + 1}`} disabled={evidence.length === 1 && !url} onClick={() => { setEvidence(previous => previous.length === 1 ? [""] : previous.filter((_, itemIndex) => itemIndex !== index)); clearError("evidence"); }}><X size={17} /></button></div>)}</div>
                  {errors.evidence && <p className={styles.fieldError} role="alert">{errors.evidence}</p>}
                  <button className={styles.addEvidence} type="button" disabled={evidence.length >= 5} onClick={() => setEvidence(previous => [...previous, ""])}><Plus size={16} />Thêm minh chứng <span>({evidence.length}/5)</span></button>
                  <p className={styles.fieldHelp}>Hỗ trợ liên kết http:// hoặc https://, tối đa 500 ký tự mỗi liên kết.</p>
                </section>

                <section className={styles.card}>
                  <SectionTitle number={4} title="Hoàn tiền & Thu hồi hàng hóa" />
                  <div className={styles.refundMethod}><span><Wallet size={23} /></span><div><h3>Phương thức hoàn tiền được xác nhận cùng CSKH</h3><p>Cửa hàng sẽ liên hệ sau khi chấp thuận yêu cầu để thống nhất cách thu hồi và hoàn tiền phù hợp với đơn hàng.</p></div><ShieldCheck size={20} /></div>
                  <div className={styles.addressHeading}><h3><Truck size={18} />Địa chỉ giao hàng của đơn</h3><Link to="/about#contact">Liên hệ hỗ trợ địa chỉ</Link></div><div className={styles.address}><MapPin size={20} /><div><strong>{order.contactPhone || "Chưa có số điện thoại"}</strong><p>{order.shippingAddress}</p></div></div>
                  <p className={styles.fieldHelp}><Info size={13} />Vui lòng giữ sản phẩm và bao bì. CSKH sẽ xác nhận địa chỉ lấy hàng, phí vận chuyển và thời gian xử lý.</p>
                </section>
              </fieldset>

              <aside className={styles.sidebar}>
                <section className={`${styles.card} ${styles.summary}`}>
                  <h2>Tóm tắt hoàn tiền</h2><dl><div><dt>Sản phẩm chọn trả ({selectedItems.length} món):</dt><dd data-testid="return-subtotal">{money(itemValue)}</dd></div><div><dt>Hoàn phí vận chuyển:</dt><dd>CSKH xác nhận</dd></div><div><dt>Phí thu hồi hàng:</dt><dd>CSKH xác nhận</dd></div></dl><div className={styles.total}><strong>Giá trị sản phẩm dự kiến:</strong><span data-testid="return-total">{money(itemValue)}</span></div><p className={styles.estimateNote}>Tạm tính theo giá sản phẩm đã mua. Số tiền hoàn cuối cùng được cửa hàng xác nhận sau khi xét duyệt, có tính đến ưu đãi của đơn hàng.</p>
                  <label className={styles.confirmation}><input id="return-confirmed" type="checkbox" checked={confirmed} disabled={busy || !canRequest} onChange={event => { setConfirmed(event.target.checked); clearError("confirmed"); }} aria-invalid={Boolean(errors.confirmed)} /><span>Tôi xác nhận thông tin cung cấp và hình ảnh minh chứng là hoàn toàn trung thực; sản phẩm được giữ nguyên để phục vụ việc kiểm tra theo <Link to="/policy#returns">chính sách đổi trả 7 ngày</Link> của StationeryStore.</span></label>{errors.confirmed && <p className={styles.fieldError}>{errors.confirmed}</p>}
                  {submitError && <div className={styles.submitError} role="alert"><CircleAlert size={18} /><span>{submitError}<button type="button" disabled={busy} onClick={() => setRefresh(value => value + 1)}>Tải lại đơn hàng & lịch sử</button></span></div>}
                  <button className={styles.submitButton} type="submit" disabled={busy || !canRequest}>{busy ? <LoaderCircle className={styles.spinner} size={18} /> : <Send size={17} />}{busy ? "Đang gửi yêu cầu…" : "Gửi yêu cầu trả hàng"}</button><button className={styles.cancelButton} type="button" disabled={busy} onClick={() => selectOrder("")}><ArrowLeft size={14} />Hủy bỏ & Chọn đơn hàng khác</button><div className={styles.support}><span>Cần xử lý khiếu nại gấp?</span><a href="tel:19006868"><Headphones size={14} />Hotline 1900 6868 (8:00 – 21:00)</a></div>
                </section>
                <section className={styles.rights}><h3><ShieldCheck size={17} />Quyền lợi đổi trả StationeryStore</h3><p><CheckCheck size={14} />Gửi yêu cầu trong 7 ngày từ thời điểm giao hàng thành công.</p><p><PackageCheck size={14} />Theo dõi kết quả xét duyệt và ghi chú từ cửa hàng.</p><p><Mail size={14} />CSKH hỗ trợ thống nhất phương thức thu hồi và hoàn tiền sau khi chấp thuận.</p></section>
              </aside>
            </form>
          </>}

          {(orderID ? orderRequests : requests).length > 0 && <section className={`${styles.card} ${styles.history}`}><div className={styles.historyHeading}><h2><RotateCcw size={20} />Lịch sử yêu cầu {orderID ? "của đơn hàng" : "của bạn"}</h2><button type="button" disabled={busy || loading} onClick={() => setRefresh(value => value + 1)}>Cập nhật trạng thái</button></div>{(orderID ? orderRequests : requests).map(request => <details key={request.returnID}><summary><span>Yêu cầu #{request.returnID}<small>Đơn #{request.orderID} · {dateLabel(request.createdAt)}</small></span><span className={`${styles.statusBadge} ${styles[`status${request.status}`]}`}>{returnStatusLabels[request.status]}</span><ChevronDown size={15} /></summary><div className={styles.historyDetails}><p>{request.reason}</p><p><strong>Số lượng đã yêu cầu:</strong> {request.items.reduce((sum, item) => sum + item.quantity, 0)} sản phẩm</p>{request.adminNote && <p><strong>Phản hồi của cửa hàng:</strong> {request.adminNote}</p>}<ul>{request.evidenceUrls.filter(isEvidenceUrl).map((url, index) => <li key={`${index}-${url}`}><a href={url} target="_blank" rel="noreferrer">Xem minh chứng {index + 1}</a></li>)}</ul></div></details>)}</section>}
          {!order && !orders.length && !loadError && <div className={styles.emptyState}><Package size={35} /><h2>Chưa có đơn hàng để tạo yêu cầu</h2><p>Các đơn hàng của bạn sẽ xuất hiện tại đây sau khi mua hàng.</p></div>}
        </>}
      <div className={styles.bottomNote}><ShieldCheck size={16} />Chúng tôi luôn ở đây để lắng nghe và hỗ trợ bạn.</div>
    </div>
  </main>;
}
