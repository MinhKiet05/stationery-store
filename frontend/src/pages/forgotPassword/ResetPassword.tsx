import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { passwordResetRequest, PasswordResetError } from '../../services/passwordResetApi';
import { notify, userMessage } from '../../utils/notifications';
import styles from './ForgotPassword.module.css';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [token, setToken] = useState(() => {
    const value = new URLSearchParams(window.location.search).get('token') ?? '';
    return value.length <= 256 ? value.trim() : '';
  });
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  useLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('token')) {
      params.delete('token');
      navigate({ pathname: '/reset-password', search: params.toString() }, { replace: true });
    }
  }, [navigate]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current || !token) return;
    if (password !== confirmation) { setError('Mật khẩu xác nhận không khớp.'); return; }
    if (password.length < 8 || password.length > 72 || new TextEncoder().encode(password).length > 72) {
      setError('Mật khẩu cần từ 8–72 ký tự và không vượt quá 72 byte.'); return;
    }
    inFlight.current = true; setBusy(true); setError('');
    try {
      await passwordResetRequest('reset-password', { token, newPassword: password });
      setToken(''); setPassword(''); setConfirmation('');
      localStorage.removeItem('accessToken');
      window.dispatchEvent(new Event('auth-changed'));
      notify.success('Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.');
      navigate('/login', { replace: true });
    } catch (failure) {
      const message = userMessage(failure, 'Không thể đặt lại mật khẩu lúc này. Vui lòng thử lại.');
      setError(message); notify.error(failure, message);
      if (failure instanceof PasswordResetError && failure.status === 400) setToken('');
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <main className={styles.page}><div className={styles.wrapper}><div className={styles.card}>
    <div className={styles.topAccentBar} />
    <div className={styles.cardBody}>
      <h1 className={styles.title}>Đặt lại mật khẩu</h1>
      {error && <p role="alert" className={styles.errorAlert}>{error}</p>}
      {!token ? <div>
        {!error && <p role="alert">Thiếu liên kết đặt lại mật khẩu. Vui lòng mở lại liên kết trong email hoặc yêu cầu liên kết mới.</p>}
        <Link to="/forgot-password" className={styles.backLink}>Yêu cầu liên kết mới</Link>
      </div> : <form className={styles.form} onSubmit={submit} aria-busy={busy}>
        <p className={styles.subtitle}>Mật khẩu cần từ 8–72 ký tự, tối đa 72 byte.</p>
        <label className={styles.label}>Mật khẩu mới<div className={styles.inputBox}>
          <Lock size={18} className={styles.inputIcon} aria-hidden="true" />
          <input type={visible ? 'text' : 'password'} required minLength={8} maxLength={72} autoComplete="new-password"
            value={password} onChange={event => setPassword(event.target.value)} disabled={busy} />
          <button type="button" className={styles.eyeBtn} aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={visible} onClick={() => setVisible(!visible)}>
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div></label>
        <label className={styles.label}>Xác nhận mật khẩu mới<div className={styles.inputBox}>
          <Lock size={18} className={styles.inputIcon} aria-hidden="true" />
          <input type={visible ? 'text' : 'password'} required minLength={8} maxLength={72} autoComplete="new-password"
            value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} />
        </div></label>
        <button type="submit" className={styles.submitBtn} disabled={busy}>{busy ? 'Đang đặt lại mật khẩu…' : 'Xác nhận đặt lại mật khẩu'}</button>
      </form>}
    </div>
  </div></div></main>;
}
