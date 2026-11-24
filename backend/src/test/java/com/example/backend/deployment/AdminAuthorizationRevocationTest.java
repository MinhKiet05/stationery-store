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
        "spring.datasource.url=jdbc:h2:mem:admin-role-revocation;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
        "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.properties.hibernate.default_schema=store",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.mail.username=test@example.test", "spring.mail.password=", "app.mail.from=test@example.test",
        "app.ai.enabled=false", "app.ai.vector-url=", "logging.level.root=WARN", "app.admin.orders.max-export-rows=20"
})
@AutoConfigureMockMvc
class AdminAuthorizationRevocationTest {
    @Autowired MockMvc mvc;
    @Autowired WebApplicationContext context;
    @Autowired EntityManager em;
    @Autowired org.springframework.transaction.PlatformTransactionManager manager;
    @Autowired org.springframework.security.oauth2.jwt.JwtEncoder encoder;
    @MockitoBean ReviewImageStorage storage;
    @BeforeEach void setup(){mvc=MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();}
    @Test void unchangedAdminJwtIsCheckedAgainstCurrentDatabaseRoleOnEveryAdminRequest() throws Exception {
        String name="admin-"+java.util.UUID.randomUUID();var tx=new org.springframework.transaction.support.TransactionTemplate(manager);
        Long id=tx.execute(ignored->{var u=User.builder().username(name).email(name+"@example.test").passwordHash("test-only").role(UserRole.ADMIN).build();em.persist(u);return u.getUserID();});
        String token=token(name,java.time.Instant.now().plusSeconds(3600));
        mvc.perform(get("/api/admin/products/statistics").header("Authorization","Bearer "+token)).andExpect(status().isOk());
        tx.executeWithoutResult(ignored->em.find(User.class,id).setRole(UserRole.CUSTOMER));
        mvc.perform(get("/api/auth/me").header("Authorization","Bearer "+token)).andExpect(status().isOk()).andExpect(jsonPath("$.role").value("CUSTOMER"));
        for(String endpoint:List.of("/api/admin/products/statistics","/api/admin/orders?page=0","/api/admin/reviews?page=0","/api/admin/promotions?page=0","/api/admin/returns?page=0"))
            mvc.perform(get(endpoint).header("Authorization","Bearer "+token)).andExpect(status().isForbidden());
        mvc.perform(patch("/api/admin/product-variants/1/stock").header("Authorization","Bearer "+token).contentType("application/json").content("{}")).andExpect(status().isForbidden());
        tx.executeWithoutResult(ignored->em.find(User.class,id).setIsActive(false));
        mvc.perform(get("/api/auth/me").header("Authorization","Bearer "+token)).andExpect(status().isUnauthorized());
    }
    @Test void missingOrExpiredJwtNeverUsesClientAdminRole() throws Exception {
        mvc.perform(get("/api/admin/products").header("X-Role","ADMIN")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/products").header("Authorization","Bearer "+token("expired",java.time.Instant.now().minusSeconds(3600)))).andExpect(status().isUnauthorized());
    }
    private String token(String username,java.time.Instant expires) {
        var claims=org.springframework.security.oauth2.jwt.JwtClaimsSet.builder().issuer("stationery-store").subject(username).issuedAt(java.time.Instant.now().minusSeconds(7200)).expiresAt(expires).claim("role","ADMIN").build();
        return encoder.encode(org.springframework.security.oauth2.jwt.JwtEncoderParameters.from(org.springframework.security.oauth2.jwt.JwsHeader.with(org.springframework.security.oauth2.jose.jws.MacAlgorithm.HS256).build(),claims)).getTokenValue();
    }
}
