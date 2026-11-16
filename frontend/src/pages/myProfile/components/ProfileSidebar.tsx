import { NavLink, useNavigate } from 'react-router-dom';
import { User, ShoppingBag, Heart, Lock, LogOut, PhoneCall, MapPin } from 'lucide-react';
import type { UserProfile } from '../../../services/userService';
import styles from '../MyProfile.module.css';

export default function ProfileSidebar({ profile, orderCount }: { profile: UserProfile; orderCount: number | null }) {
  const navigate = useNavigate();

  function logout() {
    localStorage.removeItem('accessToken');
    window.dispatchEvent(new Event('auth-changed'));
    navigate('/login', { replace: true });
  }

  return (
    <div className={styles.sidebarContainer}>
      <nav className={styles.navCard} aria-label="Danh mục tài khoản">
        <h2>Danh mục tài khoản</h2>
        <NavLink end to="/my-profile" className={({ isActive }) => [styles.navItem, isActive ? styles.navActive : ''].join(' ')}>
          <User size={18} /> Thông tin tài khoản
        </NavLink>
        
        <NavLink to="/my-profile/orders" className={({ isActive }) => [styles.navItem, isActive ? styles.navActive : ''].join(' ')}>
          <ShoppingBag size={18} /> Lịch sử đơn hàng
        </NavLink>
        
        <NavLink to="/my-profile/wishlist" className={({ isActive }) => [styles.navItem, isActive ? styles.navActive : ''].join(' ')}>
          <Heart size={18} /> Danh sách yêu thích
        </NavLink>
        
        <NavLink to="/my-profile/security" className={({ isActive }) => [styles.navItem, isActive ? styles.navActive : ''].join(' ')}>
          <Lock size={18} /> Đổi mật khẩu
        </NavLink>
        
        <button onClick={logout} className={[styles.navItem, styles.logout].join(' ')}>
          <LogOut size={18} /> Đăng xuất tài khoản
        </button>
      </nav>

      <div className={styles.supportCard}>
        <h3><PhoneCall size={18} /> Cần trợ giúp đơn hàng?</h3>
        <p>Hỗ trợ từ 8:00 – 21:00 hằng ngày.</p>
        <a href="tel:19006868">Hotline 1900 6868</a>
      </div>

      <div className={styles.navCard}>
        <h3><MapPin size={18} /> Địa chỉ giao mặc định</h3>
        <p>{profile.address || 'Bạn chưa cập nhật địa chỉ.'}</p>
        <NavLink to="/my-profile">Cập nhật thông tin</NavLink>
      </div>
    </div>
  );
}