package com.example.backend.deployment;

import com.example.backend.model.*;
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
        "spring.datasource.url=jdbc:h2:mem:admin-reviews;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
        "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.properties.hibernate.default_schema=store",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.mail.username=test@example.test", "spring.mail.password=", "app.mail.from=test@example.test",
        "app.ai.enabled=false", "app.ai.vector-url=", "logging.level.root=WARN", "app.admin.reviews.max-export-rows=20"
})
@AutoConfigureMockMvc
@Transactional
class AdminReviewsApiTest {
    @Autowired MockMvc mvc;
    @Autowired WebApplicationContext context;
    @Autowired EntityManager em;
    @MockitoBean ReviewImageStorage storage;
    User alice, bob;
    Product pen, notebook;

    @BeforeEach void setup() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        alice = User.builder().username("alice").fullName("Nguyễn An").email("alice@example.test").passwordHash("private-test-hash").build(); em.persist(alice);
        bob = User.builder().username("bob").fullName("Trần Bình").email("bob@example.test").passwordHash("private-test-hash").build(); em.persist(bob);
        pen = Product.builder().title("Bút gel tiếng Việt").build(); pen.getImages().addAll(List.of("https://example.test/pen.png", "https://example.test/second.png")); em.persist(pen);
        notebook = Product.builder().title("Sổ tay").build(); em.persist(notebook);
    }

    @Test void anonymousCannotReadExportOrDelete() throws Exception {
        for (String path : List.of("", "/statistics", "/export", "/1")) mvc.perform(get("/api/admin/reviews" + path)).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/admin/reviews/1")).andExpect(status().isUnauthorized());
    }

    @Test @WithMockUser(roles = "CUSTOMER") void customersCannotReadExportOrDelete() throws Exception {
        for (String path : List.of("", "/statistics", "/export", "/1")) mvc.perform(get("/api/admin/reviews" + path)).andExpect(status().isForbidden());
        mvc.perform(delete("/api/admin/reviews/1")).andExpect(status().isForbidden());
    }

    @Test @WithMockUser(roles = "ADMIN") void filtersUseFullDatasetAndDatesAreInclusive() throws Exception {
        Review first = review(alice, pen, 5, "Tốt", "2026-11-01T00:00:00");
        Review latest = review(bob, pen, 2, "Cần cải thiện", "2026-11-23T23:59:59");
        review(alice, notebook, 4, "Đẹp", "2026-11-24T00:00:00");
        em.flush(); em.clear();
        mvc.perform(get("/api/admin/reviews?size=1&startDate=2026-11-01&endDate=2026-11-23"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content[0].review.reviewID").value(latest.getReviewID()));
        mvc.perform(get("/api/admin/reviews?size=1&sort=OLDEST"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].review.reviewID").value(first.getReviewID()));
        mvc.perform(get("/api/admin/reviews?search=Nguyễn&rating=5"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].review.productTitle").value("Bút gel tiếng Việt"));
        mvc.perform(get("/api/admin/reviews?search=GEL"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2));
        mvc.perform(get("/api/admin/reviews/statistics?endDate=2026-11-23"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalReviews").value(2))
                .andExpect(jsonPath("$.averageRating").value(3.5)).andExpect(jsonPath("$.fiveStarReviews").value(1))
                .andExpect(jsonPath("$.lowStarReviews").value(1));
    }

    @Test @WithMockUser(roles = "ADMIN") void pageQueriesAreBoundedAndDetailContainsOnlyRealFields() throws Exception {
        for (int i = 0; i < 15; i++) {
            Review review = review(alice, pen, 5, "Nội dung " + i, "2026-11-23T12:00:00");
            review.getImages().add(new ReviewImage("https://example.test/review-" + i + ".png", "private-id-" + i));
        }
        em.flush(); em.clear();
        var stats = em.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics(); stats.clear();
        mvc.perform(get("/api/admin/reviews?size=10"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(15))
                .andExpect(jsonPath("$.content.length()").value(10))
                .andExpect(jsonPath("$.content[0].review.productImage").value("https://example.test/pen.png"))
                .andExpect(jsonPath("$.content[0].images.length()").value(1))
                .andExpect(jsonPath("$.content[0].images[0].publicId").doesNotExist());
        assertThat(stats.getPrepareStatementCount()).isEqualTo(3);
        Long id = em.createQuery("select max(r.reviewID) from Review r", Long.class).getSingleResult();
        mvc.perform(get("/api/admin/reviews/" + id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.review.username").value("alice"))
                .andExpect(jsonPath("$.review.comment").value("Nội dung 14"))
                .andExpect(jsonPath("$.images[0].imagePosition").value(0))
                .andExpect(jsonPath("$.review.passwordHash").doesNotExist());
        mvc.perform(get("/api/admin/reviews?page=1&size=10"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content.length()").value(5));
        mvc.perform(get("/api/admin/reviews/999999")).andExpect(status().isNotFound());
        verifyNoInteractions(storage);
    }

    @Test @WithMockUser(roles = "ADMIN") void emptyAndInvalidFiltersDoNotBecomeFakeStatistics() throws Exception {
        mvc.perform(get("/api/admin/reviews/statistics")).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalReviews").value(0)).andExpect(jsonPath("$.averageRating").isEmpty());
        mvc.perform(get("/api/admin/reviews")).andExpect(status().isOk()).andExpect(jsonPath("$.content").isEmpty());
        mvc.perform(get("/api/admin/reviews/export")).andExpect(status().isNotFound());
        for (String query : List.of("rating=0", "rating=6", "sort=HACK", "page=-1", "size=51", "search=" + "x".repeat(151),
                "startDate=2026-11-23&endDate=2026-11-01", "startDate=bad", "endDate=9999-12-31")) {
            mvc.perform(get("/api/admin/reviews?" + query)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.trace").doesNotExist());
        }
    }

    @Test @WithMockUser(roles = "ADMIN") void searchTreatsSqlWildcardsAsLiteralUserText() throws Exception {
        review(alice, pen, 5, "Tốt", "2026-11-23T12:00:00"); em.flush();
        for (String keyword : List.of("%", "_", "' or 1=1 --")) mvc.perform(get("/api/admin/reviews").param("search", keyword))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test @WithMockUser(roles = "ADMIN") void excelExportsAllFilteredRowsWithVietnameseFormattingAndStringCells() throws Exception {
        Review first = null;
        for (int i = 0; i < 12; i++) {
            Review review = review(alice, pen, 5, "=HYPERLINK(\"https://evil.test\",\"Bút tốt tiếng Việt\")", "2026-11-23T12:00:00");
            review.getImages().add(new ReviewImage("https://example.test/review.png", "private-cloudinary-id"));
            if (first == null) first = review;
        }
        review(bob, notebook, 1, "Không được xuất", "2026-11-23T12:00:00"); em.flush(); em.clear();
        var response = mvc.perform(get("/api/admin/reviews/export?rating=5&search=gel&sort=OLDEST"))
                .andExpect(status().isOk()).andExpect(content().contentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.matchesPattern("attachment; filename=\"stationery-reviews-\\d{4}-\\d{2}-\\d{2}\\.xlsx\"")))
                .andReturn().getResponse();
        try (var book = new XSSFWorkbook(new ByteArrayInputStream(response.getContentAsByteArray()))) {
            var sheet = book.getSheetAt(0);
            assertThat(sheet.getLastRowNum()).isEqualTo(12); // More than the default UI page size.
            assertThat(sheet.getRow(1).getCell(0).getStringCellValue()).isEqualTo(first.getReviewID().toString());
            assertThat(sheet.getRow(1).getCell(1).getStringCellValue()).isEqualTo("Bút gel tiếng Việt");
            assertThat(sheet.getRow(1).getCell(5).getCellType()).isEqualTo(CellType.STRING);
            assertThat(sheet.getRow(1).getCell(5).getStringCellValue()).startsWith("=HYPERLINK");
            assertThat(sheet.getRow(1).getCell(6).getStringCellValue()).isEqualTo("23/11/2026 12:00");
            assertThat(sheet.getRow(1).getCell(7).getStringCellValue()).isEqualTo("https://example.test/review.png");
            assertThat(sheet.getPaneInformation().isFreezePane()).isTrue();
            assertThat(sheet.getCTWorksheet().isSetAutoFilter()).isTrue();
            assertThat(book.getFontAt(sheet.getRow(0).getCell(0).getCellStyle().getFontIndex()).getBold()).isTrue();
            assertThat(sheet.getRow(1).getCell(5).getCellStyle().getWrapText()).isTrue();
            assertThat(sheet.getRow(0).getLastCellNum()).isEqualTo((short) 8);
            String cells = sheet.getCTWorksheet().xmlText();
            assertThat(cells).doesNotContain("private-test-hash", "private-cloudinary-id", "accessToken");
        }
        verifyNoInteractions(storage);
    }

    @Test @WithMockUser(roles = "ADMIN") void exportRejectsOversizedResultsInsteadOfSilentlyTruncating() throws Exception {
        for (int i = 0; i < 21; i++) review(alice, pen, 5, "Tốt", "2026-11-23T12:00:00"); em.flush();
        mvc.perform(get("/api/admin/reviews/export")).andExpect(status().isPayloadTooLarge());
    }

    @Test @WithMockUser(roles = "ADMIN") void adminDeletionUpdatesProductAggregatesAndPublicReviews() throws Exception {
        Review removed = review(alice, pen, 5, "Xóa", "2026-11-23T12:00:00");
        review(bob, pen, 1, "Giữ lại", "2026-11-22T12:00:00"); em.flush(); em.clear();
        mvc.perform(delete("/api/admin/reviews/" + removed.getReviewID())).andExpect(status().isNoContent());
        mvc.perform(get("/api/admin/reviews/statistics")).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalReviews").value(1)).andExpect(jsonPath("$.averageRating").value(1));
        mvc.perform(get("/api/products/" + pen.getProductID() + "/reviews")).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1)).andExpect(jsonPath("$[0].comment").value("Giữ lại"));
        em.flush(); em.clear();
        assertThat(em.find(Product.class, pen.getProductID()).getReviewCount()).isEqualTo(1);
        assertThat(em.find(Product.class, pen.getProductID()).getRatingAverage()).isEqualByComparingTo("1.00");
        mvc.perform(delete("/api/admin/reviews/" + removed.getReviewID())).andExpect(status().isNotFound());
    }

    private Review review(User user, Product product, int rating, String text, String date) {
        Review result = Review.builder().user(user).product(product).rating(rating).comment(text).reviewDate(LocalDateTime.parse(date)).build();
        em.persist(result); return result;
    }
}
