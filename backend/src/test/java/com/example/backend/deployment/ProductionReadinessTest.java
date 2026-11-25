package com.example.backend.deployment;

import com.example.backend.model.*;
import com.example.backend.repositories.*;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Runs the real Flyway DDL and Hibernate validate; H2 does not replace a live PostgreSQL test. */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:production-schema;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
        "spring.jpa.hibernate.ddl-auto=validate",
        "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.mail.username=test@example.test", "spring.mail.password=", "app.mail.from=test@example.test",
        "app.ai.enabled=false", "app.ai.vector-url=", "logging.level.root=WARN"
})
@AutoConfigureMockMvc
class ProductionReadinessTest {
    @Autowired MockMvc mvc;
    @Autowired Flyway flyway;
    @Autowired ProductRepository products;
    @Autowired TagRepository tags;
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManager em;
    @Autowired StatisticsRepository statistics;
    @Autowired UserTrackingEventRepository tracking;
    @Autowired com.example.backend.services.ProductService productService;

    @Test
    void flywayInitializesSchemaBeforeHibernateValidationAndDoesNotRepeatMigrations() {
        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("3");
        assertThat(flyway.migrate().migrationsExecuted).isZero();
    }

    @Test
    void healthIsPublicAndContainsNoDatabaseOrMailDetails() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk())
                .andExpect(content().json("{\"status\":\"UP\"}"))
                .andExpect(jsonPath("$.components").doesNotExist())
                .andExpect(jsonPath("$.details").doesNotExist());
        mvc.perform(get("/actuator/env")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/admin/ai/index")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/users/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void productionCorsAllowsBearerPreflightAndRejectsUntrustedOrigins() throws Exception {
        mvc.perform(options("/api/cart/items").header("Origin", "https://stationery-store-nu.vercel.app")
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "authorization,content-type"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://stationery-store-nu.vercel.app"))
                .andExpect(header().doesNotExist("Access-Control-Allow-Credentials"));
        mvc.perform(options("/api/cart/items").header("Origin", "https://untrusted.example")
                .header("Access-Control-Request-Method", "POST"))
                .andExpect(status().isForbidden()).andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test @Transactional
    void expandedCatalogStringsRoundTripThroughJpaWithoutTruncation() {
        var handle = "h".repeat(148);
        var url = "https://example.test/" + "u".repeat(2000);
        var product = products.saveAndFlush(Product.builder().title("Catalog length regression")
                .handle(handle).url(url).build());
        em.clear();
        var reloaded = products.findById(product.getProductID()).orElseThrow();
        assertThat(reloaded.getHandle()).isEqualTo(handle);
        assertThat(reloaded.getUrl()).isEqualTo(url);
        productService.updateProduct(product.getProductID(), new com.example.backend.dto.product.ProductRequest(
                "Updated long catalog", handle, null, BigDecimal.TEN, null, null, null,
                null, null, null, null, true));
        em.flush();
        em.clear();
        assertThat(products.findById(product.getProductID()).orElseThrow().getHandle()).isEqualTo(handle);
        assertThatThrownBy(() -> productService.createProduct(new com.example.backend.dto.product.ProductRequest(
                "Oversized handle", "h".repeat(256), null, BigDecimal.TEN, null, null, null,
                null, null, null, null, true))).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("Handle");
    }

    @Test @Transactional
    void migratedTextIdentityRelationshipsAndNativeJoinDeletionWork() {
        var product = products.saveAndFlush(Product.builder().title("Bút tiếng Việt 🖊")
                .description("Nội dung dài ".repeat(1000)).build());
        var tag = tags.saveAndFlush(Tag.builder().name("Học tập").build());
        jdbc.update("insert into store.product_tags(product_id, tag_id) values (?, ?)", product.getProductID(), tag.getTagID());
        assertThat(product.getProductID()).isPositive();
        assertThat(products.findById(product.getProductID()).orElseThrow().getDescription()).hasSizeGreaterThan(8000);
        assertThat(tags.deleteProductTagLinksByTagID(tag.getTagID())).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from store.product_tags where product_id=?", Long.class, product.getProductID())).isZero();
    }

    @Test @Transactional
    void dateAggregationsPaginationAndTrackingQueriesRunOnTheMigratedSchema() {
        var user = User.builder().username("stats-customer").email("stats@example.test").passwordHash("test").build();
        em.persist(user);
        var product = Product.builder().title("Bút thống kê").price(BigDecimal.TEN).build();
        em.persist(product);
        var variant = ProductVariant.builder().title("Xanh").product(product).price(BigDecimal.TEN).stockQuantity(10).build();
        em.persist(variant);
        var date = LocalDateTime.of(2026, 11, 18, 10, 0);
        var order = Order.builder().user(user).orderDate(date).deliveredAt(date).status(OrderStatus.DELIVERED)
                .totalAmount(BigDecimal.TEN).discountAmount(BigDecimal.ZERO).isPaid(true).build();
        em.persist(order);
        em.persist(OrderDetail.builder().order(order).variant(variant).quantity(1).unitPrice(BigDecimal.TEN).subTotal(BigDecimal.TEN).build());
        em.persist(UserTrackingEvent.builder().user(user).product(product).eventType(TrackingEventType.VIEW_PRODUCT).createdAt(date).build());
        em.flush();
        var start = date.minusDays(1);
        var end = date.plusDays(1);
        assertThat(statistics.findSalesTotals(start, end).getRevenue()).isEqualByComparingTo(BigDecimal.TEN);
        assertThat(statistics.findDailyRevenue(start, end).getFirst().getYear()).isEqualTo(2026);
        assertThat(statistics.findMonthlyRevenue(start, end).getFirst().getMonth()).isEqualTo(11);
        assertThat(statistics.findYearlyRevenue(start, end).getFirst().getOrderCount()).isEqualTo(1);
        assertThat(statistics.findTopProducts(start, end, null, org.springframework.data.domain.PageRequest.of(0, 3))).hasSize(1);
        assertThat(statistics.findTopCustomers(start, end, org.springframework.data.domain.PageRequest.of(0, 3))).hasSize(1);
        assertThat(tracking.findRecentProductIds(user.getUserID())).containsExactly(product.getProductID());
        assertThat(tracking.findTop300ByUser_UserIDAndCreatedAtAfterOrderByCreatedAtDesc(user.getUserID(), start)).hasSize(1);
    }

    @Test @Transactional
    void loginProductsCartCheckoutAndDisabledAiKeepTheirHttpContracts() throws Exception {
        var product = Product.builder().title("Bút bi production test").handle("production-test-pen").price(BigDecimal.TEN).build();
        em.persist(product);
        var variant = ProductVariant.builder().title("Xanh").product(product).price(BigDecimal.TEN).stockQuantity(5).build();
        product.getVariants().add(variant);
        em.persist(variant);
        em.flush();
        mvc.perform(post("/api/auth/register").contentType("application/json")
                .content("{\"username\":\"http-customer\",\"email\":\"http@example.test\",\"password\":\"test-password-123\"}"))
                .andExpect(status().isCreated());
        var login = mvc.perform(post("/api/auth/login").contentType("application/json")
                .content("{\"username\":\"http-customer\",\"password\":\"test-password-123\"}"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String bearer = "Bearer " + tools.jackson.databind.json.JsonMapper.builder().build().readTree(login).path("accessToken").asText();
        mvc.perform(get("/api/auth/me").header("Authorization", bearer)).andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("http-customer"));
        mvc.perform(get("/api/products/handle/production-test-pen")).andExpect(status().isOk());
        mvc.perform(post("/api/cart/items").header("Authorization", bearer).contentType("application/json")
                .content("{\"variantID\":" + variant.getVariantID() + ",\"quantity\":2}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/orders").header("Authorization", bearer).contentType("application/json")
                .content("{\"shippingAddress\":\"Test address\",\"contactPhone\":\"0900000000\",\"paymentMethod\":\"COD\"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.totalAmount").value(20));
        mvc.perform(post("/api/ai/chat").contentType("application/json").content("{\"message\":\"bút bi\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.source").value("CATALOG_FALLBACK"));
    }
}
