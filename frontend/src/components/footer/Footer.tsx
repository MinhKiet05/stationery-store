import { MapPin, Phone, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import styles from "./Footer.module.css";
import stationeryStoreLogo from "../../assets/StationeryStoreLogo.webp";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.grid}>
          
          {/* Cột 1: Brand Info */}
          <div className={styles.brandInfo}>
            <div className={styles.logoWrapper}>
              <div className={styles.logoBox}>
                <img src={stationeryStoreLogo} alt="Logo" className={styles.logoImg} />
              </div>
              <span className={styles.brandName}>StationeryStore</span>
            </div>
            <p className={styles.description}>
              Mang đến văn phòng phẩm tinh tế, truyền cảm hứng sáng tạo và tối ưu hóa hiệu suất làm việc mỗi ngày.
            </p>
            <div className={styles.contactList}>
              <div className={styles.contactItem}>
                <MapPin size={18} className={styles.icon} />
                <span>123 Đường Nguyễn Huệ, Phường Bến Nghé,<br />Quận 1, TP. Hồ Chí Minh</span>
              </div>
              <div className={styles.contactItem}>
                <Phone size={18} className={styles.icon} />
                <a href="tel:19006868">Hotline: 1900 6868</a>
              </div>
              <div className={styles.contactItem}>
                <Mail size={18} className={styles.icon} />
                <a href="mailto:cskh@stationerystore.vn">cskh@stationerystore.vn</a>
              </div>
            </div>
          </div>

          {/* Cột 2: Hỗ trợ khách hàng */}
          <div className={styles.column}>
            <h3 className={styles.title}>HỖ TRỢ KHÁCH HÀNG</h3>
            <ul className={styles.linkList}>
              <li><Link to="/about#faq" className={styles.link}>Hướng dẫn mua hàng</Link></li>
              <li><Link to="/policy#shipping" className={styles.link}>Chính sách giao hàng & kiểm hàng</Link></li>
              <li><Link to="/policy#returns" className={styles.link}>Chính sách đổi trả 7 ngày</Link></li>
              <li><Link to="/returns/new" className={styles.link}>Yêu cầu trả hàng & hoàn tiền</Link></li>
              <li><Link to="/policy#terms" className={styles.link}>Hướng dẫn thanh toán an toàn</Link></li>
              <li><Link to="/about#faq" className={styles.link}>Câu hỏi thường gặp FAQ</Link></li>
          </ul>
          </div>

          {/* Cột 3: Về chúng tôi */}
          <div className={styles.column}>
            <h3 className={styles.title}>VỀ CHÚNG TÔI</h3>
            <ul className={styles.linkList}>
              <li><Link to="/about" className={styles.link}>Giới thiệu StationeryStore</Link></li>
              <li><Link to="/about#stores" className={styles.link}>Hệ thống cửa hàng</Link></li>
              <li><Link to="/about#contact" className={styles.link}>Liên hệ & Hợp tác</Link></li>
              <li><Link to="/about#contact" className={styles.link}>Liên hệ tuyển dụng</Link></li>
              <li><Link to="/policy#terms" className={styles.link}>Điều khoản dịch vụ</Link></li>
              <li><Link to="/policy#privacy" className={styles.link}>Chính sách bảo mật thông tin</Link></li>
              <li><Link to="/policy#warranty" className={styles.link}>Bảo hành & Khiếu nại</Link></li>
            </ul>
          </div>

          {/* Cột 4: Newsletter & Thanh toán */}
          <div className={styles.column}>
            <h3 className={styles.title}>ĐĂNG KÝ NHẬN ƯU ĐÃI</h3>
            <p className={styles.newsletterText}>
              Liên hệ cửa hàng để tìm hiểu các ưu đãi hiện có.
            </p>
            <Link to="/about#contact" className={styles.subscribeBtn}>Liên hệ nhận thông tin ưu đãi</Link>
            
            <h4 className={styles.paymentTitle}>THANH TOÁN AN TOÀN</h4>
            <div className={styles.paymentMethods}>
              <span className={styles.paymentBadge}>MoMo</span>
              <span className={styles.paymentBadge}>VNPay</span>
              <span className={styles.paymentBadge}>COD</span>
              <span className={styles.paymentBadge}>Visa / Mastercard</span>
            </div>
          </div>
          
        </div>

        {/* Bản quyền */}
        <div className={styles.copyright}>
          © 2026 StationeryStore. Đây chỉ là bài tập lớn cho môn WWW Java. Bản quyền thuộc về StationeryStore.
        </div>
      </div>
    </footer>
  );
}
