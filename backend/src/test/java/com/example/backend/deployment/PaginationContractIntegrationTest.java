package com.example.backend.deployment;

import com.example.backend.model.Product;
import com.example.backend.model.ProductType;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:pagination-contract;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
    "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
    "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.properties.hibernate.default_schema=store",
    "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "app.ai.enabled=false", "app.ai.vector-url=", "logging.level.root=WARN"
})
@AutoConfigureMockMvc
@Transactional
@WithMockUser(roles = "ADMIN")
class PaginationContractIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired WebApplicationContext context;
    final tools.jackson.databind.json.JsonMapper json = new tools.jackson.databind.json.JsonMapper();
    ProductType category;

    @BeforeEach void seed() {
        mvc = MockMvcBuilders.webAppContextSetup(context)
            .apply(org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity()).build();
        category = ProductType.builder().name("Pagination test").build();
        em.persist(category);
        for (String title : List.of("Audit Alpha", "Audit Beta", "Other")) {
            em.persist(Product.builder().title(title).handle(title.replace(' ', '-'))
                .price(BigDecimal.TEN).productType(category).build());
        }
        em.flush();
    }

    @Test void everyPagedEndpointKeepsTheLegacyEnvelope() throws Exception {
        for (String endpoint : List.of("/api/products", "/api/products/search", "/api/admin/products",
                "/api/admin/orders", "/api/admin/returns", "/api/admin/reviews", "/api/admin/users",
                "/api/admin/dashboard/orders?startDate=2020-01-01&endDate=2030-01-01",
                "/api/admin/dashboard/low-stock")) {
            String body = mvc.perform(get(endpoint + (endpoint.contains("?") ? "&" : "?") + "page=0&size=2"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.number").value(0)).andExpect(jsonPath("$.size").value(2))
                .andExpect(jsonPath("$.first").value(true)).andExpect(jsonPath("$.last").isBoolean())
                .andExpect(jsonPath("$.empty").isBoolean()).andExpect(jsonPath("$.numberOfElements").isNumber())
                .andExpect(jsonPath("$.totalElements").isNumber()).andExpect(jsonPath("$.totalPages").isNumber())
                .andExpect(jsonPath("$.pageable.pageNumber").value(0)).andExpect(jsonPath("$.pageable.pageSize").value(2))
                .andExpect(jsonPath("$.pageable.offset").value(0)).andExpect(jsonPath("$.pageable.paged").value(true))
                .andExpect(jsonPath("$.pageable.unpaged").value(false))
                .andExpect(jsonPath("$.pageable.sort.sorted").isBoolean())
                .andExpect(jsonPath("$.sort.sorted").isBoolean()).andExpect(jsonPath("$.sort.unsorted").isBoolean())
                .andExpect(jsonPath("$.sort.empty").isBoolean()).andReturn().getResponse().getContentAsString();
            var keys = StreamSupport.stream(json.readTree(body).properties().spliterator(), false)
                .map(java.util.Map.Entry::getKey).collect(Collectors.toSet());
            assertThat(keys).isEqualTo(Set.of("content", "pageable", "sort", "number", "size", "totalElements",
                "totalPages", "first", "last", "empty", "numberOfElements"));
        }
    }

    @Test void searchFilterSortAndZeroBasedSecondPageKeepTheirMeaning() throws Exception {
        mvc.perform(get("/api/products/search").param("catalog", "true").param("keyword", "Audit")
                .param("productTypeID", category.getProductTypeID().toString()).param("sort", "title,desc")
                .param("page", "1").param("size", "1"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].title").value("Audit Alpha"))
            .andExpect(jsonPath("$.number").value(1)).andExpect(jsonPath("$.size").value(1))
            .andExpect(jsonPath("$.numberOfElements").value(1)).andExpect(jsonPath("$.totalElements").value(2))
            .andExpect(jsonPath("$.totalPages").value(2)).andExpect(jsonPath("$.first").value(false))
            .andExpect(jsonPath("$.last").value(true)).andExpect(jsonPath("$.empty").value(false))
            .andExpect(jsonPath("$.pageable.offset").value(1));
        mvc.perform(get("/api/products/search?keyword=missing-audit-product&page=0&size=2"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.content").isEmpty())
            .andExpect(jsonPath("$.empty").value(true)).andExpect(jsonPath("$.totalPages").value(0));
    }

    @Test void legacyOrderAndReturnArraysAndAdminSecurityArePreserved() throws Exception {
        mvc.perform(get("/api/admin/orders")).andExpect(status().isOk()).andExpect(jsonPath("$").isArray());
        mvc.perform(get("/api/admin/returns")).andExpect(status().isOk()).andExpect(jsonPath("$").isArray());
        mvc.perform(get("/api/admin/products").with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors
            .user("customer").roles("CUSTOMER"))).andExpect(status().isForbidden());
    }

    @Test void missingProductsAndInvalidFiltersHaveDistinctSafeHttpErrors() throws Exception {
        for (String path : List.of("/api/products/99999999", "/api/products/handle/missing-audit-product")) {
            mvc.perform(get(path)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Không tìm thấy sản phẩm"))
                .andExpect(jsonPath("$.trace").doesNotExist());
        }
        mvc.perform(get("/api/products/not-a-number")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/products/search?catalog=true&minPrice=-1")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/products?sort=missingField,desc")).andExpect(status().isBadRequest());
    }
}
