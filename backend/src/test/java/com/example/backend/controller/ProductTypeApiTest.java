package com.example.backend.controller;

import com.example.backend.model.ProductType;
import com.example.backend.repositories.ProductTypeRepository;
import com.example.backend.repositories.UserRepository;
import com.example.backend.security.SecurityConfig;
import com.example.backend.services.impl.ProductTypeServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringJUnitWebConfig(ProductTypeApiTest.Config.class)
@TestPropertySource(properties = "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
class ProductTypeApiTest {

    @Configuration
    @EnableWebSecurity
    @EnableWebMvc
    @Import({SecurityConfig.class, ProductTypeController.class, ProductTypeServiceImpl.class,
            ProductTypeExceptionHandler.class})
    static class Config {
        @Bean
        ProductTypeRepository productTypes() {
            return mock(ProductTypeRepository.class);
        }

        @Bean
        UserRepository users() {
            return mock(UserRepository.class);
        }
    }

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private ProductTypeRepository productTypes;

    private MockMvc mvc;

    @BeforeEach
    void setup() {
        reset(productTypes);
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    }

    @Test
    void anonymousUsersCanReadListAndDetails() throws Exception {
        ProductType productType = new ProductType(1L, "Pens", true);
        when(productTypes.findAll()).thenReturn(List.of(productType));
        when(productTypes.findById(1L)).thenReturn(Optional.of(productType));

        mvc.perform(get("/api/product-types")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].productTypeID").value(1))
                .andExpect(jsonPath("$[0].name").value("Pens"))
                .andExpect(jsonPath("$[0].isActive").value(true));
        mvc.perform(get("/api/product-types/1")).andExpect(status().isOk())
                .andExpect(jsonPath("$.productTypeID").value(1))
                .andExpect(jsonPath("$.name").value("Pens"));
    }

    @Test
    void anonymousUsersCannotCreateUpdateOrDelete() throws Exception {
        for (MockHttpServletRequestBuilder request : List.of(
                post("/api/product-types"), put("/api/product-types/1"), delete("/api/product-types/1"))) {
            mvc.perform(request.contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Pens\"}"))
                    .andExpect(status().isUnauthorized());
        }
        verifyNoInteractions(productTypes);
    }

    @Test
    void customersCannotCreateUpdateOrDelete() throws Exception {
        for (MockHttpServletRequestBuilder request : List.of(
                post("/api/product-types"), put("/api/product-types/1"), delete("/api/product-types/1"))) {
            mvc.perform(request.with(jwt().authorities(new SimpleGrantedAuthority("ROLE_CUSTOMER")))
                            .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Pens\"}"))
                    .andExpect(status().isForbidden());
        }
        verifyNoInteractions(productTypes);
    }

    @Test
    void adminCanCreateUpdateAndSoftDelete() throws Exception {
        when(productTypes.saveAndFlush(any(ProductType.class))).thenAnswer(invocation -> {
            ProductType productType = invocation.getArgument(0);
            productType.setProductTypeID(1L);
            return productType;
        });
        mvc.perform(post("/api/product-types")
                        .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\" Pens \"}"))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.productTypeID").value(1))
                .andExpect(jsonPath("$.name").value("Pens"))
                .andExpect(jsonPath("$.isActive").value(true));

        ProductType productType = new ProductType(1L, "Pens", true);
        when(productTypes.findById(1L)).thenReturn(Optional.of(productType));
        mvc.perform(put("/api/product-types/1")
                        .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Paper\",\"isActive\":false}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Paper"))
                .andExpect(jsonPath("$.isActive").value(false));
        mvc.perform(delete("/api/product-types/1")
                        .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isNoContent()).andExpect(content().string(""));
        mvc.perform(get("/api/product-types/1")).andExpect(status().isOk())
                .andExpect(jsonPath("$.isActive").value(false));
        verify(productTypes, never()).deleteById(any());
        verify(productTypes, never()).delete(any(ProductType.class));
    }

    @Test
    void missingCategoryReturns404WithClearDetail() throws Exception {
        mvc.perform(get("/api/product-types/99")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.detail").value("Product type not found: 99"));
        mvc.perform(put("/api/product-types/99")
                        .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Pens\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/api/product-types/99")
                        .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isNotFound());
    }

    @Test
    void invalidNamesAndMalformedJsonReturn400() throws Exception {
        for (String body : List.of("{}", "{\"name\":null}", "{\"name\":\"   \"}",
                "{\"name\":\"" + "P".repeat(101) + "\"}", "{", "null",
                "{\"name\":\"Pens\",\"isActive\":{}}")) {
            mvc.perform(post("/api/product-types")
                            .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").isNotEmpty());
        }
        verifyNoInteractions(productTypes);
    }

    @Test
    void duplicateNamesReturn409OnCreateAndUpdate() throws Exception {
        when(productTypes.existsByNameIgnoreCase("Pens")).thenReturn(true);
        mvc.perform(post("/api/product-types")
                        .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Pens\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("Product type name already exists"));

        when(productTypes.findById(1L)).thenReturn(Optional.of(new ProductType(1L, "Paper", true)));
        when(productTypes.existsByNameIgnoreCaseAndProductTypeIDNot("Pens", 1L)).thenReturn(true);
        mvc.perform(put("/api/product-types/1")
                        .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Pens\"}"))
                .andExpect(status().isConflict());
        verify(productTypes, never()).saveAndFlush(any());
    }
}
