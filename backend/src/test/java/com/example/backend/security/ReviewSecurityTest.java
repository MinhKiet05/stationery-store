package com.example.backend.security;

import com.example.backend.controller.ProductController;
import com.example.backend.controller.ProductReviewController;
import com.example.backend.dto.review.ReviewRequest;
import com.example.backend.model.User;
import com.example.backend.model.UserRole;
import com.example.backend.repositories.UserRepository;
import com.example.backend.services.ProductService;
import com.example.backend.services.ReviewService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest({ProductReviewController.class, ProductController.class})
@Import({SecurityConfig.class, ProductReviewController.class, ProductController.class,
        ReviewSecurityTest.TestWebSecurity.class})
@TestPropertySource(properties = {
        "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "app.jwt.issuer=stationery-store",
        "spring.mail.host=localhost"
})
class ReviewSecurityTest {
    @Configuration
    @EnableWebSecurity
    static class TestWebSecurity {}

    @Autowired MockMvc mvc;
    @Autowired JwtEncoder encoder;
    @MockitoBean ReviewService reviews;
    @MockitoBean ProductService products;
    @MockitoBean UserRepository users;

    @Test
    void anonymousCustomerCannotCreateReview() throws Exception {
        mvc.perform(post("/api/products/1/reviews")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rating\":5,\"comment\":\"Good product\"}"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(reviews);
    }

    @Test
    void authenticatedCustomerReachesBusinessValidation() throws Exception {
        customer();
        when(reviews.create(eq(1L), eq("buyer"), any(ReviewRequest.class)))
                .thenThrow(new ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,
                        "Chinh sach danh gia chua duoc chot"));

        mvc.perform(post("/api/products/1/reviews")
                        .header("Authorization", "Bearer " + token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rating\":5,\"comment\":\"Good product\"}"))
                .andExpect(status().isConflict());
        verify(reviews).create(eq(1L), eq("buyer"), any(ReviewRequest.class));
    }

    @Test
    void customerStillCannotManageProducts() throws Exception {
        customer();
        String authorization = "Bearer " + token();
        mvc.perform(post("/api/products")
                        .header("Authorization", authorization)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/products/1")
                        .header("Authorization", authorization)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/products/1")
                        .header("Authorization", authorization))
                .andExpect(status().isForbidden());
        verifyNoInteractions(products);
    }

    private void customer() {
        when(users.findByUsername("buyer"))
                .thenReturn(Optional.of(User.builder().username("buyer").role(UserRole.CUSTOMER)
                        .isActive(true).build()));
    }

    private String token() {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder().subject("buyer").issuer("stationery-store")
                .issuedAt(now).expiresAt(now.plusSeconds(600)).build();
        return encoder.encode(JwtEncoderParameters.from(claims)).getTokenValue();
    }
}
