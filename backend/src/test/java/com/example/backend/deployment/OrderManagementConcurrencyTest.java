package com.example.backend.deployment;

import com.example.backend.model.*;
import com.example.backend.services.*;
import com.example.backend.dto.order.UpdateOrderStatusRequest;
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
        "spring.datasource.url=jdbc:h2:mem:order-management-concurrency;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
        "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.properties.hibernate.default_schema=store",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.mail.username=test@example.test", "spring.mail.password=", "app.mail.from=test@example.test",
        "app.ai.enabled=false", "app.ai.vector-url=", "logging.level.root=WARN", "app.admin.returns.max-export-rows=20"
})
class OrderManagementConcurrencyTest {
    @Autowired EntityManager em;
    @Autowired OrderService orders;
    @Autowired PlatformTransactionManager manager;
    @MockitoBean ReviewImageStorage storage;
    record Fixture(Long first, Long second, Long variant) {}
    private Fixture setup(String suffix) {
        return new TransactionTemplate(manager).execute(ignored -> {
            var user=User.builder().username("order-race-"+suffix).email(suffix+"@example.test").passwordHash("test-hash").build(); em.persist(user);
            var product=Product.builder().title("Race product").build(); em.persist(product);
            var variant=ProductVariant.builder().product(product).title("Test").sku("ORDER-RACE-"+suffix).stockQuantity(8).price(BigDecimal.TEN).build(); em.persist(variant);
            var first=create(user,variant); var second=create(user,variant);return new Fixture(first.getOrderID(),second.getOrderID(),variant.getVariantID());
        });
    }
    private Order create(User user,ProductVariant variant) {
        var order=Order.builder().user(user).status(OrderStatus.PENDING).isPaid(false).totalAmount(BigDecimal.valueOf(20)).build();em.persist(order);
        var line=OrderDetail.builder().order(order).variant(variant).quantity(2).unitPrice(BigDecimal.TEN).subTotal(BigDecimal.valueOf(20)).build();em.persist(line);order.getOrderDetails().add(line);return order;
    }
    @Test void confirmAndCancelWithPreloadedOrderCannotBothApplyStaleSnapshot() throws Exception {
        var f=setup("same");var results=race(f,List.of(f.first(),f.first()),List.of(OrderStatus.PROCESSING,OrderStatus.CANCELLED));
        assertThat(results).containsExactlyInAnyOrder(200,409);
        new TransactionTemplate(manager).executeWithoutResult(ignored -> {
            var order=em.find(Order.class,f.first());assertThat(order.getStatus()).isIn(OrderStatus.PROCESSING,OrderStatus.CANCELLED);
            assertThat(em.find(ProductVariant.class,f.variant()).getStockQuantity()).isEqualTo(order.getStatus()==OrderStatus.CANCELLED?10:8);
            assertThat(order.getIsPaid()).isFalse();
        });
    }
    @Test void cancellationsOfDifferentOrdersWithSamePreloadedVariantPreserveBothStockReturns() throws Exception {
        var f=setup("shared");assertThat(race(f,List.of(f.first(),f.second()),List.of(OrderStatus.CANCELLED,OrderStatus.CANCELLED))).containsExactly(200,200);
        new TransactionTemplate(manager).executeWithoutResult(ignored -> assertThat(em.find(ProductVariant.class,f.variant()).getStockQuantity()).isEqualTo(12));
    }
    private List<Integer> race(Fixture f,List<Long> ids,List<OrderStatus> targets) throws Exception {
        var ready=new CountDownLatch(2);var start=new CountDownLatch(1);var tx=new TransactionTemplate(manager);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var futures=new java.util.ArrayList<Future<Integer>>();
            for(int i=0;i<2;i++) {final int index=i;futures.add(pool.submit(() -> {
                var context=SecurityContextHolder.createEmptyContext();context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated("admin",null,List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));SecurityContextHolder.setContext(context);
                try {
                    tx.executeWithoutResult(ignored -> {
                        assertThat(em.find(Order.class,ids.get(index)).getStatus()).isEqualTo(OrderStatus.PENDING);
                        assertThat(em.find(ProductVariant.class,f.variant()).getStockQuantity()).isEqualTo(8);
                        ready.countDown();try {if(!start.await(10,TimeUnit.SECONDS))throw new IllegalStateException("Race timeout");}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException(e);}
                        orders.adminChangeStatus(ids.get(index),new UpdateOrderStatusRequest(targets.get(index),OrderStatus.PENDING,false));
                    });return 200;
                }catch(ResponseStatusException failure){return failure.getStatusCode().value();}finally{SecurityContextHolder.clearContext();}
            }));}
            assertThat(ready.await(10,TimeUnit.SECONDS)).isTrue();start.countDown();return List.of(futures.get(0).get(30,TimeUnit.SECONDS),futures.get(1).get(30,TimeUnit.SECONDS));
        }
    }
}
