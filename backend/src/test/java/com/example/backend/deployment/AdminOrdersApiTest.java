package com.example.backend.deployment;

import com.example.backend.model.*;
import java.math.BigDecimal;
import com.example.backend.services.ReviewImageStorage;
import jakarta.persistence.EntityManager;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;
import java.io.ByteArrayInputStream;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:admin-orders;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
        "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.properties.hibernate.default_schema=store",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.mail.username=test@example.test", "spring.mail.password=", "app.mail.from=test@example.test",
        "app.ai.enabled=false", "app.ai.vector-url=", "logging.level.root=WARN", "app.admin.orders.max-export-rows=20"
})
@AutoConfigureMockMvc
@Transactional
class AdminOrdersApiTest {
    @Autowired MockMvc mvc;
    @Autowired WebApplicationContext context;
    @Autowired EntityManager em;
    @MockitoBean ReviewImageStorage storage;
    User customer, other;
    ProductVariant variant;
    Order order;
    OrderDetail line;

    @BeforeEach void setup() {
        mvc=MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        customer=User.builder().username("customer").fullName("Customer test").email("return@example.test").passwordHash("private-test-hash").build(); em.persist(customer);
        other=User.builder().username("other").fullName("Other user").email("other@example.test").passwordHash("private-test-hash").build(); em.persist(other);
        Product p=Product.builder().title("Product test").build(); p.getImages().add("https://example.test/product.png"); em.persist(p);
        variant=ProductVariant.builder().product(p).title("Blue").sku("RETURN-SKU").stockQuantity(8).price(BigDecimal.valueOf(100000)).build(); em.persist(variant);
        order=Order.builder().user(customer).status(OrderStatus.PENDING).isPaid(false).paymentMethod("COD")
            .totalAmount(BigDecimal.valueOf(450000)).discountAmount(BigDecimal.valueOf(50000)).shippingAddress("Test address").contactPhone("0900000000")
            .deliveredAt(LocalDateTime.now().minusDays(2)).build(); em.persist(order);
        line=OrderDetail.builder().order(order).variant(variant).quantity(5).unitPrice(BigDecimal.valueOf(100000)).subTotal(BigDecimal.valueOf(500000)).build(); em.persist(line);
    }
    @Test void anonymousCannotAccessAnyAdminOperation() throws Exception {
        for(String path:List.of("?page=0","/statistics","/export","/1","")) mvc.perform(get("/api/admin/orders"+path)).andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/admin/orders/1/status").contentType("application/json").content("{\"status\":\"PROCESSING\"}")).andExpect(status().isUnauthorized());
    }
    @Test @WithMockUser(username="customer",roles="CUSTOMER") void customersCannotReadOrMutateAdminOrders() throws Exception {
        for(String path:List.of("?page=0","/statistics","/export","/1","")) mvc.perform(get("/api/admin/orders"+path)).andExpect(status().isForbidden());
        mvc.perform(patch("/api/admin/orders/1/status").contentType("application/json").content("{\"status\":\"PROCESSING\"}")).andExpect(status().isForbidden());
    }
    @Test @WithMockUser(roles="ADMIN") void paginationAndKpiUseWholeDatasetWithTwoQueriesAndStableOrdering() throws Exception {
        order.setOrderDate(LocalDateTime.of(2026,11,1,0,0));
        for(int i=0;i<12;i++) create(OrderStatus.PENDING,false,LocalDateTime.of(2026,11,23,10,i));
        create(OrderStatus.SHIPPED,false,LocalDateTime.of(2026,11,23,12,0));
        create(OrderStatus.DELIVERED,false,LocalDateTime.of(2026,11,23,12,1));
        create(OrderStatus.CANCELLED,true,LocalDateTime.of(2026,11,23,12,2)); em.flush(); em.clear();
        var stats=em.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics(); stats.clear();
        mvc.perform(get("/api/admin/orders?page=0&size=10")).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(16))
            .andExpect(jsonPath("$.content.length()").value(10)).andExpect(jsonPath("$.content[0].status").value("CANCELLED"));
        assertThat(stats.getPrepareStatementCount()).isEqualTo(2);
        mvc.perform(get("/api/admin/orders?page=1&size=10")).andExpect(status().isOk()).andExpect(jsonPath("$.content.length()").value(6));
        mvc.perform(get("/api/admin/orders/statistics")).andExpect(status().isOk()).andExpect(jsonPath("$.totalOrders").value(16))
            .andExpect(jsonPath("$.pendingOrders").value(13)).andExpect(jsonPath("$.shippedOrders").value(1)).andExpect(jsonPath("$.deliveredOrders").value(1))
            .andExpect(jsonPath("$.revenue").doesNotExist());
        mvc.perform(get("/api/admin/orders/statistics?status=DELIVERED&paid=false")).andExpect(status().isOk()).andExpect(jsonPath("$.totalOrders").value(1));
    }
    @Test @WithMockUser(roles="ADMIN") void literalSearchDateBoundariesPaidStatusAndSortAreAppliedOnServer() throws Exception {
        order.setOrderDate(LocalDateTime.of(2026,11,1,0,0));
        var last=create(OrderStatus.SHIPPED,true,LocalDateTime.of(2026,11,23,23,59,59));
        create(OrderStatus.SHIPPED,true,LocalDateTime.of(2026,11,24,0,0)); em.flush();
        mvc.perform(get("/api/admin/orders?page=0&startDate=2026-11-01&endDate=2026-11-23"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.content[0].orderID").value(last.getOrderID()));
        mvc.perform(get("/api/admin/orders?page=0&sort=OLDEST")).andExpect(status().isOk()).andExpect(jsonPath("$.content[0].orderID").value(order.getOrderID()));
        mvc.perform(get("/api/admin/orders?page=0&status=SHIPPED&paid=true&endDate=2026-11-23")).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/api/admin/orders?page=0").param("search","#ORD-"+order.getOrderID())).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/api/admin/orders?page=0&search=CUSTOMER")).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(3));
        for(String search:List.of("%","_","' or 1=1 --")) mvc.perform(get("/api/admin/orders?page=0").param("search",search)).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
    }
    @Test @WithMockUser(roles="ADMIN") void invalidFiltersAreRejectedWithoutLeakingDiagnostics() throws Exception {
        for(String filter:List.of("page=-1","page=0&size=51","page=2147483647","page=0&status=PACKED","page=0&paid=maybe","page=0&sort=INVALID","page=0&startDate=2026-11-23&endDate=2026-01-01","page=0&startDate=0000-01-01")) {
            mvc.perform(get("/api/admin/orders?"+filter)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.trace").doesNotExist());
        }
        mvc.perform(get("/api/admin/orders/export").param("search","a".repeat(151))).andExpect(status().isBadRequest());
    }
    @Test @WithMockUser(roles="ADMIN") void excelExportsAllFilteredRowsOriginalAmountsVietnameseAndSafeStrings() throws Exception {
        order.setOrderDate(LocalDateTime.of(2026,11,1,0,0)); customer.setFullName("=HYPERLINK(\"https://evil.test\",\"unsafe\")");
        for(int i=0;i<12;i++) create(OrderStatus.PROCESSING,false,LocalDateTime.of(2026,11,23,14,30));
        create(OrderStatus.CANCELLED,true,LocalDateTime.of(2026,11,23,14,30)); em.flush(); em.clear();
        var response=mvc.perform(get("/api/admin/orders/export?status=PROCESSING&paid=false&startDate=2026-11-23&endDate=2026-11-23&search=customer&sort=OLDEST"))
            .andExpect(status().isOk()).andExpect(content().contentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
            .andExpect(header().string("Content-Disposition",org.hamcrest.Matchers.matchesPattern("attachment; filename=\"stationery-orders-\\d{4}-\\d{2}-\\d{2}\\.xlsx\""))).andReturn().getResponse();
        try(var book=new XSSFWorkbook(new ByteArrayInputStream(response.getContentAsByteArray()))) {
            var sheet=book.getSheetAt(0); assertThat(sheet.getLastRowNum()).isEqualTo(12); assertThat(sheet.getRow(0).getLastCellNum()).isEqualTo((short)9);
            assertThat(sheet.getPaneInformation().isFreezePane()).isTrue(); assertThat(sheet.getCTWorksheet().isSetAutoFilter()).isTrue();
            assertThat(book.getFontAt(sheet.getRow(0).getCell(0).getCellStyle().getFontIndex()).getBold()).isTrue();
            assertThat(sheet.getRow(0).getCell(0).getStringCellValue()).isEqualTo("Mã đơn hàng");
            assertThat(sheet.getRow(1).getCell(2).getStringCellValue()).isEqualTo("23/11/2026 14:30");
            var text=sheet.getRow(1).getCell(1); assertThat(text.getCellType()).isEqualTo(CellType.STRING); assertThat(text.getStringCellValue()).startsWith("=HYPERLINK");
            assertThat(sheet.getRow(1).getCell(6).getNumericCellValue()).isEqualTo(500000);
            assertThat(sheet.getRow(1).getCell(7).getNumericCellValue()).isEqualTo(50000);
            assertThat(sheet.getRow(1).getCell(8).getNumericCellValue()).isEqualTo(450000);
            assertThat(sheet.getRow(1).getCell(8).getCellStyle().getDataFormatString()).contains("₫");
            for(var row:sheet) for(var cell:row) assertThat(cell.toString()).doesNotContain("private-test-hash");
        }
        verifyNoInteractions(storage);
    }
    @Test @WithMockUser(roles="ADMIN") void emptyExportAndOversizeExportHaveExplicitStatuses() throws Exception {
        mvc.perform(get("/api/admin/orders/export?status=SHIPPED")).andExpect(status().isNotFound());
        for(int i=0;i<20;i++) create(OrderStatus.PENDING,false,LocalDateTime.now()); em.flush();
        mvc.perform(get("/api/admin/orders/export")).andExpect(status().isPayloadTooLarge());
    }
    @Test @WithMockUser(username="customer",roles="CUSTOMER") void customerEndpointsKeepOwnershipAndHistoricalLinePrices() throws Exception {
        variant.setPrice(BigDecimal.ONE); order.getOrderDetails().add(line); em.flush(); em.clear();
        mvc.perform(get("/api/orders/"+order.getOrderID())).andExpect(status().isOk()).andExpect(jsonPath("$.items[0].unitPrice").value(100000)).andExpect(jsonPath("$.subTotal").value(500000));
        var foreign=create(OrderStatus.PENDING,false,LocalDateTime.now()); foreign.setUser(other); em.flush();
        mvc.perform(get("/api/orders/"+foreign.getOrderID())).andExpect(status().isNotFound());
        mvc.perform(patch("/api/orders/"+foreign.getOrderID()+"/cancel")).andExpect(status().isNotFound());
        mvc.perform(get("/api/orders/my-orders")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
    }
    @Test @WithMockUser(roles="ADMIN") void legacyArrayContractAndDetailRemainAvailable() throws Exception {
        order.getOrderDetails().add(line); em.flush();
        mvc.perform(get("/api/admin/orders")).andExpect(status().isOk()).andExpect(jsonPath("$[0].orderID").value(order.getOrderID()));
        mvc.perform(get("/api/admin/orders/"+order.getOrderID())).andExpect(status().isOk()).andExpect(jsonPath("$.order.items[0].unitPrice").value(100000));
    }
    @Test @WithMockUser(roles="ADMIN") void cancellationRestoresStockAndCouponOnceAndDeliveryDoesNotConfirmPayment() throws Exception {
        var coupon=Coupon.builder().code("ORDER-CANCEL").discountType(DiscountType.FIXED_AMOUNT)
            .discountValue(BigDecimal.valueOf(50000)).usedCount(2).build(); em.persist(coupon);
        order.setCoupon(coupon); order.getOrderDetails().add(line); em.flush();
        String path="/api/admin/orders/"+order.getOrderID()+"/status";
        String cancellation="{\"status\":\"CANCELLED\",\"expectedStatus\":\"PENDING\",\"expectedPaid\":false}";
        mvc.perform(patch(path).contentType("application/json").content(cancellation)).andExpect(status().isOk());
        // MockMvc joins the test transaction; flush writes before reading database state again.
        em.flush();
        em.refresh(variant); em.refresh(coupon);
        assertThat(variant.getStockQuantity()).isEqualTo(13); assertThat(coupon.getUsedCount()).isEqualTo(1);
        mvc.perform(patch(path).contentType("application/json").content(cancellation)).andExpect(status().isConflict());
        em.refresh(variant); em.refresh(coupon);
        assertThat(variant.getStockQuantity()).isEqualTo(13); assertThat(coupon.getUsedCount()).isEqualTo(1);
        var shipped=create(OrderStatus.SHIPPED,false,LocalDateTime.now()); em.flush();
        mvc.perform(patch("/api/admin/orders/"+shipped.getOrderID()+"/status").contentType("application/json")
            .content("{\"status\":\"DELIVERED\",\"expectedStatus\":\"SHIPPED\",\"expectedPaid\":false}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.isPaid").value(false)).andExpect(jsonPath("$.deliveredAt").isNotEmpty());
    }
    private Order create(OrderStatus status,boolean paid,LocalDateTime date) {
        var o=Order.builder().user(customer).status(status).isPaid(paid).orderDate(date).paymentMethod(paid?"VNPAY":"COD").totalAmount(BigDecimal.valueOf(450000)).discountAmount(BigDecimal.valueOf(50000)).build(); em.persist(o);
        var d=OrderDetail.builder().order(o).variant(variant).quantity(5).unitPrice(BigDecimal.valueOf(100000)).subTotal(BigDecimal.valueOf(500000)).build(); em.persist(d); o.getOrderDetails().add(d); return o;
    }
}
