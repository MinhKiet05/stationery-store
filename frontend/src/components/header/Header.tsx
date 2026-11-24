import { useCurrentUser, useCart } from "../../services/storeQueries";
import { getGuestCart } from "../../utils/guestCart";
import { API_BASE } from "../../services/api";
import React, { useEffect, useState } from "react";
import styles from "./Header.module.css";
import UserAccountDropdown from "../userAccountDropdown/UserAccountDropdown";
import stationeryStoreLogo from "../../assets/StationeryStoreLogo.webp";
import {
  Bell,
  Flame,
  Headphones,
  LogIn,
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
  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    if (!query) return;
    if (onSearch) onSearch(query);
    else window.location.href = `/search?search=${encodeURIComponent(query)}`;
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

          {loading ? (
            <div style={{ height: 40, width: 120, backgroundColor: '#f1f5f9', borderRadius: 8 }} />
          ) : user ? <UserAccountDropdown user={user} profileHref={profileHref} onLogout={onLogout} /> : (
            <div className={styles.profileContainer}><a href={loginHref} className={styles.loginBtn}><LogIn size={18} /> Đăng nhập</a></div>
          )}
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
