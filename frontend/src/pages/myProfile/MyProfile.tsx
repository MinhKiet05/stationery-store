import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, cacheTimes } from '../../services/queryCache';
import useSessionScope from '../../services/useSessionScope';
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getMyProfile, type UserProfile } from '../../services/userService';
import { getMyOrderHistory } from '../../services/orderService';
import type { ProfileContext } from './profileContext';
import { userMessage } from '../../utils/notifications';
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
  const scope = useSessionScope(), client = useQueryClient();
  const profileKey = queryKeys.private('profile', {}, scope), ordersKey = queryKeys.private('orders', { summary: true }, scope);
  const profileQuery = useQuery({ queryKey: profileKey, queryFn: ({ signal }) => getMyProfile(signal), staleTime: cacheTimes.currentUser });
  const ordersQuery = useQuery({ queryKey: ordersKey, queryFn: ({ signal }) => getMyOrderHistory({ summary: true }, signal), staleTime: cacheTimes.orders });
  const profile = profileQuery.data;
  const profileError = profileQuery.isError ? userMessage(profileQuery.error, 'Không tải được hồ sơ. Vui lòng thử lại.') : '';
  const ordersLoading = ordersQuery.isPending;
  const ordersError = ordersQuery.isError ? userMessage(ordersQuery.error, 'Không tải được đơn hàng. Vui lòng thử lại.') : '';
  const setProfile = (data: UserProfile) => client.setQueryData(profileKey, data);


  if (!profile) return (
    <main className={styles.profilePage}>
      <div className={styles.container}>
        {profileError ? <div role="alert"><p>{profileError}</p><button onClick={() => {
          void profileQuery.refetch();
        }}>Thử lại</button></div> : <p role="status">Đang tải thông tin tài khoản…</p>}
      </div>
    </main>
  );

  const context: ProfileContext = {
    profile,
    updateProfile: setProfile,
    refreshOrders: () => { void client.invalidateQueries({ queryKey: ['session', scope, 'orders'] }); },
  };

  return (
    <div className={styles.profilePage}>
      <div className={styles.container}>
        {/* Banner thông tin ở trên cùng */}
        <ProfileBanner profile={profile} summary={ordersQuery.data} ordersLoading={ordersLoading} ordersError={ordersError} />

        {/* Khung chứa Sidebar và Nội dung Tab */}
        <div className={styles.mainLayout}>
          <aside className={styles.sidebarWrapper}>
            <ProfileSidebar profile={profile} orderCount={ordersLoading || ordersError ? null : ordersQuery.data?.totalElements ?? 0} />
          </aside>

          <main className={styles.contentWrapper}>
            <Outlet context={context} />
          </main>
        </div>
      </div>
    </div>
  );
}
