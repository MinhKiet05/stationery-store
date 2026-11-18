import { useState, type FormEvent } from "react";
import { Tag, Sparkles, Truck, Eye, EyeOff, ArrowRight } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { login, register } from "../../services/authService";
import { notify } from "../../utils/notifications";
import styles from "./Login.module.css";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");

  // State cho Đăng nhập
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // State cho Đăng ký
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [regFullName, setRegFullName] = useState("");
  const [regPhoneNumber, setRegPhoneNumber] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function changeTab(tab: "login" | "register") {
    if (busy) return;
    setActiveTab(tab);
    setError("");
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await login(username, password);
      if (result.cartSynced) {
        notify.success("Đăng nhập thành công.");
        const from = location.state?.from;
        const target = typeof from?.pathname === "string" && from.pathname.startsWith("/") && !from.pathname.startsWith("//")
          ? from.pathname + (from.search || "")
          : "/";
        navigate(target, { replace: true });
      } else {
        notify.warning("Đăng nhập thành công. Chưa đồng bộ được giỏ khách.");
      }
    } catch (err) {
      notify.error(err, "Đăng nhập thất bại. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault();

    if (regPassword !== regConfirmPassword) {
      setError("Mật khẩu xác nhận không khớp!");
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const user = await register({
        username: regUsername,
        email: regEmail,
        password: regPassword,
        fullName: regFullName,
        phoneNumber: regPhoneNumber,
      });

      notify.success("Đăng ký thành công! Vui lòng đăng nhập.");
      setActiveTab("login");
      setUsername(user.username);
      setPassword("");
      setRegPassword("");
      setRegConfirmPassword("");
    } catch (err) {
      notify.error(err, "Đăng ký thất bại. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        {/* Cột trái: Thông tin thương hiệu */}
        <div className={styles.leftPanel}>
          <div className={styles.brand}>✦ INSPIRATION STUDIO</div>
          <h1 className={styles.title}>
            Khơi nguồn cảm hứng
            <br />
            sáng tạo
          </h1>
          <p className={styles.subtitle}>
            Đồng hành cùng hàng triệu học sinh, sinh viên, kiến trúc sư và người làm việc sáng tạo trên hành trình lưu giữ từng ý tưởng tinh tế.
          </p>

          <div className={styles.features}>
            <p className={styles.featureTitle}>ĐẶC QUYỀN THÀNH VIÊN STATIONERY PASS</p>
            <div className={styles.featureItem}>
              <div className={styles.icon}>
                <Tag size={24} strokeWidth={1.5} />
              </div>
              <div>
                <strong>Tích lũy điểm thưởng đơn hàng</strong>
                <p>Quy đổi voucher giảm giá trực tiếp tới 15% cho lần mua sắm tiếp theo.</p>
              </div>
            </div>
            <div className={styles.featureItem}>
              <div className={styles.icon}>
                <Sparkles size={24} strokeWidth={1.5} />
              </div>
              <div>
                <strong>Đặc quyền bộ sưu tập Limited</strong>
                <p>Ưu tiên đặt trước sổ tay bìa da thủ công và bút mực phiên bản giới hạn.</p>
              </div>
            </div>
            <div className={styles.featureItem}>
              <div className={styles.icon}>
                <Truck size={24} strokeWidth={1.5} />
              </div>
              <div>
                <strong>Miễn phí giao hàng đơn đầu</strong>
                <p>Áp dụng toàn quốc và tặng kèm set sticker đánh dấu trang cao cấp.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Cột phải: Form xác thực */}
        <div className={styles.rightPanel}>
          <div className={styles.header}>
            <div className={styles.headerText}>
              <h2>{activeTab === "login" ? "Chào mừng bạn trở lại!" : "Tạo tài khoản mới"}</h2>
              <p>
                {activeTab === "login"
                  ? "Đăng nhập để nhận ưu đãi cá nhân hóa và quản lý đơn hàng nhanh chóng."
                  : "Đăng ký thành viên để trải nghiệm trọn vẹn không gian sáng tạo."}
              </p>
            </div>
            <div className={styles.tabToggle}>
              <button
                type="button"
                disabled={busy}
                className={activeTab === "login" ? styles.active : ""}
                onClick={() => changeTab("login")}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                disabled={busy}
                className={activeTab === "register" ? styles.active : ""}
                onClick={() => changeTab("register")}
              >
                Đăng ký
              </button>
            </div>
          </div>

          {error && (
            <p className={styles.errorAlert} role="alert">
              {error}
            </p>
          )}

          {/* Form Đăng nhập */}
          {activeTab === "login" && (
            <form className={styles.form} onSubmit={handleLogin}>
              <label>
                <span>
                  Tên đăng nhập <span className={styles.req}>*</span>
                </span>
                <input
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Nhập tên đăng nhập..."
                />
              </label>
              <label>
                <span>
                  Mật khẩu <span className={styles.req}>*</span>
                </span>
                <div className={styles.inputWrapper}>
                  <input
                    required
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nhập ít nhất 8 ký tự..."
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    tabIndex={-1}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              <div className={styles.formOptions}>
                <label className={styles.checkbox}>
                  <input type="checkbox" /> Ghi nhớ đăng nhập
                </label>
                <Link to="/forgot-password" className={styles.forgot}>
                  Quên mật khẩu?
                </Link>
              </div>

              <button className={styles.submitBtn} disabled={busy}>
                {busy ? (
                  "Đang xử lý..."
                ) : (
                  <>
                    Đăng nhập ngay <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Form Đăng ký */}
          {activeTab === "register" && (
            <form className={styles.form} onSubmit={handleRegister}>
              <label>
                <span>
                  Tên đăng nhập <span className={styles.req}>*</span>
                </span>
                <input
                  required
                  minLength={3}
                  maxLength={80}
                  autoComplete="username"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="3 - 80 ký tự"
                />
              </label>
              <div className={styles.rowGrid}>
                <label>
                  <span>Họ và tên</span>
                  <input
                    maxLength={120}
                    autoComplete="name"
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                  />
                </label>
                <label>
                  <span>Số điện thoại</span>
                  <input
                    type="tel"
                    maxLength={30}
                    autoComplete="tel"
                    value={regPhoneNumber}
                    onChange={(e) => setRegPhoneNumber(e.target.value)}
                    placeholder="090xxxxxxx"
                  />
                </label>
              </div>
              <label>
                <span>
                  Email <span className={styles.req}>*</span>
                </span>
                <input
                  required
                  type="email"
                  maxLength={150}
                  autoComplete="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </label>
              <label>
                <span>
                  Mật khẩu <span className={styles.req}>*</span>
                </span>
                <div className={styles.inputWrapper}>
                  <input
                    required
                    type={showRegPassword ? "text" : "password"}
                    minLength={8}
                    maxLength={72}
                    autoComplete="new-password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="8 - 72 ký tự"
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    tabIndex={-1}
                    onClick={() => setShowRegPassword(!showRegPassword)}
                  >
                    {showRegPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              <label>
                <span>
                  Xác nhận mật khẩu <span className={styles.req}>*</span>
                </span>
                <div className={styles.inputWrapper}>
                  <input
                    required
                    type={showConfirmPassword ? "text" : "password"}
                    minLength={8}
                    maxLength={72}
                    autoComplete="new-password"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu"
                  />
                  <button
                    tabIndex={-1}
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>

              <button className={styles.submitBtn} disabled={busy}>
                {busy ? (
                  "Đang xử lý..."
                ) : (
                  <>
                    Tạo tài khoản ngay <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Social Login */}
          <div className={styles.socialDivider}>
            <span>HOẶC TIẾP TỤC VỚI</span>
          </div>
          <div className={styles.socialLogins}>
            <button type="button" className={styles.socialBtn}>
              {/* SVG Logo Google chuẩn 4 màu */}
              <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Google
            </button>

            <button type="button" className={styles.socialBtn}>
              {/* SVG Logo Facebook chuẩn */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#1877F2" xmlns="http://www.w3.org/2000/svg">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              Facebook
            </button>
          </div>

          <div className={styles.footerLink}>
            {activeTab === "login" ? "Chưa có tài khoản StationeryStore? " : "Đã có tài khoản? "}
            <span onClick={() => changeTab(activeTab === "login" ? "register" : "login")}>
              {activeTab === "login" ? "Đăng ký ngay" : "Đăng nhập ngay"}
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
