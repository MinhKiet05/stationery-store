package com.example.backend.security;

import com.example.backend.controller.AdminReturnRequestController;
import com.example.backend.controller.ReturnRequestController;
import com.example.backend.dto.returns.CreateReturnRequest;
import com.example.backend.model.User;
import com.example.backend.model.UserRole;
import com.example.backend.repositories.UserRepository;
import com.example.backend.services.ReturnRequestService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest({ReturnRequestController.class, AdminReturnRequestController.class})
@Import({SecurityConfig.class, ReturnRequestController.class, AdminReturnRequestController.class,
        ReturnSecurityTest.TestWebSecurity.class})
@TestPropertySource(properties = {
        "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "app.jwt.issuer=stationery-store",
        "spring.mail.host=localhost"
})
class ReturnSecurityTest {
    @Configuration @EnableWebSecurity static class TestWebSecurity {}
    @Autowired MockMvc mvc;
    @Autowired JwtEncoder encoder;
    @MockitoBean ReturnRequestService service;
    @MockitoBean UserRepository users;

    @Test
    void anonymousCannotCreate() throws Exception {
        mvc.perform(post("/api/returns").contentType(MediaType.APPLICATION_JSON).content(body()))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test
    void customerReachesBusinessServiceButNotAdminRoutes() throws Exception {
        mockUser("buyer", UserRole.CUSTOMER);
        when(service.create(eq("buyer"), any(CreateReturnRequest.class)))
                .thenThrow(new ResponseStatusException(HttpStatus.CONFLICT, "Order expired"));
        mvc.perform(post("/api/returns").header("Authorization", "Bearer " + token("buyer"))
                        .contentType(MediaType.APPLICATION_JSON).content(body()))
                .andExpect(status().isConflict());
        verify(service).create(eq("buyer"), any(CreateReturnRequest.class));
        mvc.perform(get("/api/admin/returns").header("Authorization", "Bearer " + token("buyer")))
                .andExpect(status().isForbidden());
        verify(service, never()).all();
    }

    @Test
    void adminCanAccessAdminList() throws Exception {
        mockUser("admin", UserRole.ADMIN);
        when(service.all()).thenReturn(List.of());
        mvc.perform(get("/api/admin/returns").header("Authorization", "Bearer " + token("admin")))
                .andExpect(status().isOk());
        verify(service).all();
    }

    private String body() {
        return "{\"orderID\":3,\"reason\":\"Damaged\",\"evidenceUrls\":[\"https://example.com/proof.jpg\"],"
                + "\"items\":[{\"orderDetailID\":4,\"quantity\":1}]}";
    }

    private void mockUser(String name, UserRole role) {
        when(users.findByUsername(name)).thenReturn(Optional.of(
                User.builder().username(name).role(role).isActive(true).build()));
    }

    private String token(String subject) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder().subject(subject).issuer("stationery-store")
                .issuedAt(now).expiresAt(now.plusSeconds(600)).build();
        return encoder.encode(JwtEncoderParameters.from(claims)).getTokenValue();
    }
}
