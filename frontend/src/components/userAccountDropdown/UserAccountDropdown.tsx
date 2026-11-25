import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { skipToken, useQuery } from '@tanstack/react-query';
import { ChevronDown, LayoutDashboard, LogOut, UserRound } from 'lucide-react';
import type { UserInfoResponse } from '../../services/authService';
import type { UserProfile } from '../../services/userService';
import useSessionScope from '../../services/useSessionScope';
import { queryKeys } from '../../services/queryCache';
import { notify } from '../../utils/notifications';
import { accountInitials, accountRoleLabel } from '../../utils/userDisplay';
import styles from './UserAccountDropdown.module.css';

type Props = { user: UserInfoResponse; profileHref?: string; onLogout?: () => void };

export default function UserAccountDropdown({ user, profileHref = '/my-profile', onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const id = useId(), location = useLocation(), scope = useSessionScope();
  // Observe the existing profile cache for cosmetic updates only. Never fetch or derive permissions here.
  const profile = useQuery<UserProfile>({ queryKey: queryKeys.private('profile', {}, scope), queryFn: skipToken }).data;
  const display = profile && profile.userID === user.userID ? profile : user;
  const name = display.fullName?.trim() || display.username?.trim() || 'Tài khoản';
  const isAdmin = user.role === 'ADMIN';

  const [locationKey, setLocationKey] = useState(location.key);
  if (locationKey !== location.key) {
    setLocationKey(location.key);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);

  function logout() {
    localStorage.removeItem('accessToken');
    setOpen(false);
    window.dispatchEvent(new Event('auth-changed'));
    notify.success('Đăng xuất thành công.');
    onLogout?.();
  }

  return <div ref={root} className={styles.profileContainer} data-user-account onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button ref={trigger} type="button" className={styles.profileBtn} data-user-account-trigger
      aria-label={`Tài khoản ${name}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <span className={styles.avatar} aria-hidden="true">{accountInitials(display.fullName?.trim() || display.username)}</span>
      <span className={styles.userInfo}><span className={styles.userName}>{name}</span>
        <span className={styles.userRole}>{accountRoleLabel(user.role)}</span></span>
      <ChevronDown size={16} className={styles.profileChevron} aria-hidden="true" />
    </button>
    {open && <div id={id} className={styles.accountDropdown} data-user-account-menu>
      <div className={styles.dropdownIdentity}><strong>{name}</strong><span>{display.email}</span></div>
      <nav className={styles.dropdownActions} aria-label="Tài khoản người dùng">
        <Link to={profileHref} className={styles.dropdownItem} onClick={() => setOpen(false)}><UserRound size={19} aria-hidden="true" />Tài khoản</Link>
        {isAdmin && <Link to="/dashboard" className={styles.dropdownItem} onClick={() => setOpen(false)}
          aria-current={location.pathname === '/dashboard' || location.pathname.startsWith('/dashboard/') ? 'page' : undefined}>
          <LayoutDashboard size={19} aria-hidden="true" />Quản trị</Link>}
        <button type="button" className={`${styles.dropdownItem} ${styles.dropdownLogout}`} onClick={logout}><LogOut size={19} aria-hidden="true" />Đăng xuất</button>
      </nav>
    </div>}
  </div>;
}
