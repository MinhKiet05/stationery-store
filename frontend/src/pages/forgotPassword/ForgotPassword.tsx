import { useState, useEffect, type FormEvent } from "react";
import {
  RotateCcw,
  KeyRound,
  AtSign,
  Clock,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  Lock,
  Smartphone,
  Shield,
} from "lucide-react";
import styles from "./ForgotPassword.module.css";
import { API_BASE } from "../../services/api";

export default function ForgotPassword() {
  const [step, setStep] = useState<1 | 2>(1);

  // State Bước 1
  const [email, setEmail] = useState("");

  // State Bước 2
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Trạng thái chung
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Tự động lấy token từ URL nếu người dùng click link từ email (VD: /forgot-password?token=xyz)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken) {
      setToken(urlToken);
      setStep(2);
    }
  }, []);

  // Gọi API Bước 1: POST /api/auth/forgot-password
  async function handleRequestReset(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccessMsg("");

    try {
      const response = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message || "Không thể gửi yêu cầu khôi phục mật khẩu.");
      }

      setSuccessMsg(
        data?.message || "Nếu email tồn tại, chúng tôi sẽ gửi liên kết/mã đặt lại mật khẩu."
      );
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi, vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  // Gọi API Bước 2: POST /api/auth/reset-password
  async function handleResetPassword(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSuccessMsg("");

    if (newPassword !== confirmPassword) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token.trim(),
          newPassword,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message || "Mã xác nhận không hợp lệ hoặc đã hết hạn.");
      }

      setSuccessMsg(data?.message || "Đặt lại mật khẩu thành công. Đang chuyển về trang đăng nhập...");
      setTimeout(() => {
        window.location.href = "/login";
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đặt lại mật khẩu thất bại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.glowBg} aria-hidden="true" />

      <div className={styles.wrapper}>
        {/* Card chính */}
        <div className={styles.card}>
          <div className={styles.topAccentBar} />

          <div className={styles.cardBody}>
            {/* Biểu tượng khôi phục */}
            <div className={styles.heroIconWrap}>
              <div className={styles.heroIconCircle}>
                <RotateCcw size={26} strokeWidth={2} />
              </div>
              <span className={styles.heroKeyBadge}>
                <KeyRound size={12} strokeWidth={2.5} />
              </span>
            </div>

            <h1 className={styles.title}>Khôi phục mật khẩu</h1>
            <p className={styles.subtitle}>
              {step === 1
                ? "Vui lòng nhập Email đã đăng ký để nhận mã xác minh / liên kết đặt lại mật khẩu an toàn."
                : "Nhập mã xác thực được gửi đến email của bạn cùng mật khẩu mới."}
            </p>

            {/* Stepper 2 bước */}
            <div className={styles.stepper}>
              <button
                type="button"
                className={`${styles.stepTab} ${step === 1 ? styles.stepActive : ""}`}
                onClick={() => {
                  setStep(1);
                  setError("");
                }}
              >
                <span className={styles.stepNum}>1</span>
                <span>Nhận mã xác thực</span>
              </button>
              <button
                type="button"
                className={`${styles.stepTab} ${step === 2 ? styles.stepActive : ""}`}
                onClick={() => {
                  setStep(2);
                  setError("");
                }}
              >
                <span className={styles.stepNum}>2</span>
                <span>Đặt lại mật khẩu</span>
              </button>
            </div>

            {/* Thông báo lỗi / thành công */}
            {error && (
              <div className={styles.errorAlert} role="alert">
                {error}
              </div>
            )}
            {successMsg && (
              <div className={styles.successAlert} role="status">
                {successMsg}
              </div>
            )}

            {/* BƯỚC 1: Nhập Email */}
            {step === 1 && (
              <form className={styles.form} onSubmit={handleRequestReset}>
                <label className={styles.label}>
                  <span>
                    Email đăng ký <span className={styles.req}>*</span>
                  </span>
                  <div className={styles.inputBox}>
                    <AtSign size={18} className={styles.inputIcon} />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="minhkiet@example.com"
                    />
                  </div>
                </label>

                <div className={styles.hintRow}>
                  <Clock size={15} className={styles.hintIcon} />
                  <span>Mã xác thực hoặc liên kết khôi phục sẽ có hiệu lực trong thời gian giới hạn.</span>
                </div>

                <div className={styles.securityBox}>
                  <ShieldCheck size={20} className={styles.securityIcon} />
                  <p>
                    <strong>Bảo vệ tài khoản:</strong> Hệ thống StationeryStore sẽ không bao giờ yêu cầu bạn
                    cung cấp mật khẩu gốc hoặc mã ngân hàng qua điện thoại.
                  </p>
                </div>

                <button type="submit" className={styles.submitBtn} disabled={busy}>
                  {busy ? (
                    "Đang gửi yêu cầu..."
                  ) : (
                    <>
                      <span>Gửi mã xác nhận</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* BƯỚC 2: Nhập Token & Mật khẩu mới */}
            {step === 2 && (
              <form className={styles.form} onSubmit={handleResetPassword}>
                <label className={styles.label}>
                  <span>
                    Mã xác thực (Token) <span className={styles.req}>*</span>
                  </span>
                  <div className={styles.inputBox}>
                    <KeyRound size={18} className={styles.inputIcon} />
                    <input
                      type="text"
                      required
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="Nhập mã xác thực từ email..."
                    />
                  </div>
                </label>

                <label className={styles.label}>
                  <span>
                    Mật khẩu mới <span className={styles.req}>*</span>
                  </span>
                  <div className={styles.inputBox}>
                    <Lock size={18} className={styles.inputIcon} />
                    <input
                      type={showNewPassword ? "text" : "password"}
                      required
                      minLength={8}
                      maxLength={72}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="8 - 72 ký tự"
                    />
                    <button
                      type="button"
                      className={styles.eyeBtn}
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      aria-label="Ẩn/hiện mật khẩu mới"
                    >
                      {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>

                <label className={styles.label}>
                  <span>
                    Xác nhận mật khẩu mới <span className={styles.req}>*</span>
                  </span>
                  <div className={styles.inputBox}>
                    <Lock size={18} className={styles.inputIcon} />
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      minLength={8}
                      maxLength={72}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Nhập lại mật khẩu mới"
                    />
                    <button
                      type="button"
                      className={styles.eyeBtn}
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label="Ẩn/hiện xác nhận mật khẩu"
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>

                <button type="submit" className={styles.submitBtn} disabled={busy}>
                  {busy ? (
                    "Đang cập nhật..."
                  ) : (
                    <>
                      <span>Xác nhận đặt lại mật khẩu</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Footer bên trong Card */}
          <div className={styles.cardFooter}>
            <a href="/login" className={styles.backLink}>
              <ArrowLeft size={16} />
              <span>Quay lại Đăng nhập</span>
            </a>
            <p className={styles.supportText}>
              Gặp sự cố khi nhận mã? <strong>Hotline 1900 6868</strong>{" "}
              <span className={styles.dot}>•</span>{" "}
              <a href="#support" className={styles.chatLink}>
                Chat Hỗ Trợ 24/7
              </a>
            </p>
          </div>
        </div>

        {/* 3 Thẻ cam kết bảo mật bên dưới */}
        <div className={styles.trustGrid}>
          <div className={styles.trustCard}>
            <ShieldCheck size={20} className={styles.trustIconDark} />
            <strong>Mã hóa SSL 256-bit</strong>
            <span>Bảo vệ luồng truyền tin</span>
          </div>
          <div className={styles.trustCard}>
            <Smartphone size={20} className={styles.trustIconOrange} />
            <strong>Xác thực 2 lớp (2FA)</strong>
            <span>Mã OTP riêng tư tức thì</span>
          </div>
          <div className={styles.trustCard}>
            <Shield size={20} className={styles.trustIconDark} />
            <strong>Bảo vệ 100% dữ liệu</strong>
            <span>Tiêu chuẩn e-Commerce</span>
          </div>
        </div>
      </div>
    </main>
  );
}
