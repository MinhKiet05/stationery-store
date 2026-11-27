package com.example.backend.deployment;

import com.example.backend.model.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/** Opt-in real HTTP/browser check. This context can only use its isolated in-memory database. */
@EnabledIfEnvironmentVariable(named = "RUN_BROWSER_E2E", matches = "true")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:browser-e2e;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
    "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
    "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.properties.hibernate.default_schema=store",
    "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", "app.ai.enabled=false", "app.ai.vector-url=",
    "app.frontend.url=http://127.0.0.1:5199", "server.address=127.0.0.1", "logging.level.root=WARN",
    "logging.level.org.hibernate.SQL=OFF", "logging.level.org.springframework.web=INFO"
})
class FullstackBrowserIntegrationTest {
    @Value("${local.server.port}") int port;
    @Autowired EntityManager em;
    @Autowired PlatformTransactionManager transactions;
    @Autowired PasswordEncoder passwords;

    @Test void realCustomerAndAdminFlows() throws Exception {
        Long deliveredID = new TransactionTemplate(transactions).execute(status -> {
            String hash = passwords.encode("Audit-only-Password123!");
            var customer = User.builder().username("e2e-customer").email("customer@example.test").passwordHash(hash).fullName("E2E Customer").build();
            em.persist(customer);
            em.persist(User.builder().username("e2e-admin").email("admin@example.test").passwordHash(hash).role(UserRole.ADMIN).build());
            var category = ProductType.builder().name("E2E Danh mục").build(); em.persist(category);
            var product = Product.builder().title("E2E Bút").handle("e2e-but").description("Local synthetic fixture")
                .productType(category).price(new BigDecimal("10000")).build(); em.persist(product);
            var variant = ProductVariant.builder().product(product).title("Mực xanh").sku("E2E-BLUE")
                .price(new BigDecimal("10000")).stockQuantity(20).build(); em.persist(variant);
            var order = Order.builder().user(customer).status(OrderStatus.DELIVERED).isPaid(true).paymentMethod("COD")
                .orderDate(LocalDateTime.now().minusDays(3)).deliveredAt(LocalDateTime.now().minusDays(1))
                .shippingAddress("Local test address").contactPhone("0901234567")
                .totalAmount(new BigDecimal("10000")).discountAmount(BigDecimal.ZERO).build();
            order.getOrderDetails().add(OrderDetail.builder().order(order).variant(variant).quantity(1)
                .unitPrice(new BigDecimal("10000")).subTotal(new BigDecimal("10000")).build());
            em.persist(order); em.flush(); return order.getOrderID();
        });
        Path root = Path.of(System.getProperty("user.dir")).toAbsolutePath().getParent();
        Path output = root.resolve(".cache/audit-real-browser.log"); Files.createDirectories(output.getParent());
        var builder = new ProcessBuilder("node", "scripts/test-api-e2e.mjs").directory(root.resolve("frontend").toFile())
            .redirectErrorStream(true).redirectOutput(output.toFile());
        builder.environment().put("E2E_API_URL", "http://127.0.0.1:" + port);
        builder.environment().put("E2E_DELIVERED_ORDER_ID", deliveredID.toString());
        var process = builder.start();
        boolean finished = process.waitFor(180, TimeUnit.SECONDS);
        if (!finished) process.destroyForcibly();
        assertThat(finished).as("browser process completed; see %s", output).isTrue();
        assertThat(process.exitValue()).as("real browser E2E; see %s\n%s", output, Files.readString(output)).isZero();
        System.out.println("REAL_BROWSER_E2E passed; log=" + output);
    }
}
