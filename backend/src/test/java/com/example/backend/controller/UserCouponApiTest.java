package com.example.backend.controller;

import com.example.backend.model.*;
import com.example.backend.repositories.*;
import com.example.backend.security.SecurityConfig;
import com.example.backend.services.impl.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import java.util.List;
import java.util.Optional;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * Runs actual security filters, method authorization, DTO validation and JSON
 * serialization without SQL Server.
 */
@SpringJUnitWebConfig(UserCouponApiTest.Config.class)
@TestPropertySource(properties = "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
class UserCouponApiTest {
    @Configuration
    @org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
    @EnableWebMvc
    @Import({ SecurityConfig.class, UserController.class, CouponController.class,
            UserServiceImpl.class, CouponServiceImpl.class, AccountCouponExceptionHandler.class,
            com.example.backend.security.JwtTokenService.class })
    static class Config {
        @Bean
        UserRepository users() {
            return mock(UserRepository.class);
        }

        @Bean
        CouponRepository coupons() {
            return mock(CouponRepository.class);
        }

        @Bean
        EntityManager entityManager() {
            return mock(EntityManager.class);
        }
    }

    @Autowired
    WebApplicationContext context;
    @Autowired
    UserRepository users;
    @Autowired
    com.example.backend.security.JwtTokenService tokenService;
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        reset(users);
        User user = User.builder().userID(1L).username("customer").email("test@example.com")
                .passwordHash("must-never-be-returned").build();
        when(users.findByUsername("customer")).thenReturn(Optional.of(user));
        when(users.findAll()).thenReturn(List.of(user));
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    }

    @Test
    void signedJwtIsRejectedAfterAccountLockAndWorksAfterUnlock() throws Exception {
        User customer = users.findByUsername("customer").orElseThrow();
        String bearer = "Bearer " + tokenService.issue(customer);
        mvc.perform(get("/api/users/me").header("Authorization", bearer)).andExpect(status().isOk());
        customer.setIsActive(false);
        mvc.perform(get("/api/users/me").header("Authorization", bearer)).andExpect(status().isUnauthorized());
        customer.setIsActive(true);
        mvc.perform(get("/api/users/me").header("Authorization", bearer)).andExpect(status().isOk());
    }

    @Test
    void signedAdminClaimDoesNotOverrideCurrentDatabaseRole() throws Exception {
        User customer = users.findByUsername("customer").orElseThrow();
        customer.setRole(UserRole.ADMIN);
        String bearer = "Bearer " + tokenService.issue(customer);
        customer.setRole(UserRole.CUSTOMER);
        mvc.perform(get("/api/users").header("Authorization", bearer)).andExpect(status().isForbidden());
    }

    @Test
    void anonymousCallsRequireAuthentication() throws Exception {
        mvc.perform(get("/api/users/me")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/coupons/validate").contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"SAVE10\",\"orderValue\":100}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void customersCannotReadAdminDataOrManageCoupons() throws Exception {
        for (String path : List.of("/api/users", "/api/users/1", "/api/coupons", "/api/coupons/1")) {
            mvc.perform(get(path).with(jwt().authorities(new SimpleGrantedAuthority("ROLE_CUSTOMER"))))
                    .andExpect(status().isForbidden());
        }
        mvc.perform(patch("/api/users/1/status").with(jwt()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"isActive\":false}")).andExpect(status().isForbidden());
        mvc.perform(delete("/api/coupons/1").with(jwt())).andExpect(status().isForbidden());
    }

    @Test
    void ownProfileUsesPrincipalAndExcludesPassword() throws Exception {
        mvc.perform(get("/api/users/me").with(jwt().jwt(token -> token.subject("customer"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.username").value("customer"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.orders").doesNotExist());
    }

    @Test
    void adminsCanReadUserListWithoutCredentials() throws Exception {
        mvc.perform(get("/api/users").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].userID").value(1))
                .andExpect(jsonPath("$[0].passwordHash").doesNotExist());
    }

    @Test
    void invalidProfileAndPasswordReturnFieldErrors() throws Exception {
        mvc.perform(put("/api/users/me").with(jwt()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"invalid\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.email").exists());
        mvc.perform(put("/api/users/me/password").with(jwt()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"oldPassword\":\"old\",\"newPassword\":\"short\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.newPassword").exists());
    }

    @Test
    void invalidCouponFieldsAndMalformedEnumsReturn400() throws Exception {
        mvc.perform(post("/api/coupons").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.code").exists());
        mvc.perform(post("/api/coupons").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN")))
                .contentType(MediaType.APPLICATION_JSON).content("{\"discountType\":\"INVALID\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").exists());
    }

    @Test
    void customerCanPreviewButCannotUseNegativeAmount() throws Exception {
        mvc.perform(post("/api/coupons/validate").with(jwt()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"UNKNOWN\",\"orderValue\":100}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("Ma giam gia khong hop le"));
        mvc.perform(post("/api/coupons/validate").with(jwt()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"SAVE10\",\"orderValue\":-1}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.orderValue").exists());
    }
}
