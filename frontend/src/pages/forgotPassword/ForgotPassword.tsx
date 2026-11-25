import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { AtSign, Mail, ArrowLeft } from 'lucide-react';
import { passwordResetRequest, PasswordResetError } from '../../services/passwordResetApi';
import { notify, userMessage } from '../../utils/notifications';
import styles from './ForgotPassword.module.css';

export default function ForgotPassword() {
  const location = useLocation();
  if (new URLSearchParams(location.search).has('token')) {
    return <Navigate to={{ pathname: '/reset-password', search: location.search }} replace />;
  }
  return <RequestResetForm />;
}

function RequestResetForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [availableAt, setAvailableAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const inFlight = useRef(false);
  const remaining = Math.max(0, Math.ceil((availableAt - now) / 1000));
  useEffect(() => {
    if (!availableAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [availableAt]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || Date.now() < availableAt) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      await passwordResetRequest('forgot-password', { email: email.trim().toLowerCase() });
      setSent(true);
      setAvailableAt(Date.now() + 60000); setNow(Date.now());
      notify.info('Nếu email tồn tại, chúng tôi sẽ gửi liên kết đặt lại mật khẩu.');
    } catch (failure) {
      const message = userMessage(failure, 'Không thể gửi yêu cầu khôi phục mật khẩu. Vui lòng thử lại.');
      setError(message); notify.error(failure, message);
      if (failure instanceof PasswordResetError && failure.status === 429) {
        setAvailableAt(Date.now() + failure.retryAfter * 1000); setNow(Date.now());
      }
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <main className={styles.page}><div className={styles.wrapper}><div className={styles.card}>
    <div className={styles.topAccentBar} />
    <div className={styles.cardBody}>
      <div className={styles.heroIconWrap}><div className={styles.heroIconCircle}><Mail size={26} aria-hidden="true" /></div></div>
      <h1 className={styles.title}>Khôi phục mật khẩu</h1>
      {error && <p className={styles.errorAlert} role="alert">{error}</p>}
      {sent && <div className={styles.successAlert} role="status">
        <strong>Kiểm tra email của bạn</strong>
        <p>Nếu email tồn tại, chúng tôi sẽ gửi liên kết đặt lại mật khẩu. Vui lòng kiểm tra Hộp thư đến (Inbox) và thư rác (Spam). Liên kết có hiệu lực trong 15 phút.</p>
      </div>}
      <form className={styles.form} onSubmit={submit} aria-busy={busy}>
        {!sent && <label className={styles.label}>Email đăng ký<div className={styles.inputBox}>
          <AtSign size={18} className={styles.inputIcon} aria-hidden="true" />
          <input type="email" autoComplete="email" required maxLength={254} value={email} disabled={busy}
            onChange={event => setEmail(event.target.value)} placeholder="ban@example.com" />
        </div></label>}
        <button className={styles.submitBtn} type="submit" disabled={busy || remaining > 0}>
          {busy ? 'Đang gửi yêu cầu…' : remaining > 0 ? `Gửi lại sau ${remaining} giây` : sent ? 'Gửi lại liên kết' : 'Gửi liên kết đặt lại mật khẩu'}
        </button>
        {sent && <button type="button" className={styles.backLink} disabled={busy} onClick={() => { setSent(false); setError(''); }}>Thay đổi email</button>}
      </form>
    </div>
    <div className={styles.cardFooter}><Link to="/login" className={styles.backLink}><ArrowLeft size={16} />Quay lại đăng nhập</Link></div>
  </div></div></main>;
}
