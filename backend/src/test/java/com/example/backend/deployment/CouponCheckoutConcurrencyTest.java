package com.example.backend.deployment;

import com.example.backend.model.*;
import com.example.backend.dto.coupon.CouponResponse;
import java.math.BigDecimal;
import java.time.LocalDate;
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
import java.util.concurrent.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import com.example.backend.services.OrderService;
import com.example.backend.dto.order.PlaceOrderRequest;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:coupon-checkout;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
        "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.properties.hibernate.default_schema=store",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.mail.username=test@example.test", "spring.mail.password=", "app.mail.from=test@example.test",
        "app.ai.enabled=false", "app.ai.vector-url=", "logging.level.root=WARN", "app.admin.promotions.max-export-rows=20"
})
@AutoConfigureMockMvc
class CouponCheckoutConcurrencyTest {
    @Autowired EntityManager em;
    @Autowired OrderService orders;
    @Autowired PlatformTransactionManager manager;
    @MockitoBean ReviewImageStorage storage;

    @Test void concurrentCheckoutsConsumeLastUseOnceAndCancellationReturnsIt() throws Exception {
        var tx=new TransactionTemplate(manager);
        tx.executeWithoutResult(ignored -> {
            Coupon c=Coupon.builder().code("LASTONE").discountType(DiscountType.PERCENTAGE).discountValue(BigDecimal.TEN).usageLimit(1).build(); em.persist(c);
            for(int i=0;i<2;i++) {
                User user=User.builder().username("checkout"+i).email("checkout"+i+"@example.test").passwordHash("test-hash").build(); em.persist(user);
                Product product=Product.builder().title("Checkout test "+i).build(); em.persist(product);
                ProductVariant variant=ProductVariant.builder().product(product).title("Test").sku("CONCURRENT"+i).stockQuantity(5).price(BigDecimal.valueOf(100000)).build(); em.persist(variant);
                Cart cart=Cart.builder().user(user).build(); em.persist(cart);
                em.persist(CartItem.builder().cart(cart).variant(variant).quantity(1).build());
            }
        });
        var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var futures=new java.util.ArrayList<Future<Integer>>();
            for(int i=0;i<2;i++) { final String username="checkout"+i;
                futures.add(pool.submit(() -> {
                    start.await();
                    try { orders.placeOrder(username,new PlaceOrderRequest("Test address","0900000000","COD","lastone")); return 201; }
                    catch(ResponseStatusException failure) { return failure.getStatusCode().value(); }
                }));
            }
            start.countDown();
            assertThat(List.of(futures.get(0).get(30,TimeUnit.SECONDS),futures.get(1).get(30,TimeUnit.SECONDS)))
                .containsExactlyInAnyOrder(201,409);
        }
        String[] winner=tx.execute(ignored -> {
            Coupon c=em.createQuery("select c from Coupon c where code='LASTONE'",Coupon.class).getSingleResult();
            assertThat(c.getUsedCount()).isEqualTo(1);
            var found=em.createQuery("select o from Order o",Order.class).getResultList(); assertThat(found).hasSize(1);
            Order order=found.getFirst(); assertThat(order.getDiscountAmount()).isEqualByComparingTo("10000"); assertThat(order.getTotalAmount()).isEqualByComparingTo("90000");
            return new String[]{order.getUser().getUsername(),order.getOrderID().toString()};
        });
        orders.cancelOrder(winner[0],Long.valueOf(winner[1]));
        tx.executeWithoutResult(ignored -> {
            Coupon c=em.createQuery("select c from Coupon c where code='LASTONE'",Coupon.class).getSingleResult(); assertThat(c.getUsedCount()).isZero();
            Order order=em.find(Order.class,Long.valueOf(winner[1])); assertThat(order.getStatus()).isEqualTo(OrderStatus.CANCELLED);
            assertThat(order.getDiscountAmount()).isEqualByComparingTo("10000");
        });
    }
}
