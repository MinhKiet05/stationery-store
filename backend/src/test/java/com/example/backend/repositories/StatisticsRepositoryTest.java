package com.example.backend.repositories;

import com.example.backend.dto.statistics.*;
import com.example.backend.model.*;
import com.example.backend.services.impl.StatisticsServiceImpl;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest(showSql = false, properties = {
        "spring.datasource.url=jdbc:h2:mem:statistics;MODE=MSSQLServer;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa", "spring.datasource.password=",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "debug=false", "logging.level.org.hibernate.SQL=OFF", "logging.level.root=WARN"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class StatisticsRepositoryTest {

    @Autowired
    private StatisticsRepository repository;
    @Autowired
    private EntityManager entityManager;
    private StatisticsServiceImpl service;

    private static final StatisticsDateRequest DAY = new StatisticsDateRequest(
            LocalDate.of(2026, 11, 2), LocalDate.of(2026, 11, 2));

    @BeforeEach
    void setup() {
        // November in Vietnam, while the UTC date is still October.
        service = new StatisticsServiceImpl(repository, Clock.fixed(
                Instant.parse("2026-10-31T18:00:00Z"), ZoneId.of("Asia/Ho_Chi_Minh")));
    }

    @Test
    void emptyDatabaseReturnsZerosAndEmptyRankings() {
        var overview = service.getOverview(DAY);
        assertEquals(0, overview.totalOrders());
        assertEquals(0, overview.successfulOrders());
        assertMoney("0", overview.totalRevenue());
        assertMoney("0", overview.totalDiscount());
        assertEquals(0, overview.quantitySold());
        var revenue = service.getRevenue(DAY, StatisticsGroupBy.DAY);
        assertMoney("0", revenue.totalRevenue());
        assertMoney("0", revenue.totalDiscount());
        assertTrue(revenue.periods().isEmpty());
        assertTrue(service.getTopProducts(DAY, null, ProductRanking.QUANTITY, 10).isEmpty());
        var customers = service.getCustomerStatistics(DAY, CustomerRanking.REVENUE, 10);
        assertEquals(0, customers.totalCustomers());
        assertTrue(customers.customers().isEmpty());
        var orders = service.getOrderStatistics(DAY);
        assertEquals(OrderStatus.values().length, orders.statusCounts().size());
        assertTrue(orders.statusCounts().values().stream().allMatch(count -> count == 0));
        assertTrue(orders.returnRequestCounts().values().stream().allMatch(count -> count == 0));
    }

    @Test
    void omittedRangeDefaultsToEntireCurrentMonthInVietnam() {
        var response = service.getOverview(new StatisticsDateRequest(null, null));
        assertEquals(LocalDate.of(2026, 11, 1), response.startDate());
        assertEquals(LocalDate.of(2026, 11, 30), response.endDate());
    }

    @Test
    void overviewUsesInclusiveDaysAndDoesNotMultiplyOrderTotalsByLines() {
        seed();
        var response = service.getOverview(DAY);
        assertEquals(7, response.totalOrders());
        assertEquals(4, response.successfulOrders());
        assertMoney("720", response.totalRevenue());
        assertMoney("30", response.totalDiscount());
        assertEquals(6, response.quantitySold());
        assertEquals(2, response.totalCustomers());
        assertEquals(1, response.newCustomers());
    }

    @Test
    void revenueGroupsByDayMonthAndYearUsingStoredOrderPrices() {
        seed();
        var range = new StatisticsDateRequest(LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 30));
        var daily = service.getRevenue(range, StatisticsGroupBy.DAY);
        assertEquals(3, daily.periods().size());
        assertEquals(LocalDate.of(2026, 11, 2), daily.periods().get(1).periodStart());
        assertMoney("720", daily.periods().get(1).totalRevenue());
        assertMoney("30", daily.periods().get(1).totalDiscount());
        assertMoney("3720", daily.totalRevenue());
        assertEquals(6, daily.successfulOrders());
        var monthly = service.getRevenue(range, StatisticsGroupBy.MONTH);
        assertEquals(1, monthly.periods().size());
        assertEquals(LocalDate.of(2026, 11, 1), monthly.periods().get(0).periodStart());
        assertMoney("3720", monthly.totalRevenue());
        var yearly = service.getRevenue(range, StatisticsGroupBy.YEAR);
        assertEquals(LocalDate.of(2026, 1, 1), yearly.periods().get(0).periodStart());
        assertMoney("3720", yearly.totalRevenue());
    }

    @Test
    void revenueSeparatesSameMonthsAcrossYears() {
        User buyer = user("buyer", true, UserRole.CUSTOMER, "2025-01-01T00:00:00");
        order(buyer, "2025-11-02T10:00:00", OrderStatus.DELIVERED, "100", "10", true, true);
        order(buyer, "2026-11-02T10:00:00", OrderStatus.DELIVERED, "200", "20", true, true);
        var response = service.getRevenue(new StatisticsDateRequest(
                LocalDate.of(2025, 1, 1), LocalDate.of(2026, 12, 31)), StatisticsGroupBy.MONTH);
        assertEquals(2, response.periods().size());
        assertEquals(LocalDate.of(2025, 11, 1), response.periods().get(0).periodStart());
        assertMoney("100", response.periods().get(0).totalRevenue());
        assertEquals(LocalDate.of(2026, 11, 1), response.periods().get(1).periodStart());
    }

    @Test
    void productsCombineVariantsFilterCategoryAndSupportBothRankings() {
        Fixture fixture = seed();
        var quantity = service.getTopProducts(DAY, null, ProductRanking.QUANTITY, 10);
        assertEquals(2, quantity.size());
        assertEquals("Pens", quantity.get(0).title());
        assertEquals(4, quantity.get(0).quantitySold());
        assertMoney("250", quantity.get(0).revenue());
        var revenue = service.getTopProducts(DAY, null, ProductRanking.REVENUE, 1);
        assertEquals(1, revenue.size());
        assertEquals("Paper", revenue.get(0).title());
        assertMoney("500", revenue.get(0).revenue());
        var category = service.getTopProducts(DAY, fixture.penTypeID(), ProductRanking.REVENUE, 10);
        assertEquals(1, category.size());
        assertEquals("Pens", category.get(0).title());
        assertTrue(service.getTopProducts(DAY, Long.MAX_VALUE, ProductRanking.QUANTITY, 10).isEmpty());
    }

    @Test
    void categoryIsOptionalAndUncategorizedProductsRemainInReport() {
        User buyer = user("buyer", true, UserRole.CUSTOMER, "2026-11-01T00:00:00");
        Product product = Product.builder().title("Uncategorized").handle("uncategorized").build();
        entityManager.persist(product);
        ProductVariant variant = variant(product, "Single");
        Order order = order(buyer, "2026-11-02T12:00:00", OrderStatus.DELIVERED, "10", "0", true, true);
        detail(order, variant, 1, "10");
        assertEquals("Uncategorized", service.getTopProducts(DAY, null, ProductRanking.QUANTITY, 10).get(0).title());
    }

    @Test
    void customerRankingUsesPaidAmountsAndCanSwitchToOrderCount() {
        seed();
        var byRevenue = service.getCustomerStatistics(DAY, CustomerRanking.REVENUE, 10);
        assertEquals(2, byRevenue.totalCustomers());
        assertEquals(1, byRevenue.activeCustomers());
        assertEquals(1, byRevenue.inactiveCustomers());
        assertEquals(1, byRevenue.newCustomers());
        assertEquals(2, byRevenue.purchasingCustomers());
        assertEquals("buyerB", byRevenue.customers().get(0).username());
        assertMoney("400", byRevenue.customers().get(0).totalPaid());
        var byOrders = service.getCustomerStatistics(DAY, CustomerRanking.ORDERS, 1);
        assertEquals(1, byOrders.customers().size());
        assertEquals("buyerA", byOrders.customers().get(0).username());
        assertEquals(3, byOrders.customers().get(0).orderCount());
        assertMoney("270", byOrders.customers().get(0).totalPaid());
    }

    @Test
    void returnApprovalDoesNotDeductMoneyAndReturnStatusesAreCountedSeparately() {
        seed();
        var orders = service.getOrderStatistics(DAY);
        assertEquals(7, orders.totalOrders());
        assertEquals(3L, orders.statusCounts().get(OrderStatus.DELIVERED));
        assertEquals(2L, orders.statusCounts().get(OrderStatus.RETURN_PENDING));
        assertEquals(1L, orders.statusCounts().get(OrderStatus.CANCELLED));
        assertEquals(0L, orders.statusCounts().get(OrderStatus.PENDING));
        for (ReturnStatus status : ReturnStatus.values()) {
            assertEquals(1L, orders.returnRequestCounts().get(status));
        }
        assertMoney("720", service.getOverview(DAY).totalRevenue());
    }

    @Test
    void adminOrdersRemainSalesButAreNotCountedAsCustomerAccounts() {
        User admin = user("admin", true, UserRole.ADMIN, "2026-11-02T10:00:00");
        order(admin, "2026-11-02T12:00:00", OrderStatus.DELIVERED, "100", "0", true, true);
        assertMoney("100", service.getOverview(DAY).totalRevenue());
        var customers = service.getCustomerStatistics(DAY, CustomerRanking.REVENUE, 10);
        assertEquals(0, customers.totalCustomers());
        assertEquals(0, customers.purchasingCustomers());
        assertTrue(customers.customers().isEmpty());
    }

    private Fixture seed() {
        User a = user("buyerA", true, UserRole.CUSTOMER, "2026-10-01T00:00:00");
        User b = user("buyerB", false, UserRole.CUSTOMER, "2026-11-02T23:59:59");
        user("admin", true, UserRole.ADMIN, "2026-11-02T12:00:00");
        ProductType penType = new ProductType(null, "Writing", true);
        ProductType paperType = new ProductType(null, "Paper", true);
        entityManager.persist(penType);
        entityManager.persist(paperType);
        Product pens = Product.builder().title("Pens").handle("pens").productType(penType).isActive(false)
                .price(new BigDecimal("9999")).build();
        Product paper = Product.builder().title("Paper").handle("paper").productType(paperType).build();
        entityManager.persist(pens);
        entityManager.persist(paper);
        ProductVariant pen1 = variant(pens, "Blue");
        ProductVariant pen2 = variant(pens, "Black");
        ProductVariant sheet = variant(paper, "A4");
        Order first = order(a, "2026-11-02T00:00:00", OrderStatus.DELIVERED, "180", "20", true, true);
        detail(first, pen1, 2, "50");
        detail(first, sheet, 1, "100");
        detail(order(a, "2026-11-02T23:59:59", OrderStatus.RETURN_PENDING, "90", "10", true, true), pen2, 1, "100");
        detail(order(b, "2026-11-02T12:00:00", OrderStatus.DELIVERED, "400", "0", true, true), sheet, 1, "400");
        detail(order(a, "2026-11-02T13:00:00", OrderStatus.DELIVERED, "50", "0", false, true), pen1, 1, "50");
        detail(order(a, "2026-11-02T12:00:00", OrderStatus.CANCELLED, "800", "0", false, false), pen1, 80, "10");
        detail(order(a, "2026-11-02T12:00:00", OrderStatus.SHIPPED, "700", "0", true, false), pen1, 70, "10");
        detail(order(a, "2026-11-02T12:00:00", OrderStatus.RETURN_PENDING, "600", "0", true, false), pen1, 60, "10");
        detail(order(a, "2026-11-01T23:59:59", OrderStatus.DELIVERED, "1000", "0", true, true), pen1, 100, "10");
        detail(order(a, "2026-11-03T00:00:00", OrderStatus.DELIVERED, "2000", "0", true, true), pen1, 200, "10");
        for (ReturnStatus status : ReturnStatus.values()) {
            entityManager.persist(ReturnRequest.builder().order(first).user(a).reason("Test return")
                    .status(status).createdAt(LocalDateTime.parse("2026-11-02T12:00:00")).build());
        }
        return new Fixture(penType.getProductTypeID());
    }

    private User user(String username, boolean active, UserRole role, String createdAt) {
        User user = User.builder().username(username).email(username + "@example.com").passwordHash("test-hash")
                .role(role).isActive(active).createdAt(LocalDateTime.parse(createdAt)).build();
        entityManager.persist(user);
        return user;
    }

    private ProductVariant variant(Product product, String title) {
        ProductVariant variant = ProductVariant.builder().product(product).title(title)
                .sku(product.getHandle() + "-" + title).price(new BigDecimal("9999")).build();
        entityManager.persist(variant);
        return variant;
    }

    private Order order(User user, String date, OrderStatus status, String amount, String discount,
            boolean paid, boolean delivered) {
        Order order = Order.builder().user(user).orderDate(LocalDateTime.parse(date)).status(status)
                .totalAmount(new BigDecimal(amount)).discountAmount(new BigDecimal(discount)).isPaid(paid)
                .deliveredAt(delivered ? LocalDateTime.parse(date) : null).build();
        entityManager.persist(order);
        return order;
    }

    private void detail(Order order, ProductVariant variant, int quantity, String unitPrice) {
        BigDecimal price = new BigDecimal(unitPrice);
        entityManager.persist(OrderDetail.builder().order(order).variant(variant).quantity(quantity)
                .unitPrice(price).subTotal(price.multiply(BigDecimal.valueOf(quantity))).build());
    }

    private void assertMoney(String expected, BigDecimal actual) {
        assertEquals(0, new BigDecimal(expected).compareTo(actual));
    }

    private record Fixture(Long penTypeID) {
    }
}
