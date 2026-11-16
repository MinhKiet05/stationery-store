import { useState, type FormEvent } from 'react';
import { UserRound } from 'lucide-react';
import { updateMyProfile, type UpdateProfileRequest } from '../../../services/userService';
import { useProfile } from '../profileContext';
import styles from './AccountInfoTab.module.css';

export default function AccountInfoTab() {
  const { profile, updateProfile } = useProfile();
  const [form, setForm] = useState<UpdateProfileRequest>(() => ({
    email: profile.email,
    fullName: profile.fullName ?? '',
    phoneNumber: profile.phoneNumber ?? '',
    address: profile.address ?? '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const updated = await updateMyProfile({
        email: form.email.trim(),
        fullName: form.fullName?.trim() || null,
        phoneNumber: form.phoneNumber?.trim() || null,
        address: form.address?.trim() || null,
      });
      updateProfile(updated);
      setForm({ email: updated.email, fullName: updated.fullName ?? '', phoneNumber: updated.phoneNumber ?? '', address: updated.address ?? '' });
      setMessage('Đã lưu thông tin tài khoản.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể lưu thông tin. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setForm({ email: profile.email, fullName: profile.fullName ?? '', phoneNumber: profile.phoneNumber ?? '', address: profile.address ?? '' });
    setError('');
    setMessage('');
  }

  return (
    <div className={styles.tabContainer}>
      <div className={styles.header}>
        <h2>Hồ sơ của tôi</h2>
        <p>Quản lý thông tin cá nhân và địa chỉ nhận hàng của bạn.</p>
      </div>
      <div className={styles.avatarSection}>
        <UserRound size={56} aria-hidden="true" />
        <div><strong>{profile.fullName || profile.username}</strong><p>Tên đăng nhập: {profile.username}</p></div>
      </div>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <form onSubmit={save} aria-busy={busy}>
        <fieldset className={styles.formFields} disabled={busy}>
          <div className={styles.formGrid}>
            <label className={styles.inputGroup}>
              <span>Họ và tên</span>
              <input autoComplete="name" maxLength={120} value={form.fullName ?? ''} onChange={(event) => setForm({ ...form, fullName: event.target.value })} />
            </label>
            <label className={styles.inputGroup}>
              <span>Email *</span>
              <input type="email" required autoComplete="email" maxLength={150} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </label>
            <label className={styles.inputGroup}>
              <span>Số điện thoại</span>
              <input type="tel" autoComplete="tel" maxLength={30} value={form.phoneNumber ?? ''} onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })} />
            </label>
            <label className={styles.inputGroup}>
              <span>Địa chỉ giao hàng mặc định</span>
              <input autoComplete="street-address" maxLength={500} value={form.address ?? ''} onChange={(event) => setForm({ ...form, address: event.target.value })} />
            </label>
          </div>
          <div className={styles.formActions}>
            <button type="submit" className={styles.btnSave}>{busy ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
            <button type="button" className={styles.btnCancel} onClick={reset}>Hủy thay đổi</button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
