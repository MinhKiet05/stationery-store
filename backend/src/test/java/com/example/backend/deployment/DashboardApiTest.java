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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
        mvc.perform(get("/api/admin/orders/1")).andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/admin/orders/1/status").contentType("application/json").content("{\"status\":\"PROCESSING\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/admin/product-variants/1/stock").contentType("application/json").content("{\"stockQuantity\":10,\"version\":0}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(roles = "CUSTOMER")
    void customersCannotReadDashboardData() throws Exception {
        mvc.perform(get("/api/admin/dashboard/orders" + RANGE)).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/dashboard/low-stock")).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/orders/1")).andExpect(status().isForbidden());
        mvc.perform(patch("/api/admin/orders/1/status").contentType("application/json").content("{\"status\":\"PROCESSING\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/admin/product-variants/1/stock").contentType("application/json").content("{\"stockQuantity\":10,\"version\":0}"))
                .andExpect(status().isForbidden());
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

    @Test
    @WithMockUser(roles = "ADMIN")
    void adminReadsOrderDetailsWithHistoricalPricesSkuAndRelatedReturns() throws Exception {
        Product product = Product.builder().title("But gel").build();
        product.getImages().add("https://example.test/pen.png"); em.persist(product);
        ProductVariant variant = variant(product, 5, "DETAIL-SKU");
        Order order = order("2026-11-23T11:30:00", "18000");
        order.setDiscountAmount(new BigDecimal("2000"));
        order.setShippingAddress("Dia chi giao hang"); order.setContactPhone("0901234567");
        OrderDetail line = OrderDetail.builder().order(order).variant(variant).quantity(2)
                .unitPrice(new BigDecimal("10000")).subTotal(new BigDecimal("20000")).build();
        order.getOrderDetails().add(line); em.persist(line);
        ReturnRequest request = ReturnRequest.builder().order(order).user(user).reason("Hang bi hong").build(); em.persist(request);
        em.flush(); em.clear();
        mvc.perform(get("/api/admin/orders/" + order.getOrderID()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.customerName").value(user.getFullName()))
                .andExpect(jsonPath("$.email").value(user.getEmail()))
                .andExpect(jsonPath("$.order.contactPhone").value("0901234567"))
                .andExpect(jsonPath("$.order.shippingAddress").value("Dia chi giao hang"))
                .andExpect(jsonPath("$.order.items[0].unitPrice").value(10000))
                .andExpect(jsonPath("$.order.items[0].productImage").value("https://example.test/pen.png"))
                .andExpect(jsonPath("$.order.subTotal").value(20000))
                .andExpect(jsonPath("$.order.discountAmount").value(2000))
                .andExpect(jsonPath("$.order.totalAmount").value(18000))
                .andExpect(jsonPath("$.variantSkus['" + variant.getVariantID() + "']").value("DETAIL-SKU"))
                .andExpect(jsonPath("$.returns[0].reason").value("Hang bi hong"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
        mvc.perform(get("/api/admin/orders/99999999")).andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void orderActionsFollowExistingTransitionsAndRefreshStatistics() throws Exception {
        Order order = order("2026-11-23T11:30:00", "20000"); em.flush();
        change(order, "DELIVERED", "PENDING", false, 409);
        change(order, "PROCESSING", "PENDING", false, 200);
        change(order, "CANCELLED", "PENDING", false, 409); // stale modal
        change(order, "SHIPPED", "PROCESSING", false, 200);
        change(order, "PROCESSING", "SHIPPED", false, 409);
        change(order, "DELIVERED", "SHIPPED", false, 200);
        change(order, "CANCELLED", "DELIVERED", false, 409);
        mvc.perform(get("/api/admin/statistics/overview" + RANGE)).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalRevenue").value(20000)).andExpect(jsonPath("$.successfulOrders").value(1));
        mvc.perform(get("/api/admin/orders/" + order.getOrderID())).andExpect(status().isOk())
                .andExpect(jsonPath("$.order.status").value("DELIVERED")).andExpect(jsonPath("$.order.deliveredAt").isNotEmpty());
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void cancellationRestocksOnceAndPaidOrdersCannotBeCancelled() throws Exception {
        Product product = Product.builder().title("But gel").build(); em.persist(product);
        ProductVariant variant = variant(product, 5, "CANCEL-SKU");
        Order order = order("2026-11-23T11:30:00", "20");
        OrderDetail line = OrderDetail.builder().order(order).variant(variant).quantity(2)
                .unitPrice(BigDecimal.TEN).subTotal(new BigDecimal("20")).build();
        order.getOrderDetails().add(line); em.persist(line); em.flush();
        change(order, "CANCELLED", "PENDING", false, 200);
        assertThat(variant.getStockQuantity()).isEqualTo(7);
        change(order, "CANCELLED", "PENDING", false, 409);
        assertThat(variant.getStockQuantity()).isEqualTo(7);
        Order paid = order("2026-11-23T11:30:00", "20"); paid.setIsPaid(true); em.flush();
        change(paid, "CANCELLED", "PENDING", true, 409);
        change(paid, "PROCESSING", "PENDING", false, 409); // payment changed since reading
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void stockUpdateChangesOnlyInventoryAndRejectsStaleVersion() throws Exception {
        Product product = Product.builder().title("But gel").build(); em.persist(product);
        ProductVariant variant = variant(product, 5, "STOCK-SKU"); em.flush();
        long version = variant.getVersion();
        mvc.perform(patch("/api/admin/product-variants/" + variant.getVariantID() + "/stock")
                        .contentType("application/json").content("{\"stockQuantity\":25,\"version\":" + version + "}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.stockQuantity").value(25))
                .andExpect(jsonPath("$.version").value(version + 1))
                .andExpect(jsonPath("$.sku").value("STOCK-SKU")).andExpect(jsonPath("$.price").value(10));
        mvc.perform(patch("/api/admin/product-variants/" + variant.getVariantID() + "/stock")
                        .contentType("application/json").content("{\"stockQuantity\":0,\"version\":" + version + "}"))
                .andExpect(status().isConflict());
        em.refresh(variant); assertThat(variant.getStockQuantity()).isEqualTo(25);
        mvc.perform(get("/api/admin/dashboard/low-stock")).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    @WithMockUser(roles = "ADMIN")
    void invalidStockAndOrderRequestsAreRejectedWithoutSensitiveErrors() throws Exception {
        Product product = Product.builder().title("But gel").build(); em.persist(product);
        ProductVariant variant = variant(product, 5, "VALIDATE-SKU"); em.flush();
        String stockPath = "/api/admin/product-variants/" + variant.getVariantID() + "/stock";
        for (String body : new String[]{"{}", "{\"stockQuantity\":-1,\"version\":0}", "{\"stockQuantity\":2}",
                "{\"stockQuantity\":1.5,\"version\":0}", "{\"stockQuantity\":2147483648,\"version\":0}"}) {
            mvc.perform(patch(stockPath).contentType("application/json").content(body)).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.trace").doesNotExist());
        }
        mvc.perform(patch("/api/admin/product-variants/99999999/stock").contentType("application/json")
                        .content("{\"stockQuantity\":1,\"version\":0}")).andExpect(status().isNotFound());
        Order order = order("2026-11-23T11:30:00", "10"); em.flush();
        mvc.perform(patch("/api/admin/orders/" + order.getOrderID() + "/status").contentType("application/json")
                        .content("{\"status\":\"PACKED\"}")).andExpect(status().isBadRequest());
        // Existing integrations may still use the original status-only contract.
        mvc.perform(patch("/api/admin/orders/" + order.getOrderID() + "/status").contentType("application/json")
                        .content("{\"status\":\"PROCESSING\"}")).andExpect(status().isOk());
    }

    private void change(Order order, String status, String expected, boolean paid, int result) throws Exception {
        mvc.perform(patch("/api/admin/orders/" + order.getOrderID() + "/status").contentType("application/json")
                .content("{\"status\":\"" + status + "\",\"expectedStatus\":\"" + expected + "\",\"expectedPaid\":" + paid + "}"))
                .andExpect(status().is(result));
    }

    private Order order(String date, String amount) {
        Order result = Order.builder().user(user).orderDate(LocalDateTime.parse(date)).totalAmount(new BigDecimal(amount))
                .discountAmount(BigDecimal.ZERO).status(OrderStatus.PENDING).paymentMethod("COD").build();
        em.persist(result); return result;
    }

    private ProductVariant variant(Product product, int stock, String sku) {
        ProductVariant variant = ProductVariant.builder().product(product).title("Muc xanh").sku(sku).price(BigDecimal.TEN).stockQuantity(stock).build();
        em.persist(variant); return variant;
    }
}
