import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getMyProfile, type UserProfile } from '../../services/userService';
import { getMyOrders, type Order } from '../../services/orderService';
import type { ProfileContext } from './profileContext';
import ProfileBanner from './components/ProfileBanner';
import ProfileSidebar from './components/ProfileSidebar';
import styles from './MyProfile.module.css';

export default function MyProfile() {
  const [token, setToken] = useState(() => localStorage.getItem('accessToken'));
  const location = useLocation();

  useEffect(() => {
    const syncAuth = () => setToken(localStorage.getItem('accessToken'));
    window.addEventListener('auth-changed', syncAuth);
    window.addEventListener('storage', syncAuth);
    return () => {
      window.removeEventListener('auth-changed', syncAuth);
      window.removeEventListener('storage', syncAuth);
    };
  }, []);

  if (!token) return <Navigate to="/login" replace state={{ from: location }} />;
  return <ProfileContent key={token} />;
}

function ProfileContent() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState('');
  const [profileAttempt, setProfileAttempt] = useState(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState('');
  const [ordersAttempt, setOrdersAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getMyProfile(controller.signal).then((data) => {
      if (!controller.signal.aborted) setProfile(data);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setProfileError(error instanceof Error ? error.message : 'Không tải được hồ sơ.');
    });
    return () => controller.abort();
  }, [profileAttempt]);

  useEffect(() => {
    const controller = new AbortController();
    getMyOrders(controller.signal).then((data) => {
      if (!controller.signal.aborted) setOrders(data);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setOrdersError(error instanceof Error ? error.message : 'Không tải được đơn hàng.');
    }).finally(() => {
      if (!controller.signal.aborted) setOrdersLoading(false);
    });
    return () => controller.abort();
  }, [ordersAttempt]);

  function retryOrders() {
    setOrdersLoading(true);
    setOrdersError('');
    setOrdersAttempt((attempt) => attempt + 1);
  }

  if (!profile) return (
    <main className={styles.profilePage}>
      <div className={styles.container}>
        {profileError ? <div role="alert"><p>{profileError}</p><button onClick={() => {
          setProfileError('');
          setProfileAttempt((attempt) => attempt + 1);
        }}>Thử lại</button></div> : <p role="status">Đang tải thông tin tài khoản…</p>}
      </div>
    </main>
  );

  const context: ProfileContext = {
    profile,
    updateProfile: setProfile,
    orders,
    ordersLoading,
    ordersError,
    retryOrders,
    replaceOrder: (updated) => setOrders((current) => current.map((order) => order.orderID === updated.orderID ? updated : order)),
  };

  return (
    <div className={styles.profilePage}>
      <div className={styles.container}>
        {/* Banner thông tin ở trên cùng */}
        <ProfileBanner profile={profile} orders={orders} ordersLoading={ordersLoading} ordersError={ordersError} />

        {/* Khung chứa Sidebar và Nội dung Tab */}
        <div className={styles.mainLayout}>
          <aside className={styles.sidebarWrapper}>
            <ProfileSidebar profile={profile} orderCount={ordersLoading || ordersError ? null : orders.length} />
          </aside>

          <main className={styles.contentWrapper}>
            <Outlet context={context} />
          </main>
        </div>
      </div>
    </div>
  );
}
