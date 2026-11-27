import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight, Award, BookOpen, Check, Clock3, ExternalLink,
  Headphones, HelpCircle, Leaf, Mail, MapPin,
  MessageCircle, PackageCheck, PenLine, Phone, Send, ShieldCheck, Smile,
  Sparkles, Star, Store, UserRound,
} from "lucide-react";
import styles from "./AboutUs.module.css";
import { notify } from "../../utils/notifications";
import { Link, useLocation, useNavigate } from 'react-router-dom';

const values = [
  { icon: ShieldCheck, title: "Tinh Tuyển Chất Lượng", description: "100% sản phẩm có chứng nhận xuất xứ rõ ràng từ các xưởng sản xuất danh tiếng tại Nhật Bản, Đức và Thụy Sĩ. Đảm bảo độ bền ngòi bút và độ chuẩn màu mực vượt trội.", promise: "Cam kết hoàn tiền 200% nếu hàng giả", promiseIcon: PackageCheck },
  { icon: Leaf, title: "Bền Vững & Sinh Thái", description: "Ưu tiên dòng giấy đạt chứng chỉ bảo vệ rừng FSC, giấy tái sinh không tẩy trắng hóa chất có độc hại và bao bì màng đệm rơm lúa mì tự phân hủy thân thiện với mẹ thiên nhiên.", promise: "100% bao bì tự phân hủy", promiseIcon: Leaf },
  { icon: Store, title: "Trải Nghiệm Tinh Tế", description: "Mỗi đơn hàng đều được bao bọc thủ công như một món quà nghệ thuật, đính kèm thiệp thư tay viết tặng mang dấu ấn riêng, bookmark thiết kế độc quyền và hương thơm nhẹ nhàng.", promise: "Gói quà nghệ thuật miễn phí", promiseIcon: Store },
  { icon: Headphones, title: "Đồng Hành Tận Tâm", description: "Chính sách đổi trả minh bạch trong 7 ngày không cần lý do. Đội ngũ chuyên viên tư vấn ngòi bút, định lượng giấy GSM và loại sổ chuyên dụng phù hợp nhất cho nhu cầu của bạn.", promise: "Hỗ trợ phản hồi trong 2–4 giờ", promiseIcon: Mail },
];

const statistics = [
  { icon: Award, value: "5+", label: "Năm phát triển", detail: "Kiến tạo phong cách ghi chép trang nhã từ năm 2019", decoration: "Since 2019" },
  { icon: Smile, value: "100.000+", label: "Khách hàng tin dùng", detail: "Cộng đồng người viết, kiến trúc sư và sinh viên toàn quốc", decoration: "Together" },
  { icon: PackageCheck, value: "2.500+", label: "Dòng sản phẩm chọn lọc", detail: "Nhập khẩu chính ngạch từ Nhật Bản, Đức, Ý và Pháp", decoration: "Selected" },
  { icon: Star, value: "99.2%", label: "Hài lòng & đánh giá 5★", detail: "Dịch vụ đóng gói kỹ lưỡng và hỗ trợ tức thời", decoration: "With love" },
];

const faqs = [
  { question: "Tôi có thể đổi trả sản phẩm trong bao lâu?", answer: "Bạn có thể yêu cầu đổi trả trong 7 ngày kể từ khi nhận hàng. Vui lòng giữ hóa đơn, bao bì và liên hệ 1900 6868 để được hướng dẫn theo tình trạng sản phẩm." },
  { question: "Thời gian giao hàng dự kiến là bao lâu?", answer: "Đơn hàng nội thành thường được giao trong 1–2 ngày làm việc; các tỉnh thành khác khoảng 3–5 ngày. Thời gian cụ thể được xác nhận khi cửa hàng tiếp nhận đơn hàng." },
  { question: "Cửa hàng có hỗ trợ gói quà không?", answer: "Có. Bạn có thể yêu cầu gói quà và viết thiệp khi đặt hàng. Với đơn quà tặng doanh nghiệp, hãy chọn chủ đề Hợp tác doanh nghiệp trong biểu mẫu liên hệ." },
];

const mapsUrl = "https://www.google.com/maps/search/?api=1&query=123+Nguyen+Hue+District+1+Ho+Chi+Minh+City";

export default function AboutUs() {
  const location = useLocation(), navigate = useNavigate();
  const [messageLength, setMessageLength] = useState(0);
  const [emailPrepared, setEmailPrepared] = useState(false);
  const [faqOpen, setFaqOpen] = useState(window.location.hash === "#faq");

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Giới thiệu & Liên hệ | StationeryStore";
    const section = location.hash.slice(1) || (/^\/(contact|lien-he)\/?$/.test(location.pathname) ? 'contact' : '');
    if (section) document.getElementById(section)?.scrollIntoView();
    return () => {
      document.title = previousTitle;
    };
  }, [location.hash, location.pathname]);

  const [previousHash, setPreviousHash] = useState(location.hash);
  if (previousHash !== location.hash) { setPreviousHash(location.hash); setFaqOpen(location.hash === '#faq'); }

  function toggleFaq() {
    const open = !faqOpen;
    setFaqOpen(open);
    const hash = open ? "#faq" : window.location.hash === "#faq" ? "" : window.location.hash;
    navigate({ pathname: location.pathname, search: location.search, hash }, { replace: true });
  }

  function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const subject = `[StationeryStore] ${String(form.get("subject"))}`;
    const body = `Họ và tên: ${String(form.get("name")).trim()}\nEmail: ${String(form.get("email")).trim()}\nSố điện thoại: ${String(form.get("phone") || "Không cung cấp").trim()}\nĐăng ký nhận cẩm nang & ưu đãi: ${form.has("newsletter") ? "Có" : "Không"}\n\n${String(form.get("message")).trim()}`;
    window.location.href = `mailto:cskh@stationerystore.vn?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setEmailPrepared(true);
    notify.info("Đã chuẩn bị email. Vui lòng gửi trong ứng dụng email của bạn.");
  }

  return (
    <main className={styles.page}>
      <div className={styles.breadcrumbBar}>
        <div className={styles.container}>
          <div className={styles.breadcrumbTrust}><span><PackageCheck size={14} /> Chứng nhận phân phối chính hãng</span><span><ShieldCheck size={14} /> Tiêu chuẩn FSC Quốc tế</span></div>
        </div>
      </div>

      <section className={styles.hero} aria-labelledby="about-title">
        <div className={`${styles.container} ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrowPill}><span /> ATELIER PAPETERIE & STUDIO NHẬT BẢN · CHÂU ÂU</span>
            <h1 id="about-title">Nuôi dưỡng cảm hứng & nghệ thuật ghi chép cùng StationeryStore</h1>
            <p>Chúng tôi tin rằng từng trang giấy mộc, từng vệt mực êm ái đều ẩn chứa năng lượng chữa lành và khai mở tư duy sáng tạo vô tận. StationeryStore ra đời như một không gian tinh tại dành cho những ai tôn sùng vẻ đẹp thủ công và giá trị sống lắng đọng.</p>
            <div className={styles.heroActions}>
              <Link to="#contact" className={styles.primaryButton}>Liên hệ & Hợp tác ngay <ArrowRight size={16} /></Link>
              <Link to="#values" className={styles.secondaryButton}><HelpCircle size={16} /> Khám phá giá trị cốt lõi</Link>
            </div>
          </div>
          <div className={styles.heroPhoto}>
            <div className={styles.photoLabel}>StationeryStore · Giới Thiệu & Liên Hệ Hệ Thống</div>
            <img src="/images/atelier-writing.jpg" alt="Ngòi bút máy lướt nhẹ trên trang giấy viết tay" fetchPriority="high" width="1200" height="899" />
            <div className={styles.established}><Sparkles size={18} /><strong>EST. 2019</strong><span>Curated Goods</span></div>
            <div className={styles.photoCaption}><div><strong>Studio Flagship TP.HCM</strong><span>Không gian trải nghiệm bút mực & giấy thủ công</span></div><BookOpen size={24} /></div>
          </div>
        </div>
      </section>

      <section className={`${styles.container} ${styles.storySection}`} aria-label="Câu chuyện thương hiệu">
        <div className={styles.storyCard}>
          <div className={styles.founderPhoto}>
            <img src="/images/atelier-studio.jpg" alt="Một góc làm việc sáng tạo ngập tràn ánh sáng tự nhiên" loading="lazy" width="850" height="1275" />
            <span><PenLine size={13} /> Hành trình đam mê</span>
          </div>
          <div className={styles.storyCopy}>
            <span className={styles.eyebrow}><span className={styles.quoteMark}>❞</span> LỜI TỰ SỰ TỪ NHÀ SÁNG LẬP</span>
            <h2>"Một trang giấy trắng không chỉ là nơi lưu giữ nét chữ, mà là tấm gương phản chiếu tâm hồn người viết."</h2>
            <p>Khởi nguồn từ một căn gác nhỏ ngập tràn mùi giấy dó, mùi mực tùng và hàng trăm mẫu bút sưu tầm từ Tokyo tới Leipzig, StationeryStore không được dựng xây đơn thuần như một cửa hàng thương mại. Chúng tôi ấp ủ tạo nên điểm dừng chân cho những người yêu cái chạm chân thật của ngòi bút trên sớ giấy mịn màng.</p>
            <p>Sau hơn 5 năm đồng hành, chúng tôi đã đóng gói và gửi trao hơn một trăm nghìn gói quà văn phòng phẩm được gói ghém bằng giấy bọc Kraft mộc, niêm phong sáp đỏ và thắt nơ dây đay vintage. Từng đơn hàng xuất kho là một thông điệp tiếp thêm cảm hứng viết tiếp ước mơ của chính bạn.</p>
            <div className={styles.signature}><div><strong>Minh Hoàng & Đội ngũ Atelier</strong><span>Sáng lập kiêm Giám đốc Tuyển chọn Sản phẩm</span></div><span className={styles.trustBadge}><ShieldCheck size={13} /> Chính hãng ủy quyền quốc tế</span></div>
          </div>
        </div>
        <div className={styles.statistics}>
          {statistics.map(({ icon: Icon, value, label, detail, decoration }) => <div className={styles.statCard} key={label}><Icon size={23} /><strong>{value}</strong><h3>{label}</h3><p>{detail}</p><span className={styles.statDecoration} aria-hidden="true">{decoration}</span></div>)}
        </div>
      </section>

      <section className={styles.valuesSection} id="values" aria-labelledby="values-title">
        <div className={styles.container}>
          <div className={styles.sectionHeading}><span className={styles.eyebrow}>TÔN CHỈ PHỤNG SỰ</span><h2 id="values-title">Bốn Trụ Cột Giá Trị Cốt Lõi</h2><p>Cam kết định hình từng điểm chạm chất lượng khi quý khách mở chiếc hộp văn phòng phẩm từ StationeryStore.</p></div>
          <div className={styles.valuesGrid}>{values.map(({ icon: Icon, title, description, promise, promiseIcon: PromiseIcon }) => <article className={styles.valueCard} key={title}><span className={styles.valueIcon}><Icon size={23} /></span><h3>{title}</h3><p>{description}</p><div className={styles.valuePromise}><PromiseIcon size={14} /><span>{promise}</span></div></article>)}</div>
        </div>
      </section>

      <section className={`${styles.container} ${styles.contactSection}`} id="contact" aria-labelledby="contact-title">
        <div className={styles.sectionHeading}><span className={styles.eyebrow}>TƯƠNG TÁC TRỰC TIẾP</span><h2 id="contact-title">Kết Nối Với Chúng Tôi</h2><p>Hãy ghé thăm không gian trải nghiệm thực tế hoặc để lại lời nhắn để bắt đầu hành trình sáng tạo mới.</p></div>
        <div className={styles.contactGrid}>
          <div className={styles.storeColumn}>
            <article className={styles.storeCard} id="stores">
              <div className={styles.cardHeading}><div><span className={styles.eyebrowPill}>TRỤ SỞ & FLAGSHIP STORE</span><h3>StationeryStore Nguyễn Huệ</h3></div><span className={styles.roundIcon}><Store size={22} /></span></div>
              <div className={styles.contactDetails}>
                <div className={styles.detailRow}><span className={styles.detailIcon}><MapPin size={18} /></span><div><strong>Địa chỉ cửa hàng:</strong><p>123 Đường Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh</p><small>(Cách Phố đi bộ Nguyễn Huệ 50m, có bãi đậu xe ô tô)</small></div></div>
                <div className={styles.detailRow}><span className={styles.detailIcon}><Clock3 size={18} /></span><div><strong>Thời gian mở cửa đón khách:</strong><p>08:00 – 21:30 (Thứ 2 đến Chủ Nhật, mở cửa cả dịp Lễ)</p></div></div>
                <div className={styles.detailRow}><span className={styles.detailIcon}><Phone size={18} /></span><div><strong>Hotline & Hỗ trợ trực tiếp:</strong><p>Tư vấn mua lẻ: <a href="tel:19006868">1900 6868</a><span className={styles.phoneSeparator}> | </span>CSKH: <a href="tel:02838229999">028 3822 9999</a></p></div></div>
                <div className={styles.detailRow}><span className={styles.detailIcon}><Mail size={18} /></span><div><strong>Hộp thư điện tử:</strong><p>Chăm sóc khách hàng: <a className={styles.orangeLink} href="mailto:cskh@stationerystore.vn">cskh@stationerystore.vn</a></p><p>Hợp tác doanh nghiệp / B2B: <a className={styles.orangeLink} href="mailto:hoptac@stationerystore.vn">hoptac@stationerystore.vn</a></p></div></div>
              </div>
              <div className={styles.socialSection}><strong>Kênh mạng xã hội chính thức:</strong><div className={styles.socialLinks}><a href="https://www.facebook.com/" target="_blank" rel="noreferrer">Facebook <ExternalLink size={11} /></a><a href="https://www.instagram.com/" target="_blank" rel="noreferrer">Instagram <ExternalLink size={11} /></a><a href="https://www.tiktok.com/" target="_blank" rel="noreferrer">TikTok <ExternalLink size={11} /></a><a href="https://shopee.vn/" target="_blank" rel="noreferrer">Shopee Mall <ExternalLink size={11} /></a></div></div>
            </article>

           <article className={styles.mapCard}>
  <div className={styles.mapHeading}>
    <h3><MapPin size={18} /> Vị trí trực quan trên Google Maps</h3>
    <a href={mapsUrl} target="_blank" rel="noreferrer">
      Mở trong Google Maps <ExternalLink size={12} />
    </a>
  </div>
  
  <div className={styles.mapFrame}>
    {/* Thay thẻ <a> bọc ngoài bằng <div> để đúng chuẩn HTML/DOM nesting */}
    <div className={styles.mapCanvas}>
      <iframe 
        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3918.858169091083!2d106.68427047570304!3d10.822164158346961!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3174deb3ef536f31%3A0x8b7bb8b7c956157b!2zVHLGsOG7nW5nIMSQ4bqhaSBo4buNYyBDw7RuZyBuZ2hp4buHcCBUUC5IQ00!5e0!3m2!1svi!2s!4v1794835472157!5m2!1svi!2s" 
        width="600" 
        height="450" 
        style={{ border: 0 }} 
        loading="lazy" 
        referrerPolicy="strict-origin-when-cross-origin"
        title="Bản đồ vị trí cửa hàng StationeryStore Flagship"
      />
    </div>

    <a 
      className={styles.mapChip} 
      href={mapsUrl} 
      target="_blank" 
      rel="noreferrer"
      aria-label="Chỉ đường từ Nhà hát Lớn"
    >
      <MapPin size={14} /> Chỉ đường từ Nhà hát Lớn <ArrowRight size={13} />
    </a>
    
    <a 
      className={styles.mapAttribution} 
      href="https://www.openstreetmap.org/copyright" 
      target="_blank" 
      rel="noreferrer"
    >
      © OpenStreetMap contributors
    </a>
  </div>
</article>

            <article className={styles.branchesCard}><h3><BookOpen size={19} /> Chi nhánh khác trên toàn quốc</h3><a href="https://www.google.com/maps/search/?api=1&query=45+Pho+Trang+Tien+Ha+Noi" target="_blank" rel="noreferrer" className={styles.branch}><div><strong>Hà Nội Atelier · Hoàn Kiếm</strong><p>45 Phố Tràng Tiền, Quận Hoàn Kiếm, Hà Nội</p><span><Phone size={11} /> Hotline chi nhánh: 024 3939 1234</span></div><span className={styles.hours}>08:30 – 21:00</span></a><a href="https://www.google.com/maps/search/?api=1&query=88+Bach+Dang+Hai+Chau+Da+Nang" target="_blank" rel="noreferrer" className={styles.branch}><div><strong>Đà Nẵng Concept Store · Hải Châu</strong><p>88 Bạch Đằng, Phường Hải Châu I, Quận Hải Châu, Đà Nẵng</p><span><Phone size={11} /> Hotline chi nhánh: 0236 3888 686</span></div><span className={styles.hours}>08:30 – 21:00</span></a></article>
          </div>

          <article className={styles.formCard}>
            <span className={styles.eyebrowPill}><Mail size={12} /> TIẾP NHẬN 24/7</span><h3>Gửi Tin Nhắn & Đóng Góp Ý Kiến</h3><p className={styles.formIntro}>Chúng tôi luôn trân trọng mọi góc nhìn đóng góp từ quý khách. Đội ngũ CSKH và Tư vấn viên chuyên sâu sẽ hồi đáp chi tiết qua Email/Điện thoại trong vòng 2 - 4 giờ làm việc.</p>
            <form onSubmit={submitContact} onChange={() => setEmailPrepared(false)}>
              <label className={styles.field}>Họ và tên của bạn <span>*</span><div className={styles.inputWrap}><UserRound size={16} /><input name="name" autoComplete="name" placeholder="Ví dụ: Nguyễn Văn An" required maxLength={100} pattern=".*\S.*" /></div></label>
              <div className={styles.formRow}>
                <label className={styles.field}>Địa chỉ Email <span>*</span><div className={styles.inputWrap}><Mail size={16} /><input type="email" name="email" autoComplete="email" placeholder="tenban@gmail.com" required maxLength={150} /></div></label>
                <label className={styles.field}>Số điện thoại liên hệ<div className={styles.inputWrap}><Phone size={16} /><input type="tel" name="phone" autoComplete="tel" placeholder="0912 345 678" maxLength={30} /></div></label>
              </div>
              <label className={styles.field}>Chủ đề liên hệ <span>*</span>
                <div className={styles.inputWrap}>
                  <MessageCircle size={16} />
                  <select name="subject" required defaultValue="">
                    <option value="" disabled>Vui lòng chọn chủ đề phù hợp</option>
                    <option>Tư vấn sản phẩm</option>
                    <option>Hỗ trợ đơn hàng & đổi trả</option>
                    <option>Hợp tác doanh nghiệp / B2B</option>
                    <option>Đóng góp ý kiến</option>
                    <option>Thông tin workshop</option>
                  </select>
                </div>
              </label>
              <label className={styles.field}><span className={styles.textareaLabel}>Nội dung tin nhắn <span>*</span><small>{messageLength} / 500 ký tự</small></span><textarea name="message" placeholder="Quý khách có thể chia sẻ cụ thể mong muốn, mã đơn hàng (nếu có) hoặc kích thước/số lượng bộ quà tặng văn phòng phẩm cần báo giá..." required minLength={10} maxLength={500} rows={6} onChange={(event) => {
                setMessageLength(event.target.value.length);
                event.target.setCustomValidity(event.target.value.trim().length < 10 ? "Vui lòng nhập ít nhất 10 ký tự nội dung, không tính khoảng trắng ở đầu và cuối." : "");
              }} /></label>
              <label className={styles.checkboxLabel}><input type="checkbox" name="newsletter" /><span>Tôi muốn nhận cẩm nang nghệ thuật viết chữ, thông báo các buổi workshop và mã voucher giảm giá 10% cho đơn hàng kế tiếp.</span></label>
              <button className={styles.submitButton} type="submit"><Send size={17} /> Gửi tin nhắn qua email <ArrowRight size={16} /></button>
              {emailPrepared && <p className={styles.formStatus} role="status"><Check size={18} /> Nội dung email đã được chuẩn bị. Vui lòng bấm Gửi trong ứng dụng email để hoàn tất. Nếu ứng dụng chưa mở, bạn có thể gửi trực tiếp đến cskh@stationerystore.vn.</p>}
              <p className={styles.privacyNote}><ShieldCheck size={14} /> Thông tin cá nhân của bạn được bảo mật theo tiêu chuẩn Atelier Papeterie</p>
            </form>
          </article>
        </div>
      </section>

      <section className={styles.faqSection} id="faq" aria-label="Hỗ trợ nhanh"><div className={styles.container}><div className={styles.faqBanner}><span className={styles.faqIcon}><HelpCircle size={27} /></span><div className={styles.faqCopy}><h2>Cần tra cứu nhanh câu hỏi thường gặp?</h2><p>Tìm hiểu chính sách đổi trả, thời gian giao hàng các tỉnh thành, hoặc hướng dẫn nạp mực bút máy tại trung tâm trợ giúp.</p></div><div className={styles.faqActions}><button type="button" onClick={toggleFaq} aria-expanded={faqOpen} aria-controls="about-faq">{faqOpen ? "Đóng mục FAQs" : "Xem mục FAQs"}</button><a href="tel:19006868"><Phone size={14} /> Gọi 1900 6868</a></div></div>{faqOpen && <div className={styles.faqAnswers} id="about-faq">{faqs.map(({ question, answer }) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>}</div></section>
    </main>
  );
}
