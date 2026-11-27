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
        "spring.datasource.url=jdbc:h2:mem:admin-returns;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
        "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.properties.hibernate.default_schema=store",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.mail.username=test@example.test", "spring.mail.password=", "app.mail.from=test@example.test",
        "app.ai.enabled=false", "app.ai.vector-url=", "logging.level.root=WARN", "app.admin.returns.max-export-rows=20"
})
@AutoConfigureMockMvc
@Transactional
class AdminReturnsApiTest {
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
        order=Order.builder().user(customer).status(OrderStatus.RETURN_PENDING).isPaid(true).paymentMethod("COD")
            .totalAmount(BigDecimal.valueOf(450000)).discountAmount(BigDecimal.valueOf(50000)).shippingAddress("Test address").contactPhone("0900000000")
            .deliveredAt(LocalDateTime.now().minusDays(2)).build(); em.persist(order);
        line=OrderDetail.builder().order(order).variant(variant).quantity(5).unitPrice(BigDecimal.valueOf(100000)).subTotal(BigDecimal.valueOf(500000)).build(); em.persist(line); order.getOrderDetails().add(line);
    }
    @Test void anonymousCannotAccessAdminQueriesOrActions() throws Exception {
        for(String path:List.of("?page=0","/statistics","/export","/1","")) mvc.perform(get("/api/admin/returns"+path)).andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/admin/returns/1/status").contentType("application/json").content("{\"status\":\"APPROVED\"}")).andExpect(status().isUnauthorized());
    }
    @Test @WithMockUser(username="customer",roles="CUSTOMER") void customersCannotReadAdminQueriesOrDecide() throws Exception {
        for(String path:List.of("?page=0","/statistics","/export","/1","")) mvc.perform(get("/api/admin/returns"+path)).andExpect(status().isForbidden());
        mvc.perform(patch("/api/admin/returns/1/status").contentType("application/json").content("{\"status\":\"APPROVED\"}")).andExpect(status().isForbidden());
    }
    @Test @WithMockUser(roles="ADMIN") void paginationAndAggregatesUseWholeFilteredDatasetWithNoNPlusOne() throws Exception {
        for(int i=0;i<12;i++) request(ReturnStatus.PENDING,"Pending",LocalDateTime.of(2026,11,23,10,i));
        request(ReturnStatus.APPROVED,"Approved",LocalDateTime.of(2026,11,23,12,0));
        request(ReturnStatus.REJECTED,"Rejected",LocalDateTime.of(2026,11,23,12,1));
        request(ReturnStatus.COMPLETED,"Completed",LocalDateTime.of(2026,11,23,12,2)); em.flush(); em.clear();
        var statistics=em.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics(); statistics.clear();
        mvc.perform(get("/api/admin/returns?page=0&size=10")).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(15))
            .andExpect(jsonPath("$.content.length()").value(10)).andExpect(jsonPath("$.content[0].status").value("COMPLETED"));
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(2);
        mvc.perform(get("/api/admin/returns?page=1&size=10")).andExpect(status().isOk()).andExpect(jsonPath("$.content.length()").value(5));
        mvc.perform(get("/api/admin/returns/statistics")).andExpect(status().isOk()).andExpect(jsonPath("$.totalRequests").value(15))
            .andExpect(jsonPath("$.pendingRequests").value(12)).andExpect(jsonPath("$.approvedRequests").value(1)).andExpect(jsonPath("$.rejectedRequests").value(1))
            .andExpect(jsonPath("$.refundedAmount").doesNotExist());
        mvc.perform(get("/api/admin/returns/statistics?status=PENDING")).andExpect(status().isOk()).andExpect(jsonPath("$.totalRequests").value(12));
    }
    @Test @WithMockUser(roles="ADMIN") void searchDatesAndSortAreConsistentAndSqlWildcardsLiteral() throws Exception {
        var first=request(ReturnStatus.PENDING,"First",LocalDateTime.of(2026,11,1,0,0));
        var last=request(ReturnStatus.PENDING,"Last",LocalDateTime.of(2026,11,23,23,59,59));
        request(ReturnStatus.REJECTED,"Outside",LocalDateTime.of(2026,11,24,0,0)); em.flush();
        mvc.perform(get("/api/admin/returns?page=0&startDate=2026-11-01&endDate=2026-11-23"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.content[0].returnID").value(last.getReturnID()));
        mvc.perform(get("/api/admin/returns?page=0&sort=OLDEST")).andExpect(status().isOk()).andExpect(jsonPath("$.content[0].returnID").value(first.getReturnID()));
        mvc.perform(get("/api/admin/returns?page=0").param("search","#RET-"+first.getReturnID()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].returnID").value(first.getReturnID()));
        mvc.perform(get("/api/admin/returns?page=0").param("search","ORD-"+order.getOrderID()))
            .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(3));
        mvc.perform(get("/api/admin/returns?page=0&search=CUSTOMER")).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(3));
        for(String search:List.of("%","_","' or 1=1 --")) mvc.perform(get("/api/admin/returns?page=0").param("search",search))
            .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
    }
    @Test @WithMockUser(roles="ADMIN") void detailUsesBoundedQueriesShowsPartialReturnAndOnlySafeEvidence() throws Exception {
        var r=request(ReturnStatus.PENDING,"Damaged",LocalDateTime.now());
        r.setEvidenceImages("https://example.test/evidence.png\nhttps://example.test/evidence.mp4\njavascript:alert(1)\nhttps://user:pass@example.test/photo.png");
        em.flush(); em.clear();
        var statistics=em.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics(); statistics.clear();
        mvc.perform(get("/api/admin/returns/"+r.getReturnID())).andExpect(status().isOk())
            .andExpect(jsonPath("$.request.username").value("customer")).andExpect(jsonPath("$.order.totalAmount").value(450000))
            .andExpect(jsonPath("$.order.isPaid").value(true)).andExpect(jsonPath("$.items[0].sku").value("RETURN-SKU"))
            .andExpect(jsonPath("$.items[0].quantity").value(1)).andExpect(jsonPath("$.items[0].purchasedQuantity").value(5))
            .andExpect(jsonPath("$.items[0].imageUrl").value("https://example.test/product.png"))
            .andExpect(jsonPath("$.evidenceUrls.length()").value(2)).andExpect(jsonPath("$.request.passwordHash").doesNotExist())
            .andExpect(jsonPath("$.refundAmount").doesNotExist()).andExpect(jsonPath("$.refundStatus").doesNotExist());
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(5);
        mvc.perform(get("/api/admin/returns/999999")).andExpect(status().isNotFound()); verifyNoInteractions(storage);
    }
    @Test @WithMockUser(roles="ADMIN") void approvalDoesNotRefundRestockOrAllowAnotherDecision() throws Exception {
        var r=request(ReturnStatus.PENDING,"Approve",LocalDateTime.now()); em.flush();
        decide(r,"APPROVED","Approved note",200);
        decide(r,"REJECTED","Second note",409); decide(r,"APPROVED",null,409);
        em.refresh(r); em.refresh(order); em.refresh(variant);
        assertThat(r.getStatus()).isEqualTo(ReturnStatus.APPROVED); assertThat(r.getProcessedAt()).isNotNull(); assertThat(r.getAdminNote()).isEqualTo("Approved note");
        assertThat(order.getStatus()).isEqualTo(OrderStatus.DELIVERED); assertThat(order.getIsPaid()).isTrue(); assertThat(order.getTotalAmount()).isEqualByComparingTo("450000");
        assertThat(variant.getStockQuantity()).isEqualTo(8);
    }
    @Test @WithMockUser(roles="ADMIN") void rejectionKeepsOrderPendingUntilAllRequestsHandledAndOptionalNoteRemainsOptional() throws Exception {
        var first=request(ReturnStatus.PENDING,"One",LocalDateTime.now()); var second=request(ReturnStatus.PENDING,"Two",LocalDateTime.now()); em.flush();
        decide(first,"REJECTED","Rejected note",200); em.refresh(order); assertThat(order.getStatus()).isEqualTo(OrderStatus.RETURN_PENDING);
        decide(second,"REJECTED",null,200); em.flush(); em.refresh(order); assertThat(order.getStatus()).isEqualTo(OrderStatus.DELIVERED);
        mvc.perform(get("/api/admin/returns/"+first.getReturnID())).andExpect(status().isOk()).andExpect(jsonPath("$.request.adminNote").value("Rejected note"));
    }
    @Test @WithMockUser(roles="ADMIN") void stalePersistenceContextCannotOverwriteAlreadyProcessedRequest() throws Exception {
        var r=request(ReturnStatus.PENDING,"Stale",LocalDateTime.now()); em.flush();
        em.createNativeQuery("update store.return_requests set status='APPROVED' where return_id=:id").setParameter("id",r.getReturnID()).executeUpdate();
        assertThat(r.getStatus()).isEqualTo(ReturnStatus.PENDING); // Intentionally stale first-level entity.
        decide(r,"REJECTED",null,409); em.refresh(r); assertThat(r.getStatus()).isEqualTo(ReturnStatus.APPROVED);
    }
    @Test @WithMockUser(roles="ADMIN") void invalidTransitionsNotesAndFiltersAreRejectedSafely() throws Exception {
        var r=request(ReturnStatus.PENDING,"Validate",LocalDateTime.now()); em.flush();
        decide(r,"PENDING",null,400); decide(r,"COMPLETED",null,400); decide(r,"APPROVED","x".repeat(1001),400);
        mvc.perform(patch("/api/admin/returns/999999/status").contentType("application/json").content("{\"status\":\"APPROVED\"}")).andExpect(status().isNotFound());
        for(String query:List.of("page=-1","page=0&size=51","page=0&sort=HACK","page=0&status=REFUNDED","page=0&startDate=bad",
                "page=0&startDate=2026-11-23&endDate=2026-11-01","page=0&endDate=9999-12-31","page=0&search="+"x".repeat(151)))
            mvc.perform(get("/api/admin/returns?"+query)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.trace").doesNotExist());
    }
    @Test @WithMockUser(username="customer",roles="CUSTOMER") void customerCreateMineAndOwnershipContinueToWorkWithSevenDayAndQuantityRules() throws Exception {
        order.setStatus(OrderStatus.DELIVERED); em.flush();
        org.mockito.Mockito.when(storage.newPublicId("stationery-store/returns")).thenAnswer(call -> "stationery-store/returns/"+java.util.UUID.randomUUID());
        org.mockito.Mockito.when(storage.upload(org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.anyString())).thenAnswer(call -> new ReviewImage("https://example.test/photo.png",call.getArgument(1)));
        String create="{\"orderID\":"+order.getOrderID()+",\"reason\":\"Partial return\",\"evidenceUrls\":[\"https://example.test/photo.png\"],\"items\":[{\"orderDetailID\":"+line.getOrderDetailID()+",\"quantity\":2}]}";
        mvc.perform(createWithImage(create)).andExpect(status().isCreated()).andExpect(jsonPath("$.items[0].quantity").value(2));
        mvc.perform(get("/api/returns/my-requests")).andExpect(status().isOk()).andExpect(jsonPath("$[0].reason").value("Partial return"));
        mvc.perform(createWithImage(create.replace("\"quantity\":2","\"quantity\":4"))).andExpect(status().isConflict());
        order.setDeliveredAt(LocalDateTime.now().minusDays(8)); em.flush();
        mvc.perform(createWithImage(create)).andExpect(status().isConflict());
        var foreign=request(ReturnStatus.PENDING,"Private",LocalDateTime.now()); foreign.setUser(other); em.flush();
        mvc.perform(get("/api/returns/"+foreign.getReturnID())).andExpect(status().isNotFound());
    }
    @Test @WithMockUser(roles="ADMIN") void legacyArrayContractStillWorksAndEmptyStatsAreNotFabricated() throws Exception {
        mvc.perform(get("/api/admin/returns/statistics")).andExpect(status().isOk()).andExpect(jsonPath("$.totalRequests").value(0));
        mvc.perform(get("/api/admin/returns/export")).andExpect(status().isNotFound());
        request(ReturnStatus.PENDING,"Legacy",LocalDateTime.now()); em.flush();
        mvc.perform(get("/api/admin/returns")).andExpect(status().isOk()).andExpect(jsonPath("$[0].reason").value("Legacy"));
    }
    @Test @WithMockUser(roles="ADMIN") void excelContainsAllFilteredRowsWithoutSecretsAndWithSafeWrappedStrings() throws Exception {
        for(int i=0;i<12;i++) request(ReturnStatus.PENDING,"=HYPERLINK(\"https://evil.test\",\"unsafe\")",LocalDateTime.of(2026,11,23,14,30));
        request(ReturnStatus.REJECTED,"Excluded",LocalDateTime.of(2026,11,23,14,30)); em.flush(); em.clear();
        var response=mvc.perform(get("/api/admin/returns/export?status=PENDING&startDate=2026-11-23&endDate=2026-11-23&search=customer"))
            .andExpect(status().isOk()).andExpect(content().contentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
            .andExpect(header().string("Content-Disposition",org.hamcrest.Matchers.matchesPattern("attachment; filename=\"stationery-returns-\\d{4}-\\d{2}-\\d{2}\\.xlsx\""))).andReturn().getResponse();
        try(var book=new XSSFWorkbook(new ByteArrayInputStream(response.getContentAsByteArray()))) {
            var sheet=book.getSheetAt(0); assertThat(sheet.getLastRowNum()).isEqualTo(12); assertThat(sheet.getRow(0).getLastCellNum()).isEqualTo((short)9);
            assertThat(sheet.getPaneInformation().isFreezePane()).isTrue(); assertThat(sheet.getCTWorksheet().isSetAutoFilter()).isTrue();
            assertThat(book.getFontAt(sheet.getRow(0).getCell(0).getCellStyle().getFontIndex()).getBold()).isTrue();
            assertThat(sheet.getRow(0).getCell(0).getStringCellValue()).isEqualTo("M\u00e3 y\u00eau c\u1ea7u");
            assertThat(sheet.getRow(1).getCell(4).getStringCellValue()).isEqualTo("23/11/2026 14:30");
            var text=sheet.getRow(1).getCell(5); assertThat(text.getCellType()).isEqualTo(CellType.STRING); assertThat(text.getStringCellValue()).startsWith("=HYPERLINK"); assertThat(text.getCellStyle().getWrapText()).isTrue();
            for(var row:sheet) for(var cell:row) assertThat(cell.toString()).doesNotContain("private-test-hash");
        }
        verifyNoInteractions(storage);
    }
    @Test @WithMockUser(roles="ADMIN") void exportLimitRejectsInsteadOfTruncating() throws Exception {
        for(int i=0;i<21;i++) request(ReturnStatus.PENDING,"Too many",LocalDateTime.now()); em.flush();
        mvc.perform(get("/api/admin/returns/export")).andExpect(status().isPayloadTooLarge());
    }
    private ReturnRequest request(ReturnStatus status,String reason,LocalDateTime created) {
        var r=ReturnRequest.builder().order(order).user(customer).status(status).reason(reason).createdAt(created).evidenceImages("https://example.test/photo.png").build();
        r.getItems().add(ReturnRequestItem.builder().returnRequest(r).orderDetail(line).quantity(1).build()); em.persist(r); return r;
    }
    private void decide(ReturnRequest r,String status,String note,int expected) throws Exception {
        mvc.perform(patch("/api/admin/returns/"+r.getReturnID()+"/status").contentType("application/json")
            .content("{\"status\":\""+status+"\",\"adminNote\":"+(note==null?"null":"\""+note+"\"")+"}"))
            .andExpect(status().is(expected)).andExpect(jsonPath("$.trace").doesNotExist());
    }
    private org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder createWithImage(String json) throws Exception {
        var bytes=new java.io.ByteArrayOutputStream();
        javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(2,2,java.awt.image.BufferedImage.TYPE_INT_RGB),"png",bytes);
        return multipart("/api/returns")
            .file(new org.springframework.mock.web.MockMultipartFile("returnRequest","","application/json",json.getBytes(java.nio.charset.StandardCharsets.UTF_8)))
            .file(new org.springframework.mock.web.MockMultipartFile("images","test.png","image/png",bytes.toByteArray()));
    }

}
