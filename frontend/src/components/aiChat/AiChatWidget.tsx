import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Sparkles, X, LoaderCircle } from "lucide-react";
import type { Product } from "../productCard/ProductCard";
import { sendChat } from "../../services/aiService";
import styles from "./AiChatWidget.module.css";
type Message = { id: number; role: "user" | "assistant"; text: string; products?: Product[] };
const welcome: Message = { id: 0, role: "assistant", text: "Chào bạn! Mình có thể giúp bạn tìm bút, sổ và dụng cụ học tập. Bạn đang cần gì, với ngân sách bao nhiêu?" };
const money = (value: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value);
export default function AiChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, busy, open]);
  useEffect(() => { if (open) field.current?.focus(); }, [open]);
  function close() { setOpen(false); launcher.current?.focus(); }
  async function submit() {
    const text = input.trim();
    if (!text || busy || request.current || text.length > 1000) return;
    setInput(""); setBusy(true);
    const userMessage: Message = { id: ++sequence.current, role: "user", text };
    setMessages(old => [...old, userMessage].slice(-60));
    const controller = new AbortController(); request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 65000);
    try {
      const data = await sendChat(text, controller.signal);
      const answer: Message = { id: ++sequence.current, role: "assistant", text: data.reply, products: data.products };
      setMessages(old => [...old, answer].slice(-60));
    } catch (err) {
      const answer: Message = { id: ++sequence.current, role: "assistant", text: err instanceof Error && err.name !== "AbortError"
        ? err.message : "Trợ lý đang bận. Bạn thử lại sau nhé." };
      setMessages(old => [...old, answer].slice(-60));
    } finally { window.clearTimeout(timeout); request.current = null; setBusy(false); }
  }
  return <div className={styles.widget}>
    {open && <section id="shopping-chat" role="dialog" aria-label="Trợ lý mua sắm" className={styles.panel}
      onKeyDown={event => { if (event.key === "Escape") close(); }}>
      <header className={styles.heading}>
        <Sparkles size={23} aria-hidden="true" />
        <div><h2>Trợ lý Stationery</h2><p>Tìm món đồ phù hợp với bạn</p></div>
        <button onClick={close} aria-label="Đóng trò chuyện"><X size={21} /></button>
      </header>
      <div className={styles.history} role="log" aria-live="polite" aria-relevant="additions text">
        {messages.map(message => <div key={message.id} className={`${styles.message} ${message.role === "user" ? styles.user : styles.assistant}`}>
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
          {message.products?.map(product => <a className={styles.product} key={product.productID}
            href={`/products/${encodeURIComponent(product.handle || String(product.productID))}`}>
            <div className={styles.productImage}>{product.images?.[0] ? <img src={product.images[0]} alt={product.title} loading="lazy" /> : <Sparkles aria-hidden="true" />}</div>
            <div><h3>{product.title}</h3><strong>{money(product.price)}</strong><span>Xem sản phẩm →</span></div>
          </a>)}
        </div>)}
        {busy && <p className={styles.thinking}><LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Đang tìm sản phẩm…</p>}
        <div ref={end} />
      </div>
      <form className={styles.composer} onSubmit={event => { event.preventDefault(); void submit(); }}>
        <label className="sr-only" htmlFor="chat-message">Nhu cầu mua sắm</label>
        <textarea id="chat-message" ref={field} rows={2} maxLength={1000} value={input}
          placeholder="Ví dụ: Bút bi dưới 20.000 đồng" onChange={event => setInput(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }} />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Gửi tin nhắn"><Send size={19} /></button>
        <small>Enter để gửi · Shift + Enter để xuống dòng</small>
      </form>
    </section>}
    <button ref={launcher} className={styles.launcher} onClick={() => open ? close() : setOpen(true)}
      aria-expanded={open} aria-controls="shopping-chat" aria-label={open ? "Đóng trợ lý mua sắm" : "Mở trợ lý mua sắm"}>
      {open ? <X size={24} /> : <MessageCircle size={24} />}<span>Hỏi trợ lý</span>
    </button>
  </div>;
}
