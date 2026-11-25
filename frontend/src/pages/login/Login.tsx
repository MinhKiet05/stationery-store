import { useState, type FormEvent } from "react";
import { login } from "../../services/authService";
import styles from "../productDetail/ProductDetail.module.css";
export default function Login() {
  const requestedRedirect = new URLSearchParams(window.location.search).get("redirect");
  let redirect = "/";
  if (requestedRedirect?.startsWith("/")) {
    try {
      const destination = new URL(requestedRedirect, window.location.origin);
      if (destination.origin === window.location.origin) redirect = destination.pathname + destination.search + destination.hash;
    } catch { /* Keep the storefront as the fallback for an invalid URL. */ }
  }
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await login(username, password);
      if (result.cartSynced) window.location.href = redirect;
      else setError("Đăng nhập thành công. Chưa đồng bộ được giỏ khách; giỏ hàng vẫn được lưu. Bạn có thể bấm Tiếp tục để mở trang đã chọn.");
    } catch (err) { setError(err instanceof Error ? err.message : "Đăng nhập thất bại."); }
    finally { setBusy(false); }
  }
  return <main className={styles.page}><form className={styles.login} onSubmit={submit}>
    <h1>Đăng nhập</h1>
    <label>Tên đăng nhập<input required autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} /></label>
    <label>Mật khẩu<input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
    {error && <p role="alert">{error}</p>}
    <button disabled={busy}>{busy ? "Đang đăng nhập…" : "Đăng nhập"}</button><a href={redirect}>{redirect === "/" ? "Về trang chủ" : "Tiếp tục"}</a>
  </form></main>;
}
