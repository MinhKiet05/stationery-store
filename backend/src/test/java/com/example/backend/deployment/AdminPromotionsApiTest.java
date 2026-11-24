package com.example.backend.deployment;

import com.example.backend.model.*;
import com.example.backend.dto.coupon.CouponResponse;
import java.math.BigDecimal;
import java.time.LocalDate;
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
        "spring.datasource.url=jdbc:h2:mem:admin-promotions;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
        "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.properties.hibernate.default_schema=store",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.mail.username=test@example.test", "spring.mail.password=", "app.mail.from=test@example.test",
        "app.ai.enabled=false", "app.ai.vector-url=", "logging.level.root=WARN", "app.admin.promotions.max-export-rows=20"
})
@AutoConfigureMockMvc
@Transactional
class AdminPromotionsApiTest {
    @Autowired MockMvc mvc;
    @Autowired WebApplicationContext context;
    @Autowired EntityManager em;
    @MockitoBean ReviewImageStorage storage;

    @BeforeEach void setup() { mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build(); }

    @Test void anonymousCannotAccessQueriesOrMutations() throws Exception {
        for (String path : List.of("/api/admin/promotions", "/api/admin/promotions/statistics", "/api/admin/promotions/export", "/api/coupons/1"))
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/coupons").contentType("application/json").content(definition("NEW"))).andExpect(status().isUnauthorized());
    }
    @Test @WithMockUser(roles="CUSTOMER") void customerCannotAdministerButCanPreview() throws Exception {
        Coupon c = coupon("CUSTOMER"); em.flush();
        for (String path : List.of("/api/admin/promotions", "/api/admin/promotions/statistics", "/api/admin/promotions/export", "/api/coupons", "/api/coupons/" + c.getCouponID()))
            mvc.perform(get(path)).andExpect(status().isForbidden());
        mvc.perform(post("/api/coupons").contentType("application/json").content(definition("NEW"))).andExpect(status().isForbidden());
        mvc.perform(put("/api/coupons/" + c.getCouponID()).contentType("application/json").content(definition("CUSTOMER"))).andExpect(status().isForbidden());
        mvc.perform(delete("/api/coupons/" + c.getCouponID())).andExpect(status().isForbidden());
        mvc.perform(post("/api/coupons/validate").contentType("application/json").content("{\"code\":\"customer\",\"orderValue\":100000}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.discountAmount").value(10000));
    }
    @Test @WithMockUser(roles="ADMIN") void aggregateUsesFullFilteredDatasetAndTwoQueriesOnly() throws Exception {
        for (int i=0;i<12;i++) { Coupon c=coupon("ACTIVE" + i); c.setUsedCount(i); }
        Coupon expired=coupon("EXPIRED"); expired.setEndDate(LocalDate.now().minusDays(1));
        em.flush(); em.clear();
        var statistics=em.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics(); statistics.clear();
        mvc.perform(get("/api/admin/promotions?size=10"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(13)).andExpect(jsonPath("$.content.length()").value(10))
            .andExpect(jsonPath("$.content[0].stateToken").isString());
        assertThat(statistics.getPrepareStatementCount()).isEqualTo(2);
        mvc.perform(get("/api/admin/promotions/statistics"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.totalCoupons").value(13)).andExpect(jsonPath("$.activeCoupons").value(12))
            .andExpect(jsonPath("$.expiredCoupons").value(1)).andExpect(jsonPath("$.totalUses").value(66));
        mvc.perform(get("/api/admin/promotions?page=1&size=10")).andExpect(status().isOk()).andExpect(jsonPath("$.content.length()").value(3));
        mvc.perform(get("/api/admin/promotions/statistics?search=ACTIVE&status=ACTIVE&discountType=PERCENTAGE"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.totalCoupons").value(12));
    }
    @Test @WithMockUser(roles="ADMIN") void derivedStatusesHaveSamePriorityAndInclusiveDatesAsCheckout() throws Exception {
        Coupon active=coupon("TODAY"); active.setStartDate(LocalDate.now()); active.setEndDate(LocalDate.now());
        Coupon expired=coupon("EXPIRED"); expired.setEndDate(LocalDate.now().minusDays(1));
        Coupon future=coupon("FUTURE"); future.setStartDate(LocalDate.now().plusDays(1));
        Coupon disabled=coupon("DISABLED"); disabled.setIsActive(false); disabled.setEndDate(LocalDate.now().minusDays(1));
        Coupon exhausted=coupon("EXHAUSTED"); exhausted.setUsageLimit(2); exhausted.setUsedCount(2);
        em.flush();
        for (String state:List.of("ACTIVE","EXPIRED","NOT_STARTED","DISABLED","EXHAUSTED")) {
            mvc.perform(get("/api/admin/promotions").param("status",state)).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.content[0].status").value(state));
            mvc.perform(get("/api/admin/promotions/statistics").param("status",state)).andExpect(status().isOk()).andExpect(jsonPath("$.totalCoupons").value(1));
        }
    }
    @Test @WithMockUser(roles="ADMIN") void searchSortAndEmptyResultsAreRealAndWildcardsLiteral() throws Exception {
        Coupon a=coupon("A_MATCH"); coupon("ZMATCH"); em.flush();
        mvc.perform(get("/api/admin/promotions?search=match&sort=CODE_ASC&size=1"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.content[0].couponID").value(a.getCouponID()));
        mvc.perform(get("/api/admin/promotions?search=_")).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        for (String term:List.of("%","' or 1=1 --")) mvc.perform(get("/api/admin/promotions").param("search",term))
            .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
        mvc.perform(get("/api/admin/promotions/statistics?search=NONE")).andExpect(status().isOk()).andExpect(jsonPath("$.totalUses").value(0));
        mvc.perform(get("/api/admin/promotions/export?search=NONE")).andExpect(status().isNotFound());
    }
    @Test @WithMockUser(roles="ADMIN") void createsNormalizesAndRejectsDuplicates() throws Exception {
        mvc.perform(post("/api/coupons").contentType("application/json").content(definition("new_code")))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.code").value("NEW_CODE")).andExpect(jsonPath("$.usedCount").value(0));
        mvc.perform(post("/api/coupons").contentType("application/json").content(definition("NEW_CODE"))).andExpect(status().isConflict());
    }
    @Test @WithMockUser(roles="ADMIN") void validatesDefinitionsAndFiltersWithoutLeakingDiagnostics() throws Exception {
        for (String body:List.of(definition(""),definition("bad code"),definition("X").replace("\"discountValue\":10","\"discountValue\":101"),
                definition("X").replace("\"discountValue\":10","\"discountValue\":0"),definition("X").replace("\"minOrderValue\":0","\"minOrderValue\":-1"),
                definition("X").replace("\"usageLimit\":null","\"usageLimit\":0"), definition("X").replace("\"startDate\":null,\"endDate\":null","\"startDate\":\"2026-12-01\",\"endDate\":\"2026-11-01\"")))
            mvc.perform(post("/api/coupons").contentType("application/json").content(body)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.trace").doesNotExist());
        for (String query:List.of("status=HACK","discountType=SHIPPING","sort=NEWEST","page=-1","size=51","search="+"x".repeat(51)))
            mvc.perform(get("/api/admin/promotions?"+query)).andExpect(status().isBadRequest());
        mvc.perform(get("/api/coupons/999999")).andExpect(status().isNotFound());
    }
    @Test @WithMockUser(roles="ADMIN") void staleEditsAndCheckoutCountChangesCannotBeOverwritten() throws Exception {
        Coupon c=coupon("LOCKED"); em.flush();
        String token=CouponResponse.from(c).stateToken();
        c.setUsedCount(3); em.flush();
        mvc.perform(put("/api/coupons/"+c.getCouponID()).contentType("application/json").content(definition("LOCKED").replace("}",",\"expectedState\":\""+token+"\"}")))
            .andExpect(status().isConflict());
        em.refresh(c); assertThat(c.getUsedCount()).isEqualTo(3);
    }
    @Test @WithMockUser(roles="ADMIN") void freshSnapshotCanBeUsedAgainAfterDatabaseDecimalScaleRoundTrip() throws Exception {
        Coupon c=coupon("FRESH"); em.flush();
        String token=CouponResponse.from(c).stateToken();
        mvc.perform(put("/api/coupons/"+c.getCouponID()).contentType("application/json")
                .content(definition("FRESH").replace("}",",\"expectedState\":\""+token+"\"}")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.stateToken").value(token));
        em.flush(); em.clear();
        mvc.perform(put("/api/coupons/"+c.getCouponID()).contentType("application/json")
                .content(definition("FRESH").replace("}",",\"expectedState\":\""+token+"\"}")))
            .andExpect(status().isOk());
    }
    @Test @WithMockUser(roles="ADMIN") void editsPreserveHistoryCountersAndSoftDeleteNeverDeletesOrders() throws Exception {
        Coupon c=coupon("HISTORY"); c.setUsedCount(2);
        User user=User.builder().username("coupon-user").email("coupon@example.test").passwordHash("test-hash").build(); em.persist(user);
        Order order=Order.builder().user(user).coupon(c).status(OrderStatus.PENDING).discountAmount(BigDecimal.TEN).totalAmount(BigDecimal.valueOf(90)).build(); em.persist(order); em.flush();
        mvc.perform(put("/api/coupons/"+c.getCouponID()).contentType("application/json").content(definition("HISTORY").replace("\"discountValue\":10","\"discountValue\":20")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.usedCount").value(2)).andExpect(jsonPath("$.discountValue").value(20));
        mvc.perform(delete("/api/coupons/"+c.getCouponID())).andExpect(status().isNoContent());
        em.flush(); em.clear();
        assertThat(em.find(Coupon.class,c.getCouponID()).getIsActive()).isFalse();
        assertThat(em.find(Order.class,order.getOrderID()).getDiscountAmount()).isEqualByComparingTo("10");
        mvc.perform(get("/api/coupons/"+c.getCouponID())).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("DISABLED"));
    }
    @Test @WithMockUser(roles="ADMIN") void usageLimitCannotBeLessThanAlreadyUsed() throws Exception {
        Coupon c=coupon("USED"); c.setUsedCount(3); em.flush();
        mvc.perform(put("/api/coupons/"+c.getCouponID()).contentType("application/json").content(definition("USED").replace("\"usageLimit\":null","\"usageLimit\":2")))
            .andExpect(status().isConflict());
        em.refresh(c); assertThat(c.getUsageLimit()).isNull();
    }
    @Test @WithMockUser(roles="CUSTOMER") void previewPreservesExpiryUsageMinimumAndDiscountCap() throws Exception {
        Coupon c=coupon("PREVIEW"); c.setDiscountType(DiscountType.FIXED_AMOUNT); c.setDiscountValue(BigDecimal.valueOf(200000)); em.flush();
        String body="{\"code\":\"PREVIEW\",\"orderValue\":100000}";
        mvc.perform(post("/api/coupons/validate").contentType("application/json").content(body)).andExpect(status().isOk())
            .andExpect(jsonPath("$.discountAmount").value(100000)).andExpect(jsonPath("$.totalAmount").value(0));
        c.setUsageLimit(1); c.setUsedCount(1); em.flush();
        mvc.perform(post("/api/coupons/validate").contentType("application/json").content(body)).andExpect(status().isConflict());
        c.setUsedCount(0); c.setEndDate(LocalDate.now().minusDays(1)); em.flush();
        mvc.perform(post("/api/coupons/validate").contentType("application/json").content(body)).andExpect(status().isBadRequest());
        c.setEndDate(null); c.setStartDate(LocalDate.now().plusDays(1)); em.flush();
        mvc.perform(post("/api/coupons/validate").contentType("application/json").content(body)).andExpect(status().isBadRequest());
        c.setStartDate(null); c.setMinOrderValue(BigDecimal.valueOf(200000)); em.flush();
        mvc.perform(post("/api/coupons/validate").contentType("application/json").content(body)).andExpect(status().isBadRequest());
    }
    @Test @WithMockUser(roles="ADMIN") void excelHasAllFilteredRowsNumericMoneyDatesAndSafeStrings() throws Exception {
        for(int i=0;i<12;i++) coupon("EXPORT"+i);
        coupon("OTHER").setDiscountType(DiscountType.FIXED_AMOUNT);
        Coupon first=coupon("=FORMULA"); first.setStartDate(LocalDate.now()); first.setEndDate(LocalDate.now()); em.flush();
        var response=mvc.perform(get("/api/admin/promotions/export?discountType=PERCENTAGE&sort=CODE_ASC"))
            .andExpect(status().isOk()).andExpect(content().contentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
            .andExpect(header().string("Content-Disposition",org.hamcrest.Matchers.matchesPattern("attachment; filename=\"stationery-promotions-\\d{4}-\\d{2}-\\d{2}\\.xlsx\""))).andReturn().getResponse();
        try(var book=new XSSFWorkbook(new ByteArrayInputStream(response.getContentAsByteArray()))) {
            var sheet=book.getSheetAt(0); assertThat(sheet.getLastRowNum()).isEqualTo(13);
            assertThat(sheet.getPaneInformation().isFreezePane()).isTrue(); assertThat(sheet.getCTWorksheet().isSetAutoFilter()).isTrue();
            assertThat(book.getFontAt(sheet.getRow(0).getCell(0).getCellStyle().getFontIndex()).getBold()).isTrue();
            assertThat(sheet.getRow(0).getCell(0).getStringCellValue()).isEqualTo("M\u00e3 voucher");
            var row=sheet.getRow(1); assertThat(row.getCell(0).getCellType()).isEqualTo(CellType.STRING); assertThat(row.getCell(0).getStringCellValue()).isEqualTo("=FORMULA");
            assertThat(row.getCell(2).getCellType()).isEqualTo(CellType.NUMERIC); assertThat(row.getCell(3).getCellStyle().getDataFormatString()).contains("\u20ab");
            assertThat(row.getCell(4).getCellStyle().getDataFormatString()).isEqualTo("dd/MM/yyyy");
            assertThat(row.getCell(4).getLocalDateTimeCellValue().toLocalDate()).isEqualTo(LocalDate.now());
        }
        verifyNoInteractions(storage);
    }
    @Test @WithMockUser(roles="ADMIN") void oversizedExportIsRejectedInsteadOfSilentlyTruncated() throws Exception {
        for(int i=0;i<21;i++) coupon("BIG"+i); em.flush();
        mvc.perform(get("/api/admin/promotions/export")).andExpect(status().isPayloadTooLarge()).andExpect(jsonPath("$.trace").doesNotExist());
    }
    private Coupon coupon(String code) {
        Coupon c=Coupon.builder().code(code).discountType(DiscountType.PERCENTAGE).discountValue(BigDecimal.TEN).minOrderValue(BigDecimal.ZERO).build(); em.persist(c); return c;
    }
    private String definition(String code) {
        return "{\"code\":\""+code+"\",\"discountType\":\"PERCENTAGE\",\"discountValue\":10,\"minOrderValue\":0,\"startDate\":null,\"endDate\":null,\"usageLimit\":null,\"isActive\":true}";
    }
}
