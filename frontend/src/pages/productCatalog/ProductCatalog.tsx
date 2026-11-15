import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Heart,
  LayoutGrid,
  Lightbulb,
  PackageCheck,
  PenTool,
  RotateCcw,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Star,
  Truck,
  X,
  Zap,
} from "lucide-react";
import {
  catalogProducts,
  categories,
  money,
  normalize,
  type CatalogProduct,
} from "./catalogData";
import styles from "./ProductCatalog.module.css";

const priceRanges = [
  { label: "< 50.000đ", min: "0", max: "50000" },
  { label: "50k - 150k", min: "50000", max: "150000" },
  { label: "150k - 300k", min: "150000", max: "300000" },
  { label: "> 300.000đ", min: "300000", max: "" },
];

export default function ProductCatalog() {
  const query =
    new URLSearchParams(window.location.search).get("search")?.trim() ?? "";
  const [category, setCategory] = useState("all");
  const [brands, setBrands] = useState<string[]>([]);
  const [brandSearch, setBrandSearch] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [price, setPrice] = useState({ min: "", max: "" });
  const [priceError, setPriceError] = useState("");
  const [rating, setRating] = useState(0);
  const [inStock, setInStock] = useState(false);
  const [onSale, setOnSale] = useState(false);
  const [express, setExpress] = useState(false);
  const [sort, setSort] = useState("popular");
  const [view, setView] = useState("grid");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(
    null,
  );
  const [notice, setNotice] = useState("");

  useEffect(() => {
    document.title = query
      ? `Tìm kiếm “${query}” | StationeryStore`
      : "Bút & Mực viết chính hãng | StationeryStore";
  }, [query]);

  useEffect(() => {
    if (!selectedProduct) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLDialogElement>(
      "#catalog-product-dialog",
    );
    dialog?.showModal();
    return () => {
      dialog?.close();
      previousFocus?.focus();
    };
  }, [selectedProduct]);

  const brandOptions = [
    ...new Set(catalogProducts.map((product) => product.brand)),
  ];
  const filtered = useMemo(() => {
    const products = catalogProducts.filter(
      (product) =>
        (!query ||
          normalize(query)
            .split(/\s+/)
            .every((word) =>
              normalize(
                `Bút Mực ${product.title} ${product.brand} ${categories.find((item) => item.id === product.category)?.label}`,
              ).includes(word),
            )) &&
        (category === "all" || product.category === category) &&
        (!brands.length || brands.includes(product.brand)) &&
        (!price.min || product.price >= Number(price.min)) &&
        (!price.max || product.price <= Number(price.max)) &&
        product.rating >= rating &&
        (!inStock || product.inStock) &&
        (!onSale || product.oldPrice > product.price) &&
        (!express || product.express),
    );
    return products.sort((a, b) =>
      sort === "price-asc"
        ? a.price - b.price
        : sort === "price-desc"
          ? b.price - a.price
          : sort === "rating"
            ? b.rating - a.rating
            : sort === "bestseller"
              ? b.sold - a.sold
              : 0,
    );
  }, [query, category, brands, price, rating, inStock, onSale, express, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const activeCount =
    brands.length +
    Number(category !== "all") +
    Number(Boolean(price.min || price.max)) +
    Number(rating > 0) +
    Number(inStock) +
    Number(onSale) +
    Number(express);

  function reset() {
    setBrands([]);
    setCategory("all");
    setPrice({ min: "", max: "" });
    setMinPrice("");
    setMaxPrice("");
    setRating(0);
    setInStock(false);
    setOnSale(false);
    setExpress(false);
    setPage(1);
    setPriceError("");
  }

  function toggleBrand(brand: string) {
    setBrands((current) =>
      current.includes(brand)
        ? current.filter((item) => item !== brand)
        : [...current, brand],
    );
    setPage(1);
  }

  function applyPrice(min = minPrice, max = maxPrice) {
    if (
      (min && (!Number.isFinite(Number(min)) || Number(min) < 0)) ||
      (max && (!Number.isFinite(Number(max)) || Number(max) < 0)) ||
      (min && max && Number(min) > Number(max))
    ) {
      setPriceError("Vui lòng nhập khoảng giá hợp lệ.");
      return;
    }
    setPriceError("");
    setMinPrice(min);
    setMaxPrice(max);
    setPrice({ min, max });
    setPage(1);
  }

  async function copyPromoCode() {
    try {
      await navigator.clipboard.writeText("PENLUXE10");
      setNotice("Đã sao chép mã PENLUXE10.");
    } catch {
      setNotice("Mã ưu đãi: PENLUXE10");
    }
  }

  const chip = (label: string, remove: () => void) => (
    <button
      className={styles.chip}
      key={label}
      onClick={remove}
      aria-label={`Bỏ lọc ${label}`}
    >
      {label}
      <X size={12} />
    </button>
  );

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.srOnly}>Bút & Mực viết chính hãng</h1>
        <div className={styles.summary}>
          <p>
            Tìm thấy <strong>{filtered.length}</strong> sản phẩm phù hợp{" "}
            {query && <>cho “{query}”</>}{" "}
            <span className={styles.separator}>•</span>{" "}
            <b>100% nhập khẩu chính hãng</b>
          </p>
          <div className={styles.promises}>
            <span>
              <BadgeCheck size={15} />
              Đổi trả trong 7 ngày
            </span>
            <span>
              <Truck size={16} />
              Hoả tốc 2H nội thành
            </span>
          </div>
        </div>

        <section className={styles.hero} aria-labelledby="collection-title">
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>
              <Sparkles size={14} /> ƯU ĐÃI ĐỘC QUYỀN THÁNG NÀY
            </span>
            <h2 id="collection-title">
              Bộ Sưu Tập Ngòi Bút Tinh Hoa & Mực Pigment Cao Cấp
            </h2>
            <p>
              Trải nghiệm cảm giác êm mượt cùng các dòng bút bi gel xoá được,
              bút máy ngòi thép Đức và mực kháng nước bền vững. Giảm đến 30% khi
              mua kèm phụ kiện thay thế.
            </p>
            <div className={styles.heroActions}>
              <a href="#catalog-results">
                Khám phá bộ sưu tập <ArrowRight size={16} />
              </a>
              <button onClick={() => void copyPromoCode()}>
                Mã: PENLUXE10 (-10%)
              </button>
            </div>
          </div>
          <PenTool
            className={styles.heroPen}
            size={190}
            strokeWidth={1}
            aria-hidden="true"
          />
        </section>

        <div className={styles.demoNote}>
          Dữ liệu sản phẩm minh hoạ theo thiết kế.
        </div>
        <button
          className={styles.mobileFilterButton}
          onClick={() => setMobileFilters(!mobileFilters)}
          aria-expanded={mobileFilters}
          aria-controls="catalog-filters"
        >
          <SlidersHorizontal size={17} /> Bộ lọc sản phẩm{" "}
          {activeCount > 0 && `(${activeCount})`}
          <ChevronDown size={16} />
        </button>

        <div className={styles.layout}>
          <aside
            id="catalog-filters"
            className={`${styles.sidebar} ${mobileFilters ? styles.sidebarOpen : ""}`}
            aria-label="Bộ lọc sản phẩm"
          >
            <div className={styles.filterHeading}>
              <h2>
                <SlidersHorizontal size={17} />
                Bộ lọc sản phẩm
              </h2>
              <button onClick={reset}>
                <RotateCcw size={12} />
                Xoá tất cả
              </button>
            </div>
            <details className={styles.filterSection} open>
              <summary>
                Danh mục con <ChevronDown size={15} />
              </summary>
              <div className={styles.categoryList}>
                {categories.map((item) => (
                  <button
                    key={item.id}
                    className={
                      category === item.id ? styles.categoryActive : ""
                    }
                    onClick={() => {
                      setCategory(item.id);
                      setPage(1);
                    }}
                    aria-pressed={category === item.id}
                  >
                    <span>
                      {category === item.id && <i />}
                      {item.label}
                    </span>
                    <small>
                      {item.id === "all"
                        ? catalogProducts.length
                        : catalogProducts.filter(
                            (product) => product.category === item.id,
                          ).length}
                    </small>
                  </button>
                ))}
              </div>
            </details>

            <section
              className={`${styles.filterSection} ${styles.priceSection}`}
              aria-labelledby="price-title"
            >
              <div className={styles.sectionHeading}>
                <h3 id="price-title">Khoảng giá (VNĐ)</h3>
                <span>Tuỳ chọn</span>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  applyPrice();
                }}
              >
                <div className={styles.priceInputs}>
                  <label>
                    TỪ
                    <input
                      aria-label="Giá từ"
                      type="number"
                      min="0"
                      step="1000"
                      placeholder="0"
                      value={minPrice}
                      onChange={(event) => setMinPrice(event.target.value)}
                    />
                  </label>
                  <span>-</span>
                  <label>
                    ĐẾN
                    <input
                      aria-label="Giá đến"
                      type="number"
                      min="0"
                      step="1000"
                      placeholder="Không giới hạn"
                      value={maxPrice}
                      onChange={(event) => setMaxPrice(event.target.value)}
                    />
                  </label>
                </div>
                <label className={styles.rangeLabel}>
                  Giá tối đa: {money(Number(maxPrice) || 500000)}
                  <input
                    type="range"
                    min="0"
                    max="500000"
                    step="10000"
                    value={maxPrice || 500000}
                    onChange={(event) => setMaxPrice(event.target.value)}
                    aria-label="Chọn giá tối đa"
                  />
                </label>
                <div className={styles.pricePresets}>
                  {priceRanges.map((range) => (
                    <button
                      key={range.label}
                      type="button"
                      aria-pressed={
                        price.min === range.min && price.max === range.max
                      }
                      onClick={() => applyPrice(range.min, range.max)}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>
                {priceError && (
                  <p className={styles.error} role="alert">
                    {priceError}
                  </p>
                )}
                <button className={styles.applyPrice} type="submit">
                  Áp dụng giá
                </button>
              </form>
            </section>

            <section
              className={styles.filterSection}
              aria-labelledby="brand-title"
            >
              <div className={styles.sectionHeading}>
                <h3 id="brand-title">Thương hiệu</h3>
                <small>Đã chọn {brands.length}</small>
              </div>
              <label className={styles.brandSearch}>
                <Search size={14} />
                <input
                  aria-label="Tìm thương hiệu"
                  placeholder="Tìm thương hiệu..."
                  value={brandSearch}
                  onChange={(event) => setBrandSearch(event.target.value)}
                />
              </label>
              <div className={styles.brandList}>
                {brandOptions
                  .filter((brand) =>
                    normalize(brand).includes(normalize(brandSearch)),
                  )
                  .map((brand) => (
                    <label className={styles.checkbox} key={brand}>
                      <input
                        type="checkbox"
                        checked={brands.includes(brand)}
                        onChange={() => toggleBrand(brand)}
                      />
                      <span>{brand}</span>
                      <small>
                        {
                          catalogProducts.filter(
                            (product) => product.brand === brand,
                          ).length
                        }
                      </small>
                    </label>
                  ))}
                {!brandOptions.some((brand) =>
                  normalize(brand).includes(normalize(brandSearch)),
                ) && (
                  <p className={styles.muted}>Không tìm thấy thương hiệu.</p>
                )}
              </div>
            </section>

            <fieldset className={styles.filterSection}>
              <legend>Đánh giá sao</legend>
              {[5, 4, 3].map((value) => (
                <label
                  key={value}
                  className={`${styles.ratingOption} ${rating === value ? styles.ratingActive : ""}`}
                >
                  <input
                    type="radio"
                    name="rating"
                    checked={rating === value}
                    onChange={() => {
                      setRating(value);
                      setPage(1);
                    }}
                  />
                  <span className={styles.stars} aria-label={`${value} sao`}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        size={14}
                        fill={star <= value ? "currentColor" : "none"}
                        className={star > value ? styles.emptyStar : ""}
                      />
                    ))}
                  </span>
                  <span>
                    {value === 5
                      ? "5 sao tuyệt đối"
                      : `Từ ${value} sao trở lên`}
                  </span>
                </label>
              ))}
            </fieldset>

            <fieldset className={styles.filterSection}>
              <legend>Dịch vụ & Tồn kho</legend>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={inStock}
                  onChange={(event) => {
                    setInStock(event.target.checked);
                    setPage(1);
                  }}
                />
                <span>Còn hàng sẵn (In stock)</span>
                <i className={styles.stockDot} />
              </label>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={onSale}
                  onChange={(event) => {
                    setOnSale(event.target.checked);
                    setPage(1);
                  }}
                />
                <span>Đang giảm giá (On sale)</span>
                <b className={styles.saleIcon}>%</b>
              </label>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={express}
                  onChange={(event) => {
                    setExpress(event.target.checked);
                    setPage(1);
                  }}
                />
                <span>Giao hoả tốc 2H</span>
                <Zap size={14} color="#ff7417" />
              </label>
            </fieldset>
          </aside>

          <div className={styles.results} id="catalog-results">
            <div className={styles.toolbar}>
              <div className={styles.chips}>
                <span>Bộ lọc:</span>
                {category !== "all" &&
                  chip(
                    categories.find((item) => item.id === category)!.label,
                    () => setCategory("all"),
                  )}
                {brands.map((brand) => chip(brand, () => toggleBrand(brand)))}
                {(price.min || price.max) &&
                  chip(
                    `${money(Number(price.min) || 0)} - ${price.max ? money(Number(price.max)) : "trở lên"}`,
                    () => {
                      setPrice({ min: "", max: "" });
                      setMinPrice("");
                      setMaxPrice("");
                    },
                  )}
                {rating > 0 &&
                  chip(`${rating} sao trở lên`, () => setRating(0))}
                {inStock && chip("Còn hàng", () => setInStock(false))}
                {onSale && chip("Giảm giá", () => setOnSale(false))}
                {express && chip("Hoả tốc 2H", () => setExpress(false))}
                {activeCount > 0 ? (
                  <button className={styles.clearFilters} onClick={reset}>
                    Xoá tất cả
                  </button>
                ) : (
                  <span className={styles.muted}>Tất cả sản phẩm</span>
                )}
              </div>
              <div className={styles.sortControls}>
                <label htmlFor="catalog-sort">Ưu tiên sắp xếp:</label>
                <select
                  id="catalog-sort"
                  value={sort}
                  onChange={(event) => {
                    setSort(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="popular">Phổ biến nhất</option>
                  <option value="bestseller">Bán chạy nhất</option>
                  <option value="price-asc">Giá tăng dần</option>
                  <option value="price-desc">Giá giảm dần</option>
                  <option value="rating">Đánh giá cao nhất</option>
                </select>
                <div className={styles.viewControls}>
                  <button
                    aria-label="Hiển thị lưới"
                    aria-pressed={view === "grid"}
                    onClick={() => setView("grid")}
                  >
                    <LayoutGrid size={16} />
                  </button>
                  <button
                    aria-label="Hiển thị danh sách"
                    aria-pressed={view === "list"}
                    onClick={() => setView("list")}
                  >
                    <Columns3 size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.srOnly} role="status" aria-live="polite">
              Tìm thấy {filtered.length} sản phẩm. Trang {currentPage} trên{" "}
              {totalPages}.
            </div>
            {visible.length ? (
              <div
                className={`${styles.productGrid} ${view === "list" ? styles.productList : ""}`}
              >
                {visible.map((product) => (
                  <article key={product.id} className={styles.card}>
                    <div className={styles.imageWrapper}>
                      <button
                        className={styles.imageButton}
                        onClick={() => setSelectedProduct(product)}
                        aria-label={`Xem ${product.title}`}
                      >
                        <img
                          src={product.image}
                          alt={product.title}
                          loading="lazy"
                          width="192"
                          height="192"
                        />
                      </button>
                      <div className={styles.badges}>
                        <span>
                          -
                          {Math.round(
                            (1 - product.price / product.oldPrice) * 100,
                          )}
                          %
                        </span>
                        {product.badge && (
                          <b
                            className={
                              ["Top Trend", "Tiết kiệm"].includes(product.badge)
                                ? styles.greenBadge
                                : ""
                            }
                          >
                            {product.badge}
                          </b>
                        )}
                      </div>
                      <button
                        className={styles.favorite}
                        aria-label={`${favorites.includes(product.id) ? "Bỏ" : "Thêm"} yêu thích ${product.title}`}
                        aria-pressed={favorites.includes(product.id)}
                        onClick={() =>
                          setFavorites((current) =>
                            current.includes(product.id)
                              ? current.filter((id) => id !== product.id)
                              : [...current, product.id],
                          )
                        }
                      >
                        <Heart
                          size={18}
                          fill={
                            favorites.includes(product.id)
                              ? "currentColor"
                              : "none"
                          }
                        />
                      </button>
                    </div>
                    <div className={styles.cardContent}>
                      <p className={styles.vendor}>
                        {product.brand}
                        {product.origin && ` (${product.origin})`}
                      </p>
                      <button
                        className={styles.productTitle}
                        onClick={() => setSelectedProduct(product)}
                      >
                        {product.title}
                      </button>
                      <p className={styles.productRating}>
                        <Star size={14} fill="currentColor" />
                        <strong>{product.rating.toFixed(1)}</strong>
                        <span>
                          (Đã bán{" "}
                          {product.sold >= 1000
                            ? `${(product.sold / 1000).toFixed(1)}k`
                            : product.sold}
                          )
                        </span>
                      </p>
                      <div className={styles.priceRow}>
                        <div>
                          <strong>{money(product.price)}</strong>
                          <del>{money(product.oldPrice)}</del>
                        </div>
                        <button
                          className={styles.cartButton}
                          aria-label={`Xem lựa chọn mua ${product.title}`}
                          onClick={() => setSelectedProduct(product)}
                        >
                          <ShoppingCart size={18} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>
                <PackageCheck size={44} />
                <h2>Chưa tìm thấy sản phẩm phù hợp</h2>
                <p>
                  Thử thay đổi từ khoá hoặc bỏ bớt bộ lọc để xem thêm sản phẩm.
                </p>
                <button onClick={reset}>Xoá bộ lọc</button>
                {query && (
                  <a href="/products?category=but-muc">Xem tất cả Bút & Mực</a>
                )}
              </div>
            )}

            <div className={styles.pagination}>
              <p>
                Hiển thị <strong>{visible.length}</strong> trên{" "}
                <strong>{filtered.length}</strong> sản phẩm
              </p>
              <div>
                <label className={styles.pageSize}>
                  Mỗi trang
                  <select
                    aria-label="Số sản phẩm mỗi trang"
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setPage(1);
                    }}
                  >
                    <option value={12}>12</option>
                    <option value={8}>8</option>
                    <option value={4}>4</option>
                  </select>
                </label>
                <nav aria-label="Phân trang sản phẩm">
                  <button
                    aria-label="Trang trước"
                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  {Array.from({ length: totalPages }, (_, index) => (
                    <button
                      key={index}
                      aria-label={`Trang ${index + 1}`}
                      aria-current={
                        currentPage === index + 1 ? "page" : undefined
                      }
                      onClick={() => setPage(index + 1)}
                    >
                      {index + 1}
                    </button>
                  ))}
                  <button
                    aria-label="Trang sau"
                    disabled={currentPage === totalPages}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    <ChevronRight size={17} />
                  </button>
                </nav>
              </div>
            </div>

            <section className={styles.tips}>
              <h2>
                <Lightbulb size={23} />
                Mẹo chọn ngòi bút phù hợp nhu cầu
              </h2>
              <div className={styles.tipGrid}>
                <article>
                  <div>
                    <h3>0.38mm – 0.5mm</h3>
                    <span>Nét thanh mảnh</span>
                  </div>
                  <p>
                    Lý tưởng để ghi chú sổ tay, viết nhật ký bullet journal trên
                    giấy mỏng, đi nét vẽ kỹ thuật hoặc người có chữ viết nhỏ
                    nhắn, chi tiết.
                  </p>
                </article>
                <article>
                  <div>
                    <h3>0.7mm</h3>
                    <span className={styles.popularTip}>Đa dụng nhất</span>
                  </div>
                  <p>
                    Độ dày tiêu chuẩn cho tốc độ viết mượt, đậm tay, mực ra đều
                    đặn. Thích hợp soạn thảo văn bản học tập, làm việc văn phòng
                    hằng ngày.
                  </p>
                </article>
                <article>
                  <div>
                    <h3>1.0mm</h3>
                    <span className={styles.darkTip}>Ký tên & Hợp đồng</span>
                  </div>
                  <p>
                    Nét đậm, sắc sảo và rõ ràng. Phù hợp cho giám đốc ký tá hồ
                    sơ quan trọng, viết tiêu đề hoặc người thích cảm giác lướt
                    bút êm ái tối đa.
                  </p>
                </article>
              </div>
            </section>
          </div>
        </div>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={notice ? styles.notice : styles.srOnly}
      >
        {notice}
        {notice && (
          <button aria-label="Đóng thông báo" onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        )}
      </p>
      {selectedProduct && (
        <dialog
          id="catalog-product-dialog"
          className={styles.dialog}
          onCancel={() => setSelectedProduct(null)}
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedProduct(null);
          }}
          aria-labelledby="product-preview-title"
        >
          <button
            className={styles.closeDialog}
            aria-label="Đóng chi tiết sản phẩm"
            onClick={() => setSelectedProduct(null)}
            autoFocus
          >
            <X size={22} />
          </button>
          <img src={selectedProduct.image} alt={selectedProduct.title} />
          <p className={styles.vendor}>{selectedProduct.brand}</p>
          <h2 id="product-preview-title">{selectedProduct.title}</h2>
          <strong className={styles.previewPrice}>
            {money(selectedProduct.price)}
          </strong>
          <p>
            {selectedProduct.inStock ? "Còn hàng" : "Tạm hết hàng"} · Đánh giá{" "}
            {selectedProduct.rating.toFixed(1)}/5
          </p>
          <p className={styles.muted}>
            Sản phẩm minh hoạ theo thiết kế. Chức năng đặt hàng sẽ được kết nối
            với cửa hàng sau.
          </p>
        </dialog>
      )}
    </main>
  );
}
