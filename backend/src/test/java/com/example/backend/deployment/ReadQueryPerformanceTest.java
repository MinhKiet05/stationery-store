package com.example.backend.deployment;

import com.example.backend.ai.ProductCatalog;
import com.example.backend.dto.product.ProductResponse;
import com.example.backend.model.*;
import com.example.backend.repositories.ProductRepository;
import com.example.backend.services.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.test.context.support.WithMockUser;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Synthetic data only. Counts prepared SQL, not network latency or JDBC protocol messages. */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:read-performance;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
        "spring.jpa.hibernate.ddl-auto=validate", "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.mail.username=test@example.test", "spring.mail.password=", "app.mail.from=test@example.test",
        "app.ai.enabled=false", "app.ai.vector-url=", "logging.level.root=WARN",
        "logging.level.org.hibernate.SQL=OFF", "logging.level.org.hibernate.orm.jdbc.bind=OFF",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "spring.jpa.properties.hibernate.query.fail_on_pagination_over_collection_fetch=true",
        "spring.jpa.properties.hibernate.session_factory.statement_inspector=com.example.backend.deployment.ReadQueryPerformanceTest$SqlCapture"
})
@AutoConfigureMockMvc
@Transactional
class ReadQueryPerformanceTest {
    public static class SqlCapture implements StatementInspector {
        static final ThreadLocal<List<String>> SQL = ThreadLocal.withInitial(ArrayList::new);
        @Override public String inspect(String sql) { SQL.get().add(sql); return sql; }
    }

    @Autowired EntityManager em;
    @Autowired EntityManagerFactory emf;
    @Autowired ProductService products;
    @Autowired ProductRepository productRepository;
    @Autowired ProductCatalog catalog;
    @Autowired ProductVariantService variants;
    @Autowired CartService carts;
    @Autowired ReviewService reviews;
    @Autowired OrderService orders;
    @Autowired ReturnRequestService returns;
    @Autowired UserService users;
    @Autowired MockMvc mvc;
    private final List<Long> ids = new ArrayList<>();
    private Long vendorId, typeId;

    @BeforeEach
    void seed() {
        var customer = User.builder().username("read-perf").email("read-perf@example.test").passwordHash("fixture").build();
        em.persist(customer);
        var cart = Cart.builder().user(customer).build();
        em.persist(cart);
        for (int i = 0; i < 45; i++) {
            var vendor = Vendor.builder().name("Vendor " + i).build();
            var type = ProductType.builder().name("Type " + i).isActive(true).build();
            var tag = Tag.builder().name("Tag " + i).build();
            em.persist(vendor); em.persist(type); em.persist(tag);
            var product = Product.builder().title(String.format("Perf %02d", i)).handle("perf-" + i)
                    .description("Full description " + i).price(BigDecimal.valueOf(i))
                    .vendor(i == 44 ? null : vendor).productType(i == 44 ? null : type).build();
            product.getImages().addAll(List.of("https://example.test/" + i + "/b", "https://example.test/" + i + "/a"));
            product.getTags().add(tag);
            em.persist(product);
            ids.add(product.getProductID());
            if (i == 10) { vendorId = vendor.getVendorID(); typeId = type.getProductTypeID(); }
            var variant = ProductVariant.builder().product(product).title("Variant " + i)
                    .price(BigDecimal.TEN).stockQuantity(100).build();
            em.persist(variant);
            var reviewer = User.builder().username("reviewer-" + i).email("reviewer-" + i + "@example.test").passwordHash("fixture").build();
            em.persist(reviewer);
            em.persist(Review.builder().user(reviewer).product(em.getReference(Product.class, ids.getFirst()))
                    .rating(5).comment("Review " + i).build());
            em.persist(CartItem.builder().cart(cart).variant(variant).quantity(1).build());
            var coupon = Coupon.builder().code("PERF" + i).discountType(DiscountType.FIXED_AMOUNT).discountValue(BigDecimal.ONE).build();
            em.persist(coupon);
            var order = Order.builder().user(customer).coupon(coupon).status(OrderStatus.DELIVERED)
                    .orderDate(LocalDateTime.of(2026, 1, 1, 0, 0).plusDays(i)).totalAmount(BigDecimal.TEN).build();
            var detail = OrderDetail.builder().order(order).variant(variant).quantity(1).unitPrice(BigDecimal.TEN).subTotal(BigDecimal.TEN).build();
            order.getOrderDetails().add(detail);
            em.persist(order);
            var request = ReturnRequest.builder().order(order).user(customer).reason("Fixture").build();
            request.getItems().add(ReturnRequestItem.builder().returnRequest(request).orderDetail(detail).quantity(1).build());
            em.persist(request);
        }
        em.persist(Product.builder().title("Inactive").isActive(false).build());
        em.flush(); em.clear();
    }

    private <T> T measure(String label, Supplier<T> operation) {
        em.clear();
        var stats = emf.unwrap(SessionFactory.class).getStatistics();
        stats.clear(); SqlCapture.SQL.get().clear();
        T result = operation.get();
        System.out.println("READ_SQL " + label + "=" + stats.getPrepareStatementCount());
        int budget = switch (label) {
            case "products-size-1", "products-size-5", "products-size-20", "search-20" -> 3;
            case "products-size-40", "catalog-20", "cart-45" -> 4;
            case "products-last", "products-empty", "search-filtered", "reviews-45" -> 2;
            case "variants-45", "users-46" -> 1;
            case "orders-45" -> 15;
            case "returns-45" -> 7;
            default -> throw new AssertionError("Missing SQL budget: " + label);
        };
        assertThat(stats.getPrepareStatementCount()).as(label + " SQL budget").isLessThanOrEqualTo(budget);
        return result;
    }

    private PageRequest page(int number, int size) { return PageRequest.of(number, size, Sort.by("productID")); }

    @Test
    void productPagesKeepMetadataAndOrderedImages() {
        for (int size : List.of(1, 5, 20, 40)) {
            var result = measure("products-size-" + size, () -> products.getAllProducts(page(0, size)));
            assertThat(SqlCapture.SQL.get().getFirst().toLowerCase(Locale.ROOT)).contains("fetch first");
            assertThat(SqlCapture.SQL.get()).noneMatch(sql -> sql.contains("product_variants") || sql.contains("product_tags"));
            assertThat(SqlCapture.SQL.get().stream().filter(sql -> sql.toLowerCase(Locale.ROOT).contains("count(")))
                    .allSatisfy(sql -> assertThat(sql).doesNotContain(" join "));
            assertThat(result.getTotalElements()).isEqualTo(45);
            assertThat(result.getTotalPages()).isEqualTo((45 + size - 1) / size);
            assertThat(result.getContent()).extracting(ProductResponse::productID).containsExactlyElementsOf(ids.subList(0, size));
            assertThat(result.getContent().getFirst().images()).containsExactly("https://example.test/0/b", "https://example.test/0/a");
            assertThat(result.getContent().getFirst().description()).isEqualTo("Full description 0");
        }
        var last = measure("products-last", () -> products.getAllProducts(page(2, 20)));
        assertThat(last.getTotalElements()).isEqualTo(45);
        assertThat(last.getContent()).hasSize(5);
        assertThat(last.getContent().getLast().vendorName()).isNull();
        assertThat(last.getContent().getLast().productTypeName()).isNull();
        var empty = measure("products-empty", () -> products.getAllProducts(page(5, 20)));
        assertThat(empty.getContent()).isEmpty();
        assertThat(empty.getTotalElements()).isEqualTo(45);
    }

    @Test
    void publicProductPageJsonKeepsItsFieldsAndMetadata() throws Exception {
        em.clear();
        mvc.perform(get("/api/products").param("page", "0").param("size", "20"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content.length()").value(20))
                .andExpect(jsonPath("$.totalElements").value(45)).andExpect(jsonPath("$.totalPages").value(3))
                .andExpect(jsonPath("$.number").value(0)).andExpect(jsonPath("$.size").value(20))
                .andExpect(jsonPath("$.content[0].description").value("Full description 0"))
                .andExpect(jsonPath("$.content[0].images[0]").value("https://example.test/0/b"))
                .andExpect(jsonPath("$.content[0].vendorName").value("Vendor 0"))
                .andExpect(jsonPath("$.content[0].productTypeName").value("Type 0"));
    }

    @Test @WithMockUser(roles = "ADMIN")
    void adminUserProjectionDoesNotLoadPasswordHashesOrCart() {
        assertThat(measure("users-46", users::getUsers)).hasSize(46)
                .allSatisfy(user -> assertThat(user.email()).endsWith("@example.test"));
        assertThat(SqlCapture.SQL.get()).allSatisfy(sql -> assertThat(sql).doesNotContain("password_hash", "carts"));
    }

    @Test
    void searchFiltersSortAndCountRetainTheSameSemantics() {
        var result = measure("search-20", () -> products.searchProducts("Perf", null, null,
                BigDecimal.ZERO, BigDecimal.valueOf(44), page(1, 20)));
        assertThat(result.getTotalElements()).isEqualTo(45);
        assertThat(result.getNumber()).isEqualTo(1);
        assertThat(result.getContent()).extracting(ProductResponse::productID).containsExactlyElementsOf(ids.subList(20, 40));
        var filtered = measure("search-filtered", () -> products.searchProducts("Perf", typeId, vendorId,
                BigDecimal.TEN, BigDecimal.TEN, page(0, 20)));
        assertThat(filtered.getTotalElements()).isEqualTo(1);
        assertThat(filtered.getContent().getFirst().productID()).isEqualTo(ids.get(10));
        var reverse = products.searchProducts("Perf", null, null, null, null,
                PageRequest.of(0, 5, Sort.by(Sort.Direction.DESC, "price")));
        assertThat(reverse.getContent().getFirst().productID()).isEqualTo(ids.getLast());
    }

    @Test
    void catalogVariantCartReviewOrderAndReturnReadsKeepTheirContent() {
        assertThat(measure("catalog-20", () -> catalog.byIds(ids.subList(0, 20)))).hasSize(20)
                .allSatisfy(p -> { assertThat(p.sellable()).isTrue(); assertThat(p.product().images()).hasSize(2); });
        assertThat(measure("variants-45", variants::getAllVariants)).hasSize(45);
        assertThat(SqlCapture.SQL.get()).allSatisfy(sql -> assertThat(sql).doesNotContain("description"));
        assertThat(measure("cart-45", () -> carts.getCart("read-perf")).items()).hasSize(45);
        assertThat(measure("reviews-45", () -> reviews.getByProduct(ids.getFirst()))).hasSize(45)
                .allSatisfy(r -> assertThat(r.username()).startsWith("reviewer-"));
        assertThat(SqlCapture.SQL.get()).allSatisfy(sql -> assertThat(sql).doesNotContain("password_hash", "carts"));
        assertThat(measure("orders-45", () -> orders.myOrders("read-perf"))).hasSize(45)
                .allSatisfy(o -> { assertThat(o.items()).hasSize(1); assertThat(o.items().getFirst().productImage()).endsWith("/b"); });
        assertThat(measure("returns-45", () -> returns.myRequests("read-perf"))).hasSize(45)
                .allSatisfy(r -> assertThat(r.items()).hasSize(1));
    }
}
