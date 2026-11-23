package com.example.backend.deployment;

import com.example.backend.model.*;
import com.example.backend.services.*;
import com.example.backend.dto.returns.UpdateReturnStatusRequest;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:return-concurrency;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
        "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.properties.hibernate.default_schema=store",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.mail.username=test@example.test", "spring.mail.password=", "app.mail.from=test@example.test",
        "app.ai.enabled=false", "app.ai.vector-url=", "logging.level.root=WARN", "app.admin.returns.max-export-rows=20"
})
class ReturnDecisionConcurrencyTest {
    @Autowired EntityManager em;
    @Autowired ReturnRequestService returns;
    @Autowired PlatformTransactionManager manager;
    @MockitoBean ReviewImageStorage storage;

    @Test void concurrentDecisionsWithPreloadedPendingEntitiesHaveExactlyOneWinner() throws Exception {
        var tx=new TransactionTemplate(manager);
        Long id=tx.execute(ignored -> {
            var user=User.builder().username("concurrent-return").email("concurrent-return@example.test").passwordHash("test-hash").build(); em.persist(user);
            var product=Product.builder().title("Test return").build(); em.persist(product);
            var variant=ProductVariant.builder().product(product).title("Test").sku("CONCURRENT-RETURN").stockQuantity(8).price(BigDecimal.TEN).build(); em.persist(variant);
            var order=Order.builder().user(user).status(OrderStatus.RETURN_PENDING).isPaid(true).totalAmount(BigDecimal.TEN).build(); em.persist(order);
            var line=OrderDetail.builder().order(order).variant(variant).quantity(1).unitPrice(BigDecimal.TEN).subTotal(BigDecimal.TEN).build(); em.persist(line);
            var request=ReturnRequest.builder().order(order).user(user).reason("Race test").status(ReturnStatus.PENDING).createdAt(LocalDateTime.now()).build();
            request.getItems().add(ReturnRequestItem.builder().returnRequest(request).orderDetail(line).quantity(1).build()); em.persist(request); return request.getReturnID();
        });
        var ready=new CountDownLatch(2); var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var futures=new java.util.ArrayList<Future<Integer>>();
            for(ReturnStatus status:List.of(ReturnStatus.APPROVED,ReturnStatus.REJECTED)) futures.add(pool.submit(() -> {
                var context=SecurityContextHolder.createEmptyContext();
                context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated("admin",null,List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));
                SecurityContextHolder.setContext(context);
                try {
                    tx.executeWithoutResult(ignored -> {
                        // Both persistence contexts hold stale PENDING before either decision starts.
                        assertThat(em.find(ReturnRequest.class,id).getStatus()).isEqualTo(ReturnStatus.PENDING);
                        ready.countDown();
                        try { if(!start.await(10,TimeUnit.SECONDS)) throw new IllegalStateException("Race start timeout"); }
                        catch(InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted); }
                        returns.changeStatus(id,new UpdateReturnStatusRequest(status,status.name()));
                    });
                    return 200;
                } catch(ResponseStatusException failure) { return failure.getStatusCode().value(); }
                finally { SecurityContextHolder.clearContext(); }
            }));
            assertThat(ready.await(10,TimeUnit.SECONDS)).isTrue(); start.countDown();
            assertThat(List.of(futures.get(0).get(30,TimeUnit.SECONDS),futures.get(1).get(30,TimeUnit.SECONDS))).containsExactlyInAnyOrder(200,409);
        }
        tx.executeWithoutResult(ignored -> {
            var request=em.find(ReturnRequest.class,id);
            assertThat(request.getStatus()).isIn(ReturnStatus.APPROVED,ReturnStatus.REJECTED);
            assertThat(request.getAdminNote()).isEqualTo(request.getStatus().name()); assertThat(request.getProcessedAt()).isNotNull();
            assertThat(request.getOrder().getIsPaid()).isTrue(); assertThat(request.getOrder().getTotalAmount()).isEqualByComparingTo("10");
            assertThat(request.getItems().getFirst().getOrderDetail().getVariant().getStockQuantity()).isEqualTo(8);
        });
    }
}
