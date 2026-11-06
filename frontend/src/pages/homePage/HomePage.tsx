import { useEffect, useState } from "react";
import Recommendations from "../../components/recommendations/Recommendations";
import { api } from "../../services/api";
import styles from "./HomePage.module.css";
import { Clock, ShieldCheck, Truck, HeadphonesIcon, ShoppingCart, Circle, ArrowRight, ChevronLeft, ChevronRight, PenTool, ExternalLink } from "lucide-react";
import ProductCard, { type Product } from "../../components/productCard/ProductCard";

// Import ảnh cho Hero Section
import backdrop1 from "../../assets/backdrop1.webp";
import backdrop2 from "../../assets/backdrop2.webp";
import backdrop3 from "../../assets/backdrop3.webp";
import cirle from "../../assets/cirle.webp";
import balohocsinh from "../../assets/balohocsinh.webp";
import butcaocap from "../../assets/butcaocap.webp";
import butgel from "../../assets/butgel.webp";
import butlongmau from "../../assets/butlongmau.webp";
import combo from "../../assets/combo.webp";
import taphocsinh from "../../assets/taphocsinh.webp";

const categories = [
  { id: 1, name: "COMBO", count: "27+ sản phẩm", icon: combo },
  { id: 2, name: "Tập học sinh", count: "20+ sản phẩm", icon: taphocsinh },
  { id: 3, name: "Bút lông màu", count: "12+ sản phẩm", icon: butlongmau },
  { id: 4, name: "Balo học sinh", count: "10+ sản phẩm", icon: balohocsinh },
  { id: 5, name: "Bút gel", count: "8+ sản phẩm", icon: butgel },
  { id: 6, name: "Bút cao cấp", count: "6+ sản phẩm", icon: butcaocap },
];

export default function HomePage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);

    // State cho Hero Section Carousel
    const [currentSlide, setCurrentSlide] = useState(0);
    const slides = [backdrop1, backdrop2, backdrop3];

    const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % slides.length);
    const prevSlide = () => setCurrentSlide((prev) => (prev === 0 ? slides.length - 1 : prev - 1));

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const data = await api<{ content: Product[] }>("/api/products");
                if (data && data.content) {
                    setProducts(data.content);
                }
            } catch (error) {
                console.error("Lỗi khi tải sản phẩm:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, []);

    return (
        <div className={styles.homePage}>
            {/* Top Announcement Bar */}
            <div className={styles.announcement}>
                <span>ƯU ĐÃI NĂM HỌC MỚI: Nhập mã <span className={styles.promoHighlight}>BACK2SCHOOL</span> giảm ngay 50.000đ cho đơn từ 299.000đ</span>
                <span>Hơn 120.000+ Học sinh & Văn phòng tin dùng</span>
            </div>

            <div className={styles.container}>

                {/* =========================================
            HERO SECTION
            ========================================= */}
                <section className={styles.heroSection}>
                    {/* Cột trái: Banner chính với Carousel */}
                    <div className={styles.mainBanner}>
                        <div className={styles.slideWrapper}>
                            {slides.map((slide, index) => (
                                <img
                                    key={index}
                                    src={slide}
                                    className={`${styles.slideImage} ${index === currentSlide ? styles.active : ""}`}
                                    alt={`Backdrop ${index + 1}`}
                                />
                            ))}
                            <div className={styles.gradientOverlay}></div>
                        </div>

                        <div className={styles.slideCounter}>
                            0{currentSlide + 1} / 0{slides.length}
                        </div>

                        <div className={styles.mainContent}>
                            <div className={styles.tag}>
                                <Circle size={9} fill="currentColor" className={styles.tagDot} />
                                Ưu đãi có hạn • Back to school 2025
                            </div>

                            <div className={styles.heroSubtitle}>Mùa tựu trường rực rỡ</div>
                            <h1 className={styles.heroTitle}>RỰC RỠ ĐÓN NĂM HỌC MỚI</h1>
                            <p className={styles.heroDesc}>
                                Ưu đãi giảm đến 50% toàn bộ dụng cụ học tập & văn phòng phẩm. Tặng
                                kèm bộ sticker chống nước và sổ planner độc quyền cho mọi đơn từ
                                350.000đ.
                            </p>

                            <div className={styles.actions}>
                                <button className={styles.primaryBtn}>
                                    Mua sắm ngay <ArrowRight size={18} />
                                </button>
                                <button className={styles.secondaryBtn}>Khám phá bộ sưu tập</button>
                            </div>
                        </div>

                        <div className={styles.bottomNav}>
                            <div className={styles.dots}>
                                {slides.map((_, index) => (
                                    <div
                                        key={index}
                                        onClick={() => setCurrentSlide(index)}
                                        className={`${styles.dot} ${index === currentSlide ? styles.active : ""}`}
                                    ></div>
                                ))}
                            </div>
                            <div className={styles.navArrows}>
                                <button onClick={prevSlide} className={styles.arrowBtn}>
                                    <ChevronLeft size={18} />
                                </button>
                                <button onClick={nextSlide} className={styles.arrowBtn}>
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Cột phải: 2 thẻ Sub Banner */}
                    <div className={styles.subBanners}>
                        {/* Thẻ Góc làm việc tối giản */}
                        <div className={`${styles.subCard} ${styles.cardLight}`}>
                            <div style={{ position: "relative", zIndex: 2 }}>
                                <div className={styles.subSubtitle}>Góc làm việc tối giản</div>
                                <h3 className={styles.subTitle}>Combo Công Sở Tinh Gọn</h3>
                                <p className={styles.subDesc}>
                                    Giảm ngay 35% cho set sổ khâu chỉ kèm khay mica & bút gel.
                                </p>
                            </div>

                            <div className={styles.circleImgWrapper}>
                                <img src={cirle} alt="Góc làm việc" className={styles.circleImg} />
                            </div>

                            <div className={styles.subFooter}>
                                <span className={styles.price}>Chỉ từ 189.000đ</span>
                                <span className={styles.linkBtn}>
                                    Xem ngay <ChevronRight size={18} />
                                </span>
                            </div>
                        </div>

                        {/* Thẻ Dịch vụ cá nhân hóa */}
                        <div className={`${styles.subCard} ${styles.cardDark}`}>
                            <PenTool size={110} strokeWidth={1} className={styles.watermarkIcon} />

                            <div style={{ position: "relative", zIndex: 2 }}>
                                <div className={styles.subSubtitle}>Dịch vụ cá nhân hóa</div>
                                <h3 className={styles.subTitle}>Sổ Da & Bút Ký Cao Cấp</h3>
                                <p className={styles.subDesc}>
                                    Miễn phí dập laser tên & chữ ký kim loại, hộp quà lụa tinh xảo.
                                </p>
                            </div>

                            <div className={styles.subFooter}>
                                <span className={styles.freeText}>Khắc tên 0đ</span>
                                <span className={styles.linkBtn}>
                                    Đặt khắc ngay <ExternalLink size={16} />
                                </span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Categories Section */}
                <section>
                    <div className={styles.sectionHeader}>
                        <div>
                            <span className={styles.sectionSubtitle}>Danh mục tuyển chọn</span>
                            <h2 className={styles.sectionTitle}>Danh Mục Nổi Bật</h2>
                        </div>
                        <a href="/categories" className={styles.viewAll}>Xem tất cả danh mục →</a>
                    </div>
                    <div className={styles.categoriesGrid}>
                        {categories.map((cat) => (
                            <a
                                key={cat.id}
                                href={`/category/${cat.id}`}
                                className={styles.categoryCard}
                            >
                                <div className={styles.categoryIcon}>
                                    <img
                                        src={cat.icon}
                                        alt={cat.name}
                                        loading="lazy"
                                    />
                                </div>

                                <div className={styles.categoryName}>
                                    {cat.name}
                                </div>

                                <div className={styles.categoryCount}>
                                    {cat.count}
                                </div>
                            </a>
                        ))}
                    </div>
                </section>

                {/* Best Sellers Section */}
                <section>
                    <div className={styles.sectionHeader}>
                        <div>
                            <span className={styles.sectionSubtitle}>Xu hướng mua sắm</span>
                            <h2 className={styles.sectionTitle}>Sản Phẩm Bán Chạy Nhất</h2>
                        </div>
                        <div className={styles.tabs}>
                            <button className={`${styles.tab} ${styles.active}`}>Tất cả sản phẩm</button>
                            <button className={styles.tab}>Bút viết HOT</button>
                            <button className={styles.tab}>Sổ tay Best-Seller</button>
                            <button className={styles.tab}>Bộ quà tặng</button>
                        </div>
                    </div>

                    <div className={styles.productsGrid}>
                        {loading ? (
                            <div style={{ color: 'white' }}>Đang tải sản phẩm...</div>
                        ) : (
                            products.slice(0, 5).map((product) => (
                                <ProductCard key={product.productID} product={product} />
                            ))
                        )}
                    </div>
                </section>

                {/* Brands Section */}
                <section className={styles.whiteSection}>
                    <div className={styles.sectionHeader} style={{ marginBottom: 0 }}>
                        <div>
                            <span className={styles.sectionSubtitle} style={{ color: '#94a3b8' }}>NHÀ CUNG CẤP UY TÍN</span>
                            <h2 className={styles.sectionTitle} style={{ color: '#091426' }}>Đối Tác & Thương Hiệu Đồng Hành</h2>
                        </div>
                        <div style={{ color: '#ea580c', fontSize: 13, fontWeight: 'bold' }}>Cam kết 100% chính hãng</div>
                    </div>

                    <div className={styles.brandLogos}>
                        <div className={styles.brandLogo}>DELI</div>
                        <div className={styles.brandLogo}>THIÊN LONG</div>
                        <div className={styles.brandLogo}>PENTEL</div>
                        <div className={styles.brandLogo}>MARVY</div>
                        <div className={styles.brandLogo}>CAMPUS</div>
                        <div className={styles.brandLogo}>PILOT</div>
                    </div>

                    <div className={styles.promoBannersGrid}>
                        <div className={styles.promoBanner}>
                            <span style={{ fontSize: 10, background: '#ea580c', padding: '4px 8px', borderRadius: 4, width: 'max-content', marginBottom: 8 }}>TUẦN LỄ PENTEL JAPAN</span>
                            <h3 style={{ fontSize: 20, marginBottom: 8 }}>Mua 1 Tặng 1 EnerGel Khô Nhanh</h3>
                            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>Áp dụng cho mọi ruột bút và thân bút EnerGel cao cấp nhập khẩu chính ngạch từ Nhật Bản.</p>
                            <span style={{ fontSize: 13, fontWeight: 'bold', cursor: 'pointer' }}>Xem ưu đãi độc quyền →</span>
                        </div>
                        <div className={`${styles.promoBanner} ${styles.light}`}>
                            <span style={{ fontSize: 10, background: '#1e293b', color: 'white', padding: '4px 8px', borderRadius: 4, width: 'max-content', marginBottom: 8 }}>DELI STATIONERY FESTIVAL</span>
                            <h3 style={{ fontSize: 20, marginBottom: 8 }}>Bộ Dụng Cụ Học Tập Tiêu Chuẩn Nhật</h3>
                            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>Đồng giá từ 19.000đ các dòng thước kẻ, gôm tẩy kháng bụi và máy tính khoa học Deli.</p>
                            <span style={{ fontSize: 13, fontWeight: 'bold', cursor: 'pointer', color: '#1e293b' }}>Khám phá lễ hội Deli →</span>
                        </div>
                    </div>
                </section>

                {/* Two Columns List Section */}
                <section className={styles.twoCols}>
                    <div className={styles.listCard}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                            <h3 style={{ fontSize: 18, fontWeight: 'bold' }}>Sản Phẩm Mới Lên Kệ</h3>
                            <span style={{ fontSize: 13, color: '#94a3b8', cursor: 'pointer' }}>Xem tất cả →</span>
                        </div>

                        {products.slice(0, 3).map((product) => (
                            <div key={product.productID} className={styles.listItem}>
                                <div className={styles.itemImg}>
                                    {product.images?.[0] && (
                                        <img
                                            src={product.images[0]}
                                            alt={product.title}
                                            loading="lazy"
                                            style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 8 }}
                                        />
                                    )}
                                </div>
                                <div className={styles.itemInfo}>
                                    <div style={{ fontSize: 10, color: '#3b82f6', fontWeight: 'bold', marginBottom: 4 }}>{product.productTypeName}</div>
                                    <div className={styles.itemTitle}>{product.title}</div>
                                    <div className={styles.itemPrice}>
                                        {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(product.price)}
                                    </div>
                                </div>
                                <button className={styles.cartBtnSmall}><ShoppingCart size={16} /></button>
                            </div>
                        ))}
                    </div>

                    <div className={styles.listCard}>
                        <Recommendations />
                    </div>
                </section>

                {/* Features Bottom Bar */}
                <section className={styles.featuresGrid}>
                    <div className={styles.featureItem}>
                        <Truck size={32} className={styles.featureIcon} />
                        <div className={styles.featureText}>
                            <h4>Giao Hàng Nhanh 24h</h4>
                            <p>Miễn phí cho đơn từ 200.000đ. Nhận ngay 2h tại TP.HCM & HN.</p>
                        </div>
                    </div>
                    <div className={styles.featureItem}>
                        <Clock size={32} className={styles.featureIcon} />
                        <div className={styles.featureText}>
                            <h4>Đổi Trả 7 Ngày Dễ Dàng</h4>
                            <p>Miễn phí đổi hàng tận nơi nếu rách, lem mực hoặc sai quy cách.</p>
                        </div>
                    </div>
                    <div className={styles.featureItem}>
                        <ShieldCheck size={32} className={styles.featureIcon} />
                        <div className={styles.featureText}>
                            <h4>100% Phân Phối Chính Hãng</h4>
                            <p>Đền bù 200% giá trị đơn hàng nếu phát hiện sản phẩm giả.</p>
                        </div>
                    </div>
                    <div className={styles.featureItem}>
                        <HeadphonesIcon size={32} className={styles.featureIcon} />
                        <div className={styles.featureText}>
                            <h4>Tư Vấn Tận Tình 24/7</h4>
                            <p>Hỗ trợ chọn loại giấy vẽ, ngòi bút và báo giá chiết khấu doanh nghiệp.</p>
                        </div>
                    </div>
                </section>

            </div>
        </div>
    );
}
