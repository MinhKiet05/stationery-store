package com.example.backend.deployment;

import com.example.backend.model.*;
import com.example.backend.security.JwtTokenService;
import jakarta.persistence.EntityManager;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:dashboard;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
        "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate",
        "spring.jpa.properties.hibernate.default_schema=store",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.mail.username=test@example.test", "spring.mail.password=", "app.mail.from=test@example.test",
        "app.ai.enabled=false", "app.ai.vector-url=", "logging.level.root=WARN"
})
@AutoConfigureMockMvc
@Transactional
class DashboardApiTest {
    private static final String RANGE = "?startDate=2026-11-01&endDate=2026-11-23";
    @Autowired MockMvc mvc;
    @Autowired WebApplicationContext context;
    @Autowired EntityManager em;
    @Autowired JwtTokenService jwt;
    User user;

    @BeforeEach
    void setup() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        user = User.builder().username("dashboard-customer").email("dashboard@example.test")
                .fullName("Khach hang thu nghiem").passwordHash("unused-test-hash").build();
        em.persist(user);
        em.flush();
    }

    @Test
    void anonymousRequestsAreRejected() throws Exception {
        mvc.perform(get("/api/admin/dashboard/orders" + RANGE)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/dashboard/low-stock")).andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(roles = "CUSTOMER")
    void customersCannotReadDashboardData() throws Exception {
        mvc.perform(get("/api/admin/dashboard/orders" + RANGE)).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/dashboard/low-stock")).andExpect(status().isForbidden());
    }

    @Test
    void signedAdminClaimCannotOverrideCurrentDatabaseRole() throws Exception {
        user.setRole(UserRole.ADMIN);
        String token = jwt.issue(user);
        user.setRole(UserRole.CUSTOMER);
        em.flush();
        mvc.perform(get("/api/admin/dashboard/orders" + RANGE).header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("CUSTOMER"));
    }

    @Test
    void currentAdminCanUseRealSignedBearerToken() throws Exception {
        user.setRole(UserRole.ADMIN);
        em.flush();
        String token = jwt.issue(user);
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("ADMIN"));
        mvc.perform(get("/api/admin/dashboard/orders" + RANGE).header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        mvc.perform(get("/api/admin/dashboard/low-stock").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void recentOrdersAreDateFilteredSortedAndPaginatedWithTwoQueries() throws Exception {
        order("2026-10-31T23:59:59", "1");
        Order earlier = order("2026-11-01T00:00:00", "20000");
        order("2026-11-23T23:59:59", "30000");
        Order latest = order("2026-11-23T23:59:59", "40000");
        order("2026-11-24T00:00:00", "2");
        em.flush(); em.clear();
        var statistics = em.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics();
        statistics.clear();
        mvc.perform(get("/api/admin/dashboard/orders" + RANGE + "&size=2"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.content[0].orderID").value(latest.getOrderID()))
                .andExpect(jsonPath("$.content[0].totalAmount").value(40000))
                .andExpect(jsonPath("$.content[0].customerName").value(user.getFullName()))
                .andExpect(jsonPath("$.content[0].passwordHash").doesNotExist())
                .andExpect(jsonPath("$.content[0].items").doesNotExist());
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(2);
        mvc.perform(get("/api/admin/dashboard/orders" + RANGE + "&size=2&page=1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].orderID").value(earlier.getOrderID()));
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void lowStockUsesVariantStockExcludesInactiveProductsAndHasBoundedQueries() throws Exception {
        Product active = Product.builder().title("But gel").build(); em.persist(active);
        Product inactive = Product.builder().title("Da ngung ban").isActive(false).build(); em.persist(inactive);
        variant(active, 10, "ENOUGH");
        variant(active, 9, "LOW");
        variant(active, 0, "EMPTY");
        variant(inactive, 1, "INACTIVE");
        em.flush(); em.clear();
        var statistics = em.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics();
        statistics.clear();
        mvc.perform(get("/api/admin/dashboard/low-stock?size=1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].sku").value("EMPTY"))
                .andExpect(jsonPath("$.content[0].stockQuantity").value(0))
                .andExpect(jsonPath("$.content[0].productTitle").value("But gel"));
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(2);
        mvc.perform(get("/api/admin/dashboard/low-stock?size=1&page=1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].sku").value("LOW"));
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void emptyDataAndInvalidParametersAreHandled() throws Exception {
        mvc.perform(get("/api/admin/dashboard/orders" + RANGE))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content").isEmpty()).andExpect(jsonPath("$.totalElements").value(0));
        mvc.perform(get("/api/admin/dashboard/low-stock"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content").isEmpty());
        for (String path : new String[]{"/orders" + RANGE + "&size=51", "/orders" + RANGE + "&page=-1",
                "/orders?startDate=2026-11-23&endDate=2026-11-01", "/orders?startDate=bad&endDate=2026-11-01",
                "/orders?startDate=2026-11-01&endDate=9999-12-31", "/low-stock?size=0", "/low-stock?size=51"}) {
            mvc.perform(get("/api/admin/dashboard" + path)).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.trace").doesNotExist());
        }
    }

    private Order order(String date, String amount) {
        Order result = Order.builder().user(user).orderDate(LocalDateTime.parse(date)).totalAmount(new BigDecimal(amount))
                .discountAmount(BigDecimal.ZERO).status(OrderStatus.PENDING).paymentMethod("COD").build();
        em.persist(result); return result;
    }

    private void variant(Product product, int stock, String sku) {
        em.persist(ProductVariant.builder().product(product).title("Muc xanh").sku(sku).price(BigDecimal.TEN).stockQuantity(stock).build());
    }
}
