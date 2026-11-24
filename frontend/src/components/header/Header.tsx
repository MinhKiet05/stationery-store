import { useCurrentUser, useCart } from "../../services/storeQueries";
import { getGuestCart } from "../../utils/guestCart";
import { API_BASE } from "../../services/api";
import { notify } from "../../utils/notifications";
import React, { useEffect, useRef, useState } from "react";
import styles from "./Header.module.css";
import stationeryStoreLogo from "../../assets/StationeryStoreLogo.webp";
import {
  Bell,
  ChevronDown,
  Flame,
  Headphones,
  LogIn,
  LogOut,
  UserRound,
  PackageSearch,
  Search,
  ShoppingBag,
  Truck,
} from "lucide-react";

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
  { label: "Về chúng tôi", href: "/about-us" },
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
  apiBaseUrl = API_BASE,
  loginHref = "/login",
  cartHref = "/cart",
  profileHref = "/my-profile",
  ordersHref = "/my-profile/orders",
  notificationsHref = "/notifications",
  cartCount: suppliedCartCount,
  onSearch,
  onLogout,
}: HeaderProps) {
  const identity = useCurrentUser(apiBaseUrl);
  const cartQuery = useCart();
  const [guestCount, setGuestCount] = useState(() => getGuestCart().reduce((sum, item) => sum + item.quantity, 0));
  useEffect(() => {
    const sync = () => setGuestCount(getGuestCart().reduce((sum, item) => sum + item.quantity, 0));
    window.addEventListener('cart-changed', sync); window.addEventListener('storage', sync);
    return () => { window.removeEventListener('cart-changed', sync); window.removeEventListener('storage', sync); };
  }, []);
  const cartCount = suppliedCartCount ?? (localStorage.getItem(TOKEN_KEY) ? cartQuery.data?.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0 : guestCount);
  const user = localStorage.getItem(TOKEN_KEY) ? identity.data : null;
  const loading = !!localStorage.getItem(TOKEN_KEY) && identity.isPending;
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("search") ?? "");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const outside = (event: PointerEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setAccountMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false);
        profileButtonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [accountMenuOpen]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    if (!query) return;
    if (onSearch) onSearch(query);
    else window.location.href = `/search?search=${encodeURIComponent(query)}`;
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setAccountMenuOpen(false);
    onLogout?.();
    window.dispatchEvent(new Event("auth-changed"));
    notify.success("Đăng xuất thành công.");
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
          <p className={styles.suggestions}>Gợi ý: <span className={styles.suggestionHighlight}>Bút gel xóa được · Sổ tay A5 bìa da · Băng keo washi · Giấy in Double A</span></p>
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
          <div ref={profileRef} className={styles.profileContainer} onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setAccountMenuOpen(false);
          }}>
            {loading ? (
              <div style={{ height: '40px', width: '120px', backgroundColor: '#f1f5f9', borderRadius: '8px' }} />
            ) : user ? (
              <>
                <button
                  ref={profileButtonRef}
                  type="button"
                  onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                  className={styles.profileBtn}
                  aria-expanded={accountMenuOpen}
                  aria-controls="header-account-dropdown"
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
                  <ChevronDown size={16} className={styles.profileChevron} aria-hidden="true" />
                </button>
                {accountMenuOpen && <div id="header-account-dropdown" className={styles.accountDropdown}>
                  <div className={styles.dropdownIdentity}>
                    <strong>{user.fullName || user.username}</strong>
                    <span>{user.email}</span>
                  </div>
                  <div className={styles.dropdownActions}>
                    <a href={profileHref} className={styles.dropdownItem}><UserRound size={19} aria-hidden="true" />Tài khoản</a>
                    <button type="button" className={`${styles.dropdownItem} ${styles.dropdownLogout}`} onClick={logout}><LogOut size={19} aria-hidden="true" />Đăng xuất</button>
                  </div>
                </div>}
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
                aria-current={item.href === window.location.pathname + window.location.search || (item.href === "/" && window.location.pathname === "/") ? "page" : undefined}
                className={`${styles.navLink} ${item.href === window.location.pathname + window.location.search || (item.href === "/" && window.location.pathname === "/") ? styles.navLinkActive : ""} ${item.promotion ? styles.navLinkHot : ""}`}
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
