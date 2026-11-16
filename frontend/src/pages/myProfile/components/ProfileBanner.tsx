import { UserRound, Mail, Phone, ShoppingBag, Truck } from 'lucide-react';
import type { UserProfile } from '../../../services/userService';
import type { Order } from '../../../services/orderService';
import styles from '../MyProfile.module.css';

type Props = { profile: UserProfile; orders: Order[]; ordersLoading: boolean; ordersError: string };

export default function ProfileBanner({ profile, orders, ordersLoading, ordersError }: Props) {
  const count = ordersLoading ? '…' : ordersError ? '—' : orders.length;
  const shipping = ordersLoading ? '…' : ordersError ? '—' : orders.filter((order) => order.status === 'SHIPPED').length;
  return (
    <header className={styles.bannerContainer}>
      <div className={styles.identity}>
        <div className={styles.avatar} aria-hidden="true"><UserRound size={36} /></div>
        <div>
          <h1>{profile.fullName || profile.username}</h1>
          <p>Mã khách hàng: #{profile.userID} · {profile.username}</p>
          <div className={styles.contact}>
            <span><Mail size={14} /> {profile.email}</span>
            {profile.phoneNumber && <span><Phone size={14} /> {profile.phoneNumber}</span>}
          </div>
        </div>
      </div>
      <div className={styles.stats} aria-busy={ordersLoading}>
        <div><span>ĐƠN HÀNG ĐÃ ĐẶT</span><strong><ShoppingBag size={20} /> {count} <small>đơn</small></strong></div>
        <div><span>ĐƠN ĐANG GIAO</span><strong><Truck size={20} /> {shipping} <small>đơn</small></strong></div>
      </div>
    </header>
  );
}
