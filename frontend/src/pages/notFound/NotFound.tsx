import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Home, PencilRuler } from 'lucide-react';
import styles from './NotFound.module.css';

export default function NotFound({ dashboard = false }: { dashboard?: boolean }) {
  useEffect(() => {
    const previous = document.title;
    document.title = '404 · Không tìm thấy trang | StationeryStore';
    return () => { document.title = previous; };
  }, []);

  const Container = dashboard ? 'section' : 'main';
  return <Container className={styles.page} aria-labelledby="not-found-title">
    <div className={styles.card}>
      <PencilRuler className={styles.icon} size={44} aria-hidden="true" />
      <p className={styles.code}>404</p>
      <h1 id="not-found-title">Không tìm thấy trang</h1>
      <p>Đường dẫn này có thể đã thay đổi hoặc không còn tồn tại. Hãy chọn một điểm đến bên dưới để tiếp tục.</p>
      <div className={styles.actions}>
        <Link className={styles.primary} to={dashboard ? '/dashboard' : '/'}><Home size={18} aria-hidden="true" />{dashboard ? 'Về trang tổng quan' : 'Về trang chủ'}</Link>
        <Link className={styles.secondary} to="/search">Khám phá sản phẩm <ArrowRight size={18} aria-hidden="true" /></Link>
      </div>
    </div>
  </Container>;
}
