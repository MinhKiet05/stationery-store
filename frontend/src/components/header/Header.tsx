import React, { useCallback, useEffect, useState } from "react";
import styles from "./Header.module.css";
import stationeryStoreLogo from "../../assets/StationeryStoreLogo.webp";
import {
  Bell,
  ChevronDown,
  ClipboardList,
  Flame,
  Headphones,
  LogIn,
  Menu,
  PackageSearch,
  Search,
  ShoppingBag,
  Truck,
  UserRound,
  X,
} from "lucide-react";

export type UserInfoResponse = {
  userID: number;
  username: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  role: string;
  avatarUrl?: string; // Bổ sung ảnh đại diện nếu có từ API
};

type HeaderProps = {
  apiBaseUrl?: string;
  loginHref?: string;
  cartHref?: string;
  profileHref?: string;
  ordersHref?: string;
  notificationsHref?: string;
  cartCount?: number;
  onSearch?: (query: string) => void;
  onLogout?: () => void;
};

const navigation = [
  { label: "Trang chủ", href: "/" },
  { label: "Bút & Mực", href: "/products?category=but-muc" },
  { label: "Sổ & Giấy", href: "/products?category=so-giay" },
  { label: "Dụng cụ văn phòng", href: "/products?category=dung-cu-van-phong" },
  { label: "Quà tặng & Phụ kiện", href: "/products?category=qua-tang-phu-kien" },
  { label: "Khuyến mãi", href: "/promotions", promotion: true },
  { label: "Blog văn phòng phẩm", href: "/blog" },
];

const TOKEN_KEY = "accessToken";

function roleLabel(role: string) {
  switch (role.toUpperCase()) {
    case "ADMIN":
    case "SUPER_ADMIN":
      return "Quản trị viên";
    case "CUSTOMER":
      return "Thành viên Bạc"; // Cập nhật text cứng hiển thị tương tự ảnh thiết kế
    default:
      return role;
  }
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(-2).map((word) => word[0] || "").join("").toUpperCase();
}

export default function Header({
  apiBaseUrl = "http://localhost:8080",
  loginHref = "/login",
  cartHref = "/cart",
  profileHref = "/profile",
  ordersHref = "/orders",
  notificationsHref = "/notifications",
  cartCount = 3, // Set mặc định 3 theo ảnh thiết kế
  onSearch,
  onLogout,
}: HeaderProps) {
  const [user, setUser] = useState<UserInfoResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const fetchCurrentUser = useCallback(async (signal?: AbortSignal) => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/auth/me`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          localStorage.removeItem(TOKEN_KEY);
        }
        setUser(null);
        return;
      }

      const data = (await response.json()) as UserInfoResponse;
      if (!signal?.aborted) setUser(data);
    } catch (error) {
      if (!signal?.aborted) {
        console.error("Không lấy được thông tin tài khoản:", error);
        setUser(null);
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchCurrentUser(controller.signal);
    const reload = () => void fetchCurrentUser();
    window.addEventListener("storage", reload);
    window.addEventListener("auth-changed", reload);
    return () => {
      controller.abort();
      window.removeEventListener("storage", reload);
      window.removeEventListener("auth-changed", reload);
    };
  }, [fetchCurrentUser]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    if (!query) return;
    if (onSearch) onSearch(query);
    else window.location.href = `/products?search=${encodeURIComponent(query)}`;
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setAccountMenuOpen(false);
    onLogout?.();
    window.dispatchEvent(new Event("auth-changed"));
  }

  return (
    <header className={styles.header}>
      {/* Top info bar */}
      <div className={styles.topBar}>
        <div className={styles.topBarContent}>
          <div className={styles.topBarLeft}>
            <span className={styles.topBarItem}>
              <Headphones size={14} /> Hotline: 1900 6868 (8:00 - 21:00)
            </span>
            <span className={`${styles.topBarItem} ${styles.divider}`}>
              Miễn phí vận chuyển cho đơn hàng từ 200.000đ
            </span>
            <span className={`${styles.topBarItem} ${styles.divider}`}>
              Hỗ trợ đổi trả 7 ngày
            </span>
          </div>
          <div className={styles.topBarRight}>
            <a href={ordersHref} className={`${styles.topBarItem} ${styles.trackOrder}`}>
              <Truck size={14} /> Tra cứu đơn hàng
            </a>
          </div>
        </div>
      </div>

      {/* Main header */}
      <div className={styles.mainHeader}>
        <a href="/" className={styles.logo} aria-label="Stationery Store - Trang chủ">
          <img
            src={stationeryStoreLogo}
            alt="StationeryStore"
            className={styles.logoImg}
          />
          <span className={styles.logoText}>StationeryStore</span>
        </a>

        <div className={styles.searchSection}>
          <form onSubmit={submitSearch} className={styles.searchForm}>
            <Search className={styles.searchIcon} size={20} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Tìm kiếm sản phẩm"
              placeholder="Tìm kiếm hơn 10.000+ sản phẩm bút, sổ tay, văn phòng phẩm..."
              className={styles.searchInput}
            />
            <button type="submit" className={styles.searchBtn}>
              Tìm kiếm
            </button>
          </form>
        </div>

        <div className={styles.actions}>
          <a href={notificationsHref} aria-label="Thông báo" className={styles.actionIconBtn}>
            <Bell size={24} />
            <span className={styles.redDot} />
          </a>

          <a href={cartHref} aria-label={`Giỏ hàng (${cartCount} sản phẩm)`} className={styles.actionIconBtn}>
            <ShoppingBag size={24} />
            {cartCount > 0 && (
              <span className={styles.badge}>
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </a>

          {/* Account Area */}
          <div className={styles.profileContainer}>
            {loading ? (
              <div style={{ height: '40px', width: '120px', backgroundColor: '#f1f5f9', borderRadius: '8px' }} />
            ) : user ? (
              <>
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                  className={styles.profileBtn}
                >
                  <span className={styles.avatar}>
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt="Avatar" className={styles.avatarImg} />
                    ) : (
                      initials(user.fullName || user.username)
                    )}
                  </span>
                  <div className={styles.userInfo}>
                    <span className={styles.userName}>{user.fullName || user.username}</span>
                    <span className={styles.userRole}>{roleLabel(user.role)}</span>
                  </div>
                </button>
              </>
            ) : (
              <a href={loginHref} className={styles.loginBtn}>
                <LogIn size={18} /> Đăng nhập
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Desktop navigation */}
      <nav className={styles.nav} aria-label="Danh mục chính">
        <div className={styles.navContent}>
          <div className={styles.navLinks}>
            {navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${item.href === "/" ? styles.navLinkActive : ""} ${item.promotion ? styles.navLinkHot : ""}`}
              >
                {item.promotion && <Flame size={16} style={{ marginRight: '4px' }} />}
                {item.label}
                {item.promotion && <span className={styles.hotBadge}>HOT</span>}
              </a>
            ))}
          </div>
          <div className={styles.guarantee}>
            <PackageSearch size={18} className={styles.guaranteeIcon} /> Chính hãng 100%
          </div>
        </div>
      </nav>
    </header>
  );
}