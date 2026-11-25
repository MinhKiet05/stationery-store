package com.example.backend.deployment;

import com.example.backend.dto.order.PlaceOrderRequest;
import com.example.backend.dto.returns.ReceiveReturnRequest;
import com.example.backend.dto.returns.RestockReturnRequest;
import com.example.backend.model.*;
import com.example.backend.services.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.cache.CacheManager;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:catalog-cache;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
        "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.properties.hibernate.default_schema=store",
        "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.mail.username=test@example.test", "spring.mail.password=", "app.mail.from=test@example.test",
        "app.ai.enabled=false", "app.ai.vector-url=", "logging.level.root=WARN",
        "app.redis.enabled=true", "app.redis.host=127.0.0.1",
        "app.password-reset.hmac-secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
})
@Import(CatalogInventoryCachingTest.LocalCache.class)
@WithMockUser(username = "admin", roles = "ADMIN")
class CatalogInventoryCachingTest {
    @Autowired EntityManager em;
    @Autowired PlatformTransactionManager transactions;
    @Autowired ProductVariantService variants;
    @Autowired OrderService orders;
    @Autowired ReturnInventoryService returns;
    @MockitoBean ReviewImageStorage images;

    @Test void checkoutUsesLockedDatabasePriceAndStockAndWritesInvalidatePublicCacheAfterCommit() {
        var tx = new TransactionTemplate(transactions);
        Long variantID = tx.execute(ignored -> {
            var user = User.builder().username("buyer").email("buyer@example.test").passwordHash("hash").build();
            em.persist(user);
            em.persist(User.builder().username("admin").email("admin@example.test").passwordHash("hash").role(UserRole.ADMIN).build());
            var product = Product.builder().title("Cache test pen").price(BigDecimal.TEN).build(); em.persist(product);
            var variant = ProductVariant.builder().product(product).title("Blue").price(BigDecimal.TEN).stockQuantity(5).build(); em.persist(variant);
            var cart = Cart.builder().user(user).build(); em.persist(cart);
            em.persist(CartItem.builder().cart(cart).variant(variant).quantity(2).build());
            return variant.getVariantID();
        });
        assertThat(variants.getVariantById(variantID).stockQuantity()).isEqualTo(5);
        tx.executeWithoutResult(ignored -> {
            // Deliberately leave a stale cache snapshot to prove checkout never trusts it.
            var variant = em.find(ProductVariant.class, variantID);
            variant.setPrice(new BigDecimal("20")); variant.setStockQuantity(3);
        });
        assertThat(variants.getVariantById(variantID).price()).isEqualByComparingTo("10");
        var order = orders.placeOrder("buyer", new PlaceOrderRequest("Test address", "0900000000", "COD", null));
        assertThat(order.totalAmount()).isEqualByComparingTo("40");
        assertThat(variants.getVariantById(variantID).stockQuantity()).isEqualTo(1);
        assertThat(variants.getVariantById(variantID).price()).isEqualByComparingTo("20");
        orders.cancelOrder("buyer", order.orderID());
        assertThat(variants.getVariantById(variantID).stockQuantity()).isEqualTo(3);

        Long[] receipt = tx.execute(ignored -> {
            var original = em.find(Order.class, order.orderID()); original.setStatus(OrderStatus.DELIVERED);
            var detail = original.getOrderDetails().getFirst();
            var request = ReturnRequest.builder().order(original).user(original.getUser()).reason("Damaged package")
                    .status(ReturnStatus.APPROVED).build();
            var item = ReturnRequestItem.builder().returnRequest(request).orderDetail(detail).quantity(1).build();
            request.getItems().add(item); em.persist(request); em.flush();
            return new Long[]{request.getReturnID(), item.getReturnItemID()};
        });
        returns.receive(receipt[0], new ReceiveReturnRequest(List.of(new ReceiveReturnRequest.Item(receipt[1], BigDecimal.ONE))));
        variants.getVariantById(variantID);
        returns.restock(receipt[0], new RestockReturnRequest(List.of(new RestockReturnRequest.Item(receipt[1], BigDecimal.ONE, BigDecimal.ZERO)), "Checked"));
        assertThat(variants.getVariantById(variantID).stockQuantity()).isEqualTo(4);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class LocalCache {
        // Redis infrastructure is constructed lazily; all cache operations use this local test double.
        @Bean @Primary CacheManager localCatalogCache() { return new ConcurrentMapCacheManager(); }
    }
}
