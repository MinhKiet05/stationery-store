import { useCurrentUser, useCart } from "../../services/storeQueries";
import { getGuestCart } from "../../utils/guestCart";
import { API_BASE } from "../../services/api";
import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getProductTypes } from '../../services/productTypeService';
import { cacheTimes, queryKeys, schedulePrefetch, cancelPrefetch } from '../../services/queryCache';
import { catalogOptions } from '../../services/catalogService';
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

const TOKEN_KEY = "accessToken";

export default function Header({
  apiBaseUrl = API_BASE,
  loginHref = "/login",
  cartHref = "/cart",
  profileHref = "/my-profile",
  ordersHref = "/my-profile/orders",
  notificationsHref,
  cartCount: suppliedCartCount,
  onSearch,
  onLogout,
}: HeaderProps) {
  const location = useLocation(), navigate = useNavigate();
  const categories = useQuery({ queryKey: queryKeys.public('categories'), queryFn: ({ signal }) => getProductTypes(signal), staleTime: cacheTimes.categories });
  const navigation = [
    { label: 'Trang chủ', href: '/' },
    ...(categories.data ?? []).filter(type => type.isActive).slice(0, 4).map(type => ({ label: type.name, href: `/search?category=${type.productTypeID}`, category: String(type.productTypeID) })),
    { label: 'Tất cả sản phẩm', href: '/search' },
    { label: 'Khuyến mãi', href: '/search?onSale=true', promotion: true },
    { label: 'Về chúng tôi', href: '/about-us' },
  ];
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
  const searchQuery = new URLSearchParams(location.search).get('search') ?? '';
  const [search, setSearch] = useState(searchQuery);
  const [previousSearch, setPreviousSearch] = useState(searchQuery);
  if (previousSearch !== searchQuery) { setPreviousSearch(searchQuery); setSearch(searchQuery); }
  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    if (!query) return;
    if (onSearch) onSearch(query);
    else navigate(`/search?search=${encodeURIComponent(query)}`);
  }

  return (
    <header className={styles.header} data-store-header>
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
            <Link to={ordersHref} className={`${styles.topBarItem} ${styles.trackOrder}`}>
              <Truck size={14} /> Tra cứu đơn hàng
            </Link>
          </div>
        </div>
      </div>

      {/* Main header */}
      <div className={styles.mainHeader}>
        <Link to="/" className={styles.logo} aria-label="Stationery Store - Trang chủ">
          <img
            src={stationeryStoreLogo}
            alt="StationeryStore"
            className={styles.logoImg}
          />
          <span className={styles.logoText}>StationeryStore</span>
        </Link>

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
          {notificationsHref && <Link to={notificationsHref} aria-label="Thông báo" className={styles.actionIconBtn}>
            <Bell size={24} />
          </Link>}

          <Link to={cartHref} aria-label={`Giỏ hàng (${cartCount} sản phẩm)`} className={styles.actionIconBtn}>
            <ShoppingBag size={24} />
            {cartCount > 0 && (
              <span className={styles.badge}>
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>

          {loading ? (
            <div style={{ height: 40, width: 120, backgroundColor: '#f1f5f9', borderRadius: 8 }} />
          ) : identity.isError && localStorage.getItem(TOKEN_KEY) ? <button type="button" className={styles.loginBtn} onClick={() => void identity.refetch()}>Thử lại tài khoản</button>
          : user ? <UserAccountDropdown user={user} profileHref={profileHref} onLogout={onLogout} /> : (
            <div className={styles.profileContainer}><Link to={loginHref} state={{ from: location }} className={styles.loginBtn}><LogIn size={18} /> Đăng nhập</Link></div>
          )}
        </div>
      </div>

      {/* Desktop navigation */}
      <nav className={styles.nav} aria-label="Danh mục chính">
        <div className={styles.navContent}>
          <div className={styles.navLinks}>
            {navigation.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onFocus={() => { if ('category' in item) schedulePrefetch(catalogOptions({ productTypeID: item.category })); }}
                onMouseEnter={() => { if ('category' in item) schedulePrefetch(catalogOptions({ productTypeID: item.category })); }}
                onMouseLeave={cancelPrefetch}
                onBlur={cancelPrefetch}
                aria-current={item.href === location.pathname + location.search ? "page" : undefined}
                className={`${styles.navLink} ${item.href === location.pathname + location.search ? styles.navLinkActive : ""} ${'promotion' in item && item.promotion ? styles.navLinkHot : ""}`}
              >
                {'promotion' in item && item.promotion && <Flame size={16} style={{ marginRight: '4px' }} />}
                {item.label}
                {'promotion' in item && item.promotion && <span className={styles.hotBadge}>HOT</span>}
              </Link>
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
