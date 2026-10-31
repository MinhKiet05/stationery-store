import React from "react";
import { MapPin, Phone, Mail } from "lucide-react";
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
                <span>Hotline: 1900 6868</span>
              </div>
              <div className={styles.contactItem}>
                <Mail size={18} className={styles.icon} />
                <span>cskh@stationerystore.vn</span>
              </div>
            </div>
          </div>

          {/* Cột 2: Hỗ trợ khách hàng */}
          <div className={styles.column}>
            <h3 className={styles.title}>HỖ TRỢ KHÁCH HÀNG</h3>
            <ul className={styles.linkList}>
              <li><a href="#" className={styles.link}>Hướng dẫn mua hàng</a></li>
              <li><a href="#" className={styles.link}>Chính sách giao hàng & kiểm hàng</a></li>
              <li><a href="#" className={styles.link}>Chính sách đổi trả 7 ngày</a></li>
              <li><a href="#" className={styles.link}>Hướng dẫn thanh toán an toàn</a></li>
              <li><a href="#" className={styles.link}>Câu hỏi thường gặp FAQ</a></li>
            </ul>
          </div>

          {/* Cột 3: Về chúng tôi */}
          <div className={styles.column}>
            <h3 className={styles.title}>VỀ CHÚNG TÔI</h3>
            <ul className={styles.linkList}>
              <li><a href="#" className={styles.link}>Giới thiệu StationeryStore</a></li>
              <li><a href="#" className={styles.link}>Hệ thống cửa hàng</a></li>
              <li><a href="#" className={styles.link}>Tuyển dụng</a></li>
              <li><a href="#" className={styles.link}>Điều khoản dịch vụ</a></li>
              <li><a href="#" className={styles.link}>Chính sách bảo mật thông tin</a></li>
            </ul>
          </div>

          {/* Cột 4: Newsletter & Thanh toán */}
          <div className={styles.column}>
            <h3 className={styles.title}>ĐĂNG KÝ NHẬN ƯU ĐÃI</h3>
            <p className={styles.newsletterText}>
              Nhận ngay voucher giảm 10% cho đơn hàng đầu tiên.
            </p>
            <form className={styles.subscribeForm} onSubmit={(e) => e.preventDefault()}>
              <input 
                type="email" 
                placeholder="Nhập email của bạn..." 
                className={styles.input}
                required
              />
              <button type="submit" className={styles.subscribeBtn}>
                Đăng ký
              </button>
            </form>
            
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