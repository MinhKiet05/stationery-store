package com.example.backend.deployment;

import com.example.backend.config.CatalogCache;
import com.example.backend.model.*;
import com.example.backend.services.ReviewImageStorage;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/** Opt-in diagnostic only: synthetic H2 data, loopback Redis, never production credentials.
 * The disabled samples bypass CatalogCache in the same warmed application, excluding startup.
 * Output describes the supplied Redis implementation; a test double is NOT a Cloud benchmark.
 */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:redis-performance;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
        "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.properties.hibernate.generate_statistics=true",
        "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.mail.username=test@example.test", "spring.mail.password=", "app.mail.from=test@example.test",
        "app.ai.enabled=false", "app.ai.vector-url=", "logging.level.root=WARN",
        "logging.level.org.hibernate.SQL=OFF", "logging.level.org.hibernate.orm.jdbc.bind=OFF",
        "app.redis.enabled=true", "app.redis.host=127.0.0.1", "app.redis.port=${test.redis.port}",
        "app.redis.username=", "app.redis.password=", "app.redis.ssl-enabled=false",
        "app.cache.environment=performance-test",
        "app.password-reset.hmac-secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
})
@AutoConfigureMockMvc
@EnabledIfSystemProperty(named = "test.redis.benchmark", matches = "true")
@WithMockUser(username = "admin", roles = "ADMIN")
class RedisPerformanceVerificationTest {
    @Autowired EntityManager em;
    @Autowired EntityManagerFactory emf;
    @Autowired PlatformTransactionManager transactions;
    @Autowired CatalogCache cache;
    @Autowired MockMvc mvc;
    @MockitoBean ReviewImageStorage images;

    @Test void compareSameResponsesAndSqlForDisabledMissAndHit() throws Exception {
        Long id = new TransactionTemplate(transactions).execute(ignored -> {
            var type = ProductType.builder().name("Synthetic stationery").isActive(true).build(); em.persist(type);
            var vendor = Vendor.builder().name("Synthetic brand").build(); em.persist(vendor);
            Long first = null;
            for (int i = 0; i < 24; i++) {
                var p = Product.builder().title("Synthetic pen " + i).handle("bench-" + i)
                        .price(BigDecimal.TEN).productType(type).vendor(vendor).build();
                p.getImages().add("https://example.test/pen.png"); em.persist(p);
                em.persist(ProductVariant.builder().product(p).title("Blue").stockQuantity(10).price(BigDecimal.TEN).build());
                if (first == null) first = p.getProductID();
            }
            for (int i = 0; i < 12; i++) em.persist(Coupon.builder().code("SYNTHETIC" + i)
                    .discountType(DiscountType.FIXED_AMOUNT).discountValue(BigDecimal.ONE).build());
            return first;
        });
        String range = "?startDate=2026-11-01&endDate=2026-11-30";
        Map<String,String> endpoints = new LinkedHashMap<>();
        endpoints.put("product-list", "/api/products?page=0&size=10&sort=productID,asc");
        endpoints.put("product-detail", "/api/products/" + id);
        endpoints.put("categories", "/api/product-types");
        endpoints.put("overview", "/api/admin/statistics/overview" + range);
        endpoints.put("revenue", "/api/admin/statistics/revenue" + range + "&groupBy=DAY");
        endpoints.put("voucher-list", "/api/admin/promotions?page=0&size=10");
        var sql = emf.unwrap(SessionFactory.class).getStatistics();
        try {
            for (var endpoint : endpoints.entrySet()) {
                Map<String,List<Double>> times = new LinkedHashMap<>();
                Map<String,Long> queries = new LinkedHashMap<>();
                Map<String,Integer> hits = new LinkedHashMap<>();
                String expected = null;
                for (int round = -3; round < 10; round++) {
                    for (String mode : List.of("disabled", "miss", "hit")) {
                        ReflectionTestUtils.setField(cache, "enabled", !mode.equals("disabled"));
                        if (mode.equals("miss")) cache.invalidateAfterCommit(Set.of("products", "categories", "admin"));
                        Thread.sleep(100); // Small sequential sample; no stress/production traffic.
                        sql.clear();
                        long start = System.nanoTime();
                        var response = mvc.perform(get(endpoint.getValue()).with(user("admin").roles("ADMIN")))
                                .andReturn().getResponse();
                        double ms = (System.nanoTime() - start) / 1_000_000.0;
                        assertThat(response.getStatus()).as(endpoint.getKey() + ":" + mode).isEqualTo(200);
                        if (expected == null) expected = response.getContentAsString();
                        assertThat(response.getContentAsString()).isEqualTo(expected);
                        if (round >= 0) {
                            times.computeIfAbsent(mode, ignored -> new ArrayList<>()).add(ms);
                            queries.merge(mode, sql.getPrepareStatementCount(), Long::sum);
                            if (sql.getPrepareStatementCount() == 0) hits.merge(mode, 1, Integer::sum);
                        }
                    }
                }
                for (var sample : times.entrySet()) {
                    var sorted = sample.getValue().stream().sorted().toList();
                    System.out.printf(Locale.ROOT, "REDIS_BENCH %s %s n=%d p50_ms=%.3f p95_ms=%.3f sql_total=%d zero_sql=%d%n",
                            endpoint.getKey(), sample.getKey(), sorted.size(), sorted.get(4), sorted.get(9),
                            queries.get(sample.getKey()), hits.getOrDefault(sample.getKey(), 0));
                }
                assertThat(queries.get("disabled")).isPositive();
                if (!endpoint.getKey().equals("voucher-list")) assertThat(queries.get("hit")).isZero();
                else assertThat(queries.get("hit")).isPositive(); // Deliberately uncached; decisions stay in PostgreSQL.
            }
        } finally { ReflectionTestUtils.setField(cache, "enabled", true); }
    }
}
