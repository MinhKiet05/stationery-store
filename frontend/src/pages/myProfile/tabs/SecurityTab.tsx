import { useEffect, useRef, useState, type FormEvent } from "react";
import { Lock, Eye, EyeOff, ShieldCheck, KeyRound } from "lucide-react";
import styles from "./SecurityTab.module.css";
import { changeMyPassword } from '../../../services/userService';
import { notify } from "../../../utils/notifications";

export default function SecurityTab() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || request.current) return;

    setError("");

    // 1. Kiểm tra mật khẩu mới không trùng mật khẩu cũ
    if (newPassword === oldPassword) {
      setError("Mật khẩu mới không được trùng với mật khẩu hiện tại.");
      return;
    }

    // 2. Kiểm tra xác nhận mật khẩu mới
    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp với mật khẩu mới.");
      return;
    }

    // 3. Kiểm tra giới hạn 72 byte UTF-8 của BCrypt (khớp với backend)
    const byteLength = new TextEncoder().encode(newPassword).length;
    if (byteLength > 72) {
      setError("Mật khẩu mới không được vượt quá 72 byte (hạn chế ký tự có dấu/emoji quá dài).");
      return;
    }

    setBusy(true);
    const controller = new AbortController(); request.current = controller;
    try {
      await changeMyPassword(oldPassword, newPassword, controller.signal);

      // Endpoint trả về 204 No Content khi thành công
      notify.success("Đổi mật khẩu thành công! Mật khẩu mới của bạn đã được áp dụng.");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      if (controller.signal.aborted || err instanceof DOMException && err.name === 'AbortError') return;
      notify.error(err, "Đổi mật khẩu thất bại. Vui lòng thử lại.");
    } finally {
      request.current = null;
      setBusy(false);
    }
  }

  return (
    <div className={styles.tabContainer}>
      <div className={styles.header}>
        <h2>Đổi mật khẩu & Bảo mật</h2>
        <p>Để bảo mật tài khoản, vui lòng không chia sẻ mật khẩu cho người khác và thay đổi định kỳ.</p>
      </div>

      {error && (
        <div className={styles.errorAlert} role="alert">
          {error}
        </div>
      )}


      <form className={styles.form} onSubmit={handleSubmit}>
        {/* Mật khẩu hiện tại */}
        <label className={styles.inputGroup}>
          <span>
            Mật khẩu hiện tại <span className={styles.req}>*</span>
          </span>
          <div className={styles.inputWrapper}>
            <KeyRound size={17} className={styles.leftIcon} />
            <input
              type={showOld ? "text" : "password"}
              required
              maxLength={72}
              autoComplete="current-password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Nhập mật khẩu hiện tại..."
            />
            <button
              type="button"
              className={styles.eyeBtn}
              onClick={() => setShowOld(!showOld)}
              aria-label="Ẩn/hiện mật khẩu hiện tại"
            >
              {showOld ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>

        {/* Mật khẩu mới */}
        <label className={styles.inputGroup}>
          <span>
            Mật khẩu mới <span className={styles.req}>*</span>
          </span>
          <div className={styles.inputWrapper}>
            <Lock size={17} className={styles.leftIcon} />
            <input
              type={showNew ? "text" : "password"}
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Tối thiểu 8 ký tự, khác mật khẩu cũ..."
            />
            <button
              type="button"
              className={styles.eyeBtn}
              onClick={() => setShowNew(!showNew)}
              aria-label="Ẩn/hiện mật khẩu mới"
            >
              {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>

        {/* Xác nhận mật khẩu mới */}
        <label className={styles.inputGroup}>
          <span>
            Xác nhận mật khẩu mới <span className={styles.req}>*</span>
          </span>
          <div className={styles.inputWrapper}>
            <Lock size={17} className={styles.leftIcon} />
            <input
              type={showConfirm ? "text" : "password"}
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu mới..."
            />
            <button
              type="button"
              className={styles.eyeBtn}
              onClick={() => setShowConfirm(!showConfirm)}
              aria-label="Ẩn/hiện xác nhận mật khẩu"
            >
              {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>

        <div className={styles.actions}>
          <button type="submit" className={styles.btnSave} disabled={busy}>
            {busy ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
          </button>
          <button
            type="button"
            className={styles.btnReset}
            disabled={busy}
            onClick={() => {
              setOldPassword("");
              setNewPassword("");
              setConfirmPassword("");
              setError("");
            }}
          >
            Làm mới
          </button>
        </div>
      </form>

      {/* Khối lưu ý bảo mật đồng bộ với AccountInfoTab */}
      <div className={styles.securityNote}>
        <ShieldCheck size={20} className={styles.shieldIcon} />
        <div>
          <strong>Gợi ý đặt mật khẩu an toàn</strong>
          <p>
            Sử dụng độ dài từ 8 đến 72 ký tự, kết hợp chữ hoa, chữ thường, chữ số và ký tự đặc biệt. Tránh dùng lại mật khẩu đã sử dụng trên các trang web khác.
          </p>
        </div>
      </div>
    </div>
  );
}
