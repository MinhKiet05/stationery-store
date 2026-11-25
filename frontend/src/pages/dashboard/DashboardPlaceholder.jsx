import { Link } from 'react-router-dom';
import { Construction } from 'lucide-react';

export default function DashboardPlaceholder({ title }) {
  return <><p className="dashboard-eyebrow">STATIONERY STORE · ADMINISTRATION</p><h1 className="dashboard-placeholder-title">{title}</h1>
    <section className="dashboard-panel dashboard-placeholder"><span className="dashboard-icon-tile tone-orange"><Construction size={30} /></span>
      <h2>Chức năng đang được phát triển</h2><p>Không gian quản lý {title.toLocaleLowerCase('vi-VN')} sẽ có mặt trong bản cập nhật tiếp theo.</p>
      <Link className="dashboard-button dashboard-button-primary" to="/dashboard">Về trang tổng quan</Link></section></>;
}
